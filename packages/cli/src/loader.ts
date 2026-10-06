import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { COMPONENT } from "@aac/core";
import type { Boundary } from "@aac/core";
import type { SpecInput, SpecModel } from "./extract.ts";

// 仕様の読み込みはここ1箇所に閉じ込める。パスは process.cwd() 基準。
export async function loadSpecs(dir: string): Promise<SpecInput> {
  const root = resolve(process.cwd(), dir);
  const files = (readdirSync(root, { recursive: true }) as string[])
    .filter((file) => file.endsWith(".ts") && !file.endsWith(".d.ts"))
    .sort();

  const input: SpecInput = { behaviors: {}, tables: {} };
  for (const file of files) {
    // Layer 2 (bindSpecification) は副作用で登録されるため、どこからも import されていないファイルも必ず評価する
    const mod = await import(pathToFileURL(join(root, file)).href);
    for (const [exportName, value] of Object.entries(mod)) {
      if (typeof value !== "object" || value === null) continue;
      if ((value as any)[COMPONENT]) {
        if (input.model) throw new Error(`コンポーネントが複数あります (${file})。現在は1つだけ扱えます`);
        Object.assign(input, normalize(exportName, value as Boundary & { behaviors: Record<string, unknown> }));
      } else if ("default" in value) {
        if (exportName in input.tables && input.tables[exportName] !== value) {
          throw new Error(`DecisionTable "${exportName}" が重複しています (${file})`);
        }
        input.tables[exportName] = value;
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
