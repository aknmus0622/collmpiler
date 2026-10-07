import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { BINDING, COMPONENT, activate } from "@clp/core";
import type { AssetDeclaration, BoundSpecification, Structure } from "@clp/core";
import { resolveAssets } from "./assets.ts";
import { stableStringify } from "./extract.ts";
import type { SpecAsk, SpecEffect, SpecInput, SpecModel, SpecOutcome, SpecValue } from "./extract.ts";

// 下書き (LLM が導き、人がまだ確定していない解釈) のファイル名
export const DRAFT_SUFFIX = ".draft.ts";

// 解釈のファイルの先頭に記す、導いたときの Layer 1 のハッシュ。
// Layer 1 がそのあとで変わっていれば、解釈は古い（正解として使えない）
export const STAMP = "// layer1: ";
export const stampIn = (text: string): string | undefined => new RegExp(`^${STAMP}(sha256:[0-9a-f]+)$`, "m").exec(text)?.[1];

// Layer 1 のハッシュ。解釈に影響し得るものすべてを含める。
// 決定表のセルの値は含めない（値は解釈を通らずに IR に届く。含めるのは、行と列の名前と、値の型だけ）。添付資料も含めない
export function layer1Hash(layer1: object): string {
  const { assets: _assets, decisions, ...rest } = layer1 as { assets?: unknown; decisions?: Record<string, Record<string, Record<string, unknown>>> };
  const shapes = Object.fromEntries(
    Object.entries(decisions ?? {}).map(([name, table]) => [
      name,
      Object.fromEntries(
        Object.entries(table).map(([row, cells]) => [row, Object.fromEntries(Object.entries(cells).map(([column, cell]) => [column, cell === null ? "null" : typeof cell]))]),
      ),
    ]),
  );
  return `sha256:${createHash("sha256").update(stableStringify({ ...rest, decisions: shapes })).digest("hex")}`;
}

type Found = { name: string; declaration: object; file: string; exportName: string };
type Scan = { root: string; components: Found[]; bindings: { binding: BoundSpecification; file: string }[]; exported: Map<object, { file: string; exportName: string }> };

// コンポーネントの名前: export 名を小文字とハイフンにしたもの (Order → order、CheckoutButton → checkout-button)。
// テスト側のファイル名と、--component の指定に使う
export const componentName = (exportName: string) =>
  exportName.replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/([A-Z])([A-Z][a-z])/g, "$1-$2").toLowerCase();

// 仕様のファイルを読み込み、コンポーネント (Layer 1) と解釈 (Layer 2) を集める。
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
        components.push({ name, declaration: value, file, exportName });
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
// bindings: false のときは、解釈を重ねない（どのファイルにあるかだけを記録する）。
// Layer 1 だけを読むためのもの
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
  const bound = bindings.find(({ binding }) => binding.source === declaration);
  // 同じコンポーネントの解釈が、このプロセスに2つ読み込まれていることがある（確定版と下書き）。使うほうを選ぶ
  if (bound && options.bindings !== false) activate(bound.binding);
  const input = normalize(exportName, declaration, options.bindings === false ? undefined : bound?.binding);
  input.name = name;
  // 添付資料のパスは、コンポーネントのファイルがあるディレクトリからの相対
  input.assets = resolveAssets((declaration as { assets?: readonly AssetDeclaration[] }).assets ?? [], dirname(join(root, file)));
  if (bound && options.bindings !== false) {
    const stamp = stampIn(readFileSync(join(root, bound.file), "utf8"));
    if (stamp !== undefined && stamp !== layer1Hash(declaration)) input.stale = true;
  }
  input.sources = {
    component: { file, exportName },
    ...(bound ? { binding: bound.file } : {}),
    // ほかのコンポーネントの解釈のファイル（このコンポーネントだけを検査するときに、そこの誤りを除くため）
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

// Layer 1 に解釈を重ねたコンポーネントを、抽出と検証が扱う形に正規化する。
// 解釈が無い、または Layer 1 と合わないときは、語彙を作らずに、その旨だけを持たせる（報告は extract が行う）
function normalize(name: string, layer1: object, binding: BoundSpecification | undefined): SpecInput {
  if (!binding) return { behaviors: {}, decisions: {}, layer1 };
  if (binding.problems.length > 0) return { behaviors: {}, decisions: {}, layer1, binding, problems: binding.problems };
  const component = binding.component;
  const model: SpecModel = {
    init: component.init,
    states: component.states,
    data: component.data,
    commands: Object.fromEntries(Object.entries(component.commands).map(([command, decl]) => [command, decl.input ?? {}])),
    queries: component.queries,
    effects: component.effects,
    ...(Object.keys(component.calculations).length > 0 ? { calculations: component.calculations } : {}),
    ...(component.invariants.length > 0 ? { invariants: component.invariants } : {}),
  };
  validateModel(name, model, Object.values(component.commands).flatMap((decl) => Object.keys(decl.asks ?? {})));

  const behaviors: SpecInput["behaviors"] = {};
  for (const [command, decl] of Object.entries(component.commands)) {
    const when: Record<string, SpecOutcome> = {};
    for (const [condition, outcome] of Object.entries(decl.when)) {
      const written = binding.commands[command]?.[condition] ?? {};
      when[condition] = {
        ...(outcome.goTo === undefined ? {} : { goTo: outcome.goTo }),
        ...(outcome.does === undefined ? {} : { does: outcome.does }),
        effects: effectsOf(name, `commands.${command}`, written),
        set: (written.set ?? {}) as Record<string, SpecValue>,
      };
    }
    behaviors[command] = {
      ...(decl.description === undefined ? {} : { description: decl.description }),
      from: decl.from,
      onlyIf: decl.onlyIf,
      ...(decl.asks ? { asks: decl.asks as Record<string, SpecAsk> } : {}),
      when,
    };
  }

  for (const [decision, table] of Object.entries(component.decisions)) {
    if (!table.otherwise) throw new Error(`決定表 "${decision}" に otherwise がありません`);
  }
  return { model, behaviors, decisions: component.decisions, layer1, component, binding };
}

function validateModel(name: string, model: SpecModel, asked: string[]) {
  if (!model.states.includes(model.init)) {
    throw new Error(`コンポーネント "${name}" の init "${model.init}" が states にありません`);
  }
  // 条件と計算からは、data・引数の無い問い合わせ・入力・尋ねた答えに付けた名前が同じ階層で見えるため、名前が重なると区別できない
  const owners = new Map<string, string>([["status", "予約語"]]);
  const claim = (field: string, owner: string, shared = false) => {
    const taken = owners.get(field);
    if (taken !== undefined && !(shared && taken === owner)) {
      throw new Error(`コンポーネント "${name}" のフィールド "${field}" が重複しています (${taken} と ${owner})`);
    }
    owners.set(field, owner);
  };
  for (const field of Object.keys(model.data)) claim(field, "data");
  for (const [field, query] of Object.entries(model.queries)) if (Object.keys(query.input).length === 0) claim(field, "queries");
  // 尋ねた答えに付けた名前どうしは、コマンドが違えば同名でよい
  for (const alias of asked) claim(alias, "asks", true);
  // 入力どうしはコマンドが違えば同名でよい
  for (const fields of Object.values(model.commands)) for (const field of Object.keys(fields)) claim(field, "input", true);
}
