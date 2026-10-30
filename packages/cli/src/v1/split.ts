// The proposal of how to split a component (DSL.md §17.19): `clp run` asks an LLM, once, whether a large component given
// only as sentences is really several, and shows the person the change to Layer 1. The LLM's words reach Layer 1 only
// when the person has seen that change and accepted it. A component is a candidate from the state of the specs alone:
// declining leaves it to be interpreted, and a component with an interpretation is never proposed for again.

import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { scrubEnv } from "../gates.ts";
import type { ImplementationStrategy } from "../strategy.ts";
import type { Program, Unit } from "./read.ts";
import { closingQuote } from "./supplement.ts";
import type { Expr } from "./syntax.ts";

export type SplitPart = { name: string; description: string; because: string };
export type SplitProposal = { component: string; arrangement: "inside" | "separate"; description: string; parts: SplitPart[] };
export type SplitOptions = { strategy: ImplementationStrategy; maxAttempts?: number; log?: (line: string) => void };

const SPEC_DIR = "spec";
const REQUEST = "clp/REQUEST.md";
const ANSWER = "clp/split.json";
const sentences = (text: string) => text.split(/[.!?。！？]+(?:\s|$)|[。！？]+/).filter((s) => s.trim() !== "").length;
const rel = (file: string) => relative(process.cwd(), file).split(sep).join("/");

function names(root: unknown, name: string): boolean {
  if (Array.isArray(root)) return root.some((node) => names(node, name));
  if (!root || typeof root !== "object") return false;
  const n = root as { k?: string; name?: string } & Record<string, unknown>;
  if (n.k === "id" && n.name === name) return true;
  return Object.entries(n).some(([key, value]) => key !== "at" && names(value, name));
}

/** The components worth asking about: several sentences and nothing else, never interpreted, connected to nothing. */
export function candidatesOf(program: Program): Unit[] {
  return program.units
    .filter((unit) => unit.kind === "service" && unit.proseOnly && unit.interpretation === undefined && unit.description && unit.description.embedded.length === 0 && sentences(unit.description.text) > 1)
    .filter((unit) => ![...program.modules.values()].some((module) => module.decls.some((decl) => decl.name !== unit.exportName && names(decl, unit.exportName))))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function request(unit: Unit, specsDir: string, attempt: number, problems: string | undefined): string {
  return `# Propose how to split a component (attempt ${attempt})

The files under \`${SPEC_DIR}/\` are a specification written in clp's notation. A person wrote \`${SPEC_DIR}/${relative(specsDir, unit.file).split(sep).join("/")}\`, and its
component \`${unit.exportName}\` is given only as sentences:

> ${unit.description!.text.split("\n").join("\n> ")}

Read it and decide whether it describes **several components**: parts with their own state and their own commands or
queries, which could be understood and verified on their own. Do not split for the sake of it: one thing described at
length stays one component. Change nothing under \`${SPEC_DIR}/\`. Write your answer to \`${ANSWER}\`, and only that file.

If it should stay one component:

\`\`\`json
{ "split": false }
\`\`\`

Otherwise:

\`\`\`json
{
  "split": true,
  "arrangement": "inside",
  "description": "The library. It lends books. Fines are worked out by \${Fines}, and membership is asked of \${Members}.",
  "parts": [
    { "name": "Fines", "description": "What the component says about fines.", "because": "Why this is a part of its own." }
  ]
}
\`\`\`

- \`arrangement\`: \`"inside"\` when the parts belong to \`${unit.exportName}\` (it keeps its behaviour and calls them);
  \`"separate"\` when they run separately and \`${unit.exportName}\` only names them (each then has everything that was said).
  \`"inside"\` has at least one part; \`"separate"\` at least two.
- \`description\`: the new description of \`${unit.exportName}\`. With \`"inside"\` it embeds every part once as \`\${Name}\`, where
  the sentences about that part were. With \`"separate"\` it embeds nothing.
- \`parts[].name\`: a new name in PascalCase, not used anywhere in the specification.
- \`parts[].description\`: everything the original says about that part. It embeds nothing.
- \`parts[].because\`: one sentence for the person who decides, in the language of the specification.

Between them the descriptions must keep everything the original says, in the author's own words wherever you can: the
person decides from the change to their text, and nothing is added that they did not say.
${problems ? `\n## Your previous answer was rejected\n\n${problems}\n` : ""}`;
}

/** What is wrong with an answer (undefined when it can be written into Layer 1); `null` means "do not split". */
export function readAnswer(text: string, unit: Unit): { proposal?: Omit<SplitProposal, "component"> | null; problems?: string } {
  let answer: unknown;
  try {
    answer = JSON.parse(text);
  } catch (error) {
    return { problems: `${ANSWER} is not JSON: ${(error as Error).message}` };
  }
  const a = answer as { split?: unknown; arrangement?: unknown; description?: unknown; parts?: unknown };
  if (a === null || typeof a !== "object" || typeof a.split !== "boolean") return { problems: '"split" must be true or false.' };
  if (a.split === false) return { proposal: null };
  const found: string[] = [];
  const arrangement = a.arrangement;
  if (arrangement !== "inside" && arrangement !== "separate") found.push('"arrangement" must be "inside" or "separate".');
  const parts = (Array.isArray(a.parts) ? a.parts : []) as Partial<SplitPart>[];
  if (parts.length < (arrangement === "separate" ? 2 : 1)) found.push(`"parts" has too few parts for "${String(arrangement)}".`);
  if (typeof a.description !== "string" || a.description.trim() === "") found.push('"description" must be a sentence.');
  const source = readFileSync(unit.file, "utf8");
  const seen = new Set<string>();
  for (const part of parts) {
    const name = typeof part?.name === "string" ? part.name : "";
    if (!/^[A-Z][A-Za-z0-9]*$/.test(name)) found.push(`"${name}" is not a name in PascalCase.`);
    else if (seen.has(name) || new RegExp(`\\b${name}\\b`).test(source)) found.push(`The name ${name} is already in use.`);
    seen.add(name);
    for (const field of ["description", "because"] as const) {
      if (typeof part?.[field] !== "string" || part[field].trim() === "") found.push(`${name}: "${field}" must be a sentence.`);
    }
    if (typeof part?.description === "string" && part.description.includes("${")) found.push(`${name}: its description embeds nothing.`);
  }
  if (typeof a.description === "string") {
    const embedded = [...a.description.matchAll(/\$\{([^}]*)\}/g)].map((m) => m[1]);
    const wanted = arrangement === "inside" ? [...seen].sort() : [];
    if ([...embedded].sort().join() !== wanted.join()) found.push(`"description" must embed ${wanted.length ? wanted.map((n) => `\${${n}}`).join(", ") + " once each" : "nothing"}, but embeds: ${embedded.join(", ") || "nothing"}.`);
  }
  if (found.length > 0) return { problems: found.join("\n") };
  return { proposal: { arrangement: arrangement as SplitProposal["arrangement"], description: a.description as string, parts: parts as SplitPart[] } };
}

/** One LLM session (and its attempts) for a candidate. A proposal, or undefined: stay one component, or no usable answer. */
export async function proposeSplit(unit: Unit, specsDir: string, options: SplitOptions): Promise<{ proposal?: SplitProposal; problems?: string }> {
  const log = options.log ?? (() => {});
  const files = (readdirSync(specsDir, { recursive: true }) as string[]).filter((file) => file.endsWith(".ts"));
  let problems: string | undefined;
  const maxAttempts = options.maxAttempts ?? 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const sandbox = mkdtempSync(join(realpathSync(tmpdir()), "clp-"));
    try {
      for (const file of files) {
        mkdirSync(dirname(join(sandbox, SPEC_DIR, file)), { recursive: true });
        writeFileSync(join(sandbox, SPEC_DIR, file), readFileSync(join(specsDir, file), "utf8"));
      }
      mkdirSync(join(sandbox, "clp"), { recursive: true });
      writeFileSync(join(sandbox, REQUEST), request(unit, specsDir, attempt, problems));
      log(`[split #${attempt}] ${options.strategy.name} (in ${sandbox})`);
      await options.strategy.run({ dir: sandbox, phase: "split", attempt, env: scrubEnv(process.env, [...new Set([process.cwd(), specsDir])]) });
      const answer = join(sandbox, ANSWER);
      const read = existsSync(answer) ? readAnswer(readFileSync(answer, "utf8"), unit) : { problems: `${ANSWER} is missing.` };
      if (read.problems === undefined) return read.proposal ? { proposal: { component: unit.id, ...read.proposal } } : {};
      problems = read.problems;
      log(`[split #${attempt}] rejected\n${problems}`);
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  }
  return { problems };
}

const templateOf = (text: string) => `\`${text.replace(/\\/g, "\\\\").replace(/`/g, "\\`")}\``;
const camel = (name: string) => name.charAt(0).toLowerCase() + name.slice(1);

/** The text of the file with the proposal written in, and the change as a diff a person reads. */
export function splitChange(unit: Unit, proposal: SplitProposal): { file: string; text: string; diff: string } {
  const text = readFileSync(unit.file, "utf8");
  const decl = unit.module.decls.find((d) => d.k === "const" && d.name === unit.exportName);
  if (decl?.k !== "const" || decl.init.k !== "call") throw new Error(`${unit.exportName} の定義が読めません`);
  const lines = text.split("\n");
  const offset = (at: { line: number; col: number }) => lines.slice(0, at.line - 1).reduce((n, l) => n + l.length + 1, 0) + at.col - 1;
  let first: Expr = decl.init.args[0];
  while (first.k === "bin") first = first.left;
  let last: Expr = decl.init.args[0];
  while (last.k === "bin") last = last.right;
  const start = offset(first.at);
  const close = closingQuote(text, offset(last.at));
  if (close === undefined) throw new Error(`${unit.exportName} の説明の文が読めません`);
  const inside = proposal.arrangement === "inside";
  const components = inside ? "" : `, { components: { ${proposal.parts.map((p) => `${camel(p.name)}: ${p.name}`).join(", ")} } }`;
  const body = text.slice(0, start) + (inside ? templateOf(proposal.description) : JSON.stringify(proposal.description)) + components + text.slice(close + 1);
  // the parts just above the component (and above the comments that belong to it)
  const comments = new Set(unit.module.comments.map((c) => c.line));
  let line = decl.at.line;
  while (comments.has(line - 1)) line--;
  const before = body.split("\n");
  const declared = proposal.parts.map((p) => `export const ${p.name} = service(${JSON.stringify(p.description)});`);
  before.splice(line - 1, 0, ...declared);
  const next = before.join("\n");
  return { file: unit.file, text: next, diff: diffOf(rel(resolve(unit.file)), text, next) };
}

function diffOf(file: string, before: string, after: string): string {
  const [a, b] = [before.split("\n"), after.split("\n")];
  let head = 0;
  while (head < a.length && a[head] === b[head]) head++;
  let tail = 0;
  while (tail < a.length - head && tail < b.length - head && a[a.length - 1 - tail] === b[b.length - 1 - tail]) tail++;
  return [`--- ${file}`, `+++ ${file}`, `@@ ${head + 1} @@`, ...a.slice(head, a.length - tail).map((l) => `-${l}`), ...b.slice(head, b.length - tail).map((l) => `+${l}`)].join("\n");
}
