// 場合の選び方 (N12c) の Stage 0。採点の部品 step-choice (R1) の対になる手書きの版なので、このファイルには選び方のほかを
// 置かない（ここが変われば、その部品の合格の記録は使えなくなる: R5）。
//
// 条件が成り立つかは、渡された holds で尋ねる（意味の関数を実行するのは呼ぶ側、橋渡し）。

export type CaseChoice = { chosen: string | null; conflict: string[] };

// 起きる場合: 条件が成り立つものがちょうど1つならそれ、無ければ otherwise、2つ以上なら衝突（どれも尋ねる）
export function chooseCaseStage0(names: string[], holds: (condition: string) => boolean): CaseChoice {
  const hits = names.filter((name) => name !== "otherwise" && holds(name));
  if (hits.length > 1) return { chosen: null, conflict: hits };
  return { chosen: hits[0] ?? "otherwise", conflict: [] };
}
