/**
 * Syntax check: which words of TypeScript a spec may not write, and why.
 *
 * Corresponds to the specification component `syntax-check`. It has no state
 * and no dependencies; its one query is implemented here by a pure function
 * that answers the same result for the same argument and touches nothing:
 *
 * - `Word` → {@link wordVerdict}
 */

/**
 * The verdict on a word met in a spec (the specification's result of `Word`,
 * calculation `word`). Each value is the specification value of the same name.
 *
 * - `"allowed"`: the word may be written.
 * - every other value: the word is refused, and the value names the reason
 *   (the kind of construct the word belongs to): `"loop"`, `"let"`,
 *   `"exception"`, `"switch"`, `"function"`, `"class"`, `"async"`,
 *   `"generator"`, `"new"`, `"delete"`, `"typeof"`, `"in"`, `"jump"`.
 */
export type WordVerdict =
  | "allowed"
  | "loop"
  | "let"
  | "exception"
  | "switch"
  | "function"
  | "class"
  | "async"
  | "generator"
  | "new"
  | "delete"
  | "typeof"
  | "in"
  | "jump";

/**
 * Specification query `syntax-check.Word` (calculation `word`).
 *
 * Judges one word met in a spec.
 *
 * @param word the word, exactly as met (specification parameter `word`); any
 *   string may be given, not only TypeScript keywords.
 * @returns whether the word is allowed, or the reason it is refused.
 */
export function wordVerdict(word: string): WordVerdict {
  return REFUSED_WORDS.get(word) ?? "allowed";
}

/** The refused words, each with the reason it is refused. */
const REFUSED_WORDS: ReadonlyMap<string, WordVerdict> = new Map<string, WordVerdict>([
  ["for", "loop"],
  ["while", "loop"],
  ["do", "loop"],
  ["let", "let"],
  ["var", "let"],
  ["try", "exception"],
  ["throw", "exception"],
  ["switch", "switch"],
  ["function", "function"],
  ["class", "class"],
  ["await", "async"],
  ["async", "async"],
  ["yield", "generator"],
  ["new", "new"],
  ["delete", "delete"],
  ["typeof", "typeof"],
  ["in", "in"],
  ["instanceof", "in"],
  ["break", "jump"],
  ["continue", "jump"],
]);
