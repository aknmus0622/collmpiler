/**
 * Decides whether a spec may write a given word of TypeScript and, when it may
 * not, names the reason.
 *
 * Stateless and free of dependencies: nothing is remembered between calls,
 * nothing needs to be constructed, and calling it has no effect on anything.
 * It corresponds to the specification's component `syntax-check`.
 */

/**
 * What is decided about a word. Specification name: the result of the query
 * `Word`; the values are the specification's own.
 *
 * - `"allowed"`: the spec may write the word.
 *
 * Every other value means the word is refused, and names the kind of syntax it
 * is refused as:
 *
 * - `"loop"`: looping.
 * - `"let"`: a reassignable variable.
 * - `"exception"`: exception handling.
 * - `"switch"`: a switch statement.
 * - `"function"`: a function declaration.
 * - `"class"`: a class declaration.
 * - `"async"`: asynchronous code.
 * - `"generator"`: a generator.
 * - `"new"`: object construction.
 * - `"delete"`: property deletion.
 * - `"typeof"`: a runtime type test by name.
 * - `"in"`: a runtime membership or instance test.
 * - `"jump"`: a jump out of the normal flow of a loop.
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
 * Performs the specification's query `Word` (`syntax-check.Word`).
 *
 * Accepts any string and always answers. Reads no state, so the same word
 * always gives the same answer. Ask once per word met in a spec.
 *
 * @param word the word met in the spec (specification parameter `word`).
 * @returns what is decided about the word.
 */
export function checkWord(word: string): WordVerdict {
  switch (word) {
    case "for":
    case "while":
    case "do":
      return "loop";
    case "let":
    case "var":
      return "let";
    case "try":
    case "throw":
      return "exception";
    case "switch":
      return "switch";
    case "function":
      return "function";
    case "class":
      return "class";
    case "await":
    case "async":
      return "async";
    case "yield":
      return "generator";
    case "new":
      return "new";
    case "delete":
      return "delete";
    case "typeof":
      return "typeof";
    case "in":
    case "instanceof":
      return "in";
    case "break":
    case "continue":
      return "jump";
    default:
      return "allowed";
  }
}
