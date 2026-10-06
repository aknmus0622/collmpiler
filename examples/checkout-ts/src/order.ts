import { resolveCampaign } from "./campaign.ts";
import type { Command, OrderAction, OrderData, OrderState, PaymentResult } from "./types.ts";

const INITIAL_STATE: OrderState = "PENDING";
const INITIAL_DATA: OrderData = { isMonthEnd: false, paymentModuleActive: false, rank: "Bronze" };

export class OrderSystem {
  private state: OrderState = INITIAL_STATE;
  private data: OrderData = INITIAL_DATA;
  private fired: Command[] = [];

  reset(): void {
    this.state = INITIAL_STATE;
    this.data = INITIAL_DATA;
    this.fired = [];
  }

  restore(state: OrderState, data: OrderData): void {
    this.state = state;
    this.data = data;
  }

  perform(action: OrderAction, result: PaymentResult): void {
    if (action === "Checkout") this.checkout(result);
  }

  // Checkout requires the external payment module; without it the order is left untouched.
  checkout(result: PaymentResult): void {
    if (!this.data.paymentModuleActive) return;
    if (result === "PaymentSuccess") {
      const campaign = resolveCampaign(this.data);
      this.fired.push({ action: "SendReceipt", payload: { discount: campaign.discount } }, ...campaign.effects);
      this.state = "PAID";
    }
  }

  currentState(): OrderState {
    return this.state;
  }

  firedCommands(): Command[] {
    return [...this.fired];
  }
}
