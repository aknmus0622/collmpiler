// What `clp run` writes into Layer 1 (DSL.md §17.19): a person's answer to a question of the interpretation, in their
// own words, appended to the sentence the question is about. The only place the framework writes Layer 1; nothing an
// LLM wrote goes there. Where it goes is decided by where the question is:
//
// - a `// REVIEW:` inside an entry of an interpretation (or on the line above it): the sentence of the same entry in
//   Layer 1 (`Return: "…"`, a state field, `is.onLoan("…")`, `does.x("…")`, `value.x("…")`);
// - a `// REVIEW(clp):` difference: the sentence of the command or query it names;
// - otherwise (the entry is code in Layer 1, the question is outside every entry): the description of the component.

import { readFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { HEADINGS } from "./read.ts";
import type { Program, Unit } from "./read.ts";
import { parseModule } from "./syntax.ts";
import type { Expr, Module, Prop } from "./syntax.ts";

export type Review = Program["reviews"][number];
/** What a question is about: a component, and the entry in it when there is one. */
export type Anchor = { unit: Unit; entry?: { heading: string; name: string } };
/** One sentence of Layer 1 made longer. */
export type Supplement = { file: string; line: number; before: string; after: string };

const rel = (file: string) => relative(process.cwd(), file).split(sep).join("/");
const FRAGMENT_OF: Record<string, string> = { conditions: "is", does: "does", calcs: "value" };

/** The component (and entry) a question in an interpretation file is about. */
export function anchorOf(program: Program, review: Review): Anchor | undefined {
  const file = resolve(process.cwd(), review.file);
  const units = program.units.filter((u) => u.kind !== "external" && u.interpretation !== undefined && resolve(u.interpretation.file) === file);
  const draft = parseModule(readFileSync(file, "utf8"), file);
  const calls = interpretationsIn(draft).flatMap((call) => {
    const unit = units.find((u) => u.exportName === call.of);
    return unit ? [{ ...call, unit }] : [];
  });
  if (calls.length === 0) return units[0] ? { unit: units[0] } : undefined;
  if (review.by === "clp") {
    // "2 つ目の解釈と食い違う (fines.Charge、答え): …"
    const named = /\(([^、)]+)、/.exec(review.text)?.[1];
    if (named) {
      const name = named.split(".").at(-1)!;
      const owner = named.includes(".") ? named.split(".").slice(0, -1).join(".") : undefined;
      for (const unit of owner ? [...units.filter((u) => u.id === owner), ...units] : units) {
        const entry = unit.entries.get(name);
        if (entry && (entry.heading === "commands" || entry.heading === "queries")) return { unit, entry: { heading: entry.heading, name } };
      }
    }
    return { unit: calls[0].unit };
  }
  // the entry on the line below the question (skipping other comments), or the one the question is inside
  const commentLines = new Set(draft.comments.map((c) => c.line));
  let below = review.line + 1;
  while (commentLines.has(below)) below++;
  const entries = calls.flatMap((call) => call.entries.map((entry) => ({ ...entry, unit: call.unit, call })));
  const at = entries.find((e) => e.line === below) ?? entries.filter((e) => e.line < review.line && e.call.line <= review.line).at(-1);
  if (at && at.call.end >= review.line) return { unit: at.unit, entry: { heading: at.heading, name: at.name } };
  const call = calls.find((c) => c.line <= review.line && c.end >= review.line) ?? calls.find((c) => c.line >= below) ?? calls.at(-1)!;
  return { unit: call.unit };
}

type Call = { of: string; line: number; end: number; entries: { heading: string; name: string; line: number }[] };
function interpretationsIn(module: Module): Call[] {
  const calls: Call[] = [];
  const decls = module.decls.filter((d) => d.k === "const");
  decls.forEach((decl, index) => {
    const init = decl.init;
    if (init.k !== "call" || init.callee.k !== "id" || init.callee.name !== "interpretation") return;
    const [of, body] = init.args;
    if (of?.k !== "id" || body?.k !== "obj") return;
    const entries = body.props.flatMap((heading) =>
      heading.k === "prop" && (HEADINGS as readonly string[]).includes(heading.key) && heading.value.k === "obj"
        ? heading.value.props.flatMap((p) => (p.k === "spread" ? [] : [{ heading: heading.key, name: p.key, line: p.at.line }]))
        : [],
    );
    const next = decls[index + 1];
    calls.push({ of: of.name, line: decl.at.line, end: next ? next.at.line - 1 : Number.MAX_SAFE_INTEGER, entries });
  });
  return calls;
}

/** The sentence of Layer 1 an anchor stands for: the entry's own sentence when it has one, else the description. */
function sentenceOf(anchor: Anchor): Expr | undefined {
  const module = anchor.unit.module;
  const decl = module.decls.find((d) => d.k === "const" && d.name === anchor.unit.exportName);
  if (decl?.k !== "const" || decl.init.k !== "call") return undefined;
  const [description, body] = decl.init.args;
  if (anchor.entry) {
    const { heading, name } = anchor.entry;
    if (body?.k === "obj") {
      const under = body.props.find((p): p is Extract<Prop, { k: "prop" }> => p.k === "prop" && p.key === heading);
      const entry = under?.value.k === "obj" ? under.value.props.find((p) => p.k === "prop" && p.key === name) : undefined;
      if (entry?.k === "prop" && isSentence(entry.value)) return entry.value;
      // a method whose only sentence is one fragment: that sentence
      const method = under?.value.k === "obj" ? under.value.props.find((p) => p.k === "method" && p.key === name) : undefined;
      const inside = method ? fragmentsIn(method) : [];
      if (inside.length === 1) return inside[0].sentence;
    }
    const kind = FRAGMENT_OF[heading];
    if (kind) {
      // a fragment written in a body: in this component first, then anywhere in the file
      const own = fragmentsIn(decl.init).find((f) => f.kind === kind && f.name === name);
      const anywhere = own ?? module.decls.flatMap((d) => (d.k === "const" ? fragmentsIn(d.init) : [])).find((f) => f.kind === kind && f.name === name);
      if (anywhere) return anywhere.sentence;
    }
  }
  return description && isSentence(description) ? description : undefined;
}

const isSentence = (expr: Expr): boolean => expr.k === "str" || expr.k === "tmpl" || (expr.k === "bin" && expr.op === "+" && isSentence(expr.left) && isSentence(expr.right));

function fragmentsIn(root: unknown): { kind: string; name: string; sentence: Expr }[] {
  const found: { kind: string; name: string; sentence: Expr }[] = [];
  const visit = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== "object") return;
    const n = node as { k?: string } & Record<string, unknown>;
    if (n.k === "call") {
      const call = n as Extract<Expr, { k: "call" }>;
      if (call.callee.k === "member" && call.callee.object.k === "id" && ["is", "does", "value"].includes(call.callee.object.name) && call.args[0] && isSentence(call.args[0])) {
        found.push({ kind: call.callee.object.name, name: call.callee.name, sentence: call.args[0] });
      }
    }
    for (const [key, value] of Object.entries(n)) if (key !== "at") visit(value);
  };
  visit(root);
  return found;
}

/**
 * Appends a person's words to the sentence a question is about. Returns the new text of the Layer 1 file and the
 * line that changed; `text` is the file as it is now (several supplements to one file are applied one after another).
 */
export function supplement(anchor: Anchor, words: string, text: string): { text: string; line: number } | undefined {
  const sentence = sentenceOf(anchor);
  if (!sentence) return undefined;
  // the last literal of the sentence ("a" + "b" → "b")
  let last = sentence;
  while (last.k === "bin") last = last.right;
  const lines = text.split("\n");
  const start = lines.slice(0, last.at.line - 1).reduce((n, l) => n + l.length + 1, 0) + last.at.col - 1;
  const quote = text[start];
  const close = closingQuote(text, start);
  if (close === undefined) return undefined;
  const before = text.slice(start + 1, close);
  const added = separator(before) + escaped(words.trim(), quote);
  return { text: text.slice(0, close) + added + text.slice(close), line: text.slice(0, close).split("\n").length };
}

// a space after a finished sentence; a sentence left unfinished is finished first (in its own language)
const CJK = /[\u3000-\u30ff\u4e00-\u9fff\uff00-\uffef]/;
function separator(before: string): string {
  const text = before.trimEnd();
  if (text === "") return "";
  const japanese = CJK.test(text.at(-1)!);
  if (/[.!?。！？]$/.test(text)) return before !== text || japanese ? "" : " ";
  return japanese ? "。" : before !== text ? "" : ". ";
}

function closingQuote(text: string, start: number): number | undefined {
  const quote = text[start];
  let depth = 0;
  for (let i = start + 1; i < text.length; i++) {
    const c = text[i];
    if (c === "\\") {
      i++;
      continue;
    }
    if (quote === "`") {
      if (c === "$" && text[i + 1] === "{") {
        depth++;
        i++;
        continue;
      }
      if (depth > 0) {
        if (c === "}") depth--;
        continue;
      }
    }
    if (c === quote) return i;
    if (quote !== "`" && c === "\n") return undefined;
  }
  return undefined;
}

function escaped(words: string, quote: string): string {
  const text = words.replace(/\\/g, "\\\\").replace(/\r?\n/g, quote === "`" ? "\n" : " ").split(quote).join(`\\${quote}`);
  return quote === "`" ? text.replace(/\$\{/g, "\\${") : text;
}

/** The supplements of several answers, file by file, with the lines that changed (what the person confirms). */
export function supplementAll(program: Program, answers: { review: Review; words: string }[]): { files: Map<string, string>; changes: Supplement[]; unplaced: Review[] } {
  const files = new Map<string, string>();
  const unplaced: Review[] = [];
  for (const { review, words } of answers) {
    const anchor = anchorOf(program, review);
    if (!anchor) {
      unplaced.push(review);
      continue;
    }
    const file = anchor.unit.file;
    const now = files.get(file) ?? readFileSync(file, "utf8");
    const done = supplement(anchor, words, now);
    if (!done) {
      unplaced.push(review);
      continue;
    }
    files.set(file, done.text);
  }
  const changes: Supplement[] = [];
  for (const [file, text] of files) {
    const old = readFileSync(file, "utf8").split("\n");
    text.split("\n").forEach((line, i) => {
      if (line !== old[i]) changes.push({ file: rel(file), line: i + 1, before: old[i], after: line });
    });
  }
  return { files, changes, unplaced };
}

/** The changes as a diff a person reads. */
export const diffOf = (changes: Supplement[]) =>
  [...new Set(changes.map((c) => c.file))]
    .map((file) => [`--- ${file}`, `+++ ${file}`, ...changes.filter((c) => c.file === file).flatMap((c) => [`@@ ${c.line} @@`, `-${c.before}`, `+${c.after}`])].join("\n"))
    .join("\n");
