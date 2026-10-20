import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { BINDING, COMPONENT, activate, check, isComponent, layer1Of, leafFactsOf, overlayCodesStage0, overlayOf, treeOf } from "@clp/core";
import type { AssetDeclaration, BoundSpecification, Diagnostic as TreeDiagnostic, LeafFacts, Node, OverlayCode, OverlayFact, Structure } from "@clp/core";
import { resolveAssets } from "./assets.ts";
import { stableStringify } from "./extract.ts";
import type { SpecAsk, SpecEffect, SpecInput, SpecModel, SpecOutcome, SpecValue } from "./extract.ts";
import { claimEvents, declaredMessage, declaredReportsStage0 } from "./declared.ts";
import type { DeclaredEvent, DeclaredReport } from "./declared.ts";

// 下書き (LLM が導き、人がまだ確定していない解釈) のファイル名
export const DRAFT_SUFFIX = ".draft.ts";

// 解釈のファイルの先頭に記す、導いたときの Layer 1 のハッシュ。
// Layer 1 がそのあとで変わっていれば、解釈は古い（正解として使えない）
export const STAMP = "// layer1: ";
export const stampIn = (text: string): string | undefined => new RegExp(`^${STAMP}(sha256:[0-9a-f]+)$`, "m").exec(text)?.[1];

// 人が確かめるまで確定できない印。解釈した LLM が書くもの (// REVIEW:) と、2つの解釈の食い違いを clp が書くもの (// REVIEW(clp):)。
// 人は、Layer 1 を詳しくして導き直すか、その読み方でよければ REVIEWED に書き換える（確かめた記録として残る）
export type OpenReview = { line: number; text: string; by: "interpreter" | "clp" };
export function openReviews(text: string): OpenReview[] {
  return text.split("\n").flatMap((line, index) => {
    const match = /\/\/\s*REVIEW(\(clp\))?:\s*(.*)$/.exec(line);
    return match ? [{ line: index + 1, text: match[2].trim(), by: match[1] ? ("clp" as const) : ("interpreter" as const) }] : [];
  });
}

// Layer 1 のハッシュ。解釈に影響し得るものすべてを含める。
// 決定表のセルの値は含めない（値は解釈を通らずに IR に届く。含めるのは、行と列の名前と、値の型だけ）。添付資料も含めない
export function layer1Hash(layer1: object): string {
  const { assets: _assets, decisions, parts, durable, ...rest } = layer1 as {
    assets?: unknown;
    decisions?: Record<string, Record<string, Record<string, unknown>>>;
    parts?: Record<string, { component: object; by?: string }>;
    durable?: true | { store: object };
  };
  const shapes = Object.fromEntries(
    Object.entries(decisions ?? {}).map(([name, table]) => [
      name,
      Object.fromEntries(
        Object.entries(table).map(([row, cells]) => [row, Object.fromEntries(Object.entries(cells).map(([column, cell]) => [column, cell === null ? "null" : typeof cell]))]),
      ),
    ]),
  );
  // 含む部品は、その部品の Layer 1 のハッシュで表す（書いた行の位置は含めない）
  const nested =
    parts === undefined
      ? {}
      : {
          parts: Object.fromEntries(
            Object.entries(parts).map(([name, { component, by }]) => {
              const hash = layer1Hash(isComponent(component) ? layer1Of(component) : component);
              return [name, by === undefined ? hash : { layer1: hash, by }];
            }),
          ),
        };
  // 保存先の部品も、その部品の Layer 1 のハッシュで表す
  const kept =
    durable === undefined ? {} : { durable: durable === true ? true : { store: layer1Hash(isComponent(durable.store) ? layer1Of(durable.store) : durable.store) } };
  return `sha256:${createHash("sha256").update(stableStringify({ ...rest, decisions: shapes, ...nested, ...kept })).digest("hex")}`;
}

type Found = { name: string; declaration: object; file: string; exportName: string };
type Scan = {
  root: string;
  components: Found[];
  bindings: { binding: BoundSpecification; file: string }[];
  exported: Map<object, { file: string; exportName: string }>;
  // 読み込めなかった解釈のファイル（Layer 1 から消えた取っ手を使っているときなど）
  broken: { file: string; message: string }[];
};
// 解釈のファイル（確定版と下書き）。読み込めなくても、ほかの仕様の読み込みは止めない
const INTERPRETATION_FILE = /\.interpretation(\.draft)?\.ts$/;

// コンポーネントの名前: export 名を小文字とハイフンにしたもの (Order → order、CheckoutButton → checkout-button)。
// テスト側のファイル名と、--component の指定に使う
export const componentName = (exportName: string) =>
  exportName.replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/([A-Z])([A-Z][a-z])/g, "$1-$2").toLowerCase();

// 仕様のファイルを読み込み、コンポーネント (Layer 1) と解釈 (Layer 2) を集める。
// 下書き (*.draft.ts) は既定では読まない。人が確認して名前を変えるまで、正解として使われないようにするため。
// drafts: true のときだけ下書きを読み、それが置き換える確定版 (X.draft.ts に対する X.ts) は読まない
// 仕様のディレクトリが無いときに、どうすればよいかを伝える
export function requireSpecsDir(root: string): void {
  if (existsSync(root)) return;
  throw new Error(`仕様のディレクトリがありません: ${root}\n  場所を指定するか (--specs <dir>。clp compile では引数)、仕様 (specs/) のあるディレクトリで実行してください`);
}

async function scanSpecs(dir: string, options: { drafts?: boolean }): Promise<Scan> {
  const root = resolve(process.cwd(), dir);
  requireSpecsDir(root);
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
  const broken: Scan["broken"] = [];
  for (const file of files) {
    let mod: Record<string, unknown>;
    try {
      mod = await import(pathToFileURL(join(root, file)).href);
    } catch (error) {
      if (!INTERPRETATION_FILE.test(file)) throw error;
      broken.push({ file, message: error instanceof Error ? error.message : String(error) });
      continue;
    }
    for (const [exportName, value] of Object.entries(mod)) {
      if (typeof value !== "object" || value === null) continue;
      exported.set(value, { file, exportName });
      // いまの書き方の値か、次の書き方 (@clp/core/next) の部品の木
      if ((value as any)[COMPONENT] || isComponent(value)) {
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
  return { root, components, bindings, exported, broken };
}

// 仕様にあるコンポーネントの名前（名前順）
export async function listComponents(dir: string, options: { drafts?: boolean } = {}): Promise<string[]> {
  return (await scanSpecs(dir, options)).components.map((found) => found.name);
}

// 読み込むときの判断（木の検査と葉の検査）。core は事実を出し、判断はここで渡されたもの（Stage 1）が行う。
// 渡されないか、undefined を返したら（実行できなかった）、Stage 0 (core の check / leafCheck) が判断する。
// 入口 (compile / apply) が渡す。loader が Stage 1 を直接読まないのは、Stage 1 の部品が loader に頼るため（循環しないように）
export type LoadJudges = {
  tree?: (tree: Node) => Promise<TreeDiagnostic[] | undefined>;
  leaf?: (facts: LeafFacts) => Promise<string[] | undefined>;
  // 名前の衝突（宣言の検査の、名前を主張する事実の列）
  claims?: (events: DeclaredEvent[]) => Promise<DeclaredReport[] | undefined>;
  // 重ね合わせで確かめた事実（Layer 1 との衝突、古さ）。事実ごとの問題の種類 (N12g)
  overlay?: (facts: OverlayFact[]) => Promise<OverlayCode[][] | undefined>;
};

// 解釈を重ねたときの問題。事実を Stage 1 で判断し直せれば、それを言葉にする。できなければ、Stage 0 の判断 (binding.problems)
async function overlayProblems(binding: BoundSpecification, judges: LoadJudges): Promise<string[]> {
  const checks = overlayOf(binding);
  const codes = checks && (await judges.overlay?.(checks.map((check) => check.fact)));
  if (!checks || !codes) return binding.problems;
  return checks.flatMap((check, index) => codes[index].map((code) => check.messages[code] ?? code));
}

// 仕様の読み込みはここ1箇所に閉じ込める。パスは process.cwd() 基準。
// component: 読み込むコンポーネントの名前。省略できるのは、コンポーネントが1つのときだけ。
// bindings: false のときは、解釈を重ねない（どのファイルにあるかだけを記録する）。
// Layer 1 だけを読むためのもの
export async function loadSpecs(
  dir: string,
  options: { drafts?: boolean; bindings?: boolean; component?: string; judges?: LoadJudges } = {},
): Promise<SpecInput> {
  const judges = options.judges ?? {};
  // 木の検査: 文法に合わない所 (Stage 1 か Stage 0) と、まだ使えない書き方
  const grammarOf = async (value: object): Promise<TreeDiagnostic[]> => {
    const found = treeOf(value);
    if (!found) return [];
    return [...((await judges.tree?.(found.tree)) ?? check(found.tree)), ...found.problems];
  };
  // 葉の検査 (Stage 1 か Stage 0)
  const incompleteOf = async (binding: BoundSpecification | undefined): Promise<string[] | undefined> => {
    if (!binding) return undefined;
    const facts = leafFactsOf(binding);
    return (facts ? await judges.leaf?.(facts) : undefined) ?? binding.incomplete;
  };
  const { root, components, bindings, exported, broken } = await scanSpecs(dir, options);
  if (components.length === 0) return { behaviors: {}, decisions: {} };
  const names = components.map((found) => found.name).join(", ");
  if (options.component === undefined && components.length > 1) {
    throw new Error(`コンポーネントが複数あります (${names})。どれを読むかを指定してください`);
  }
  const found = options.component === undefined ? components[0] : components.find((other) => other.name === options.component);
  if (!found) throw new Error(`コンポーネント "${options.component}" がありません (あるのは: ${names})`);

  const { name, file, exportName } = found;
  // 次の書き方の部品は、いまの Layer 1 の値に変換して扱う。解釈が指す相手は、書かれた値（木）のほう
  const written = found.declaration;
  const declaration = isComponent(written) ? layer1Of(written) : written;
  const bound = bindings.find(({ binding }) => binding.source === written);
  // 同じコンポーネントの解釈が、このプロセスに2つ読み込まれていることがある（確定版と下書き）。使うほうを選ぶ
  if (bound && options.bindings !== false) activate(bound.binding);
  const usedBinding = options.bindings === false ? undefined : bound?.binding;
  const input = await normalize(exportName, declaration, usedBinding, await incompleteOf(usedBinding), judges);
  input.name = name;
  // 木の検査: 文法に合わない所と、まだ使えない書き方（次の書き方で書かれたものだけ）
  const grammar = [...(input.grammar ?? []), ...(isComponent(written) ? await grammarOf(written) : []), ...(bound && options.bindings !== false ? await grammarOf(bound.binding) : [])];
  if (grammar.length > 0) input.grammar = grammar;
  // 添付資料のパスは、コンポーネントのファイルがあるディレクトリからの相対
  input.assets = resolveAssets((declaration as { assets?: readonly AssetDeclaration[] }).assets ?? [], dirname(join(root, file)));
  if (bound && options.bindings !== false) {
    const stamp = stampIn(readFileSync(join(root, bound.file), "utf8"));
    const fact: OverlayFact = { kind: "stamp", recorded: stamp ?? null, current: layer1Hash(declaration) };
    if (((await judges.overlay?.([fact]))?.[0] ?? overlayCodesStage0(fact)).includes("stale")) input.stale = true;
    // 確定版に、確かめていない印が残っている（手で書き換えた、など）。下書きは、そもそも確かめていないものなので見ない
    if (!bound.file.endsWith(DRAFT_SUFFIX)) {
      const open = openReviews(readFileSync(join(root, bound.file), "utf8"));
      if (open.length > 0) input.unreviewed = open.map((review) => `${bound.file}:${review.line}`);
    }
  }
  // このコンポーネントの解釈のファイル（名前で決まる）が読み込めなければ、解釈の誤りとして報告する
  const base = file.replace(/(\.component)?\.ts$/, "");
  const unloadable = bound ? undefined : broken.find((entry) => entry.file.replace(INTERPRETATION_FILE, "") === base);
  if (unloadable && options.bindings !== false) {
    input.problems = [...(input.problems ?? []), `解釈のファイル ${unloadable.file} を読み込めません: ${unloadable.message}`];
  }
  // 再起動を越えて残るか (W7)。保存先の部品は、その名前で指す
  const durableOf = (spec: SpecInput) => {
    const declared = spec.component?.durable;
    if (declared === undefined || !spec.model) return;
    if (declared === true) {
      spec.model.durable = true;
      return;
    }
    const store = components.find((other) => other.declaration === declared.store);
    if (!store) spec.problems = [...(spec.problems ?? []), "durable: 保存先の部品が、仕様のファイルから export された部品ではありません"];
    else spec.model.durable = { store: store.name };
  };
  // 含む部品: それぞれを、その部品の解釈と一緒に読む
  const nest = async (spec: SpecInput, trail: string[]) => {
    const declared = spec.component?.parts;
    if (!declared || !spec.model) return;
    const found: Record<string, SpecInput> = {};
    const problems: string[] = [];
    for (const [part, { component: written, by }] of Object.entries(declared)) {
      const inner = components.find((other) => other.declaration === written);
      if (!inner) {
        problems.push(`含む部品 "${part}" は、仕様のファイルから export された部品ではありません`);
        continue;
      }
      if (trail.includes(inner.name)) {
        problems.push(`含む部品 "${part}" (${inner.name}) が、自分を含んでいます (${[...trail, inner.name].join(" → ")})`);
        continue;
      }
      const childBinding = bindings.find(({ binding }) => binding.source === written)?.binding;
      const child = await normalize(inner.exportName, isComponent(written) ? layer1Of(written) : written, childBinding, await incompleteOf(childBinding), judges);
      child.name = inner.name;
      if (!child.model) {
        problems.push(`含む部品 "${part}" (${inner.name}) の解釈が無いか、Layer 1 と合いません。先に、その部品を clp interpret してください`);
        continue;
      }
      durableOf(child);
      await nest(child, [...trail, inner.name]);
      if (by !== undefined) child.by = by;
      found[part] = child;
    }
    if (problems.length > 0) spec.problems = [...(spec.problems ?? []), ...problems];
    spec.parts = found;
    spec.model.parts = Object.fromEntries(Object.entries(found).map(([part, child]) => [part, boundaryOfPart(child)]));
  };
  if (options.bindings !== false) {
    durableOf(input);
    await nest(input, [name]);
  }
  input.sources = {
    component: { file, exportName },
    ...(bound ? { binding: bound.file } : unloadable ? { binding: unloadable.file.replace(/\.draft\.ts$/, ".ts") } : {}),
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
// incomplete: 葉の検査の結果（判断したのは Stage 1 か Stage 0）
async function normalize(name: string, layer1: object, binding: BoundSpecification | undefined, incomplete: string[] | undefined, judges: LoadJudges = {}): Promise<SpecInput> {
  if (!binding) return { behaviors: {}, decisions: {}, layer1 };
  // 重ね合わせの誤りか、書き残し（葉の検査）があれば、語彙は作らない（報告は extract が行う）
  const problems = await overlayProblems(binding, judges);
  if (problems.length > 0 || (incomplete?.length ?? 0) > 0) {
    return { behaviors: {}, decisions: {}, layer1, binding, problems, ...(incomplete?.length ? { incomplete } : {}) };
  }
  const component = binding.component;
  const model: SpecModel = {
    init: component.init,
    states: component.states,
    ...(component.finals ? { final: component.finals } : {}),
    data: component.data,
    commands: Object.fromEntries(Object.entries(component.commands).map(([command, decl]) => [command, decl.input ?? {}])),
    queries: component.queries,
    effects: component.effects,
    ...(Object.keys(component.calculations).length > 0 ? { calculations: component.calculations } : {}),
    ...(component.invariants.length > 0 ? { invariants: component.invariants } : {}),
  };
  // コマンドが返すものの形（返すコマンドがあるときだけ持つ）
  const outputs = Object.fromEntries(Object.entries(component.commands).flatMap(([command, decl]) => (decl.output === undefined ? [] : [[command, decl.output]])));
  if (Object.keys(outputs).length > 0) model.outputs = outputs;
  // 経路（コマンドが外からどう届くか）。書いたコマンドがあるときだけ持つ
  const routes = Object.fromEntries(Object.entries(component.commands).flatMap(([command, decl]) => (decl.route === undefined ? [] : [[command, decl.route]])));
  if (Object.keys(routes).length > 0) model.routes = routes;
  if (component.initial) model.initial = component.initial;
  const asked = Object.values(component.commands).flatMap((decl) => Object.keys(decl.asks ?? {}));
  const claims = [...claimEvents(model, asked, Object.keys(component.parts ?? {}))];
  const collisions = (await judges.claims?.(claims)) ?? declaredReportsStage0(claims);
  const vocabulary = validateModel(name, model, component.decisions, collisions);
  if (vocabulary.length > 0) return { behaviors: {}, decisions: {}, layer1, binding, grammar: vocabulary };

  const behaviors: SpecInput["behaviors"] = {};
  for (const [command, decl] of Object.entries(component.commands)) {
    const when: Record<string, SpecOutcome> = {};
    for (const [condition, outcome] of Object.entries(decl.when)) {
      const written = binding.commands[command]?.[condition] ?? {};
      when[condition] = {
        ...(outcome.goTo === undefined ? {} : { goTo: outcome.goTo }),
        ...(outcome.does === undefined ? {} : { does: outcome.does }),
        ...(outcome.responds === undefined ? {} : { responds: outcome.responds as SpecOutcome["responds"] }),
        effects: effectsOf(name, `commands.${command}`, written),
        set: (written.set ?? {}) as Record<string, SpecValue>,
        ...(written.adds ? { adds: written.adds as SpecOutcome["adds"] } : {}),
        ...(written.removes ? { removes: written.removes as SpecOutcome["removes"] } : {}),
      };
    }
    behaviors[command] = {
      ...(decl.description === undefined ? {} : { description: decl.description }),
      from: decl.from,
      onlyIf: decl.onlyIf,
      ...(decl.asks ? { asks: decl.asks as Record<string, SpecAsk> } : {}),
      ...(decl.calls ? { calls: decl.calls as SpecInput["behaviors"][string]["calls"] } : {}),
      when,
    };
  }

  return { model, behaviors, decisions: component.decisions, layer1, component, binding };
}

// 語彙の誤り。読み込みを止めずに、ほかの診断と一緒に報告する（場所と直し方を添える）
type VocabularyProblem = { code: string; message: string };
// collisions: 名前の衝突の判断（Stage 1 か Stage 0。declared.ts）
function validateModel(name: string, model: SpecModel, decisions: Record<string, Record<string, unknown>>, collisions: DeclaredReport[]): VocabularyProblem[] {
  void name;
  const problems: VocabularyProblem[] = [];
  if (!model.states.includes(model.init)) {
    problems.push({ code: "unknown-state", message: `初期状態 (init) の "${model.init}" が、states にありません` });
  }
  for (const [decision, table] of Object.entries(decisions)) {
    if (!table.otherwise) problems.push({ code: "bad-decision", message: `決定表 "${decision}" に otherwise がありません。どの行にも当たらないときの値を、otherwise の行に書いてください` });
  }
  // 条件と計算からは、data・引数の無い問い合わせ・入力・尋ねた答えに付けた名前が同じ階層で見えるため、名前が重なると区別できない
  for (const found of collisions) {
    const worded = declaredMessage(found);
    problems.push({ code: worded.code, message: worded.message });
  }
  return problems;
}

// 含む部品の、外から見た境界: 呼べるコマンド（入力と、返すもの）と、その部品（と、さらに中の部品）の依存。
// 依存の名前は、部品の名前で修飾する（todos.newId）。外側の部品の契約に、この名前で並ぶ
export function boundaryOfPart(child: SpecInput): NonNullable<SpecModel["parts"]>[string] {
  const model = child.model!;
  const { queries, effects } = dependenciesOf(child);
  return {
    component: child.name ?? "",
    ...(child.by === undefined ? {} : { by: child.by }),
    commands: model.commands,
    ...(model.outputs ? { outputs: model.outputs } : {}),
    queries,
    effects,
    // 再起動を越えて残るものを含む（その部品か、さらに中の部品が durable）
    ...(restartable(child) ? { durable: true as const } : {}),
  };
}
// 再起動を越えて残るものを含むか（その部品か、中の部品のどれかが durable）。含むなら、検証は途中で再起動する
export const restartable = (spec: SpecInput): boolean => spec.model?.durable !== undefined || Object.values(spec.parts ?? {}).some(restartable);
// その部品自身と、含む部品の依存（中の部品のものは、部品の名前で修飾する）
export function dependenciesOf(spec: SpecInput): { queries: SpecModel["queries"]; effects: SpecModel["effects"] } {
  const queries = { ...spec.model!.queries };
  const effects = { ...spec.model!.effects };
  for (const [part, child] of Object.entries(spec.parts ?? {})) {
    const inner = dependenciesOf(child);
    for (const [name, query] of Object.entries(inner.queries)) queries[`${part}.${name}`] = query;
    for (const [name, fields] of Object.entries(inner.effects)) effects[`${part}.${name}`] = fields;
  }
  return { queries, effects };
}
