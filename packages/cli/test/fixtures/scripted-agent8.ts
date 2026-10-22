import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, posix } from "node:path";

// LLM の代役 (1.0 の注文の仕様、examples/checkout-ts/specs)。決まった成果物を書き出す。ループ (失敗 → 差し戻し → 修正) を
// LLM なしで再現するためのもの。段階ごとに書くものが違う:
//   design … 骨組み
//     correct  … 正しい骨組み（中身は "not implemented" を投げる）
//     broken   … 構文エラー
//     crashing … 型は通るが、読み込むと例外を投げる
//     leaky    … 仕様の条件の文を、コメントにそのまま書き写している
//     kept     … 骨組みではなく、実装済みのコードをそのまま残す（仕様が変わっても、形を直す必要が無かった場合）
//   wiring … アダプター
//     correct  … 正しい配線
//     idle     … 何も書かない（渡された雛形のまま）
//     mistyped … 存在しないメソッドを呼ぶ（型エラーになる）
//     miswired … 型検査をすり抜けて、存在しないメソッドを呼ぶ（実行時に失敗する）
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
  | "correct" | "broken" | "crashing" | "leaky" | "kept"
  | "mistyped" | "miswired" | "fake" | "touch" | "cheat" | "idle"
  | "buggy" | "norefund" | "boundary" | "rounding";

const DEPS = `export type Deps = {
  isMonthEnd(): boolean;
  paymentActive(): boolean;
  charge(): string;
  send(message: string, payload: object): void;
  refund(amount: number): void;
};
`;

const skeleton = `${DEPS}
/** An order. \`status\` is the current state, using the specification's state names. */
export class OrderService {
  status = "DRAFT";
  rank = "";
  price = 0;
  paid = 0;
  deps: Deps;

  constructor(deps: Deps) {
    this.deps = deps;
  }

  /** The PlaceOrder command. */
  place(rank: string, price: number) {
    throw new Error("not implemented");
  }

  /** The Checkout command. */
  checkout() {
    throw new Error("not implemented");
  }

  /** The Ship command. */
  ship() {
    throw new Error("not implemented");
  }

  /** The Cancel command: what it answers. */
  cancel(): string {
    throw new Error("not implemented");
  }
}
`;

const source = (step: Step) => `${DEPS}
export class OrderService {
  status = "DRAFT";
  rank = "";
  price = 0;
  paid = 0;
  deps: Deps;

  constructor(deps: Deps) {
    this.deps = deps;
  }

  place(rank: string, price: number) {
    if (this.status !== "DRAFT") return;
    this.rank = rank;
    this.price = price;
    this.deps.send("OrderConfirmation", {});
    this.status = "PENDING";
  }

  checkout() {
    if (this.status !== "PENDING" || !this.deps.paymentActive()) return;
    if (this.deps.charge() !== "succeeded") {
      this.deps.send("PaymentFailure", {});
      return;
    }
    let percent = 0;
    let coupon = false;
    if (this.rank === "Gold" && this.deps.isMonthEnd()) {
      percent = 20;
      coupon = true;
    } else if (this.rank === "Silver") {
      percent = ${step === "buggy" ? "50" : "5"};
    }
    const amount = Math.${step === "rounding" ? "round" : "floor"}((this.price * (100 - percent)) / 100);
    this.paid = amount;
    this.deps.send("Receipt", { discountPercent: percent, amount });
    if (coupon) this.deps.send("Coupon", { type: "Premium" });
    this.status = "PAID";
  }

  ship() {
    if (this.status !== "PAID") return;
    this.deps.send("ShippingNotice", { priority: this.rank === "Gold" || this.price ${step === "boundary" ? ">" : ">="} 10000 });
    this.status = "SHIPPED";
  }

  cancel(): string {
    if (this.status === "PAID") {
${step === "norefund" ? "" : "      this.deps.refund(this.paid);\n"}      this.status = "CANCELLED";
      return "cancelled";
    }
    if (this.status === "PENDING") {
      this.status = "CANCELLED";
      return "cancelled";
    }
    return "not-cancellable";
  }
}
`;

// 業務上の判断をアダプター側で行ってしまう例
const INTERCEPT = `    if (command.name === "Checkout" && service?.rank === "Silver" && service.status === "PENDING" && saved?.payment.Active() && saved.payment.Result() === "succeeded") {
      const amount = Math.floor((service.price * 95) / 100);
      service.paid = amount;
      saved.customer.Receipt({ discountPercent: 5, amount });
      service.status = "PAID";
      return;
    }
`;

// 成果物を書く場所（作業場所からの相対パス）。配置によって変わる
export type Place = { source: string; adapter: string };
const DEFAULT_PLACE: Place = { source: "src/order-service.ts", adapter: "clp/order.adapter.ts" };
const relativeImport = (from: string, to: string) => {
  const rel = posix.relative(posix.dirname(from), to);
  return rel.startsWith(".") ? rel : `./${rel}`;
};

const adapter = (step: Step, place: Place) => `import type { Ports, TargetSystemAdapter } from "${relativeImport(place.adapter, place.adapter.replace(/adapter\.ts$/, "adapter.contract.ts"))}";
${step === "fake" ? source("correct").replaceAll("export ", "") : `import { OrderService } from "${relativeImport(place.adapter, place.source)}";`}

let service: OrderService | undefined;
let saved: Ports | undefined;

export const adapter: TargetSystemAdapter = {
  async setupIsolation(ports: Ports) {
    saved = ports;
    service = new OrderService({
      isMonthEnd: () => ports.calendar.IsMonthEnd(),
      paymentActive: () => ports.payment.Active(),
      charge: () => ports.payment.Result(),
      send: (message, payload) => (ports.customer as Record<string, (payload: never) => void>)[message](payload as never),
      refund: (amount) => ports.refunds.Refund({ amount }),
    });
  },
  async teardownIsolation() {
    service = undefined;
  },
  async executeCommand(command) {
${step === "cheat" ? INTERCEPT : ""}    if (command.name === "PlaceOrder") ${step === "miswired" ? "(service as any).placeOrder" : step === "mistyped" ? "service?.placeOrder" : "service?.place"}(command.input.customerRank, command.input.listPrice);
    if (command.name === "Checkout") service?.checkout();
    if (command.name === "Ship") service?.ship();
    if (command.name === "Cancel") return service?.cancel() as "cancelled" | "not-cancellable";
  },
  async executeQuery(query) {
    return (service?.status ?? "DRAFT") as never;
  },
};
`;

export function write(phase: Phase, step: Step, dir: string, place: Place = DEFAULT_PLACE) {
  mkdirSync(dirname(join(dir, place.source)), { recursive: true });
  mkdirSync(dirname(join(dir, place.adapter)), { recursive: true });
  if (phase === "design") {
    const text =
      step === "broken"
        ? "export const = ;\n"
        : step === "leaky"
          ? `// Discount applies when: The customer is a Silver member\n${skeleton}`
          : step === "crashing"
            ? `${skeleton}\nthrow new Error("boom at load");\n`
            : step === "kept"
              ? source("correct")
              : skeleton;
    writeFileSync(join(dir, place.source), text);
  }
  if (phase === "wiring" && step !== "idle") {
    writeFileSync(join(dir, place.adapter), adapter(step, place));
    if (step === "touch") writeFileSync(join(dir, place.source), source("correct"));
  }
  if (phase === "implementation") writeFileSync(join(dir, place.source), source(step));
}

// ループから起動されたとき (CLP_PHASE がある) だけ書き出す。
// `node --test` は test/ 配下の全ファイルを実行するため、素の実行では何もしない。
// CLP_SCRIPT は実装の段階の試行ごとの成果物 (例: "buggy,correct")。他の段階は常に correct
if (import.meta.main && process.env.CLP_PHASE) {
  const phase = process.env.CLP_PHASE as Phase;
  const steps = (process.env.CLP_SCRIPT ?? "correct").split(",") as Step[];
  const attempt = Number(process.env.CLP_ATTEMPT ?? "1");
  write(phase, phase === "implementation" ? steps[Math.min(attempt, steps.length) - 1] : "correct", process.cwd());
}
