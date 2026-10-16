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
const ACCOUNT = `import { commands, conditions, data, decisions, effects, input, integer, otherwise, service } from "@clp/core";
export const Decision = decisions({ limits: [otherwise({ max: 300 })] });
export const If = conditions({ overLimit: "The balance would go over the limit" });
export const Data = data({ balance: { type: integer({ min: 0, max: 1000 }), initially: 0 } });
export const Effect = effects({ Audit: input({ amount: "integer" }) });
export const DepositInput = input({ amount: integer({ min: 1, max: 100 }) });
export const Command = commands({
  Deposit: {
    input: DepositInput,
    output: ["ok", "refused"],
    cases: [If.overLimit.then({ does: "Refused.", responds: "refused" }), otherwise({ does: "The balance grows; the deposit is audited.", responds: "ok" })],
  },
  Balance: { output: "integer", does: "The answer is the balance." },
});
export const Account = service({ description: "A bank account.", uses: [Data, Effect, Decision, If, Command] });
`;
const ACCOUNT_INTERPRETATION = `import { calculations, interpretation, otherwise } from "@clp/core";
import { Account, Command, Data, Decision, DepositInput, Effect, If } from "./account.component.ts";
export const Calc = calculations({ grown: { description: "balance + amount", output: "integer" } });
export const Interpretation = interpretation(Account, [
  Calc,
  Command.Deposit.with({ cases: [otherwise({ set: [Data.balance.set(Calc.grown)], emits: [Effect.Audit({ amount: DepositInput.amount })] })] }),
  Command.Balance.with({ responds: Data.balance }),
  If.overLimit.means((state) => state.balance + state.amount > Decision.limits.of(state).max),
  Calc.grown.means((state) => state.balance + state.amount),
]);
`;
// 外側の部品: 窓口。支払いを口座に入金し、受け付けたら領収書を出す。閉じたら受け付けない
const TELLER = `import { commands, conditions, effects, input, integer, otherwise, parts, record, service, states } from "@clp/core";
import { Account } from "./account.component.ts";
export const State = states(["OPEN", "CLOSED"]);
export const Part = parts({ account: Account });
export const If = conditions({ accepted: "The account accepted the deposit" });
export const Effect = effects({ Receipt: input({ amount: "integer" }) });
export const PayInput = input({ amount: integer({ min: 1, max: 100 }) });
export const Command = commands({
  Pay: {
    input: PayInput,
    from: State.OPEN,
    calls: [Part.account.Deposit({ amount: PayInput.amount })],
    output: record({ status: integer({ min: 100, max: 599 }) }),
    cases: [If.accepted.then({ responds: { status: 201 }, does: "A receipt is given." }), otherwise({ responds: { status: 422 } })],
  },
  Check: { calls: [Part.account.Balance()], output: "integer", responds: Part.account.Balance.answer },
  Close: { from: State.OPEN, goTo: State.CLOSED },
});
export const Teller = service({ description: "A teller in front of an account.", init: State.OPEN, uses: [State, Part, Effect, If, Command] });
`;
const TELLER_INTERPRETATION = `import { interpretation } from "@clp/core";
import { Command, Effect, If, PayInput, Teller } from "./teller.component.ts";
export const Interpretation = interpretation(Teller, [
  Command.Pay.with({ cases: [If.accepted.then({ emits: [Effect.Receipt({ amount: PayInput.amount })] })] }),
  If.accepted.means((state) => state.account.Deposit === "ok"),
]);
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

// 経路の path に入る値: "." と ".." は、パーセントエンコードしても URL の正規化で区切りになり、HTTP では送れない
const THINGS = `import { commands, input, service, string } from "@clp/core";
export const GetInput = input({ id: string({ examples: [".", "..", "a"] }), note: string({ examples: [".", ".."] }) });
export const Things = service({
  description: "Things by id.",
  uses: [commands({ Get: { route: "GET /things/:id", input: GetInput, output: "string", responds: GetInput.id } })],
});
`;
const THINGS_INTERPRETATION = `import { interpretation } from "@clp/core";
import { Things } from "./things.component.ts";
export const Interpretation = interpretation(Things, []);
`;

test("経路: path に入る値のうち HTTP で送れないもの (\".\"、\"..\") は、仕様の外として生成しない。path でない入力には使う", async () => {
  const dir = mkdtempSync(join(tmpRoot, "r-"));
  writeFileSync(join(dir, "things.component.ts"), THINGS);
  writeFileSync(join(dir, "things.interpretation.ts"), THINGS_INTERPRETATION);
  const sent = { ids: new Set<string>(), notes: new Set<string>() };
  const adapter: Adapter = {
    async setupIsolation() {},
    async teardownIsolation() {},
    async executeCommand(command: { name: string; input: { id: string; note: string } }) {
      sent.ids.add(command.input.id);
      sent.notes.add(command.input.note);
      return command.input.id;
    },
    async getCurrentState() {
      return "READY";
    },
  };
  const result = await check(dir, adapter, { drafts: false }, { seed: 1, numRuns: 300 });
  assert.equal(result.status, "pass");
  assert.ok(sent.ids.has("a"));
  assert.ok(!sent.ids.has(".") && !sent.ids.has(".."));
  assert.ok(sent.notes.has(".") && sent.notes.has(".."));
});
