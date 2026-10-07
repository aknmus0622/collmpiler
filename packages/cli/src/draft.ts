import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { getCondition, getFormula, getInvariant } from "@aac/core";
import type { SpecInput } from "./extract.ts";
import { assetsFor, mergeAssets } from "./assets.ts";
import type { Asset } from "./assets.ts";
import { scrubEnv } from "./gates.ts";
import { ASSETS_DIR, renderAssets } from "./request.ts";
import { TEST_DIR, FILES } from "./generate.ts";
import { DRAFT_SUFFIX, loadSpecs } from "./loader.ts";
import type { ImplementationStrategy } from "./strategy.ts";

// 結び付け (Layer 2) の下書きを LLM に書かせる。実装のループとは別の、仕様を書く人のための補助。
//
// 結び付けは採点の正解なので、LLM が書いたものをそのまま正解にはしない:
//   - 下書きは <名前>.binding.draft.ts に書き出す。ローダーは既定で *.draft.ts を読まないので、
//     人が中身を確認して <名前>.binding.ts に名前を変えるまで、検証には使われない
//   - 機械的に確かめられること（型エラー、結び付け漏れ、条件の衝突、不変条件、値の型）は、書き出す前に検査して差し戻す。
//     意味が合っているかは、人が読んで確かめる

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
  | { status: "drafted" | "failed"; draft: string; attempts: number; missing: Names; problems?: string };

type Names = { conditions: string[]; formulas: string[]; invariants: string[] };

const SPEC_DIR = "spec";
const REQUEST = `${TEST_DIR}/${FILES.request}`;

const HEADER = `// DRAFT — written by an LLM, not yet reviewed.
// This file is the oracle the tests are judged against. Read every function and check that it means what
// its name says. Then rename this file (drop ".draft") to put it into use. Until then it is ignored.
`;

// 結び付けるべき名前のうち、まだ結び付けの無いもの
function missingNames(spec: SpecInput): Names {
  const conditions = new Set<string>();
  for (const behavior of Object.values(spec.behaviors)) {
    for (const name of [...(behavior.where ?? []), ...Object.keys(behavior.cases)]) conditions.add(name);
  }
  for (const table of Object.values(spec.tables)) for (const name of Object.keys(table)) conditions.add(name);
  conditions.delete("default");
  return {
    conditions: [...conditions].filter((name) => !getCondition(name)).sort(),
    formulas: Object.keys(spec.model?.formulas ?? {}).filter((name) => !getFormula(name)).sort(),
    invariants: (spec.model?.invariants ?? []).filter((name) => !getInvariant(name)).sort(),
  };
}

const quote = (name: string) => JSON.stringify(name);
const todo = `{\n      throw new Error("TODO");\n    }`;

// 確定版がまだ無いときの出発点。名前をすべて並べ、中身は未実装にしておく
function skeleton(spec: SpecInput, names: Names, componentFile: string, exportName: string): string {
  const byFile = new Map<string, string[]>([[componentFile, [exportName]]]);
  for (const [table, file] of Object.entries(spec.sources?.tables ?? {})) {
    byFile.set(file, [...(byFile.get(file) ?? []), table]);
  }
  const imports = [...byFile].map(([file, exports]) => `import { ${exports.sort().join(", ")} } from "./${file}";`);
  const group = (key: string, list: string[]) =>
    list.length === 0 ? "" : `\n  ${key}: {\n${list.map((name) => `    ${quote(name)}: (state) => ${todo},`).join("\n")}\n  },\n`;
  const tables = Object.keys(spec.sources?.tables ?? {}).sort();
  return `import { applyDecision, bindSpecification } from "@aac/core";
${imports.join("\n")}

export const Specification = bindSpecification(${exportName}, {
  tables: { ${tables.join(", ")} },
${group("conditions", names.conditions) || "\n  conditions: {},\n"}${group("formulas", names.formulas)}${group("invariants", names.invariants)}});
`;
}

function request(
  spec: SpecInput,
  names: Names,
  draftFile: string,
  extending: boolean,
  attempt: number,
  assets: Asset[],
  problems?: string,
) {
  const model = spec.model!;
  const list = (items: string[]) => items.map((item) => `  - ${quote(item)}`).join("\n") || "  (none)";
  const inputs = [...new Set(Object.values(model.actions).flatMap((fields) => Object.keys(fields)))];
  return `# Draft the binding of a specification (attempt ${attempt})

The files under \`${SPEC_DIR}/\` are a specification. In it, conditions, formulas, and invariants are written
only as **natural-language names**. Your task is to write, for each name, the function that says what it
means. The result is a draft: a person will review every function before it is used.

## What to write

Edit \`${SPEC_DIR}/${draftFile}\`, and only that file.${extending ? " It already contains the reviewed bindings: leave those functions exactly as they are, and add the missing names listed below." : " It lists every name with a placeholder body: replace each body."}

Names to bind:

- conditions (return a boolean):
${list(names.conditions)}
- formulas (return a value of the type declared in the component's \`formulas\`):
${list(names.formulas)}
- invariants (return a boolean that must always be true):
${list(names.invariants)}

## What the functions receive

- Conditions and formulas receive \`state\` with: \`status\` (the current state name); the remembered data
  (${Object.keys(model.data).map((k) => `\`${k}\``).join(", ") || "none"}), each possibly \`undefined\` before it is set; the query answers
  (${Object.keys(model.queries).map((k) => `\`${k}\``).join(", ") || "none"}); and the inputs of the action being executed
  (${inputs.map((k) => `\`${k}\``).join(", ") || "none"}), \`undefined\` during other actions.
- Invariants receive only \`status\` and the remembered data.
- A formula may use a decision table's result: \`applyDecision(Table, state).column\`.

## Rules

- **Write the most literal reading of each name.** The name is the specification; do not add conditions it
  does not state. If a name can reasonably be read in more than one way, pick one and put a comment starting
  with \`// REVIEW:\` on the line above it explaining the doubt. Those comments are the most useful part of
  the draft.
- Conditions that label the rows of the same decision table, or the cases of the same action, must never be
  true at the same time (\`default\` covers "none of them").
- Formulas over money use whole numbers; apply the rounding the name states.
- Do not change any other file, and do not read anything outside this directory.

## How the draft is checked

After you finish, the draft is type-checked, and the specification is run on its own with your functions,
over many random sequences of actions. The draft is rejected if it has a type error, if a name is left unbound, if two conditions of the same table or action hold
at once, if an invariant is broken, or if a formula returns a value that does not fit its declared type.
Passing this check does not mean the functions are right; that is what the review is for.
${renderAssets(assets)}${problems ? `\n## Problems found in the previous attempt\n\n\`\`\`\n${problems}\n\`\`\`\n` : ""}`;
}

export async function draftBinding(options: DraftOptions): Promise<DraftResult> {
  const specsDir = resolve(process.cwd(), options.specs);
  const log = options.log ?? (() => {});

  const spec = await loadSpecs(specsDir);
  const component = spec.sources?.component;
  if (!spec.model || !component) throw new Error("仕様にコンポーネントがありません");
  const missing = missingNames(spec);
  if (missing.conditions.length + missing.formulas.length + missing.invariants.length === 0) {
    return { status: "nothing-to-draft" };
  }

  // order.component.ts → 確定版 order.binding.ts、下書き order.binding.draft.ts
  const stem = join(dirname(component.file), basename(component.file).replace(/(\.component)?\.ts$/, ""));
  const finalFile = `${stem}.binding.ts`;
  const draftFile = `${stem}.binding${DRAFT_SUFFIX}`;
  const extending = existsSync(join(specsDir, finalFile));
  const start = extending
    ? readFileSync(join(specsDir, finalFile), "utf8")
    : skeleton(spec, missing, basename(component.file), component.exportName);

  const hidden = [...new Set([process.cwd(), specsDir])];
  const specFiles = (readdirSync(specsDir, { recursive: true }) as string[]).filter(
    (file) => file.endsWith(".ts") && !file.endsWith(DRAFT_SUFFIX),
  );
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
      // 仕様に宣言された資料と、コマンドで渡された資料のうち、設計の段階に渡るもの
      const assets = assetsFor(mergeAssets(spec.assets ?? [], options.assets ?? []), "design");
      for (const asset of assets) {
        if (asset.kind !== "file") continue;
        mkdirSync(dirname(join(dir, ASSETS_DIR, asset.name)), { recursive: true });
        writeFileSync(join(dir, ASSETS_DIR, asset.name), asset.content);
      }
      writeFileSync(join(dir, REQUEST), request(spec, missing, draftFile, extending, attempt, assets, problems));

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
        const text = readFileSync(join(dir, SPEC_DIR, draftFile), "utf8");
        cpSync(join(dir, SPEC_DIR, draftFile), previous);
        writeFileSync(previous, text.startsWith(HEADER) ? text : HEADER + text);
        problems = check(specsDir);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }

    log(`[binding #${attempt}] ${problems === undefined ? "ok" : "rejected"}`);
    if (problems === undefined) return { status: "drafted", draft: join(specsDir, draftFile), attempts: attempt, missing };
  }
  return { status: "failed", draft: join(specsDir, draftFile), attempts: options.maxAttempts ?? 3, missing, problems };
}

// 下書きを確定版の代わりに読み込み、仕様の検査にかける。
// 結び付けはプロセス全体で共有されるので、別プロセスで行う
function check(specsDir: string): string | undefined {
  const run = spawnSync(process.execPath, [join(import.meta.dirname, "compile.ts"), specsDir, "--drafts"], {
    encoding: "utf8",
    timeout: 120_000,
  });
  if (run.status === 0) return undefined;
  return [process.cwd(), specsDir]
    .reduce((text, path) => text.split(path).join("."), `${run.stderr ?? ""}${run.error?.message ?? ""}`)
    .split("\n")
    .filter((line) => !line.includes("ExperimentalWarning") && !line.includes("--trace-warnings"))
    .join("\n")
    .trim()
    .slice(-3000);
}
