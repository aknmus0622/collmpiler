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
export function graphDiagnostics(input: SpecInput): Diagnostic[] {
  const model = input.model;
  if (!model) return [];
  const found: Diagnostic[] = [];
  const report = (severity: Diagnostic["severity"], code: string, behavior: string, message: string) =>
    found.push({ severity, code, behavior, case: "", message });
  const behaviors = Object.entries(input.behaviors);
  const outcomes = behaviors.flatMap(([, behavior]) => Object.values(behavior.when));

  // たどり着ける状態: 初期状態から、遷移の辺をたどる
  const reachable = new Set<string>([model.init]);
  for (let grown = true; grown; ) {
    grown = false;
    for (const [, behavior] of behaviors) {
      if (!(behavior.from ?? model.states).some((state) => reachable.has(state))) continue;
      for (const outcome of Object.values(behavior.when)) {
        if (outcome.goTo !== undefined && model.states.includes(outcome.goTo) && !reachable.has(outcome.goTo)) {
          reachable.add(outcome.goTo);
          grown = true;
        }
      }
    }
  }
  for (const state of model.states) {
    if (!reachable.has(state)) {
      report("error", "unreachable-state", "", `状態 "${state}" には、初期状態 "${model.init}" から、どのコマンドでもたどり着けません。そこへ遷移する (goTo) コマンドを書くか、状態を消してください`);
    }
  }
  for (const [name, behavior] of behaviors) {
    const from = behavior.from ?? model.states;
    // 宣言されていない状態は、別の診断 (unknown-state) が報告する
    const declared = from.filter((state) => model.states.includes(state));
    if (declared.length === from.length && !from.some((state) => reachable.has(state))) {
      const where = from.length === 0 ? "実行できる状態 (from) が、1つもありません" : `実行できる状態 (${from.join(", ")}) のどれにも、たどり着けません`;
      report("error", "unreachable-command", name, `コマンド "${name}" は、実行されることがありません: ${where}`);
    }
  }

  // 入ってくる辺の無い語彙
  const emitted = new Set(outcomes.flatMap((outcome) => outcome.effects.map((effect) => effect.name)));
  for (const effect of Object.keys(model.effects)) {
    if (!emitted.has(effect)) report("warning", "unused-effect", "", `副作用 "${effect}" を起こす (emits) コマンドが、1つもありません`);
  }
  const remembered = new Set(outcomes.flatMap((outcome) => Object.keys(outcome.set)));
  for (const field of Object.keys(model.data)) {
    if (!remembered.has(field)) report("warning", "unset-data", "", `データ "${field}" を覚える (set) コマンドが、1つもありません。いつも未設定のままです`);
  }
  const asked = new Set(behaviors.flatMap(([, behavior]) => Object.values(behavior.asks ?? {}).map((ask) => ask.query)));
  for (const [query, declaration] of Object.entries(model.queries)) {
    if (Object.keys(declaration.input).length > 0 && !asked.has(query)) {
      report("warning", "unasked-query", "", `引数つきの問い合わせ "${query}" を尋ねる (asks) コマンドが、1つもありません`);
    }
  }
  return found;
}
