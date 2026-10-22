import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { compile } from "../src/v1/load.ts";
import { problemText } from "../src/v1/read.ts";
import { check8, selfCheck8 } from "../src/v1/pbt.ts";
import type { Adapter8 } from "../src/v1/pbt.ts";

// 1.0 の書き方の機能: 外の世界への問い合わせの引数、構造のある値 (レコード・並び・対応)、答え
process.env.CLP_ALLOY = "off";

const tmpRoot = join(import.meta.dirname, ".tmp-features");
mkdirSync(tmpRoot, { recursive: true });
after(() => rmSync(tmpRoot, { recursive: true, force: true }));

function irOf(name: string, source: string) {
  const dir = mkdtempSync(join(tmpRoot, "s-"));
  writeFileSync(join(dir, `${name}.component.ts`), source);
  const { ir, problems } = compile(dir, name);
  assert.deepEqual(problems.filter((p) => p.severity === "error").map(problemText), []);
  return ir!;
}

// --- 問い合わせの引数 ---

const EXCHANGE = `import { answer, external, requires, service } from "@clp/core";
import type { Int } from "@clp/core";
export const Rates = external("Exchange rates, in yen per unit.", { queries: { Of: (currency: "USD" | "EUR" | "GBP"): Int => answer() } });
export const Exchange = service("Converts an amount into yen.", {
  commands: {
    Convert(currency: "USD" | "EUR" | "GBP", amount: Int): Int {
      requires(amount >= 0 && amount <= 1000);
      return amount * Rates.Of(currency);
    },
  },
});
`;

function exchangeAdapter(kind: "correct" | "always-usd" | "swallowed"): Adapter8 {
  let rates: { Of(input: { currency: string }): number };
  return {
    async setupIsolation(ports) {
      rates = (ports as { rates: typeof rates }).rates;
    },
    async teardownIsolation() {},
    async executeCommand(command) {
      const { currency, amount } = command.input as { currency: string; amount: number };
      if (kind === "swallowed") {
        // 確かめのために、ほかの通貨も尋ねてしまう（答えは使わない）
        try {
          rates.Of({ currency: currency === "USD" ? "EUR" : "USD" });
        } catch {
          // ignored
        }
      }
      return amount * rates.Of({ currency: kind === "always-usd" ? "USD" : currency });
    },
  };
}

test("問い合わせの引数: 仕様が尋ねたのと違うものについて尋ねた実装は、答えが合っていても落ちる", async () => {
  const ir = irOf("exchange", EXCHANGE);
  assert.ok((await selfCheck8(ir, { seed: 1 })).ok);
  const run = (kind: "correct" | "always-usd" | "swallowed") => check8(ir, exchangeAdapter(kind), { seed: 2, numRuns: 200 });
  assert.equal((await run("correct")).status, "pass");
  const usd = await run("always-usd");
  assert.ok(usd.status === "fail" && "error" in usd.actual && /ports\.rates\.Of was asked about \{"currency":"USD"\}/.test(usd.actual.error), JSON.stringify(usd));
  // 仕様が尋ねない引数で尋ねたことは、本番コードが例外を握りつぶしても見つかる
  const swallowed = await run("swallowed");
  assert.ok(swallowed.status === "fail" && "error" in swallowed.actual && /was asked about/.test(swallowed.actual.error), JSON.stringify(swallowed));
});

// --- 構造のある値 ---

const SHELF = `import { Map, List, requires, service } from "@clp/core";
import type { Id, Int } from "@clp/core";
export type BookId = Id<"a book">;
export type Book = { id: BookId; title: string; pages: Int };
export const Shelf = service("A shelf of books, in the order they were put on it.", {
  state: { books: List<Book>(), lent: Map<BookId, string>() },
  commands: {
    Put(id: BookId, title: string, pages: Int): "put" | "duplicate" {
      requires(pages >= 1 && pages <= 2000);
      if (this.books.some((b) => b.id === id)) return "duplicate";
      this.books = [...this.books, { id: id, title: title, pages: pages }];
      return "put";
    },
    Lend(id: BookId, to: string): "lent" | "unknown" | "already-lent" {
      if (!this.books.some((b) => b.id === id)) return "unknown";
      if (this.lent.has(id)) return "already-lent";
      this.lent.set(id, to);
      return "lent";
    },
  },
  queries: {
    Thick(): Book[] { return this.books.filter((b) => b.pages > 500); },
    Borrower(id: BookId): string | null { return this.lent.has(id) ? this.lent.get(id)! : null; },
  },
});
`;

function shelfAdapter(bug?: "order" | "threshold" | "lend-twice"): Adapter8 {
  let books: { id: string; title: string; pages: number }[] = [];
  let lent = new globalThis.Map<string, string>();
  return {
    async setupIsolation() {
      books = [];
      lent = new globalThis.Map();
    },
    async teardownIsolation() {},
    async executeCommand(command) {
      const input = command.input as { id: string; title: string; pages: number; to: string };
      if (command.name === "Put") {
        if (books.some((b) => b.id === input.id)) return "duplicate";
        const book = { id: input.id, title: input.title, pages: input.pages };
        books = bug === "order" ? [book, ...books] : [...books, book];
        return "put";
      }
      if (!books.some((b) => b.id === input.id)) return "unknown";
      if (lent.has(input.id) && bug !== "lend-twice") return "already-lent";
      lent.set(input.id, input.to);
      return "lent";
    },
    async executeQuery(query) {
      if (query.name === "Thick") return books.filter((b) => b.pages > (bug === "threshold" ? 501 : 500));
      return lent.get((query.input as { id: string }).id) ?? null;
    },
  };
}

test("構造のある値: レコードの並び、識別子をキーにした対応。並びの順序、しきい値、答えの違いを見つける", async () => {
  const ir = irOf("shelf", SHELF);
  assert.deepEqual(ir.components.shelf.state, { books: { list: { record: { id: { atom: "BookId" }, title: "string", pages: "int" } } }, lent: { map: [{ atom: "BookId" }, "string"] } });
  assert.ok((await selfCheck8(ir, { seed: 1 })).ok);
  const run = (bug?: "order" | "threshold" | "lend-twice") => check8(ir, shelfAdapter(bug), { seed: 3, numRuns: 500 });
  assert.equal((await run()).status, "pass");
  for (const bug of ["order", "threshold", "lend-twice"] as const) assert.equal((await run(bug)).status, "fail", bug);
});
