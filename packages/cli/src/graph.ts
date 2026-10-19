import { goToTargets } from "./extract.ts";
import type { Diagnostic, SpecInput } from "./extract.ts";

// グラフを土台にした検査 (DSL.md §8)。仕様を実行せず、書かれた構造だけから分かることを確かめる。
//
//   遷移の辺   … 状態 → 状態。コマンドの from と、場合ごとの goTo（無ければ、とどまる）から決まる
//   起こす辺   … 場合 → 副作用 (emits)
//   覚える辺   … 場合 → データ (set)
//   尋ねる辺   … コマンド → 引数つきの問い合わせ (asks)
//
// 条件が成り立つかどうかは見ない（意味は関数で、書かれたものからは分からない）。ここで言えるのは「道が無い」ことだけである。
// 道があるのに届かないこと（いつも偽の条件など）は、仕様を実行する検査（事前検査、仕様のミューテーション）が見る。
//
// extract の診断とは分けてある。たどり着けない状態やコマンドは誤り (error)、入ってくる辺の無い語彙は注意 (warning)
// 多数ある部品として含まれる部品のデータのうち、含む部品が作るとき (adds) に渡すもの (W13)。部品の名前 → データの名前
export function providedData(specs: SpecInput[]): Map<string, Set<string>> {
  const provided = new Map<string, Set<string>>();
  for (const spec of specs) {
    for (const behavior of Object.values(spec.behaviors ?? {})) {
      for (const outcome of Object.values(behavior.when)) {
        for (const added of outcome.adds ?? []) {
          const child = spec.model?.parts?.[added.part]?.component;
          if (child === undefined) continue;
          const names = provided.get(child) ?? new Set<string>();
          for (const field of Object.keys(added.data)) names.add(field);
          provided.set(child, names);
        }
      }
    }
  }
  return provided;
}

// グラフの検査が報告すること（判断）。文面は graphMessage が付ける。判断は Stage 0 (graphDiagnostics) か、
// フレームワーク自身の仕様から生成した部品 (self/specs/graph-check.*、Stage 1) が下す
export type GraphReport = {
  code: "unreachable-state" | "unreachable-command" | "dead-end-state" | "unused-effect" | "unset-data" | "unasked-query";
  subject: string;
  severity: "error" | "warning";
};
// 判断に、利用者向けの文面を付ける
export function graphMessage(input: SpecInput, { code, subject, severity }: GraphReport): Diagnostic {
  const model = input.model!;
  const strictlyAdded = severity === "error" ? "（解釈が足したものです。使わないなら消してください）" : "";
  const at = (behavior: string, message: string): Diagnostic => ({ severity, code, behavior, case: "", message });
  switch (code) {
    case "unreachable-state":
      return at("", `状態 "${subject}" には、初期状態 "${model.init}" から、どのコマンドでもたどり着けません。そこへ遷移する (goTo) コマンドを書くか、状態を消してください`);
    case "unreachable-command": {
      const from = input.behaviors[subject]?.from ?? model.states;
      const where = from.length === 0 ? "実行できる状態 (from) が、1つもありません" : `実行できる状態 (${from.join(", ")}) のどれにも、たどり着けません`;
      return at(subject, `コマンド "${subject}" は、実行されることがありません: ${where}`);
    }
    case "dead-end-state":
      return at("", `状態 "${subject}" は終わりの状態ではありませんが、どのコマンドでも、ほかの状態へ出られません。出るコマンドを書くか、終わりの状態 (final: true) にしてください`);
    case "unused-effect":
      return at("", `副作用 "${subject}" を起こす (emits) コマンドが、1つもありません${strictlyAdded}`);
    case "unset-data":
      return at("", `データ "${subject}" を覚える (set) コマンドが、1つもありません。いつも未設定のままです${strictlyAdded}`);
    case "unasked-query":
      return at("", `引数つきの問い合わせ "${subject}" を尋ねる (asks) コマンドが、1つもありません${strictlyAdded}`);
  }
}

// 遷移の辺: コマンドが実行できる状態 (from。無ければ全状態) から、場合ごとの goTo の行き先へ（判断を持たない糊）
export const transitions = (input: SpecInput): { from: string; to: string }[] =>
  Object.values(input.behaviors).flatMap((behavior) =>
    (behavior.from ?? input.model!.states).flatMap((from) =>
      Object.values(behavior.when).flatMap((outcome) => (outcome.goTo === undefined ? [] : goToTargets(input, outcome.goTo).map((to) => ({ from, to })))),
    ),
  );
// 語彙が使われているか（起こす、覚える・作るときに渡される、尋ねる）と、Layer 1 が項目として並べているか。事実を集めるだけの糊
export function vocabularyFacts(input: SpecInput, provided: ReadonlySet<string>) {
  const model = input.model!;
  const behaviors = Object.values(input.behaviors);
  const outcomes = behaviors.flatMap((behavior) => Object.values(behavior.when));
  const listed = (group: "effects" | "data" | "queries") => {
    const given = (input.layer1 as Record<string, unknown> | undefined)?.[group];
    return typeof given === "object" && given !== null && !("$description" in given) ? new Set(Object.keys(given)) : new Set<string>();
  };
  const emitted = new Set(outcomes.flatMap((outcome) => outcome.effects.map((effect) => effect.name)));
  const remembered = new Set(outcomes.flatMap((outcome) => Object.keys(outcome.set)));
  const asked = new Set(behaviors.flatMap((behavior) => Object.values(behavior.asks ?? {}).map((ask) => ask.query)));
  return [
    ...Object.keys(model.effects).map((name) => ({ group: "effects" as const, name, used: emitted.has(name), listed: listed("effects").has(name), takesInput: false })),
    ...Object.keys(model.data).map((name) => ({ group: "data" as const, name, used: remembered.has(name) || provided.has(name), listed: listed("data").has(name), takesInput: false })),
    ...Object.entries(model.queries).map(([name, query]) => ({ group: "queries" as const, name, used: asked.has(name), listed: listed("queries").has(name), takesInput: Object.keys(query.input).length > 0 })),
  ];
}

// provided: 含む部品が作るときに渡すデータ（覚える (set) コマンドが無くても、設定される）
// strict: 解釈が足した語彙が使われていなければ、注意ではなく誤り（clp interpret の検査。DSL.md §16.7）
// judged: Stage 1 の判断（無いか undefined なら、Stage 0 が判断する）
export function graphDiagnostics(input: SpecInput, provided: ReadonlySet<string> = new Set(), strict = false, judged?: GraphReport[]): Diagnostic[] {
  if (!input.model) return [];
  return (judged ?? graphReportsStage0(input, provided, strict)).map((report) => graphMessage(input, report));
}

// 判断 (Stage 0、手書き)
export function graphReportsStage0(input: SpecInput, provided: ReadonlySet<string> = new Set(), strict = false): GraphReport[] {
  const model = input.model;
  if (!model) return [];
  const found: GraphReport[] = [];
  const report = (severity: GraphReport["severity"], code: GraphReport["code"], subject: string) => found.push({ code, subject, severity });
  const behaviors = Object.entries(input.behaviors);

  // たどり着ける状態: 初期状態から、遷移の辺をたどる
  const reachable = new Set<string>([model.init]);
  for (let grown = true; grown; ) {
    grown = false;
    for (const [, behavior] of behaviors) {
      if (!(behavior.from ?? model.states).some((state) => reachable.has(state))) continue;
      for (const outcome of Object.values(behavior.when)) {
        for (const target of outcome.goTo === undefined ? [] : goToTargets(input, outcome.goTo)) {
          if (model.states.includes(target) && !reachable.has(target)) {
            reachable.add(target);
            grown = true;
          }
        }
      }
    }
  }
  for (const state of model.states) if (!reachable.has(state)) report("error", "unreachable-state", state);
  for (const [name, behavior] of behaviors) {
    const from = behavior.from ?? model.states;
    // 宣言されていない状態は、別の診断 (unknown-state) が報告する
    const declared = from.filter((state) => model.states.includes(state));
    if (declared.length === from.length && !from.some((state) => reachable.has(state))) report("error", "unreachable-command", name);
  }

  // 出口の無い状態: 終わりの状態を宣言したときだけ。終わりの状態でないのに、どのコマンドでも別の状態へ出られない
  if (model.final !== undefined) {
    for (const state of model.states) {
      if (model.final.includes(state) || !reachable.has(state)) continue;
      const leaves = behaviors.some(([, behavior]) =>
        (behavior.from ?? model.states).includes(state) &&
        Object.values(behavior.when).some((outcome) => outcome.goTo !== undefined && goToTargets(input, outcome.goTo).some((target) => target !== state)),
      );
      if (!leaves) report("error", "dead-end-state", state);
    }
  }

  // 入ってくる辺の無い語彙。解釈が足したもの（Layer 1 が項目として並べていないもの）は、strict なら誤り
  const CODE = { effects: "unused-effect", data: "unset-data", queries: "unasked-query" } as const;
  for (const entry of vocabularyFacts(input, provided)) {
    if (entry.used || (entry.group === "queries" && !entry.takesInput)) continue;
    report(strict && !entry.listed ? "error" : "warning", CODE[entry.group], entry.name);
  }
  return found;
}
