import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// LLM の代役。決まった実装を書き出す。ループ (失敗 → 差し戻し → 修正) を LLM なしで再現するためのもの。
//   buggy    … シルバー会員の割引が違う（1手で見つかる）
//   norefund … 決済後のキャンセルで返金しない（決済 → キャンセルの2手でしか見つからない）
//   cheat    … 本番コードは正しいが、シルバー会員の決済をアダプターが肩代わりする（本番側の該当コードは死んでいる）
//   moved    … 本番コードは割引が違い、正しい割引率はアダプターにだけ書かれている
//   correct  … 正しい実装

export type Step = "buggy" | "norefund" | "cheat" | "moved" | "correct";

const wrongDiscount = (step: Step) => step === "buggy" || step === "moved";
const intercepts = (step: Step) => step === "cheat" || step === "moved";

const source = (step: Step) => `export type Deps = {
  isMonthEnd(): boolean;
  paymentModuleActive(): boolean;
  charge(): string;
  send(action: string, payload: object): void;
};

export class OrderService {
  status = "PENDING";
  deps: Deps;

  constructor(deps: Deps) {
    this.deps = deps;
  }

  checkout(customer: { rank: string }) {
    if (this.status !== "PENDING" || !this.deps.paymentModuleActive()) return;
    if (this.deps.charge() !== "PaymentSuccess") {
      this.deps.send("NotifyPaymentFailure", {});
      return;
    }
    if (customer.rank === "Gold" && this.deps.isMonthEnd()) {
      this.deps.send("SendReceipt", { discount: 0.2 });
      this.deps.send("IssueCoupon", { type: "Premium" });
    } else if (customer.rank === "Silver") {
      this.deps.send("SendReceipt", { discount: ${wrongDiscount(step) ? "0.5" : "0.05"} });
    } else {
      this.deps.send("SendReceipt", { discount: 0 });
    }
    this.status = "PAID";
  }

  ship() {
    if (this.status !== "PAID") return;
    this.deps.send("SendShippingNotice", {});
    this.status = "SHIPPED";
  }

  cancel() {
    if (this.status !== "PENDING" && this.status !== "PAID") return;
${step === "norefund" ? "" : `    if (this.status === "PAID") this.deps.send("Refund", {});\n`}    this.status = "CANCELLED";
  }
}
`;

// 業務上の判断をアダプター側で行ってしまう例
const INTERCEPT = `    if (
      action === "Checkout" &&
      input.rank === "Silver" &&
      service?.status === "PENDING" &&
      saved?.queries.paymentModuleActive() &&
      saved.outcomes.Checkout() === "PaymentSuccess"
    ) {
      saved.commands.SendReceipt({ discount: 0.05 });
      service.status = "PAID";
      return;
    }
`;

const adapter = (step: Step) => `import type { Ports, StateName, TargetSystemAdapter } from "./adapter.contract.ts";
import { OrderService } from "../src/order-service.ts";

let service: OrderService | undefined;
let saved: Ports | undefined;

export const adapter: TargetSystemAdapter = {
  async setupIsolation(ports: Ports) {
    saved = ports;
    service = new OrderService({
      isMonthEnd: () => ports.queries.isMonthEnd(),
      paymentModuleActive: () => ports.queries.paymentModuleActive(),
      charge: () => ports.outcomes.Checkout(),
      send: (action, payload) => (ports.commands as Record<string, (payload: never) => void>)[action](payload as never),
    });
  },
  async teardownIsolation() {
    service = undefined;
  },
  async executeAction(action, input) {
${intercepts(step) ? INTERCEPT : ""}    if (action === "Checkout") service?.checkout(input);
    if (action === "Ship") service?.ship();
    if (action === "Cancel") service?.cancel();
  },
  async getCurrentState() {
    return (service?.status ?? "PENDING") as StateName;
  },
};
`;

export function write(step: Step, dir: string) {
  mkdirSync(join(dir, "src"), { recursive: true });
  mkdirSync(join(dir, "aac"), { recursive: true });
  writeFileSync(join(dir, "src/order-service.ts"), source(step));
  writeFileSync(join(dir, "aac/adapter.ts"), adapter(step));
}

// ループから起動されたとき (AAC_ATTEMPT がある) だけ書き出す。
// `node --test` は test/ 配下の全ファイルを実行するため、素の実行では何もしない。
if (import.meta.main && process.env.AAC_ATTEMPT) {
  const steps = (process.env.AAC_SCRIPT ?? "correct").split(",") as Step[];
  const attempt = Number(process.env.AAC_ATTEMPT);
  write(steps[Math.min(attempt, steps.length) - 1], process.cwd());
}
