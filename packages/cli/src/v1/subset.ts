// Which words of TypeScript a spec may not use (1.0, DSL.md §17.5): the Stage 0 of syntax-check. A body is read as
// expressions, so a word whose meaning is control flow, mutation outside `this`, or anything an expression cannot say
// is refused, with the reason. Every other word is allowed (what it means is decided by the reader).

export type Refusal = "allowed" | "loop" | "let" | "exception" | "switch" | "function" | "class" | "async" | "generator" | "new" | "delete" | "typeof" | "in" | "jump";

const REFUSED: Record<string, Refusal> = {
  for: "loop",
  while: "loop",
  do: "loop",
  let: "let",
  var: "let",
  try: "exception",
  throw: "exception",
  switch: "switch",
  function: "function",
  class: "class",
  await: "async",
  async: "async",
  yield: "generator",
  new: "new",
  delete: "delete",
  typeof: "typeof",
  in: "in",
  instanceof: "in",
  break: "jump",
  continue: "jump",
};

export function subsetStage0(word: string): Refusal {
  return Object.hasOwn(REFUSED, word) ? REFUSED[word] : "allowed";
}
