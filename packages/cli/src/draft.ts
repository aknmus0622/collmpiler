import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { assetsFor, mergeAssets } from "./assets.ts";
import type { Asset } from "./assets.ts";
import type { SpecInput } from "./extract.ts";
import { scrubEnv } from "./gates.ts";
import { TEST_DIR, FILES } from "./generate.ts";
import { DRAFT_SUFFIX, loadSpecs } from "./loader.ts";
import { ASSETS_DIR, renderAssets } from "./request.ts";
import type { ImplementationStrategy } from "./strategy.ts";

// 結び付けの下書きを LLM に書かせる。実装のループとは別の、仕様を書く人のための補助。
// 下書きには、コマンドの構造 (宣言) と、名前の意味 (関数) の両方が含まれる。
//
// 結び付けは採点の正解なので、LLM が書いたものをそのまま正解にはしない:
//   - 下書きは <名前>.binding.draft.ts に書き出す。ローダーは既定で *.draft.ts を読まないので、
//     人が中身を確認して <名前>.binding.ts に名前を変えるまで、検証には使われない
//   - 機械的に確かめられること（型エラー、参照の誤り、条件の衝突、不変条件、値の型）は、書き出す前に検査して差し戻す。
//     文と構造・意味が合っているかは、人が読んで確かめる

export type DraftOptions = {
  specs: string;
  strategy: ImplementationStrategy;
  // 依頼に添付する資料（用語集など）。コンポーネントの assets に宣言したものに追加される
  assets?: Asset[];
  maxAttempts?: number;
  log?: (line: string) => void;
};

export type DraftResult =
  | { status: "nothing-to-draft" }
  | { status: "drafted" | "failed"; draft: string; attempts: number; problems?: string };

const SPEC_DIR = "spec";
const REQUEST = `${TEST_DIR}/${FILES.request}`;

const HEADER = `// DRAFT — written by an LLM, not yet reviewed.
// This file is the oracle the tests are judged against. Read every entry and check that it means what the
// component says. Then rename this file (drop ".draft") to put it into use. Until then it is ignored.
`;

const quote = (name: string) => JSON.stringify(name);
const TODO = `{\n      throw new Error("TODO");\n    }`;

// 出発点: コマンドと名前をすべて並べ、中身は空にしておく
function skeleton(spec: SpecInput, componentFile: string, exportName: string): string {
  const model = spec.model!;
  const commands = Object.entries(spec.behaviors).map(([name, behavior]) => {
    const conditions = Object.keys(behavior.when);
    if (conditions.length === 1) return `    // ${behavior.when.otherwise.does}\n    ${name}: {},`;
    const inner = conditions.map((condition) => `      // ${behavior.when[condition].does}\n      ${quote(condition)}: {},`).join("\n");
    return `    ${name}: {\n${inner}\n    },`;
  });
  const conditions = new Set<string>();
  for (const behavior of Object.values(spec.behaviors)) {
    for (const name of [...(behavior.onlyIf ?? []), ...Object.keys(behavior.when)]) conditions.add(name);
  }
  for (const table of Object.values(spec.decisions)) for (const name of Object.keys(table)) conditions.add(name);
  conditions.delete("otherwise");

  const group = (key: string, entries: string[]) => (entries.length === 0 ? "" : `\n  ${key}: {\n${entries.join("\n")}\n  },\n`);
  return `import { bind, calculate, decide, ref } from "@aac/core";
import { ${exportName} } from "./${componentFile}";

export const Binding = bind(${exportName}, {
  // Structure: what each command's sentence means, as declarations.
  commands: {
${commands.join("\n")}
  },

  // Meaning: what each name refers to, as functions.
  conditions: {
${[...conditions].sort().map((name) => `    ${quote(name)}: (state) => ${TODO},`).join("\n")}
  },
${group("calculations", Object.entries(model.calculations ?? {}).map(([name, calculation]) => `    // ${calculation.is}\n    ${name}: (state) => ${TODO},`))}${group("invariants", (model.invariants ?? []).map((name) => `    ${quote(name)}: (state) => ${TODO},`))}});
`;
}

function request(spec: SpecInput, draftFile: string, attempt: number, assets: Asset[], problems?: string) {
  const model = spec.model!;
  const names = (fields: object) => Object.keys(fields).map((k) => `\`${k}\``).join(", ") || "none";
  const inputs = [...new Set(Object.values(model.commands).flatMap((fields) => Object.keys(fields)))];
  return `# Draft the binding of a specification (attempt ${attempt})

The files under \`${SPEC_DIR}/\` are a specification. The component describes what each command does **in prose**
(\`does\`), and names its conditions, calculations, and invariants in natural language. Your task is to write
the **binding**: what those sentences and names mean. The result is a draft; a person will review every entry
before it is used.

## What to write

Edit \`${SPEC_DIR}/${draftFile}\`, and only that file. It lists every command and every name with an empty
placeholder. It has two parts.

### 1. Structure (\`commands\`): declarations, no functions

For each command (and, where the component has \`when\`, for each of its conditions including \`otherwise\`),
write what the \`does\` sentence means:

- \`effects\`: the effects to perform, in order, each as \`{ EffectName: { field: value, ... } }\`. Add
  \`when: ...\` to perform an effect only sometimes.
- \`set\`: the data to store, as \`{ field: value }\`.
- The resulting state is already given by \`goTo\` in the component; do not repeat it.

A value is a constant or a reference:

- \`ref.input("field")\`: the command's input (${inputs.map((k) => `\`${k}\``).join(", ") || "none"})
- \`ref.data("field")\`: remembered data (${names(model.data)})
- \`ref.query("field")\`: a query answer (${names(model.queries)})
- \`ref.decision("table", "column")\`: the value of a decision table's column in the row that applies
  (tables: ${names(spec.decisions)})
- \`ref.calculation("name")\`: the result of a calculation (${names(model.calculations ?? {})})

An effect's \`when\` is either a boolean reference (\`ref.decision(...)\`, \`ref.query(...)\`, \`ref.data(...)\`, or
\`ref.was("STATE", ...)\` for "the state before the command was one of these"), or a new condition sentence in
natural language, which you must then also define under \`conditions\`. Prefer a reference when one fits.

### 2. Meaning (\`conditions\`, \`calculations\`, \`invariants\`): functions

- Each condition returns a boolean; each calculation returns a value of its declared type; each \`invariants\`
  entry returns a boolean that must always be true.
- Conditions and calculations receive \`state\` with: \`status\` (the current state name); the remembered data,
  each possibly \`undefined\` before it is set; the query answers; and the inputs of the command being executed,
  \`undefined\` during other commands. \`invariants\` functions receive only \`status\` and the remembered data.
- Inside a function, \`decide(Component, "table", state)\` gives the row of a decision table that applies, and
  \`calculate(Component, "name", state)\` gives the result of another calculation.

## Rules

- **Write the most literal reading of each sentence.** The component is the specification; do not add anything
  it does not state. If a sentence or name can reasonably be read in more than one way, pick one and put a
  comment starting with \`// REVIEW:\` on the line above it explaining the doubt. Those comments are the most
  useful part of the draft.
- Conditions that label the rows of the same decision table, or the cases of the same command, must never be
  true at the same time (\`otherwise\` covers "none of them").
- Calculations over money use whole numbers; apply the rounding the description states.
- Do not change any other file, and do not read anything outside this directory.

## How the draft is checked

After you finish, the draft is type-checked, and the specification is run on its own over many random
sequences of commands. The draft is rejected if it has a type error, if a reference does not fit the field it
is used for, if a name is left without a meaning, if two conditions of the same table or command hold at once,
if an invariant is broken, or if a value does not fit its declared type. Passing this check does not mean the
draft is right; that is what the review is for.
${renderAssets(assets)}${problems ? `\n## Problems found in the previous attempt\n\n\`\`\`\n${problems}\n\`\`\`\n` : ""}`;
}

export async function draftBinding(options: DraftOptions): Promise<DraftResult> {
  const specsDir = resolve(process.cwd(), options.specs);
  const log = options.log ?? (() => {});

  const spec = await loadSpecs(specsDir);
  const component = spec.sources?.component;
  if (!spec.model || !component) throw new Error("仕様にコンポーネントがありません");
  // 確定した結び付けがあれば、何もしない
  if (spec.binding) return { status: "nothing-to-draft" };

  // order.component.ts → 下書き order.binding.draft.ts
  const stem = join(dirname(component.file), basename(component.file).replace(/(\.component)?\.ts$/, ""));
  const draftFile = `${stem}.binding${DRAFT_SUFFIX}`;
  const start = skeleton(spec, basename(component.file), component.exportName);

  const hidden = [...new Set([process.cwd(), specsDir])];
  const specFiles = (readdirSync(specsDir, { recursive: true }) as string[]).filter(
    (file) => file.endsWith(".ts") && !file.endsWith(DRAFT_SUFFIX),
  );
  // 仕様に宣言された資料と、コマンドで渡された資料のうち、設計の段階に渡るもの
  const assets = assetsFor(mergeAssets(spec.assets ?? [], options.assets ?? []), "design");
  let problems: string | undefined;

  for (let attempt = 1; attempt <= (options.maxAttempts ?? 3); attempt++) {
    // 作業場所: 仕様のファイルと依頼文だけを置く。下書きは、前回の試行の成果か出発点
    const dir = mkdtempSync(join(realpathSync(tmpdir()), "aac-"));
    try {
      const originals: Record<string, string> = {};
      for (const file of specFiles) {
        originals[file] = readFileSync(join(specsDir, file), "utf8");
        mkdirSync(dirname(join(dir, SPEC_DIR, file)), { recursive: true });
        writeFileSync(join(dir, SPEC_DIR, file), originals[file]);
      }
      const previous = join(specsDir, draftFile);
      writeFileSync(join(dir, SPEC_DIR, draftFile), existsSync(previous) && attempt > 1 ? readFileSync(previous, "utf8") : start);
      mkdirSync(join(dir, TEST_DIR), { recursive: true });
      for (const asset of assets) {
        if (asset.kind !== "file") continue;
        mkdirSync(dirname(join(dir, ASSETS_DIR, asset.name)), { recursive: true });
        writeFileSync(join(dir, ASSETS_DIR, asset.name), asset.content);
      }
      writeFileSync(join(dir, REQUEST), request(spec, draftFile, attempt, assets, problems));

      log(`[binding #${attempt}] ${options.strategy.name} (in ${dir})`);
      await options.strategy.run({ dir, phase: "binding", attempt, env: scrubEnv(process.env, hidden) });

      // 取り出すのは下書きだけ。仕様のファイルを書き換えていたら差し戻す
      const changed = specFiles.filter(
        (file) => !existsSync(join(dir, SPEC_DIR, file)) || readFileSync(join(dir, SPEC_DIR, file), "utf8") !== originals[file],
      );
      if (!existsSync(join(dir, SPEC_DIR, draftFile))) {
        problems = `${draftFile} is missing.`;
      } else if (changed.length > 0) {
        problems = `Only ${draftFile} may be edited, but these files were changed: ${changed.join(", ")}`;
      } else {
        const content = readFileSync(join(dir, SPEC_DIR, draftFile), "utf8");
        cpSync(join(dir, SPEC_DIR, draftFile), previous);
        writeFileSync(previous, content.startsWith(HEADER) ? content : HEADER + content);
        problems = check(specsDir);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }

    log(`[binding #${attempt}] ${problems === undefined ? "ok" : "rejected"}`);
    if (problems === undefined) return { status: "drafted", draft: join(specsDir, draftFile), attempts: attempt };
  }
  return { status: "failed", draft: join(specsDir, draftFile), attempts: options.maxAttempts ?? 3, problems };
}

// 下書きを読み込み、型チェックと仕様の検査にかける。別プロセスで行う
function check(specsDir: string): string | undefined {
  const run = spawnSync(process.execPath, [join(import.meta.dirname, "compile.ts"), specsDir, "--drafts"], {
    encoding: "utf8",
    timeout: 120_000,
  });
  if (run.status === 0) return undefined;
  return [process.cwd(), specsDir]
    .reduce((output, path) => output.split(path).join("."), `${run.stderr ?? ""}${run.error?.message ?? ""}`)
    .split("\n")
    .filter((line) => !line.includes("ExperimentalWarning") && !line.includes("--trace-warnings"))
    .join("\n")
    .trim()
    .slice(-3000);
}
