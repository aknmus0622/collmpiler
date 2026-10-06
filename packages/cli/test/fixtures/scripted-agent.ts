import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// LLM の代役。決まった成果物を書き出す。ループ (失敗 → 差し戻し → 修正) を LLM なしで再現するためのもの。
// 段階ごとに書くものが違う:
//   design … 骨組み
//     correct  … 正しい骨組み（中身は "not implemented" を投げる）
//     broken   … 構文エラーで読み込めない
//     leaky    … 仕様の条件の文を、コメントにそのまま書き写している
//   wiring … アダプター
//     correct  … 正しい配線
//     miswired … 存在しないメソッドを呼ぶ
//     fake     … 本番コードを使わず、アダプターの中に実装を持つ（骨組みのままでもテストが通ってしまう）
//     touch    … 配線は正しいが、本番コード（骨組み）を書き換える
//     cheat    … シルバー会員の決済をアダプターが肩代わりする（本番側の該当コードが死ぬ）
//   implementation … 本番コードの中身
//     correct  … 正しい実装
//     buggy    … シルバー会員の割引率が違う（注文 → 決済の2手で見つかる）
//     norefund … 決済後のキャンセルで返金しない（注文 → 決済 → キャンセルの3手でしか見つからない）
//     boundary … 優先出荷のしきい値を「1万円より大きい」にしている（ちょうど1万円でだけ違う）
//     rounding … 請求金額を切り捨てではなく四捨五入している

export type Phase = "design" | "wiring" | "implementation";
export type Step =
  | "correct" | "broken" | "leaky"
  | "miswired" | "fake" | "touch" | "cheat"
  | "buggy" | "norefund" | "boundary" | "rounding";

const wrongDiscount = (step: Step) => step === "buggy";
const intercepts = (step: Step) => step === "cheat";

const skeleton = `export type Deps = {
  isMonthEnd(): boolean;
  paymentModuleActive(): boolean;
  charge(): string;
  send(action: string, payload: object): void;
};

/** An order. \`status\` is the current state, using the specification's state names. */
export class OrderService {
  status = "DRAFT";
  rank = "";
  price = 0;
  deps: Deps;

  constructor(deps: Deps) {
    this.deps = deps;
  }

  /** The PlaceOrder action. */
  place(rank: string, price: number) {
    throw new Error("not implemented");
  }

  /** The Checkout action. */
  checkout() {
    throw new Error("not implemented");
  }

  /** The Ship action. */
  ship() {
    throw new Error("not implemented");
  }

  /** The Cancel action. */
  cancel() {
    throw new Error("not implemented");
  }
}
`;

const source = (step: Step) => `export type Deps = {
  isMonthEnd(): boolean;
  paymentModuleActive(): boolean;
  charge(): string;
  send(action: string, payload: object): void;
};

export class OrderService {
  status = "DRAFT";
  rank = "";
  price = 0;
  deps: Deps;

  constructor(deps: Deps) {
    this.deps = deps;
  }

  place(rank: string, price: number) {
    if (this.status !== "DRAFT") return;
    this.rank = rank;
    this.price = price;
    this.deps.send("SendOrderConfirmation", {});
    this.status = "PENDING";
  }

  checkout() {
    if (this.status !== "PENDING" || !this.deps.paymentModuleActive()) return;
    if (this.deps.charge() !== "succeeded") {
      this.deps.send("NotifyPaymentFailure", {});
      return;
    }
    let percent = 0;
    let coupon = false;
    if (this.rank === "Gold" && this.deps.isMonthEnd()) {
      percent = 20;
      coupon = true;
    } else if (this.rank === "Silver") {
      percent = ${wrongDiscount(step) ? "50" : "5"};
    }
    const amount = Math.${step === "rounding" ? "round" : "floor"}((this.price * (100 - percent)) / 100);
    this.deps.send("SendReceipt", { discountPercent: percent, amount });
    if (coupon) this.deps.send("IssueCoupon", { type: "Premium" });
    this.status = "PAID";
  }

  ship() {
    if (this.status !== "PAID") return;
    this.deps.send("SendShippingNotice", { priority: this.rank === "Gold" || this.price ${step === "boundary" ? ">" : ">="} 10000 });
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
      action.name === "Checkout" &&
      service?.rank === "Silver" &&
      service.status === "PENDING" &&
      saved?.queries.paymentModuleActive() &&
      saved.queries.paymentResult() === "succeeded"
    ) {
      saved.commands.SendReceipt({ discountPercent: 5, amount: Math.floor((service.price * 95) / 100) });
      service.status = "PAID";
      return;
    }
`;

const adapter = (step: Step) => `import type { Ports, StateName, TargetSystemAdapter } from "./adapter.contract.ts";
${step === "fake" ? source("correct").replaceAll("export ", "") : `import { OrderService } from "../src/order-service.ts";`}

let service: OrderService | undefined;
let saved: Ports | undefined;

export const adapter: TargetSystemAdapter = {
  async setupIsolation(ports: Ports) {
    saved = ports;
    service = new OrderService({
      isMonthEnd: () => ports.queries.isMonthEnd(),
      paymentModuleActive: () => ports.queries.paymentModuleActive(),
      charge: () => ports.queries.paymentResult(),
      send: (action, payload) => (ports.commands as Record<string, (payload: never) => void>)[action](payload as never),
    });
  },
  async teardownIsolation() {
    service = undefined;
  },
  async executeAction(action) {
${intercepts(step) ? INTERCEPT : ""}    if (action.name === "PlaceOrder") service?.${step === "miswired" ? "placeOrder" : "place"}(action.input.customerRank, action.input.listPrice);
    if (action.name === "Checkout") service?.checkout();
    if (action.name === "Ship") service?.ship();
    if (action.name === "Cancel") service?.cancel();
  },
  async getCurrentState() {
    return (service?.status ?? "DRAFT") as StateName;
  },
};
`;

export function write(phase: Phase, step: Step, dir: string) {
  mkdirSync(join(dir, "src"), { recursive: true });
  mkdirSync(join(dir, "aac"), { recursive: true });
  if (phase === "design") {
    const text =
      step === "broken"
        ? "export const = ;\n"
        : step === "leaky"
          ? `// Discount applies when: The customer is a Silver member\n${skeleton}`
          : skeleton;
    writeFileSync(join(dir, "src/order-service.ts"), text);
  }
  if (phase === "wiring") {
    writeFileSync(join(dir, "aac/adapter.ts"), adapter(step));
    if (step === "touch") writeFileSync(join(dir, "src/order-service.ts"), source("correct"));
  }
  if (phase === "implementation") writeFileSync(join(dir, "src/order-service.ts"), source(step));
}

// ループから起動されたとき (AAC_PHASE がある) だけ書き出す。
// `node --test` は test/ 配下の全ファイルを実行するため、素の実行では何もしない。
// AAC_SCRIPT は実装の段階の試行ごとの成果物 (例: "buggy,correct")。他の段階は常に correct
if (import.meta.main && process.env.AAC_PHASE) {
  const phase = process.env.AAC_PHASE as Phase;
  const steps = (process.env.AAC_SCRIPT ?? "correct").split(",") as Step[];
  const attempt = Number(process.env.AAC_ATTEMPT ?? "1");
  write(phase, phase === "implementation" ? steps[Math.min(attempt, steps.length) - 1] : "correct", process.cwd());
}
