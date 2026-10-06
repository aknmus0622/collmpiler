import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { BEHAVIORS } from "@aac/core";
import type { DomainModel } from "@aac/core";
import type { SpecInput } from "./extract.ts";

// 仕様の読み込みはここ1箇所に閉じ込める。パスは process.cwd() 基準。
export async function loadSpecs(dir: string): Promise<SpecInput> {
  const root = resolve(process.cwd(), dir);
  const files = (readdirSync(root, { recursive: true }) as string[])
    .filter((file) => file.endsWith(".ts") && !file.endsWith(".d.ts"))
    .sort();

  const input: SpecInput = { behaviors: {}, tables: {} };
  for (const file of files) {
    // Layer 2 (bindDecisionDetails) は副作用で登録されるため、型しか import されていないファイルも必ず評価する
    const mod = await import(pathToFileURL(join(root, file)).href);
    for (const [exportName, value] of Object.entries(mod)) {
      if (typeof value !== "object" || value === null) continue;
      if ((value as any)[BEHAVIORS]) {
        for (const [name, behavior] of Object.entries(value)) {
          if (name in input.behaviors) throw new Error(`behavior "${name}" が重複しています (${file})`);
          input.behaviors[name] = behavior as SpecInput["behaviors"][string];
        }
      } else if (isDomainModel(value)) {
        if (input.model && input.model !== value) throw new Error(`DomainModel が複数あります (${file})`);
        validateModel(exportName, value);
        input.model = value;
      } else if ("default" in value) {
        if (exportName in input.tables && input.tables[exportName] !== value) {
          throw new Error(`DecisionTable "${exportName}" が重複しています (${file})`);
        }
        input.tables[exportName] = value;
      }
    }
  }
  if (input.model) {
    const declared = Object.keys(input.model.actions).sort().join(", ");
    const defined = Object.keys(input.behaviors).sort().join(", ");
    if (declared !== defined) {
      throw new Error(`モデルの actions (${declared}) と behaviors (${defined}) が一致しません`);
    }
  }
  return input;
}

function isDomainModel(value: object): value is DomainModel {
  return "states" in value && Array.isArray(value.states) && "actions" in value && "queries" in value && "commands" in value;
}

function validateModel(name: string, model: DomainModel) {
  if (!model.states.includes(model.initial)) {
    throw new Error(`DomainModel "${name}" の initial "${model.initial}" が states にありません`);
  }
  // 条件と case からは data・queries・入力が同じ階層で見えるため、名前が重なると区別できない
  const owners = new Map<string, string>([["status", "予約語"]]);
  const claim = (field: string, owner: string, shared = false) => {
    const taken = owners.get(field);
    if (taken !== undefined && !(shared && taken === owner)) {
      throw new Error(`DomainModel "${name}" のフィールド "${field}" が重複しています (${taken} と ${owner})`);
    }
    owners.set(field, owner);
  };
  for (const field of Object.keys(model.data)) claim(field, "data");
  for (const field of Object.keys(model.queries)) claim(field, "queries");
  // 入力どうしはアクションが違えば同名でよい
  for (const fields of Object.values(model.actions)) for (const field of Object.keys(fields)) claim(field, "actions の入力", true);
}
