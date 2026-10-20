// 1手の選び方 (N12c) の Stage 0。採点の部品 step-choice (R1) の対になる手書きの版なので、このファイルには選び方のほかを
// 置かない（ここが変われば、その部品の合格の記録は使えなくなる: R5）。
//
// 条件が成り立つかは、渡された holds で尋ねる（意味の関数を実行するのは呼ぶ側、橋渡し）。

// コマンド1つについての事実。everywhere: from を書いていない。pathValues: 経路の path に入る入力の値
export type CommandFacts = { command: string; everywhere: boolean; from: readonly string[]; pathValues: readonly string[]; onlyIf: readonly string[] };
export type CommandChoice = { chosen: string | null; refused: boolean };
export type CaseChoice = { chosen: string | null; conflict: string[] };

// いま実行できるコマンド（渡した順）。onlyIf は、そこまでの事実で実行できるあいだだけ、書いた順に尋ねる
export function enabledStage0(state: string, facts: CommandFacts[], holds: (command: string, condition: string) => boolean): string[] {
  return facts
    .filter(
      (fact) =>
        (fact.everywhere || fact.from.includes(state)) &&
        fact.pathValues.every((value) => value !== "." && value !== "..") &&
        fact.onlyIf.every((condition) => holds(fact.command, condition)),
    )
    .map((fact) => fact.command);
}

// 実行するコマンド。forced: 外側の部品が呼んだ（実行できなくても、それ）。strict なら、実行できなければ断る
export function chooseStage0(enabled: string[], pick: number, forced: string | null, strict: boolean): CommandChoice {
  if (forced !== null) return strict && !enabled.includes(forced) ? { chosen: null, refused: true } : { chosen: forced, refused: false };
  return { chosen: enabled.length === 0 ? null : enabled[pick % enabled.length], refused: false };
}

// 起きる場合: 条件が成り立つものがちょうど1つならそれ、無ければ otherwise、2つ以上なら衝突（どれも尋ねる）
export function chooseCaseStage0(names: string[], holds: (condition: string) => boolean): CaseChoice {
  const hits = names.filter((name) => name !== "otherwise" && holds(name));
  if (hits.length > 1) return { chosen: null, conflict: hits };
  return { chosen: hits[0] ?? "otherwise", conflict: [] };
}
