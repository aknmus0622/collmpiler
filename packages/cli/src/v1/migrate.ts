// Moving a 0.3 Layer 1 to the 1.0 notation (DSL.md §17.16, "0.3 の書き方からの移し方"): a starting point, written as
// source, for a person to read and correct. Mechanical: groups become headings, handles become names, states become
// a state field, `from` / `onlyIf` become `requires`, dependencies become an `external`, a decision-table column
// becomes a call. Every sentence stays a sentence; meaning is never invented (the interpretation is derived again).
// It exists only for the move from 0.3, and goes with the 0.3 vocabulary.

import { pathToFileURL } from "node:url";
import { join, resolve } from "node:path";
import { readdirSync } from "node:fs";
import { compositionOf, handlesOf } from "@clp/core";
import type { Composition, FieldSchema, Layer1 } from "@clp/core";
import { componentName, listComponents, loadSpecs } from "../loader.ts";

const quote = (text: string) => JSON.stringify(text);
const STOP = new Set(["the", "a", "an", "is", "are", "of", "and", "or", "to", "it", "its", "in", "that", "this", "has", "be", "by", "for"]);
function keyOf(sentence: string, taken: Set<string>): string {
  const words = sentence.replace(/[^A-Za-z0-9 ]/g, " ").split(/\s+/).filter((w) => w !== "" && !STOP.has(w.toLowerCase())).slice(0, 4);
  let base = words.map((w, i) => (i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase())).join("") || "condition";
  if (/^\d/.test(base)) base = `c${base}`;
  let key = base;
  for (let n = 2; taken.has(key); n++) key = `${base}${n}`;
  taken.add(key);
  return key;
}

export function typeText(schema: FieldSchema | undefined): string {
  if (schema === undefined) return "unknown";
  if (schema === "boolean") return "boolean";
  if (schema === "integer" || schema === "number") return "Int";
  if (schema === "string") return "string";
  if (schema === "value") return "Json";
  if (Array.isArray(schema)) return schema.map((v) => JSON.stringify(v)).join(" | ");
  const s = schema as Record<string, unknown>;
  if (s.type === "integer" || s.type === "number") return "Int";
  if (s.type === "string") return "string";
  if (s.type === "boolean") return "boolean";
  if ("list" in s) {
    const inner = typeText(s.list as FieldSchema);
    return /[| ]/.test(inner) && !inner.startsWith("{") ? `(${inner})[]` : `${inner}[]`;
  }
  if ("optional" in s) return `${typeText(s.optional as FieldSchema)} | null`;
  if ("record" in s) {
    const optional = new Set((s.optional as string[] | undefined) ?? []);
    return `{ ${Object.entries(s.record as Record<string, FieldSchema>).map(([k, t]) => `${k}: ${typeText(t)}${optional.has(k) ? " | null" : ""}`).join("; ")} }`;
  }
  if ("oneOf" in s) return `{ ${Object.entries(s.oneOf as Record<string, FieldSchema>).map(([k, t]) => `${k}: ${typeText(t)} | null`).join("; ")} } /* exactly one is set */`;
  return "unknown";
}
const boundsOf = (name: string, schema: FieldSchema | undefined): string[] => {
  if (typeof schema !== "object" || schema === null || Array.isArray(schema)) return [];
  const s = schema as { type?: string; min?: number; max?: number };
  return [...(s.min !== undefined ? [`${name} >= ${s.min}`] : []), ...(s.max !== undefined ? [`${name} <= ${s.max}`] : [])];
};

type Ref = { $ref: string; path: unknown };
const isRef = (v: unknown): v is Ref => typeof v === "object" && v !== null && "$ref" in v;

/** One component of a 0.3 spec directory, written in the 1.0 notation. */
export async function migrateComponent(dir: string, name: string): Promise<{ file: string; source: string }> {
  const spec = await loadSpecs(dir, { bindings: false, component: name });
  const layer1 = spec.layer1 as Layer1;
  const exportName = spec.sources!.component!.exportName;
  const env = `${exportName}Env`;
  const notes: string[] = [];
  // the names Layer 1 gave its condition sentences
  const keys = new Map<string, string>();
  const taken = new Set<string>();
  for (const file of (readdirSync(dir, { recursive: true }) as string[]).filter((f) => f.endsWith(".ts") && !f.includes(".interpretation"))) {
    const mod = (await import(pathToFileURL(join(dir, file)).href)) as Record<string, unknown>;
    for (const value of Object.values(mod)) {
      const handles = handlesOf(value);
      if (handles?.kind === "conditions") for (const [key, sentence] of handles.entries) if (!keys.has(sentence)) (keys.set(sentence, key), taken.add(key));
    }
  }
  const keyFor = (sentence: string) => {
    if (!keys.has(sentence)) keys.set(sentence, keyOf(sentence, taken));
    return keys.get(sentence)!;
  };
  const condition = (sentence: string): string => {
    const composite: Composition | undefined = compositionOf(sentence);
    if (composite && "all" in composite) return composite.all.map((part) => condition(part)).join(" && ");
    if (composite && "not" in composite) return `!(${condition(composite.not)})`;
    if (composite && "failed" in composite) return `failed(${env}.${composite.failed}())`;
    return `is.${keyFor(sentence)}(${quote(sentence)})`;
  };
  const tables = new Map<string, string>();
  const tableName = (table: string) => {
    if (!tables.has(table)) tables.set(table, table.charAt(0).toUpperCase() + table.slice(1));
    return tables.get(table)!;
  };
  const value = (v: unknown, inputs: Set<string>): string => {
    if (isRef(v)) {
      const [kind, path] = [v.$ref, v.path] as [string, unknown];
      const p = Array.isArray(path) ? path.join(".") : String(path);
      if (kind === "input") return inputs.has(p.split(".")[0]) ? p : `/* input ${p} */ ${p}`;
      if (kind === "data") return `this.${p}`;
      if (kind === "query") return `${env}.${p}()`;
      if (kind === "decision") {
        const [table, column] = p.split(".");
        return `${tableName(table)}().${column}`;
      }
      if (kind === "calculation") return `value.${p}()`;
      if (kind === "call") return p;
      if (kind === "was") return `/* was ${p} */ ${(path as string[]).map((s) => `this.status === ${quote(s)}`).join(" || ")}`;
      return `/* ${kind} ${p} */ null`;
    }
    if (typeof v === "string") return quote(v);
    if (Array.isArray(v)) return `[${v.map((x) => value(x, inputs)).join(", ")}]`;
    if (typeof v === "object" && v !== null) return `{ ${Object.entries(v).map(([k, x]) => `${k}: ${value(x, inputs)}`).join(", ")} }`;
    return String(v);
  };

  // --- state ---
  const state: string[] = [];
  const stateNames = layer1.states === undefined ? undefined : Array.isArray(layer1.states) ? (layer1.states as string[]) : "$description" in (layer1.states as object) ? undefined : Object.keys(layer1.states as object);
  if (stateNames && stateNames.length) state.push(`status: init<${stateNames.map(quote).join(" | ")}>(${quote(layer1.init ?? stateNames[0])}),`);
  else if (layer1.states && !Array.isArray(layer1.states) && "$description" in (layer1.states as object)) notes.push(`States: ${(layer1.states as { $description: string }).$description}`);
  const data = layer1.data;
  if (data && "$description" in data) notes.push(`What it remembers: ${(data as { $description: string }).$description}`);
  else
    for (const [field, entry] of Object.entries((data ?? {}) as Record<string, { $description?: string; $fragment?: { type?: FieldSchema; initially?: { value: unknown }; description?: string } }>)) {
      const shape = entry.$fragment;
      if (!shape?.type) {
        state.push(`${field}: ${quote(entry.$description ?? shape?.description ?? field)},`);
        continue;
      }
      const t = typeText(shape.type);
      const comment = shape.description ? `// ${shape.description}\n    ` : "";
      state.push(shape.initially ? `${comment}${field}: init<${t}>(${value(shape.initially.value, new Set())}),` : `${comment}${field}: init<${t} | null>(null),`);
    }

  // --- the outside world ---
  const queries: string[] = [];
  const effects: string[] = [];
  const qs = layer1.queries;
  if (qs && "$description" in qs) notes.push(`What it asks the world around it: ${(qs as { $description: string }).$description}`);
  else
    for (const [q, entry] of Object.entries((qs ?? {}) as Record<string, { $description?: string; $fragment?: { output?: FieldSchema; input?: Record<string, FieldSchema>; promise?: string; mayFail?: true; description?: string } }>)) {
      const shape = entry.$fragment ?? {};
      if (!shape.output) {
        notes.push(`It asks ${q}: ${entry.$description ?? shape.description ?? ""}`);
        continue;
      }
      const promise = [...(shape.promise ? [`${shape.promise}: true`] : []), ...(shape.mayFail ? ["mayFail: true"] : [])];
      const comment = shape.description ? `/** ${shape.description} */ ` : "";
      queries.push(`${comment.replace(/ $/, "\n    ")}${q}: (${Object.entries(shape.input ?? {}).map(([k, t]) => `${k}: ${typeText(t)}`).join(", ")}): ${typeText(shape.output)} => answer(${promise.length ? `{ ${promise.join(", ")} }` : ""}),`);
    }
  const es = layer1.effects;
  if (es && "$description" in es) notes.push(`What it does to the world around it: ${(es as { $description: string }).$description}`);
  else
    for (const [e, entry] of Object.entries((es ?? {}) as Record<string, { $description?: string; $fragment?: { input?: Record<string, FieldSchema>; description?: string } }>)) {
      const shape = entry.$fragment;
      // an effect given only as a sentence: a command that carries nothing (correct it by hand if it should carry something)
      const text = shape?.description ?? entry.$description;
      const comment = text ? `/** ${text} */\n    ` : "";
      effects.push(`${comment}${e}(${Object.entries(shape?.input ?? {}).map(([k, t]) => `${k}: ${typeText(t)}`).join(", ")}) {},`);
    }

  // --- commands ---
  const commands: string[] = [];
  const cs = layer1.commands;
  if (cs && "$description" in cs) notes.push(`Commands: ${(cs as { $description: string }).$description}`);
  else
    for (const [command, entry] of Object.entries((cs ?? {}) as Record<string, { $description?: string; $fragment?: Record<string, unknown> }>)) {
      const shape = entry.$fragment as
        | {
            description?: string;
            input?: Record<string, FieldSchema>;
            output?: FieldSchema;
            from?: string[];
            onlyIf?: string[];
            asks?: Record<string, Record<string, { input: Record<string, unknown> }>>;
            calls?: Record<string, { part: string; command: string; input: Record<string, unknown> }>;
            route?: string;
            goTo?: unknown;
            does?: string;
            responds?: unknown;
            when?: Record<string, { goTo?: unknown; does?: string; responds?: unknown; nothing?: true; set?: unknown; effects?: unknown }>;
          }
        | undefined;
      if (!shape) {
        commands.push(`${command}: ${quote(entry.$description ?? "")},`);
        continue;
      }
      const inputs = new Set(Object.keys(shape.input ?? {}));
      const params = Object.entries(shape.input ?? {}).map(([k, t]) => `${k}: ${typeText(t)}`).join(", ");
      const body: string[] = [];
      const requires = [
        ...Object.entries(shape.input ?? {}).flatMap(([k, t]) => boundsOf(k, t)),
        ...(shape.from ? [shape.from.map((s) => `this.status === ${quote(s)}`).join(" || ")] : []),
        ...(shape.onlyIf ?? []).map(condition),
      ];
      if (requires.length) body.push(`requires(${requires.map((r) => (requires.length > 1 && r.includes("||") ? `(${r})` : r)).join(" && ")});`);
      for (const [answer, asked] of Object.entries((shape.asks ?? {}) as Record<string, unknown>)) {
        const one = asked as { query?: string; input?: Record<string, unknown> };
        const pairs: [string, Record<string, unknown>][] = one.query !== undefined ? [[one.query, one.input ?? {}]] : Object.entries(asked as Record<string, Record<string, unknown>>).map(([q, x]) => [q, (x as { input?: Record<string, unknown> }).input ?? x]);
        for (const [query, input] of pairs) body.push(`const ${answer} = ${env}.${query}(${Object.values(input).map((v) => value(v, inputs)).join(", ")});`);
      }
      for (const [answer, call] of Object.entries(shape.calls ?? {})) body.push(`const ${answer} = ${call.part}.${call.command}(${Object.values(call.input).map((v) => value(v, inputs)).join(", ")});`);
      const answers = shape.output !== undefined;
      // a command's prose fragments are named after it: placeOrder, placeOrder2, …
      const lower = command.charAt(0).toLowerCase() + command.slice(1);
      const fragment = (_text: string) => {
        let key = lower;
        for (let n = 2; taken.has(key); n++) key = `${lower}${n}`;
        taken.add(key);
        return key;
      };
      const outcome = (o: { goTo?: unknown; does?: string; responds?: unknown; nothing?: true }, indent: string, last: boolean): string[] => {
        const lines: string[] = [];
        if (typeof o.goTo === "string") lines.push(`this.status = ${quote(o.goTo)};`);
        else if (isRef(o.goTo)) lines.push(`this.status = ${value(o.goTo, inputs)};`);
        if (o.responds !== undefined) {
          if (o.does) lines.push(`does.${fragment(o.does)}(${quote(o.does)});`);
          lines.push(`return ${value(o.responds, inputs)};`);
        } else if (o.does) lines.push(answers ? `return does.${fragment(o.does)}(${quote(o.does)});` : `does.${fragment(o.does)}(${quote(o.does)});`);
        if (!last && !lines.some((l) => l.startsWith("return"))) lines.push("return;");
        return lines.map((l) => `${indent}${l}`);
      };
      if (shape.description) body.push(`// ${shape.description}`);
      const when = shape.when ?? {};
      const branches = Object.entries(when).filter(([c]) => c !== "otherwise");
      for (const [c, o] of branches) {
        body.push(`if (${condition(c)}) {`, ...outcome(o, "  ", false), "}");
      }
      const rest = when.otherwise ?? {};
      const top = { goTo: shape.goTo ?? rest.goTo, does: [shape.does, rest.does].filter(Boolean).join(" ") || undefined, responds: shape.responds ?? rest.responds };
      body.push(...outcome(top, "", true));
      if (shape.route) notes.push(`(route ${command}: ${shape.route})`);
      commands.push(`${command}(${params})${answers ? `: ${typeText(shape.output)}` : ""} {\n${body.map((l) => `      ${l}`).join("\n")}\n    },`);
    }

  // --- calculations, invariants ---
  const calcs: string[] = [];
  const calculations = layer1.calculations;
  if (calculations && "$description" in calculations) notes.push(`Calculations: ${(calculations as { $description: string }).$description}`);
  else
    for (const [c, entry] of Object.entries((calculations ?? {}) as Record<string, { $description?: string; $fragment?: { description?: string } }>)) {
      calcs.push(`${c}: ${quote(entry.$description ?? entry.$fragment?.description ?? c)},`);
    }
  const rules = (layer1.invariants ?? []).map((sentence) => `${keyFor(sentence)}: ${quote(sentence)},`);

  // --- decision tables ---
  const decisions: string[] = [];
  for (const [table, rows] of Object.entries(layer1.decisions ?? {})) {
    const name = tableName(table);
    const lines = Object.entries(rows).map(([c, cells]) => `  [${c === "otherwise" ? "otherwise" : condition(c)}, { ${Object.entries(cells).map(([k, v]) => `${k}: ${v === null ? "null" : JSON.stringify(v)}`).join(", ")} }],`);
    decisions.push(`export const ${name} = decisions(${quote(table)}, () => [\n${lines.join("\n")}\n]);`);
  }

  const routes = Object.entries((cs && !("$description" in cs) ? cs : {}) as Record<string, { $fragment?: { route?: string } }>).flatMap(([c, e]) => (e.$fragment?.route ? [`${c}: ${quote(e.$fragment.route)}`] : []));
  const description = [layer1.description ?? "", ...notes].filter(Boolean).join(" ");
  const headings = [
    state.length ? `  state: {\n${state.map((l) => `    ${l}`).join("\n")}\n  },` : "",
    commands.length ? `  commands: {\n${commands.map((l) => `    ${l}`).join("\n")}\n  },` : "",
    calcs.length ? `  calcs: {\n${calcs.map((l) => `    ${l}`).join("\n")}\n  },` : "",
    rules.length ? `  rules: {\n${rules.map((l) => `    ${l}`).join("\n")}\n  },` : "",
    layer1.durable === true ? "  durable: true," : layer1.durable ? "  durable: true, // TODO: 0.3 kept it through a store component" : "",
    routes.length ? `  routes: { ${routes.join(", ")} },` : "",
    layer1.parts ? `  // TODO: 0.3 parts: ${Object.keys(layer1.parts).join(", ")} (call them where they are used; many(...) becomes a Map in state)` : "",
  ].filter(Boolean);
  const outside =
    queries.length || effects.length
      ? `export const ${env} = external(${quote(`What ${exportName} asks of the world around it, and what it does to it.`)}, {\n${queries.length ? `  queries: {\n${queries.map((l) => `    ${l}`).join("\n")}\n  },\n` : ""}${effects.length ? `  commands: {\n${effects.map((l) => `    ${l}`).join("\n")}\n  },\n` : ""}});\n\n`
      : "";
  const source = `import { answer, decisions, does, external, failed, init, is, otherwise, requires, service, value } from "@clp/core/v1";
import type { Int, Json } from "@clp/core/v1";

${outside}${decisions.length ? `${decisions.join("\n\n")}\n\n` : ""}export const ${exportName} = service(${quote(description)}, {
${headings.join("\n")}
});
`;
  return { file: `${componentName(exportName)}.component.ts`, source };
}

export async function migrate(dir: string): Promise<{ file: string; source: string }[]> {
  const root = resolve(process.cwd(), dir);
  const done: { file: string; source: string }[] = [];
  for (const name of await listComponents(root)) {
    try {
      done.push(await migrateComponent(root, name));
    } catch (error) {
      console.error(`${name}: 移せませんでした: ${error instanceof Error ? error.stack : String(error)}`);
    }
  }
  return done;
}
