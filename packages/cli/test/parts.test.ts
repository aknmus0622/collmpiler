import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { extract } from "../src/extract.ts";
import { generateContract } from "../src/generate.ts";
import type { Ir } from "../src/generate.ts";
import { loadSpecs } from "../src/loader.ts";
import { check, selfCheck } from "../src/runtime.ts";
import type { Adapter, Ports } from "../src/runtime.ts";

// 部品の中の部品（DSL.md §14）: 外側の部品が、含む部品のコマンドを呼ぶ。
// 期待値は、外側と中の仕様を一緒に実行して作る。観測するのは、外側の答えと、外の世界への副作用すべて

const tmpRoot = join(import.meta.dirname, ".tmp-parts");
mkdirSync(tmpRoot, { recursive: true });
after(() => rmSync(tmpRoot, { recursive: true, force: true }));

// 中の部品: 口座。上限を超える入金は断る。入金のたびに監査に記録する
const ACCOUNT = `import { component, conditions, data, decisionTable, does, effects, initially, input, integer, otherwise, output, responds, when } from "@clp/core";
export const Limits = decisionTable(otherwise({ max: 300 }));
export const If = conditions({ overLimit: "The balance would go over the limit" });
export const Data = data({ balance: component(integer({ min: 0, max: 1000 }), initially(0)) });
export const Effect = effects({ Audit: input({ amount: "integer" }) });
export const DepositInput = input({ amount: integer({ min: 1, max: 100 }) });
export const Account = component({
  description: "A bank account.",
  data: Data,
  effects: Effect,
  decisions: { limits: Limits },
  commands: {
    Deposit: component(DepositInput, output(["ok", "refused"]), when(If.overLimit, does("Refused."), responds("refused")), otherwise(does("The balance grows; the deposit is audited."), responds("ok"))),
    Balance: component(output("integer"), does("The answer is the balance.")),
  },
});
`;
const ACCOUNT_INTERPRETATION = `import { calculations, component, description, interpretation, output, responds, when, otherwise } from "@clp/core";
import { Account, Data, DepositInput, Effect, If, Limits } from "./account.component.ts";
export const Calc = calculations({ grown: component(description("balance + amount"), output("integer")) });
export const Interpretation = interpretation(Account, {
  calculations: Calc,
  commands: {
    Deposit: component(when(If.overLimit), otherwise(Data.balance.set(Calc.grown), Effect.Audit({ amount: DepositInput.amount }))),
    Balance: component(responds(Data.balance)),
  },
  meanings: [
    If.overLimit.means((state) => state.balance + state.amount > Limits.of(state).max),
    Calc.grown.means((state) => state.balance + state.amount),
  ],
});
`;
// 外側の部品: 窓口。支払いを口座に入金し、受け付けたら領収書を出す。閉じたら受け付けない
const TELLER = `import { component, conditions, effects, from, goTo, input, integer, output, parts, record, responds, states, when, otherwise, does } from "@clp/core";
import { Account } from "./account.component.ts";
export const State = states("OPEN", "CLOSED");
export const Part = parts({ account: Account });
export const If = conditions({ accepted: "The account accepted the deposit" });
export const Effect = effects({ Receipt: input({ amount: "integer" }) });
export const PayInput = input({ amount: integer({ min: 1, max: 100 }) });
export const Teller = component({
  description: "A teller in front of an account.",
  states: State,
  init: State.OPEN,
  parts: Part,
  effects: Effect,
  commands: {
    Pay: component(
      PayInput,
      from(State.OPEN),
      Part.account.Deposit({ amount: PayInput.amount }),
      output(record({ status: integer({ min: 100, max: 599 }) })),
      when(If.accepted, responds({ status: 201 }), does("A receipt is given.")),
      otherwise(responds({ status: 422 })),
    ),
    Check: component(Part.account.Balance(), output("integer"), responds(Part.account.Balance.answer)),
    Close: component(from(State.OPEN), goTo(State.CLOSED)),
  },
});
`;
const TELLER_INTERPRETATION = `import { component, interpretation, when, otherwise } from "@clp/core";
import { Effect, If, PayInput, Teller } from "./teller.component.ts";
export const Interpretation = interpretation(Teller, {
  commands: {
    Pay: component(when(If.accepted, Effect.Receipt({ amount: PayInput.amount })), otherwise()),
    Check: component(),
    Close: component(),
  },
  meanings: [If.accepted.means((state) => state.account.Deposit === "ok")],
});
`;

function specDir() {
  const dir = mkdtempSync(join(tmpRoot, "s-"));
  writeFileSync(join(dir, "account.component.ts"), ACCOUNT);
  writeFileSync(join(dir, "account.interpretation.ts"), ACCOUNT_INTERPRETATION);
  writeFileSync(join(dir, "teller.component.ts"), TELLER);
  writeFileSync(join(dir, "teller.interpretation.ts"), TELLER_INTERPRETATION);
  return dir;
}

// 手で書いた本番コード（の代わり）。中の部品は、外側から使われる、ふつうのクラス
type Faults = { limit?: number; receiptAlways?: boolean; noAudit?: boolean; closedPays?: boolean };
class AccountCode {
  balance = 0;
  audit: (amount: number) => void;
  faults: Faults;
  constructor(audit: (amount: number) => void, faults: Faults) {
    this.audit = audit;
    this.faults = faults;
  }
  deposit(amount: number): "ok" | "refused" {
    if (this.balance + amount > (this.faults.limit ?? 300)) return "refused";
    this.balance += amount;
    if (!this.faults.noAudit) this.audit(amount);
    return "ok";
  }
}
class TellerCode {
  state: "OPEN" | "CLOSED" = "OPEN";
  account: AccountCode;
  receipt: (amount: number) => void;
  faults: Faults;
  constructor(account: AccountCode, receipt: (amount: number) => void, faults: Faults) {
    this.account = account;
    this.receipt = receipt;
    this.faults = faults;
  }
  pay(amount: number) {
    const result = this.account.deposit(amount);
    if (result === "ok" || this.faults.receiptAlways) this.receipt(amount);
    return { status: result === "ok" ? 201 : 422 };
  }
}
// 外側の部品のアダプター: 中の部品の依存（account.Audit）も、外側の契約の名前で渡す
function tellerAdapter(faults: Faults = {}): Adapter {
  let teller: TellerCode;
  return {
    async setupIsolation(ports: Ports) {
      teller = new TellerCode(new AccountCode((amount) => ports.effects["account.Audit"]({ amount }), faults), (amount) => ports.effects.Receipt({ amount }), faults);
    },
    async teardownIsolation() {},
    async executeCommand(command: { name: string; input: { amount?: number } }) {
      if (command.name === "Pay") return teller.pay(command.input.amount!);
      if (command.name === "Check") return teller.account.balance;
      teller.state = "CLOSED";
    },
    async getCurrentState() {
      return teller.state;
    },
  };
}

test("部品の中の部品: IR に、含む部品の境界と、呼ぶことが出る。契約には、中の部品の依存が名前を修飾して並ぶ", async () => {
  const dir = specDir();
  const { ir, diagnostics } = extract(await loadSpecs(dir, { component: "teller" }));
  assert.deepEqual(diagnostics, []);
  const model = (ir as Ir).model!;
  assert.deepEqual(Object.keys(model.parts ?? {}), ["account"]);
  assert.equal(model.parts!.account.component, "account");
  assert.deepEqual(model.parts!.account.outputs, { Balance: "integer", Deposit: ["ok", "refused"] });
  assert.deepEqual(Object.keys(model.parts!.account.effects), ["Audit"]);
  const pay = (ir as Ir).behaviors.find((behavior) => behavior.name === "Pay")!;
  assert.deepEqual(pay.calls, { "account.Deposit": { part: "account", command: "Deposit", input: { amount: { $ref: "input:amount" } } } });
  const contract = generateContract(ir as Ir);
  assert.match(contract, /"account\.Audit"\(payload: \{ amount: number \}\): void;/);
  assert.match(contract, /Receipt\(payload: \{ amount: number \}\): void;/);
});

test("部品の中の部品: 外側と中の仕様を一緒に実行する。正しい実装は通り、外側・中の誤りは見つかる", async () => {
  const dir = specDir();
  assert.ok((await selfCheck(await loadSpecs(dir, { component: "teller" }), { seed: 1 })).ok);
  const run = (faults?: Faults) => check(dir, tellerAdapter(faults), { drafts: false, component: "teller" }, { seed: 1, numRuns: 300 });

  assert.equal((await run()).status, "pass");
  // 中の部品の判断の誤り（上限）: 外側の答え（422 のはずが 201）に現れる
  const limit = await run({ limit: 250 });
  assert.equal(limit.status, "fail");
  // 中の部品の副作用を起こさない: 外の世界への副作用として観測する
  const audit = await run({ noAudit: true });
  assert.ok(audit.status === "fail" && JSON.stringify(audit.expected).includes("account.Audit"));
  // 外側の判断の誤り: 断られたのに領収書を出す
  const receipt = await run({ receiptAlways: true });
  assert.equal(receipt.status, "fail");
});

test("部品の中の部品: 呼ぶコマンドの入力と、知らない部品・コマンドは、IR を作るときに報告する", async () => {
  const dir = mkdtempSync(join(tmpRoot, "s-"));
  writeFileSync(join(dir, "account.component.ts"), ACCOUNT);
  writeFileSync(join(dir, "account.interpretation.ts"), ACCOUNT_INTERPRETATION);
  writeFileSync(join(dir, "teller.component.ts"), TELLER.replace("Part.account.Deposit({ amount: PayInput.amount })", 'Part.account.Deposit({ amount: "ten" })').replace("Part.account.Balance()", "Part.account.Balanse()"));
  writeFileSync(join(dir, "teller.interpretation.ts"), TELLER_INTERPRETATION);
  const messages = extract(await loadSpecs(dir, { component: "teller" })).diagnostics.map((d) => `${d.code} ${d.behavior}: ${d.message}`);
  assert.ok(messages.some((line) => line.startsWith('bad-value Pay: account.Deposit.amount: "ten" は')), messages.join("\n"));
  assert.ok(messages.includes('unknown-command Check: account.Balanse: 部品 "account" (account) に、コマンド Balanse はありません'), messages.join("\n"));
});
