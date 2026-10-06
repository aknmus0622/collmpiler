import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// LLM の代役。AAC_SCRIPT (例: "buggy,cheat,correct") の順に、決まった実装を書き出す。
// ループ (失敗 → 差し戻し → 修正) を LLM なしで再現するためのもの。

export type Step = "buggy" | "cheat" | "correct";

const source = (silverDiscount: string) => `export type Order = { rank: string; isMonthEnd: boolean; paymentModuleActive: boolean };

export class OrderService {
  status = "PENDING";
  outbox: object[] = [];
  order: Order | undefined;

  load(status: string, order: Order) {
    this.status = status;
    this.order = order;
  }

  checkout(outcome: string) {
    const order = this.order;
    if (!order || outcome !== "PaymentSuccess") return;
    if (order.rank === "Gold" && order.isMonthEnd) {
      this.outbox.push({ action: "SendReceipt", payload: { discount: 0.2 } });
      this.outbox.push({ action: "IssueCoupon", payload: { type: "Premium" } });
    } else if (order.rank === "Silver") {
      this.outbox.push({ action: "SendReceipt", payload: { discount: ${silverDiscount} } });
    } else {
      this.outbox.push({ action: "SendReceipt", payload: { discount: 0 } });
    }
    this.status = "PAID";
  }
}
`;

const adapter = (body: string) => `import type { Command, StateName, TargetSystemAdapter } from "./adapter.contract.ts";
import { OrderService } from "../src/order-service.ts";

let service = new OrderService();

export const adapter: TargetSystemAdapter = {
  async setupIsolation() {
    service = new OrderService();
  },
  async teardownIsolation() {},
  async givenState(state, data) {
    service.load(state, data);
  },
  async executeAction(action, outcome) {
${body}
  },
  async getCurrentState() {
    return service.status as StateName;
  },
  async getFiredCommands() {
    return service.outbox as Command[];
  },
};
`;

const FORWARD = `    if (action === "Checkout") service.checkout(outcome);`;
// 業務ロジックをアダプター側に書いてしまう例
const CHEAT = `    if (service.order?.rank === "Silver") service.outbox.push({ action: "SendReceipt", payload: { discount: 0.05 } });
    else if (action === "Checkout") service.checkout(outcome);`;

export function write(step: Step, dir: string) {
  mkdirSync(join(dir, "src"), { recursive: true });
  mkdirSync(join(dir, "aac"), { recursive: true });
  writeFileSync(join(dir, "src/order-service.ts"), source(step === "correct" ? "0.05" : "0.5"));
  writeFileSync(join(dir, "aac/adapter.ts"), adapter(step === "cheat" ? CHEAT : FORWARD));
}

// ループから起動されたとき (AAC_ATTEMPT がある) だけ書き出す。
// `node --test` は test/ 配下の全ファイルを実行するため、素の実行では何もしない。
if (import.meta.main && process.env.AAC_ATTEMPT) {
  const steps = (process.env.AAC_SCRIPT ?? "correct").split(",") as Step[];
  const attempt = Number(process.env.AAC_ATTEMPT);
  write(steps[Math.min(attempt, steps.length) - 1], process.cwd());
}
