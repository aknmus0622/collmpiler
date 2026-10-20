// 入力の候補 (N12f) の Stage 0。採点の部品 input-candidates (R1) の対になる手書きの版なので、このファイルには候補の決め方のほかを
// 置かない（ここが変われば、その部品の合格の記録は使えなくなる: R5）。
//
// 乱数そのもの（どの候補を、どの重みで引くか）は fast-check のまま。ここで決めるのは、一様な乱数ではまず出ない値のうち、
// どれを候補に混ぜるか: 仕様の中の文字列と数（意味の関数と決定表から拾ったものは、渡す側が渡す）、宣言した例としきい値、
// 範囲の端、しきい値の前後、長さのしきい値、いま覚えているものから選ぶ値。

// 文字列の候補: 仕様の中の文字列と宣言した例（初めに現れた順、重ねない）と、仕様の中の数の前後の長さ（1 以上 10000 以下の整数の前後）
export function stringCandidatesStage0(texts: readonly string[], numbers: readonly number[]): { known: string[]; lengths: number[] } {
  return {
    known: [...new Set(texts)],
    lengths: [...new Set(numbers.filter((n) => Number.isInteger(n) && n > 0 && n <= 10_000).flatMap((n) => [n - 1, n, n + 1]))],
  };
}

// 数の候補: 範囲の端と、しきい値（仕様の中の数と around）。整数なら、しきい値の前後も。型と範囲に合うものだけ（初めに現れた順、重ねない）
export function numberCandidatesStage0(integer: boolean, min: number | null, max: number | null, around: readonly number[]): { limits: number[]; thresholds: number[] } {
  const fits = (value: number) => Number.isFinite(value) && (!integer || Number.isInteger(value)) && (min === null || value >= min) && (max === null || value <= max);
  const valid = (values: (number | null)[]) => [...new Set(values.filter((value): value is number => value !== null && fits(value)))];
  return {
    limits: valid([min, max]),
    thresholds: valid([...new Set(around)].flatMap((value) => (integer ? [value - 1, value, value + 1] : [value]))),
  };
}

// いま覚えているものから選ぶ入力 (among): 使えるもの（null でなく、入力の型に合う。渡す側が比べる）のうち、pick 番目
// （数で割った余り）。pick が無い（4回に1回）か、使えるものが無ければ、選ばない（乱数の値のまま）。答えは、渡した中での位置
export function amongStage0(pick: number | null, usable: readonly boolean[]): number | null {
  const positions = usable.flatMap((ok, index) => (ok ? [index] : []));
  return pick === null || positions.length === 0 ? null : positions[pick % positions.length];
}
