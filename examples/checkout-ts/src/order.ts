import type { OrderDependencies } from "./ports.ts";
import { amountCharged, campaignFor, isMonthEnd, isPriorityShipping } from "./rules.ts";
import type { CustomerRank, OrderState } from "./types.ts";

/** What an order remembers once it has been placed. */
interface PlacedOrder {
  readonly rank: CustomerRank;
  readonly priceYen: number;
}

/**
 * Thrown by an {@link Order} command that cannot be executed: the order is in a state the
 * command does not start from, or a precondition of the command does not hold. The order is
 * left unchanged and no effect is performed on any dependency.
 */
export class OrderCommandRejected extends Error {
  /** Name of the rejected method, e.g. `"checkout"`. */
  readonly command: string;
  /** State the order was in when the command was rejected. */
  readonly state: OrderState;

  /**
   * @param command name of the rejected method.
   * @param state state the order was in.
   * @param reason human-readable explanation.
   */
  constructor(command: string, state: OrderState, reason: string) {
    super(reason);
    this.name = "OrderCommandRejected";
    this.command = command;
    this.state = state;
  }
}

/**
 * One customer order, from draft to shipment or cancellation. This is the component the
 * specification describes; each of its four methods is one specification command.
 *
 * A new instance is a fresh order in the specification's initial state. Commands are
 * synchronous: when a method returns, the state has been updated and every dependency call the
 * command makes has been made, in the order the specification lists the effects.
 *
 * The rank and price the order remembers (specification data `rank` and `price`) are internal
 * and are observable only through what later commands send to the dependencies.
 */
export class Order {
  private readonly deps: OrderDependencies;
  private current: OrderState = "DRAFT";
  private placed: PlacedOrder | undefined;

  /**
   * @param deps the clock, payment gateway, customer notifier and coupon issuer this order
   *   uses. They are kept for the lifetime of the order and consulted anew by every command.
   */
  constructor(deps: OrderDependencies) {
    this.deps = deps;
  }

  /**
   * The current state of the order, under the specification's state names (see
   * {@link OrderState}). Reading it has no side effects.
   */
  get state(): OrderState {
    return this.current;
  }

  /**
   * Performs the specification's `PlaceOrder` command.
   *
   * Uses `deps.notifier`.
   *
   * @param customerRank the command's `customerRank` input.
   * @param listPriceYen the command's `listPrice` input, in whole yen.
   * @throws OrderCommandRejected if the command cannot be executed in the current state.
   */
  place(customerRank: CustomerRank, listPriceYen: number): void {
    this.requireState("place", ["DRAFT"]);
    this.placed = { rank: customerRank, priceYen: listPriceYen };
    this.current = "PENDING";
    this.deps.notifier.sendOrderConfirmation();
  }

  /**
   * Performs the specification's `Checkout` command (no input).
   *
   * Uses `deps.paymentGateway` (`isActive` for the specification's `paymentModuleActive`,
   * `charge` for its `paymentResult`), `deps.clock` (for its `isMonthEnd`), `deps.notifier`
   * and `deps.couponIssuer`.
   *
   * @throws OrderCommandRejected if the command cannot be executed in the current state or its
   *   precondition does not hold.
   */
  checkout(): void {
    const { rank, priceYen } = this.requirePlaced("checkout", ["PENDING"]);
    const { paymentGateway, clock, notifier, couponIssuer } = this.deps;
    if (!paymentGateway.isActive()) {
      throw new OrderCommandRejected("checkout", this.current, "the payment module is not active");
    }

    const campaign = campaignFor(rank, isMonthEnd(clock.today()));
    const amountYen = amountCharged(priceYen, campaign.discountPercent);
    if (paymentGateway.charge(amountYen) !== "succeeded") {
      notifier.notifyPaymentFailure();
      return;
    }

    this.current = "PAID";
    notifier.sendReceipt({ amountYen, discountPercent: campaign.discountPercent });
    if (campaign.grantsCoupon) {
      couponIssuer.issueCoupon(campaign.coupon);
    }
  }

  /**
   * Performs the specification's `Ship` command (no input).
   *
   * Uses `deps.notifier`.
   *
   * @throws OrderCommandRejected if the command cannot be executed in the current state.
   */
  ship(): void {
    const { rank, priceYen } = this.requirePlaced("ship", ["PAID"]);
    this.current = "SHIPPED";
    this.deps.notifier.sendShippingNotice(isPriorityShipping(rank, priceYen));
  }

  /**
   * Performs the specification's `Cancel` command (no input).
   *
   * Uses `deps.paymentGateway` (`refund`).
   *
   * @throws OrderCommandRejected if the command cannot be executed in the current state.
   */
  cancel(): void {
    this.requireState("cancel", ["PENDING", "PAID"]);
    const wasPaid = this.current === "PAID";
    this.current = "CANCELLED";
    if (wasPaid) {
      this.deps.paymentGateway.refund();
    }
  }

  private requireState(command: string, from: readonly OrderState[]): void {
    if (!from.includes(this.current)) {
      throw new OrderCommandRejected(
        command,
        this.current,
        `cannot ${command} an order in state ${this.current}`,
      );
    }
  }

  private requirePlaced(command: string, from: readonly OrderState[]): PlacedOrder {
    this.requireState(command, from);
    if (this.placed === undefined) {
      throw new OrderCommandRejected(command, this.current, "the order has not been placed");
    }
    return this.placed;
  }
}
