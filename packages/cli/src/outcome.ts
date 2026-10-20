// 起きることの適用 (N12d) の Stage 0。採点の部品 outcome-apply (R1) の対になる手書きの版なので、このファイルには適用の判断のほかを
// 置かない（ここが変われば、その部品の合格の記録は使えなくなる: R5）。
//
// 場合が決まったあとの1手を、事実を1つずつ受けて判断する（シミュレーターが、Stage 0 が確かめる順に渡す）。値を解決すること
// （参照を、その場の値にする）と、組み立てた値が型に合うかを比べることは、渡す側が行い、その結果を事実として渡す。
// 仕様の誤りが見つかったら、その種類 (fail) を返す。言葉にするのは、渡す側

export type OutcomeFail = "undeclared-state" | "undeclared-effect" | "undeclared-data" | "missing-responds" | "bad-value" | "not-many" | "duplicate-key";
export type OutcomeEvent =
  | { name: "Begin"; input: { state: string } }
  | { name: "GoTo"; input: { target: string; declared: boolean } }
  | { name: "Effect"; input: { guard: "none" | "condition" | "value"; chosen: boolean; guardValue: unknown; declared: boolean } }
  | { name: "Set"; input: { declared: boolean } }
  | { name: "Fits"; input: { fits: boolean } }
  | { name: "Responds"; input: { given: boolean } }
  | { name: "RespondField"; input: { isNull: boolean; anyValue: boolean; optional: boolean; fits: boolean } }
  | { name: "Add"; input: { many: boolean } }
  | { name: "Key"; input: { exists: boolean } }
  | { name: "AddField"; input: { declared: boolean } }
  | { name: "Remove"; input: { many: boolean } }
  | { name: "End"; input: Record<string, never> };
export type OutcomeMemory = { current: string; destination: string };
export const OUTCOME_START: OutcomeMemory = { current: "", destination: "" };
export type OutcomeAnswer = { memory: OutcomeMemory; answer?: unknown; fail?: OutcomeFail };

export function outcomeStage0(memory: OutcomeMemory, event: OutcomeEvent): OutcomeAnswer {
  switch (event.name) {
    case "Begin":
      // 遷移先を書いていなければ、状態は変わらない
      return { memory: { current: event.input.state, destination: event.input.state } };
    case "GoTo":
      return event.input.declared ? { memory: { ...memory, destination: event.input.target } } : { memory, fail: "undeclared-state" };
    case "Effect": {
      // 起こすか: onlyWhen が無い、条件の場合が選ばれた、値が true のとき。起こすのに宣言されていなければ、誤り
      const { guard, chosen, guardValue, declared } = event.input;
      const issued = guard === "none" ? true : guard === "condition" ? chosen : guardValue === true;
      return issued && !declared ? { memory, answer: issued, fail: "undeclared-effect" } : { memory, answer: issued };
    }
    case "Set":
      return event.input.declared ? { memory } : { memory, fail: "undeclared-data" };
    case "Fits":
      return event.input.fits ? { memory } : { memory, fail: "bad-value" };
    case "Responds":
      return event.input.given ? { memory } : { memory, fail: "missing-responds" };
    case "RespondField": {
      // 組の1つのフィールド: null は、どんな値でもよい型 (value) でなければ、省けるフィールドのときだけ合う
      const { isNull, anyValue, optional, fits } = event.input;
      return (isNull && !anyValue ? optional : fits) ? { memory } : { memory, fail: "bad-value" };
    }
    case "Add":
    case "Remove":
      return event.input.many ? { memory } : { memory, fail: "not-many" };
    case "Key":
      return event.input.exists ? { memory, fail: "duplicate-key" } : { memory };
    case "AddField":
      return event.input.declared ? { memory } : { memory, fail: "undeclared-data" };
    case "End":
      return { memory, answer: memory.destination };
  }
}

// 含む部品のコマンドを呼ぶか: 多数ある部品 (keyed) で、そのキーの部品が無ければ呼ばない（答えは null）
export function callsStage0(keyed: boolean, found: boolean): boolean {
  return !keyed || found;
}
