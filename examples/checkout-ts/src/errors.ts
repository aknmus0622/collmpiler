import type { OrderStatus } from "./types.ts";

/** Name of an action on an {@link Order}; the method names of the class. */
export type OrderAction = "place" | "checkout" | "ship" | "cancel";

/**
 * Thrown by an {@link Order} method when the specification does not allow that action right now:
 * the order is in a status outside the action's `from` list, or one of the action's
 * `preconditions` does not hold. The order is left unchanged and none of the specification's
 * commands is carried out.
 */
export class OrderActionNotAllowedError extends Error {
  /** The action that was refused. */
  readonly action: OrderAction;
  /** The status the order was in (and still is in) when the action was refused. */
  readonly status: OrderStatus;

  constructor(action: OrderAction, status: OrderStatus) {
    super(`Order action "${action}" is not allowed (status: ${status})`);
    this.name = "OrderActionNotAllowedError";
    this.action = action;
    this.status = status;
  }
}
