export type OrderState = "PENDING" | "PAID" | "SHIPPED" | "CANCELLED";
export type OrderAction = "Cancel" | "Checkout" | "Ship";
export type MemberRank = "Gold" | "Silver" | "Bronze";
export type CouponType = "Premium" | "Standard";
export type OrderInput = { rank: MemberRank };

export type OrderEnvironment = {
  queries: {
    isMonthEnd(): boolean;
    paymentModuleActive(): boolean;
  };
  outcomes: {
    Cancel(): "Cancelled";
    Checkout(): "PaymentFailure" | "PaymentSuccess";
    Ship(): "Shipped";
  };
  commands: {
    IssueCoupon(payload: { type: CouponType }): void;
    NotifyPaymentFailure(payload: {}): void;
    Refund(payload: {}): void;
    SendReceipt(payload: { discount: number }): void;
    SendShippingNotice(payload: {}): void;
  };
};

type Campaign = { discount: number; coupon: CouponType | null };

function campaignFor(rank: MemberRank, isMonthEnd: boolean): Campaign {
  if (rank === "Gold" && isMonthEnd) return { discount: 0.2, coupon: "Premium" };
  if (rank === "Silver") return { discount: 0.05, coupon: null };
  return { discount: 0, coupon: null };
}

export class Order {
  private state: OrderState = "PENDING";
  private readonly env: OrderEnvironment;

  constructor(env: OrderEnvironment) {
    this.env = env;
  }

  currentState(): OrderState {
    return this.state;
  }

  execute(action: OrderAction, input: OrderInput): void {
    switch (action) {
      case "Cancel":
        return this.cancel();
      case "Checkout":
        return this.checkout(input);
      case "Ship":
        return this.ship();
    }
  }

  cancel(): void {
    if (this.state !== "PENDING" && this.state !== "PAID") return;
    const wasPaid = this.state === "PAID";
    this.env.outcomes.Cancel();
    this.state = "CANCELLED";
    if (wasPaid) this.env.commands.Refund({});
  }

  checkout(input: OrderInput): void {
    if (this.state !== "PENDING") return;
    if (!this.env.queries.paymentModuleActive()) return;
    if (this.env.outcomes.Checkout() === "PaymentFailure") {
      this.env.commands.NotifyPaymentFailure({});
      return;
    }
    const campaign = campaignFor(input.rank, this.env.queries.isMonthEnd());
    this.state = "PAID";
    this.env.commands.SendReceipt({ discount: campaign.discount });
    if (campaign.coupon !== null) this.env.commands.IssueCoupon({ type: campaign.coupon });
  }

  ship(): void {
    if (this.state !== "PAID") return;
    this.env.outcomes.Ship();
    this.state = "SHIPPED";
    this.env.commands.SendShippingNotice({});
  }
}
