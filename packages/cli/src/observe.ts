import { isDeepStrictEqual } from "node:util";

// 観測値の比較 (N12b) の Stage 0。採点の部品 observation-compare (R1) の対になる手書きの版なので、このファイルには
// 比較のほかを置かない（ここが変われば、その部品の合格の記録は使えなくなる: R5）。
//
// 比べるのは、コマンドのあとに本番システムが見せたもの（状態、順に記録した副作用、答えるコマンドなら答え）と、仕様が期待するもの。
// answers: 仕様がそのコマンドの答えの形を宣言している。answered: 本番システムが何かを返した（返さなければ null と答えたとみなす）

export type Observed = { state: unknown; effects: unknown[]; output?: unknown };

export function observationsEqualStage0(expected: Observed, actual: Observed, answers: boolean): boolean {
  const shown = answers && !("output" in actual) ? { ...actual, output: null } : actual;
  return isDeepStrictEqual(expected, shown);
}

// 値を葉の列にする（Stage 1 に渡す形。判断を持たない糊）。葉は `道筋|種類|中身`。道筋は、上からのキーと添字を
// それぞれ JSON で書いて "." でつないだもの（JSON の文字列は自分で区切れるので、違う葉が同じ文字列になることはない）。
// 種類は null / boolean / number / string / array / object。中身は、値そのものなら JSON、配列なら長さ、オブジェクトなら空
export function* leavesOf(value: unknown, path: (string | number)[] = []): Generator<string> {
  const at = path.map((segment) => JSON.stringify(segment)).join(".");
  if (value === null || value === undefined) yield `${at}|null|null`;
  else if (Array.isArray(value)) {
    yield `${at}|array|${value.length}`;
    for (const [index, item] of value.entries()) yield* leavesOf(item, [...path, index]);
  } else if (typeof value === "object") {
    yield `${at}|object|`;
    for (const [key, item] of Object.entries(value)) if (item !== undefined) yield* leavesOf(item, [...path, key]);
  } else yield `${at}|${typeof value}|${JSON.stringify(value)}`;
}
