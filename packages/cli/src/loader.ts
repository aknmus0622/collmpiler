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
        if (!value.states.includes(value.initial)) {
          throw new Error(`DomainModel "${exportName}" の initial "${value.initial}" が states にありません`);
        }
        input.model = value;
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

function isDomainModel(value: object): value is DomainModel {
  return "states" in value && Array.isArray(value.states) && "input" in value && "queries" in value && "commands" in value;
}
