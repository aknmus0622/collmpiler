import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { contract8 } from "../src/v1/generate.ts";
import { compile } from "../src/v1/load.ts";
import { problemText } from "../src/v1/read.ts";
import { check8, selfCheck8 } from "../src/v1/pbt.ts";
import type { Adapter8 } from "../src/v1/pbt.ts";

// 部品の中の部品（DSL.md §17）: 外側の部品が、中の部品のコマンドを呼ぶ。
// 期待値は、外側と中の仕様を一緒に実行して作る。観測するのは、答えと、外の世界へのコマンドすべて
process.env.CLP_ALLOY = "off";

const tmpRoot = join(import.meta.dirname, ".tmp-parts");
mkdirSync(tmpRoot, { recursive: true });
after(() => rmSync(tmpRoot, { recursive: true, force: true }));

// 中の部品: 口座。上限を超える入金は断る。入金のたびに監査に記録する
const ACCOUNT = `import { external, init, requires, service } from "@clp/core";
import type { Int } from "@clp/core";
export const Audit = external("The audit log.", { commands: { Record(amount: Int) {} } });
export const Account = service("A bank account. A deposit that would take the balance over 300 is refused.", {
  state: { balance: init<Int>(0) },
  commands: {
    Deposit(amount: Int): "ok" | "refused" {
      requires(amount >= 1 && amount <= 100);
      if (this.balance + amount > 300) return "refused";
      Audit.Record(amount);
      this.balance += amount;
      return "ok";
    },
  },
  queries: { Balance() { return this.balance; } },
});
`;
// 外側の部品: 窓口。支払いを口座に入金し、受け付けたら領収書を出す。閉じたら受け付けない
const TELLER = (pay = "Account.Deposit(amount)", balance = "Account.Balance()") => `import { external, init, requires, service } from "@clp/core";
import type { Int } from "@clp/core";
import { Account } from "./account.component.ts";
export const Printer = external("Prints receipts.", { commands: { Receipt(amount: Int) {} } });
export const Teller = service(\`A teller in front of \${Account}.\`, {
  state: { open: init<boolean>(true) },
  commands: {
    Pay(amount: Int): { status: 201 | 422 } {
      requires(this.open && amount >= 1 && amount <= 100);
      const answer = ${pay};
      if (answer === "refused") return { status: 422 };
      Printer.Receipt(amount);
      return { status: 201 };
    },
    Close() {
      requires(this.open);
      this.open = false;
    },
  },
  queries: { Check() { return ${balance}; } },
});
`;

function specDir(teller = TELLER()) {
  const dir = mkdtempSync(join(tmpRoot, "s-"));
  writeFileSync(join(dir, "account.component.ts"), ACCOUNT);
  writeFileSync(join(dir, "teller.component.ts"), teller);
  return dir;
}

// 手で書いた本番コード（の代わり）。中の部品は、外側から使われる、ふつうのクラス
type Faults = { limit?: number; receiptAlways?: boolean; noAudit?: boolean };
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
  open = true;
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
// 外側の部品のアダプター: 中の部品の外の世界 (audit) も、外側の契約で渡る
function tellerAdapter(faults: Faults = {}): Adapter8 {
  let teller: TellerCode;
  return {
    async setupIsolation(ports) {
      const p = ports as { audit: { Record(input: { amount: number }): void }; printer: { Receipt(input: { amount: number }): void } };
      teller = new TellerCode(new AccountCode((amount) => p.audit.Record({ amount }), faults), (amount) => p.printer.Receipt({ amount }), faults);
    },
    async teardownIsolation() {},
    async executeCommand(command) {
      if (command.name === "Pay") return teller.pay(command.input.amount as number);
      teller.open = false;
    },
    async executeQuery(query) {
      return teller.account.balance;
    },
  };
}

test("部品の中の部品: IR に、含む部品と、呼ぶことが出る。契約には、中の部品の外の世界も並ぶ", () => {
  const { ir, problems } = compile(specDir(), "teller");
  assert.deepEqual(problems.filter((p) => p.severity === "error").map(problemText), []);
  assert.deepEqual(ir!.components.teller.contains, ["account"]);
  // 外側が呼ぶ中のコマンドは、入り口ではない
  assert.deepEqual(ir!.entries.commands, ["teller.Close", "teller.Pay"]);
  const pay = ir!.components.teller.events!["Pay.otherwise"] ?? Object.values(ir!.components.teller.events!).find((e) => e.command === "Pay")!;
  assert.ok(JSON.stringify(pay).includes('"Deposit"'), JSON.stringify(pay));
  const contract = contract8(ir!);
  assert.match(contract, /audit: \{\s*Record\(input: \{ amount: number \}\): void;/);
  assert.match(contract, /printer: \{\s*Receipt\(input: \{ amount: number \}\): void;/);
});

test("部品の中の部品: 外側と中の仕様を一緒に実行する。正しい実装は通り、外側・中の誤りは見つかる", async () => {
  const { ir } = compile(specDir(), "teller");
  assert.ok((await selfCheck8(ir!, { seed: 1 })).ok);
  const run = (faults?: Faults) => check8(ir!, tellerAdapter(faults), { seed: 1, numRuns: 300 });

  assert.equal((await run()).status, "pass");
  // 中の部品の判断の誤り（上限）: 外側の答え（422 のはずが 201）に現れる
  assert.equal((await run({ limit: 250 })).status, "fail");
  // 中の部品の外の世界へのコマンドを起こさない: 外の世界へのコマンドとして観測する
  const audit = await run({ noAudit: true });
  assert.ok(audit.status === "fail" && JSON.stringify(audit.expected).includes("audit.Record"), JSON.stringify(audit));
  // 外側の判断の誤り: 断られたのに領収書を出す
  assert.equal((await run({ receiptAlways: true })).status, "fail");
});

test("部品の中の部品: 呼ぶコマンドの引数の型と、知らないコマンドは、IR を作るときに報告する", () => {
  const { problems } = compile(specDir(TELLER('Account.Deposit("ten")', "Account.Balanse()")), "teller");
  const found = problems.map(problemText).join("\n");
  assert.match(found, /error\[type-mismatch\] Teller\.commands\.Pay/);
  assert.match(found, /Balanse/);
});

// 経路の path に入る値: "." と ".." は、パーセントエンコードしても URL の正規化で区切りになり、HTTP では送れない
const THINGS = `import { service } from "@clp/core";
export const Things = service("Things by id.", {
  commands: {
    Get(id: string, note: string): string {
      if (note === "." || note === "..") return "dots";
      return id;
    },
  },
  routes: { Get: "GET /things/:id" },
});
`;

test("経路: path に入る値のうち HTTP で送れないもの (\".\"、\"..\") は、仕様の外として生成しない。path でない入力には使う", async () => {
  const dir = mkdtempSync(join(tmpRoot, "r-"));
  writeFileSync(join(dir, "things.component.ts"), THINGS);
  const { ir } = compile(dir, "things");
  const sent = { ids: new Set<string>(), notes: new Set<string>() };
  const adapter: Adapter8 = {
    async setupIsolation() {},
    async teardownIsolation() {},
    async executeCommand(command) {
      const { id, note } = command.input as { id: string; note: string };
      sent.ids.add(id);
      sent.notes.add(note);
      return note === "." || note === ".." ? "dots" : id;
    },
  };
  const result = await check8(ir!, adapter, { seed: 1, numRuns: 300 });
  assert.equal(result.status, "pass");
  assert.ok(!sent.ids.has(".") && !sent.ids.has(".."));
  assert.ok(sent.notes.has(".") && sent.notes.has(".."));
});
