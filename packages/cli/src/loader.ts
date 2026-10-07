import { readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { BINDING, COMPONENT } from "@clp/core";
import type { BoundSpecification, Declaration, Outcome, Structure } from "@clp/core";
import { resolveAssets } from "./assets.ts";
import type { SpecEffect, SpecInput, SpecModel, SpecOutcome, SpecValue } from "./extract.ts";

// 下書き (LLM が書き、人がまだ確定していない結び付け) のファイル名
export const DRAFT_SUFFIX = ".draft.ts";

type Found = { name: string; declaration: Declaration; file: string; exportName: string };
type Scan = { root: string; components: Found[]; bindings: { binding: BoundSpecification; file: string }[]; exported: Map<object, { file: string; exportName: string }> };

// コンポーネントの名前: export 名を小文字とハイフンにしたもの (Order → order、CheckoutButton → checkout-button)。
// テスト側のファイル名と、--component の指定に使う
export const componentName = (exportName: string) =>
  exportName.replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/([A-Z])([A-Z][a-z])/g, "$1-$2").toLowerCase();

// 仕様のファイルを読み込み、コンポーネントと結び付けを集める。
// 下書き (*.draft.ts) は既定では読まない。人が確認して名前を変えるまで、正解として使われないようにするため。
// drafts: true のときだけ下書きを読み、それが置き換える確定版 (X.draft.ts に対する X.ts) は読まない
async function scanSpecs(dir: string, options: { drafts?: boolean }): Promise<Scan> {
  const root = resolve(process.cwd(), dir);
  const all = (readdirSync(root, { recursive: true }) as string[])
    .filter((file) => file.endsWith(".ts") && !file.endsWith(".d.ts"))
    .sort();
  const drafts = all.filter((file) => file.endsWith(DRAFT_SUFFIX));
  const replaced = new Set(drafts.map((file) => `${file.slice(0, -DRAFT_SUFFIX.length)}.ts`));
  const files = options.drafts
    ? all.filter((file) => !replaced.has(file))
    : all.filter((file) => !file.endsWith(DRAFT_SUFFIX));

  const components: Found[] = [];
  const bindings: Scan["bindings"] = [];
  const exported: Scan["exported"] = new Map();
  for (const file of files) {
    const mod = await import(pathToFileURL(join(root, file)).href);
    for (const [exportName, value] of Object.entries(mod)) {
      if (typeof value !== "object" || value === null) continue;
      exported.set(value, { file, exportName });
      if ((value as any)[COMPONENT]) {
        const name = componentName(exportName);
        const same = components.find((other) => other.name === name);
        if (same) throw new Error(`コンポーネントの名前 "${name}" が重なっています (${same.file} と ${file})`);
        components.push({ name, declaration: value as Declaration, file, exportName });
      } else if ((value as any)[BINDING]) {
        bindings.push({ binding: value as BoundSpecification, file });
      }
    }
  }
  components.sort((a, b) => (a.name < b.name ? -1 : 1));
  return { root, components, bindings, exported };
}

// 仕様にあるコンポーネントの名前（名前順）
export async function listComponents(dir: string, options: { drafts?: boolean } = {}): Promise<string[]> {
  return (await scanSpecs(dir, options)).components.map((found) => found.name);
}

// 仕様の読み込みはここ1箇所に閉じ込める。パスは process.cwd() 基準。
// component: 読み込むコンポーネントの名前。省略できるのは、コンポーネントが1つのときだけ。
// bindings: false のときは、結び付けを仕様に重ねない（どのファイルにあるかだけを記録する）。
// コンポーネントが変わって結び付けが古くなっていても、コンポーネントの側を読めるようにするため
export async function loadSpecs(
  dir: string,
  options: { drafts?: boolean; bindings?: boolean; component?: string } = {},
): Promise<SpecInput> {
  const { root, components, bindings, exported } = await scanSpecs(dir, options);
  if (components.length === 0) return { behaviors: {}, decisions: {} };
  const names = components.map((found) => found.name).join(", ");
  if (options.component === undefined && components.length > 1) {
    throw new Error(`コンポーネントが複数あります (${names})。どれを読むかを指定してください`);
  }
  const found = options.component === undefined ? components[0] : components.find((other) => other.name === options.component);
  if (!found) throw new Error(`コンポーネント "${options.component}" がありません (あるのは: ${names})`);

  const { name, declaration, file, exportName } = found;
  const bound = bindings.find(({ binding }) => binding.component === declaration);
  const input = normalize(exportName, declaration, options.bindings === false ? undefined : bound?.binding);
  input.name = name;
  // 添付資料のパスは、コンポーネントのファイルがあるディレクトリからの相対
  input.assets = resolveAssets(declaration.assets ?? [], dirname(join(root, file)));
  input.sources = {
    component: { file, exportName },
    ...(bound ? { binding: bound.file } : {}),
    // ほかのコンポーネントの結び付けのファイル（このコンポーネントだけを検査するときに、そこの誤りを除くため）
    otherBindings: bindings.filter((other) => other !== bound).map((other) => other.file),
    decisions: Object.fromEntries(Object.entries(input.decisions).map(([table, value]) => [table, exported.get(value)])),
  };
  return input;
}

// 副作用の書き方 { SendReceipt: {...}, when? } を、扱いやすい形にする
function effectsOf(component: string, where: string, structure: Structure): SpecEffect[] {
  return (structure.effects ?? []).map((entry) => {
    const { when, ...rest } = entry as { when?: SpecEffect["when"] } & Record<string, unknown>;
    const names = Object.keys(rest);
    if (names.length !== 1) {
      throw new Error(`コンポーネント "${component}" の ${where}: effects の要素には、副作用を1つだけ書いてください (${names.join(", ") || "なし"})`);
    }
    return { name: names[0], payload: (rest[names[0]] ?? {}) as Record<string, SpecValue>, ...(when === undefined ? {} : { when }) };
  });
}

// コンポーネントと結び付けの構造を、抽出と検証が扱う形に正規化する。
// 省略された宣言は空にし、条件で分かれないコマンドは otherwise だけの表にする
function normalize(name: string, component: Declaration, binding: BoundSpecification | undefined): SpecInput {
  const model: SpecModel = {
    init: component.init,
    states: component.states,
    data: component.data ?? {},
    commands: Object.fromEntries(Object.entries(component.commands).map(([command, decl]) => [command, decl.input ?? {}])),
    queries: component.queries ?? {},
    effects: component.effects ?? {},
    ...(component.calculations ? { calculations: component.calculations } : {}),
    ...(component.invariants ? { invariants: component.invariants } : {}),
  };
  validateModel(name, model);

  const behaviors: SpecInput["behaviors"] = {};
  for (const [command, decl] of Object.entries(component.commands)) {
    if ((decl.then === undefined) === (decl.when === undefined)) {
      throw new Error(`コンポーネント "${name}" のコマンド "${command}": then か when の、どちらか一方を書いてください`);
    }
    const outcomes: Record<string, Outcome> = decl.when ?? { otherwise: decl.then! };
    if (!outcomes.otherwise) throw new Error(`コンポーネント "${name}" のコマンド "${command}": when に otherwise がありません`);

    const structure = binding?.commands[command] as Structure | Record<string, Structure> | undefined;
    const when: Record<string, SpecOutcome> = {};
    for (const [condition, outcome] of Object.entries(outcomes)) {
      // 結び付けが無い (下書き前) ときは、構造を空として扱う
      const written = ((decl.when ? (structure as Record<string, Structure> | undefined)?.[condition] : structure) ?? {}) as Structure;
      if (binding && decl.when && !(structure as Record<string, Structure> | undefined)?.[condition]) {
        throw new Error(`結び付けの commands.${command} に、条件 "${condition}" の構造がありません`);
      }
      when[condition] = {
        goTo: outcome.goTo,
        does: outcome.does,
        effects: effectsOf(name, `commands.${command}`, written),
        set: (written.set ?? {}) as Record<string, SpecValue>,
      };
    }
    if (binding && !structure) throw new Error(`結び付けの commands に、コマンド "${command}" の構造がありません`);
    behaviors[command] = { from: decl.from, onlyIf: decl.onlyIf, when };
  }
  const extra = Object.keys(binding?.commands ?? {}).find((command) => !(command in component.commands));
  if (extra !== undefined) throw new Error(`結び付けの commands の "${extra}" に対応するコマンドが、コンポーネントにありません`);

  const decisions = component.decisions ?? {};
  for (const [decision, table] of Object.entries(decisions)) {
    if (!table.otherwise) throw new Error(`決定表 "${decision}" に otherwise がありません`);
  }
  return { model, behaviors, decisions, component, ...(binding ? { binding } : {}) };
}

function validateModel(name: string, model: SpecModel) {
  if (!model.states.includes(model.init)) {
    throw new Error(`コンポーネント "${name}" の init "${model.init}" が states にありません`);
  }
  // 条件と計算からは data・queries・入力が同じ階層で見えるため、名前が重なると区別できない
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
  // 入力どうしはコマンドが違えば同名でよい
  for (const fields of Object.values(model.commands)) for (const field of Object.keys(fields)) claim(field, "input", true);
}
