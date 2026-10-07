import { readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { COMPONENT } from "@aac/core";
import type { Boundary } from "@aac/core";
import { resolveAssets } from "./assets.ts";
import type { SpecInput, SpecModel } from "./extract.ts";

// 下書き (LLM が書き、人がまだ確定していない結び付け) のファイル名
export const DRAFT_SUFFIX = ".draft.ts";

// 仕様の読み込みはここ1箇所に閉じ込める。パスは process.cwd() 基準。
// 下書き (*.draft.ts) は既定では読まない。人が確認して名前を変えるまで、正解として使われないようにするため。
// drafts: true のときだけ下書きを読み、それが置き換える確定版 (X.draft.ts に対する X.ts) は読まない
export async function loadSpecs(dir: string, options: { drafts?: boolean } = {}): Promise<SpecInput> {
  const root = resolve(process.cwd(), dir);
  const all = (readdirSync(root, { recursive: true }) as string[])
    .filter((file) => file.endsWith(".ts") && !file.endsWith(".d.ts"))
    .sort();
  const drafts = all.filter((file) => file.endsWith(DRAFT_SUFFIX));
  const replaced = new Set(drafts.map((file) => `${file.slice(0, -DRAFT_SUFFIX.length)}.ts`));
  const files = options.drafts
    ? all.filter((file) => !replaced.has(file))
    : all.filter((file) => !file.endsWith(DRAFT_SUFFIX));

  const input: SpecInput = { behaviors: {}, tables: {} };
  for (const file of files) {
    // Layer 2 (bindSpecification) は副作用で登録されるため、どこからも import されていないファイルも必ず評価する
    const mod = await import(pathToFileURL(join(root, file)).href);
    for (const [exportName, value] of Object.entries(mod)) {
      if (typeof value !== "object" || value === null) continue;
      if ((value as any)[COMPONENT]) {
        if (input.model) throw new Error(`コンポーネントが複数あります (${file})。現在は1つだけ扱えます`);
        Object.assign(input, normalize(exportName, value as Boundary & { behaviors: Record<string, unknown> }));
        input.sources = { ...input.sources, component: { file, exportName }, tables: input.sources?.tables ?? {} };
        // 添付資料のパスは、コンポーネントのファイルがあるディレクトリからの相対
        input.assets = resolveAssets((value as Boundary).assets ?? [], dirname(join(root, file)));
      } else if ("default" in value) {
        if (exportName in input.tables && input.tables[exportName] !== value) {
          throw new Error(`DecisionTable "${exportName}" が重複しています (${file})`);
        }
        input.tables[exportName] = value;
        input.sources = { component: input.sources?.component, tables: { ...input.sources?.tables, [exportName]: file } };
      }
    }
  }
  return input;
}

// コンポーネントを、抽出と検証が扱う形に正規化する。
// 省略された宣言は空にし、関数1つで書かれた case は default だけの表にする
function normalize(name: string, component: Boundary & { behaviors: Record<string, unknown> }) {
  const model: SpecModel = {
    initial: component.initial,
    states: component.states,
    data: component.data ?? {},
    actions: Object.fromEntries(Object.entries(component.actions).map(([action, decl]) => [action, decl.input ?? {}])),
    queries: component.queries ?? {},
    commands: component.commands ?? {},
    ...(component.formulas ? { formulas: component.formulas } : {}),
    ...(component.invariants ? { invariants: component.invariants } : {}),
  };
  validateModel(name, model);

  const behaviors: SpecInput["behaviors"] = {};
  for (const [action, decl] of Object.entries(component.actions)) {
    const cases = component.behaviors[action];
    const table = typeof cases === "function" ? { default: cases } : cases;
    if (typeof (table as { default?: unknown } | undefined)?.default !== "function") {
      throw new Error(`コンポーネント "${name}" のアクション "${action}" に case がありません（表で書く場合は "default" が必須です）`);
    }
    const unknownState = (decl.from ?? []).find((state) => !component.states.includes(state));
    if (unknownState !== undefined) {
      throw new Error(`コンポーネント "${name}" のアクション "${action}" の from "${unknownState}" が states にありません`);
    }
    behaviors[action] = { from: decl.from, where: decl.where, cases: table as SpecInput["behaviors"][string]["cases"] };
  }
  const extra = Object.keys(component.behaviors).find((action) => !(action in component.actions));
  if (extra !== undefined) throw new Error(`コンポーネント "${name}" の case "${extra}" に対応するアクションがありません`);
  return { model, behaviors };
}

function validateModel(name: string, model: SpecModel) {
  if (!model.states.includes(model.initial)) {
    throw new Error(`コンポーネント "${name}" の initial "${model.initial}" が states にありません`);
  }
  // 条件と case からは data・queries・入力が同じ階層で見えるため、名前が重なると区別できない
  const owners = new Map<string, string>([["status", "予約語"]]);
  const claim = (field: string, owner: string, shared = false) => {
    const taken = owners.get(field);
    if (taken !== undefined && !(shared && taken === owner)) {
      throw new Error(`コンポーネント "${name}" のフィールド "${field}" が重複しています (${taken} と ${owner})`);
    }
    owners.set(field, owner);
  };
  for (const field of Object.keys(model.data)) claim(field, "data");
  for (const field of Object.keys(model.queries)) claim(field, "queries");
  // 入力どうしはアクションが違えば同名でよい
  for (const fields of Object.values(model.actions)) for (const field of Object.keys(fields)) claim(field, "actions の入力", true);
}
