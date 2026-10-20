// 依存の約束 (N12e) の Stage 0。採点の部品 promise-keeper (R1) の対になる手書きの版なので、このファイルには約束の守り方のほかを
// 置かない（ここが変われば、その部品の合格の記録は使えなくなる: R5）。
//
// 乱数で引いた答え (drawn) を、約束を守る答えに直す。前に答えたものの記録は、呼ぶ側がシミュレーションの状態に持つ。

// increasing: 前の答えが無ければ引いた値。あれば、前の答えに増え幅を足したもの（上限があれば、それを超えない）
export function increasingStage0(drawn: number, previous: number | null, delta: number, max: number | null): number {
  return previous === null ? drawn : Math.min(previous + delta, max ?? Number.POSITIVE_INFINITY);
}

// fresh: すでに答えた値なら、別の値にする（数なら、答えた中で最大のものより 1 大きい数。ほかは、"#" と答えた数を後ろに付ける）
export function freshStage0(drawn: unknown, used: readonly unknown[]): unknown {
  if (!used.includes(drawn)) return drawn;
  return typeof drawn === "number" ? Math.max(...(used as number[])) + 1 : `${String(drawn)}#${used.length}`;
}

// 再起動を越えて、部品の状態とデータが残るか。再起動を越えて残る部品 (durable) は残り、ほかは始めに戻る
export function survivesRestartStage0(durable: boolean): boolean {
  return durable;
}
