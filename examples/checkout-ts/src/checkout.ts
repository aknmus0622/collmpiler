export type OrderState = "PENDING" | "PAID";
export type Rank = "Gold" | "Silver" | "Bronze";
export type OrderData = { isMonthEnd: boolean; paymentModuleActive: boolean; rank: Rank };
export type Command =
  | { action: "IssueCoupon"; payload: { type: "Premium" | "Standard" } }
  | { action: "SendReceipt"; payload: { discount: number } };
export type PaymentOutcome = "PaymentSuccess";

type Campaign = { discount: number; effects: Command[] };

// Campaign rules: at most one non-default rule applies to a given order.
function resolveCampaign(data: OrderData): Campaign {
  if (data.rank === "Gold" && data.isMonthEnd) {
    return { discount: 0.2, effects: [{ action: "IssueCoupon", payload: { type: "Premium" } }] };
  }
  if (data.rank === "Silver") {
    return { discount: 0.05, effects: [] };
  }
  return { discount: 0, effects: [] };
}

export class OrderSystem {
  private state: OrderState = "PENDING";
  private data: OrderData | undefined = undefined;
  private commands: Command[] = [];

  reset(): void {
    this.state = "PENDING";
    this.data = undefined;
    this.commands = [];
  }

  load(state: OrderState, data: OrderData): void {
    this.state = state;
    this.data = data;
  }

  checkout(outcome: PaymentOutcome): void {
    const data = this.data;
    // Checkout requires the external payment module to be active.
    if (data === undefined || !data.paymentModuleActive) return;
    if (outcome === "PaymentSuccess") {
      const campaign = resolveCampaign(data);
      this.commands.push({ action: "SendReceipt", payload: { discount: campaign.discount } });
      this.commands.push(...campaign.effects);
      this.state = "PAID";
    }
  }

  execute(action: "Checkout", outcome: PaymentOutcome): void {
    if (action === "Checkout") this.checkout(outcome);
  }

  currentState(): OrderState {
    return this.state;
  }

  firedCommands(): Command[] {
    return this.commands.slice();
  }
}
