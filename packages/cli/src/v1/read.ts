// Reading a 1.0 spec directory (DSL.md §17.7): parse every file, resolve names across files, find the components and
// their interpretations, and lay each interpretation over its Layer 1 (Layer 1 wins). Nothing is executed.
//
// The result is the merged declaration of every unit (component, external, decision table, named condition or
// calculation) — still syntax inside: bodies become expressions in build.ts.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { parseModule, SyntaxError1 } from "./syntax.ts";
import type { Block, Decl, Expr, Module, Param, Pos, Prop, TypeNode } from "./syntax.ts";
import { overlayStage0 } from "./overlay.ts";
import type { OverlayFacts } from "./overlay.ts";
import { decided } from "./decide.ts";

export const CORE = "@clp/core/v1";
export const DRAFT_SUFFIX = ".draft.ts";
const INTERPRETATION_FILE = /\.interpretation(\.draft)?\.ts$/;

export type Severity = "error" | "warning";
export type Problem = { severity: Severity; code: string; where: string; message: string; at?: Pos };
export const problemText = (p: Problem) => `${p.severity}[${p.code}] ${p.where === "" ? "" : `${p.where}: `}${p.message}`;

export type UnitKind = "service" | "external" | "decisions" | "condition" | "calc";
export const HEADINGS = ["state", "commands", "queries", "rules", "examples", "conditions", "calcs", "decisions", "components", "does"] as const;
export type Heading = (typeof HEADINGS)[number];
const SETTINGS = ["durable", "routes", "assets"] as const;

/** Who wrote an entry. */
export type Layer = 1 | 2;
/** One entry under a heading: prose (a component whose contents are not written yet), or what was written. */
export type Entry = {
  name: string;
  heading: Heading;
  layer: Layer;
  prose?: string;
  /** For a method: its parameters, return type and body. For anything else: the expression written. */
  method?: { params: Param[]; ret?: TypeNode; body: Block };
  value?: Expr;
  /** The prose a filled entry replaced (Layer 1's sentence), kept for notes and tracing. */
  replaced?: string;
  at: Pos;
};

export type Unit = {
  kind: UnitKind;
  /** The name it is exported (or declared) under, and its name in file names and the IR. */
  exportName: string;
  id: string;
  module: Module;
  file: string;
  at: Pos;
  description?: { text: string; embedded: Expr[] };
  /** Prose only: Layer 1 gave nothing but the description. */
  proseOnly: boolean;
  entries: Map<string, Entry>;
  /** Headings Layer 1 wrote (a command or query heading written there is closed to new entries). */
  layer1Headings: Set<Heading>;
  settings: { durable?: true; routes?: Record<string, string>; assets?: Expr };
  /** External: the ports. */
  ports?: { queries: Map<string, { params: Param[]; ret?: TypeNode; promise: Expr | undefined; at: Pos }>; commands: Map<string, { params: Param[]; at: Pos }> };
  /** Decision tables, named conditions and calculations: the parameters and the body. */
  fn?: { params: Param[]; body: Expr | Block; ret?: TypeNode };
  /** The interpretation laid over it, if any (file, stamp line). */
  interpretation?: { file: string; module: Module; at: Pos; stamp?: string };
  /** Which elements each sentence of the description became (written by the interpretation under `trace`). */
  trace: Map<string, string[]>;
};

export type Program = {
  root: string;
  modules: Map<string, Module>;
  units: Unit[];
  problems: Problem[];
  /** Open review marks left in interpretation files. */
  reviews: { file: string; line: number; text: string; by: "interpreter" | "clp" }[];
};

// --- Names ---

/** The name a component goes by in file names and the IR: the export name in kebab case (`Order` → `order`). */
export const componentName = (exportName: string) =>
  exportName.replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/([A-Z])([A-Z][a-z])/g, "$1-$2").toLowerCase();

export type Sym =
  | { k: "core"; name: string }
  | { k: "const"; decl: Extract<Decl, { k: "const" }>; module: Module }
  | { k: "type"; decl: Extract<Decl, { k: "type" }>; module: Module }
  | { k: "unknown"; name: string };

export class Names {
  private modules: Map<string, Module>;
  constructor(modules: Map<string, Module>) {
    this.modules = modules;
  }
  /** What a name used in a module refers to. */
  resolve(module: Module, name: string, seen = new Set<string>()): Sym {
    const local = module.decls.find((decl) => decl.name === name);
    if (local) return local.k === "const" ? { k: "const", decl: local, module } : { k: "type", decl: local, module };
    for (const imp of module.imports) {
      const found = imp.names.find((n) => n.local === name);
      if (!found) continue;
      if (imp.from === CORE) return { k: "core", name: found.imported };
      if (!imp.from.startsWith(".")) return { k: "unknown", name };
      const target = this.modules.get(resolve(dirname(module.file), imp.from));
      if (!target) return { k: "unknown", name };
      const key = `${target.file}#${found.imported}`;
      if (seen.has(key)) return { k: "unknown", name };
      seen.add(key);
      const decl = target.decls.find((d) => d.name === found.imported && d.exported);
      if (!decl) return { k: "unknown", name };
      return this.resolve(target, found.imported, seen);
    }
    return { k: "unknown", name };
  }
}

// --- Scanning ---

const isCall = (expr: Expr | undefined, names: Names, module: Module, core: string): expr is Extract<Expr, { k: "call" }> =>
  expr?.k === "call" && expr.callee.k === "id" && (() => {
    const sym = names.resolve(module, (expr.callee as { name: string }).name);
    return sym.k === "core" && sym.name === core;
  })();

const where = (unit: Pick<Unit, "exportName">, ...path: string[]) => [unit.exportName, ...path].join(".");

/** A sentence: a string, a template string, or strings joined with `+` (a long sentence over several lines). */
export function proseOf(expr: Expr | undefined): string | undefined {
  if (!expr) return undefined;
  if (expr.k === "str") return expr.value;
  if (expr.k === "bin" && expr.op === "+") {
    const left = proseOf(expr.left);
    const right = proseOf(expr.right);
    return left === undefined || right === undefined ? undefined : left + right;
  }
  if (expr.k === "tmpl") return expr.quasis.reduce((text, quasi, i) => text + quasi + (i < expr.exprs.length ? `\${${describeEmbedded(expr.exprs[i])}}` : ""), "");
  return undefined;
}
const describeEmbedded = (expr: Expr) => (expr.k === "id" ? expr.name : "…");

/** Reads every file of a spec directory. Drafts are read only with `drafts: true`, and then replace their reviewed file. */
export function readProgram(dir: string, options: { drafts?: boolean } = {}): Program {
  const root = resolve(process.cwd(), dir);
  if (!existsSync(root)) throw new Error(`仕様のディレクトリがありません: ${root}\n  場所を指定するか (--specs <dir>。clp compile では引数)、仕様 (specs/) のあるディレクトリで実行してください`);
  const all = (readdirSync(root, { recursive: true }) as string[]).filter((file) => file.endsWith(".ts") && !file.endsWith(".d.ts")).sort();
  const drafts = all.filter((file) => file.endsWith(DRAFT_SUFFIX));
  const replaced = new Set(drafts.map((file) => `${file.slice(0, -DRAFT_SUFFIX.length)}.ts`));
  const files = options.drafts ? all.filter((file) => !replaced.has(file)) : all.filter((file) => !file.endsWith(DRAFT_SUFFIX));
  const problems: Problem[] = [];
  const modules = new Map<string, Module>();
  const reviews: Program["reviews"] = [];
  for (const file of files) {
    const path = join(root, file);
    const source = readFileSync(path, "utf8");
    const rel = relative(process.cwd(), path).split(sep).join("/");
    try {
      const module = parseModule(source, path);
      modules.set(path, module);
      // the same module under the draft's name, so that `./x.interpretation.ts` imports it
      if (file.endsWith(DRAFT_SUFFIX)) modules.set(join(root, `${file.slice(0, -DRAFT_SUFFIX.length)}.ts`), module);
    } catch (error) {
      if (!(error instanceof SyntaxError1)) throw error;
      problems.push({ severity: "error", code: "syntax", where: `${rel}:${error.at.line}:${error.at.col}`, message: error.message.replace(/^.*?: /, ""), at: error.at });
    }
    if (INTERPRETATION_FILE.test(file)) {
      source.split("\n").forEach((line, index) => {
        const match = /\/\/\s*REVIEW(\(clp\))?:\s*(.*)$/.exec(line);
        if (match) reviews.push({ file: rel, line: index + 1, text: match[2].trim(), by: match[1] ? "clp" : "interpreter" });
      });
    }
  }
  const names = new Names(modules);
  const units = findUnits([...new Set(modules.values())], names, problems);
  for (const module of new Set(modules.values())) overlayInterpretations(module, names, units, problems);
  return { root, modules, units, problems, reviews };
}

function findUnits(modules: Module[], names: Names, problems: Problem[]): Unit[] {
  const units: Unit[] = [];
  for (const module of modules) {
    for (const decl of module.decls) {
      if (decl.k !== "const" || decl.init.k !== "call" || decl.init.callee.k !== "id") continue;
      const sym = names.resolve(module, decl.init.callee.name);
      if (sym.k !== "core") continue;
      const kind = (["service", "external", "decisions", "condition", "calc"] as const).find((k) => k === sym.name);
      if (!kind) continue;
      const unit: Unit = {
        kind,
        exportName: decl.name,
        id: kind === "service" || kind === "external" ? componentName(decl.name) : decl.name.charAt(0).toLowerCase() + decl.name.slice(1),
        module,
        file: module.file,
        at: decl.at,
        proseOnly: false,
        entries: new Map(),
        layer1Headings: new Set(),
        settings: {},
        trace: new Map(),
      };
      readUnit(unit, decl.init.args, problems);
      const same = units.find((other) => other.id === unit.id && other.kind === unit.kind);
      if (same) problems.push({ severity: "error", code: "name-collision", where: decl.name, message: `部品の名前 "${unit.id}" が重なっています (${same.file} と ${module.file})` });
      units.push(unit);
    }
  }
  return units;
}

function readUnit(unit: Unit, args: Expr[], problems: Problem[]) {
  const fail = (code: string, message: string, at: Pos, path: string[] = []) => problems.push({ severity: "error", code, where: where(unit, ...path), message, at });
  let rest = args;
  const text = proseOf(rest[0]);
  if (text !== undefined) {
    unit.description = { text, embedded: rest[0].k === "tmpl" ? rest[0].exprs : [] };
    rest = rest.slice(1);
  }
  if (unit.kind === "decisions" || unit.kind === "condition" || unit.kind === "calc") {
    const fn = rest[0];
    if (!fn) {
      if (unit.kind === "decisions") fail("bad-decision", "決定表には、行を返す関数が要ります", unit.at);
      else unit.proseOnly = true;
      return;
    }
    if (fn.k !== "arrow") return fail("syntax", "2つ目の引数は、アロー関数 (引数) => … で書きます", fn.at);
    unit.fn = { params: fn.params, body: fn.body, ret: fn.ret };
    return;
  }
  const contents = rest[0];
  if (rest.length > 1) fail("syntax", "引数が多すぎます。説明の文と、中身の { … } だけを書きます", rest[1].at);
  if (!contents) {
    unit.proseOnly = unit.kind === "service";
    if (unit.kind === "external") fail("syntax", "external には、約束 ({ queries, commands }) が要ります", unit.at);
    return;
  }
  if (contents.k !== "obj") return fail("syntax", "中身は { 見出し: { … } } の形で書きます", contents.at);
  if (unit.kind === "external") return readPorts(unit, contents, problems);
  readHeadings(unit, contents, 1, problems);
}

function readPorts(unit: Unit, contents: Extract<Expr, { k: "obj" }>, problems: Problem[]) {
  const ports: NonNullable<Unit["ports"]> = { queries: new Map(), commands: new Map() };
  unit.ports = ports;
  for (const prop of contents.props) {
    if (prop.k !== "prop" || (prop.key !== "queries" && prop.key !== "commands") || prop.value.k !== "obj") {
      problems.push({ severity: "error", code: "syntax", where: where(unit), message: "external の約束には、queries と commands だけを書きます", at: prop.at });
      continue;
    }
    for (const port of prop.value.props) {
      if (prop.key === "queries") {
        if (port.k === "prop" && port.value.k === "arrow") {
          const body = port.value.body;
          ports.queries.set(port.key, { params: port.value.params, ret: port.value.ret, promise: body.k === "block" ? undefined : body, at: port.at });
        } else if (port.k === "method") {
          const ret = port.body.body.find((s) => s.k === "return");
          ports.queries.set(port.key, { params: port.params, ret: port.ret, promise: ret?.k === "return" ? ret.expr : undefined, at: port.at });
        } else problems.push({ severity: "error", code: "syntax", where: where(unit, port.k === "spread" ? "…" : port.key), message: "問い合わせは (引数): 型 => answer(…) で書きます", at: port.at });
      } else {
        if (port.k === "method") ports.commands.set(port.key, { params: port.params, at: port.at });
        else if (port.k === "prop" && port.value.k === "arrow") ports.commands.set(port.key, { params: port.value.params, at: port.at });
        else problems.push({ severity: "error", code: "syntax", where: where(unit, port.k === "spread" ? "…" : port.key), message: "コマンドは 名前(引数) {} で書きます", at: port.at });
      }
    }
  }
}

function readHeadings(unit: Unit, contents: Extract<Expr, { k: "obj" }>, layer: Layer, problems: Problem[]) {
  for (const prop of contents.props) {
    if (prop.k === "spread") {
      problems.push({ severity: "error", code: "syntax", where: where(unit), message: "中身に ... は書けません", at: prop.at });
      continue;
    }
    if ((SETTINGS as readonly string[]).includes(prop.key) && prop.k === "prop") {
      if (layer === 2) {
        problems.push({ severity: "error", code: "overwrite", where: where(unit, prop.key), message: `${prop.key} は Layer 1 だけが書けます`, at: prop.at });
        continue;
      }
      if (prop.key === "durable") {
        if (prop.value.k === "bool" && prop.value.value) unit.settings.durable = true;
        else problems.push({ severity: "error", code: "syntax", where: where(unit, "durable"), message: "durable には true を書きます", at: prop.at });
      } else if (prop.key === "routes") {
        if (prop.value.k !== "obj") problems.push({ severity: "error", code: "syntax", where: where(unit, "routes"), message: "routes は { コマンド: \"POST /path\" } で書きます", at: prop.at });
        else unit.settings.routes = Object.fromEntries(prop.value.props.flatMap((p) => (p.k === "prop" && p.value.k === "str" ? [[p.key, p.value.value]] : [])));
      } else unit.settings.assets = prop.value;
      continue;
    }
    if (layer === 2 && prop.key === "trace" && prop.k === "prop" && prop.value.k === "obj") {
      for (const t of prop.value.props) {
        if (t.k !== "prop") continue;
        const targets = t.value.k === "arr" ? t.value.items.flatMap((i) => (i.k === "str" ? [i.value] : [])) : t.value.k === "str" ? [t.value.value] : [];
        unit.trace.set(t.key, targets);
      }
      continue;
    }
    const heading = (HEADINGS as readonly string[]).includes(prop.key) ? (prop.key as Heading) : undefined;
    if (!heading || prop.k !== "prop" || prop.value.k !== "obj") {
      problems.push({
        severity: "error",
        code: "unknown-heading",
        where: where(unit, prop.key),
        message: `見出しは ${HEADINGS.join(" / ")} のどれかで、中身は { … } です`,
        at: prop.at,
      });
      continue;
    }
    if (layer === 1) unit.layer1Headings.add(heading);
    for (const item of prop.value.props) {
      if (item.k === "spread") {
        problems.push({ severity: "error", code: "syntax", where: where(unit, heading), message: "見出しの中に ... は書けません", at: item.at });
        continue;
      }
      const entry = entryOf(heading, item, layer);
      if (layer === 1) {
        const same = unit.entries.get(entry.name);
        if (same) {
          problems.push({ severity: "error", code: "name-collision", where: where(unit, heading, entry.name), message: `"${entry.name}" は ${same.heading} にもあります。名前は部品の中で1つです`, at: item.at });
          continue;
        }
        unit.entries.set(entry.name, entry);
      } else overlayEntry(unit, entry, problems);
    }
  }
}

function entryOf(heading: Heading, item: Exclude<Prop, { k: "spread" }>, layer: Layer): Entry {
  if (item.k === "method") return { name: item.key, heading, layer, method: { params: item.params, ret: item.ret, body: item.body }, at: item.at };
  const prose = proseOf(item.value);
  // a bare string is prose — except under `state`, where a string constant cannot be a state declaration either
  if (prose !== undefined) return { name: item.key, heading, layer, prose, at: item.at };
  if (item.value.k === "arrow" && heading !== "state" && heading !== "examples" && heading !== "components") {
    const body = item.value.body;
    return {
      name: item.key,
      heading,
      layer,
      method: { params: item.value.params, ret: item.value.ret, body: body.k === "block" ? body : { k: "block", body: [{ k: "return", expr: body, at: body.at }], at: body.at } },
      at: item.at,
    };
  }
  return { name: item.key, heading, layer, value: item.value, at: item.at };
}

// The interpretation fills what Layer 1 left as prose, under the same heading. It never overrides what Layer 1 wrote.
function overlayEntry(unit: Unit, entry: Entry, problems: Problem[]) {
  const fail = (code: string, message: string) => problems.push({ severity: "error", code, where: where(unit, entry.heading, entry.name), message, at: entry.at });
  const written = unit.entries.get(entry.name);
  const facts: OverlayFacts = {
    existing: !written ? "none" : written.layer === 2 ? "interpretation" : written.prose === undefined ? "code" : "prose",
    sameHeading: written?.heading === entry.heading,
    closedHeading: (entry.heading === "commands" || entry.heading === "queries") && unit.layer1Headings.has(entry.heading),
    layer1Only: entry.heading === "examples" || entry.heading === "components",
  };
  switch (decided("overlay-check", facts, overlayStage0(facts))) {
    case "wrong-heading":
      return fail("wrong-heading", `Layer 1 では ${written!.heading} の "${entry.name}" です。解釈は同じ見出しで埋めます`);
    case "twice":
      return fail("name-collision", `"${entry.name}" を2回埋めています`);
    case "overwrite":
      return fail("overwrite", `Layer 1 が書いた "${entry.name}" は、解釈では書き換えられません（Layer 1 が勝ちます）`);
    case "closed-heading":
      return fail("closed-heading", `Layer 1 が ${entry.heading} を書いているので、解釈は新しい ${entry.heading === "commands" ? "コマンド" : "問い合わせ"} を足せません`);
    case "layer1-only":
      return fail("overwrite", `${entry.heading} は Layer 1 だけが書けます`);
    case "fill":
      unit.entries.set(entry.name, { ...entry, replaced: written!.prose });
      return;
    case "add":
      unit.entries.set(entry.name, entry);
  }
}

function overlayInterpretations(module: Module, names: Names, units: Unit[], problems: Problem[]) {
  for (const decl of module.decls) {
    if (decl.k !== "const" || !isCall(decl.init, names, module, "interpretation")) continue;
    const [target, contents] = decl.init.args;
    const fail = (message: string, at: Pos) => problems.push({ severity: "error", code: "bad-interpretation", where: decl.name, message, at });
    if (target?.k !== "id") {
      fail("interpretation の最初の引数は、部品の名前です", decl.at);
      continue;
    }
    const sym = names.resolve(module, target.name);
    const unit = sym.k === "const" ? units.find((u) => u.module === sym.module && u.exportName === sym.decl.name) : undefined;
    if (!unit) {
      fail(`"${target.name}" は部品ではありません`, target.at);
      continue;
    }
    if (unit.interpretation) {
      fail(`${unit.exportName} の解釈が2つあります (${unit.interpretation.file} と ${module.file})`, decl.at);
      continue;
    }
    if (unit.kind === "external") {
      fail("external には解釈がありません（約束だけを持つ部品です）", decl.at);
      continue;
    }
    unit.interpretation = { file: module.file, module, at: decl.at, stamp: stampIn(module, unit.exportName) };
    if (contents?.k !== "obj") {
      fail("解釈の中身は { 見出し: { … } } の形で書きます", decl.at);
      continue;
    }
    if (unit.kind !== "service") {
      // a decision table, condition or calculation: only `conditions` / `calcs` fill its fragments
      readHeadings(unit, contents, 2, problems);
      continue;
    }
    readHeadings(unit, contents, 2, problems);
  }
}

/** The stamp of one interpretation in its file: `// layer1 Library: sha256:…`. */
export const stampLine = (exportName: string, hash: string) => `// layer1 ${exportName}: ${hash}`;
function stampIn(module: Module, exportName: string): string | undefined {
  const prefix = `layer1 ${exportName}: `;
  const comment = module.comments.find((c) => c.text.startsWith(prefix));
  return comment?.text.slice(prefix.length);
}
