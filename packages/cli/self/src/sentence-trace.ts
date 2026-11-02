/**
 * Decides whether every sentence Layer 1 wrote became something, and whether
 * what the interpretation traces exists. Each function here judges one item,
 * from facts the caller has already established about it.
 *
 * Stateless and free of dependencies: nothing is remembered between calls,
 * nothing needs to be constructed, and calling it has no effect on anything.
 * It corresponds to the specification's component `sentence-trace`.
 */

/**
 * The answer for something embedded in a description as `${X}`. Specification
 * name: the result of the query `Embedded`; the values are the specification's own.
 *
 * - `"none"`: nothing to report.
 * - `"unknown-name"`: reported as a name that is not known.
 * - `"embedded-unused"`: reported as embedded but unused.
 */
export type EmbeddedOutcome = "none" | "unknown-name" | "embedded-unused";

/**
 * The answer for a key of the interpretation's trace. Specification name: the
 * result of the query `Key`; the values are the specification's own.
 *
 * - `"none"`: nothing to report.
 * - `"unknown-sentence"`: reported as a key that names no known sentence.
 */
export type KeyOutcome = "none" | "unknown-sentence";

/**
 * The answer for a sentence of a component's description. Specification name:
 * the result of the query `Sentence`; the values are the specification's own.
 *
 * - `"none"`: nothing to report.
 * - `"sentence-unused"`: reported as a sentence that became nothing.
 */
export type SentenceOutcome = "none" | "sentence-unused";

/**
 * The answer for a name a key of the trace points to. Specification name: the
 * result of the query `Target`; the values are the specification's own.
 *
 * - `"none"`: nothing to report.
 * - `"unknown-name"`: reported as a name that is not known.
 */
export type TargetOutcome = "none" | "unknown-name";

/**
 * Everything known about one thing embedded in a description as `${X}`. The
 * field names are the specification's parameter names.
 */
export interface EmbeddedFacts {
  /** Whether `X` is a component (specification parameter `isComponent`). */
  isComponent: boolean;
  /** Whether some body of the component uses it (specification parameter `used`). */
  used: boolean;
}

/**
 * Everything known about one sentence of a component's description. The field
 * names are the specification's parameter names.
 */
export interface SentenceFacts {
  /**
   * Whether the interpretation added commands or queries Layer 1 did not name
   * (specification parameter `added`).
   */
  added: boolean;
  /**
   * Whether a key of the interpretation's trace is part of this sentence
   * (specification parameter `covered`).
   */
  covered: boolean;
}

/**
 * Performs the specification's query `Embedded` (`sentence-trace.Embedded`).
 *
 * Accepts any combination of the two facts and always answers. Reads no state,
 * so the same facts always give the same answer. Ask once per embedded item.
 *
 * @param facts the item's two facts, one field per specification parameter.
 * @returns the answer for the embedded item.
 */
export function decideEmbedded(facts: EmbeddedFacts): EmbeddedOutcome {
  if (!facts.isComponent) {
    return "unknown-name";
  }
  if (!facts.used) {
    return "embedded-unused";
  }
  return "none";
}

/**
 * Performs the specification's query `Key` (`sentence-trace.Key`).
 *
 * Always answers. Reads no state, so the same argument always gives the same
 * answer. Ask once per key of the interpretation's trace.
 *
 * @param inDescription whether the key is part of a sentence of the description
 *   (specification parameter `inDescription`).
 * @returns the answer for the key.
 */
export function decideKey(inDescription: boolean): KeyOutcome {
  return inDescription ? "none" : "unknown-sentence";
}

/**
 * Performs the specification's query `Sentence` (`sentence-trace.Sentence`).
 *
 * Accepts any combination of the two facts and always answers. Reads no state,
 * so the same facts always give the same answer. Ask once per sentence.
 *
 * @param facts the sentence's two facts, one field per specification parameter.
 * @returns the answer for the sentence.
 */
export function decideSentence(facts: SentenceFacts): SentenceOutcome {
  return facts.added && !facts.covered ? "sentence-unused" : "none";
}

/**
 * Performs the specification's query `Target` (`sentence-trace.Target`).
 *
 * Always answers. Reads no state, so the same argument always gives the same
 * answer. Ask once per name a key of the trace points to.
 *
 * @param exists whether the name exists (specification parameter `exists`).
 * @returns the answer for the name.
 */
export function decideTarget(exists: boolean): TargetOutcome {
  return exists ? "none" : "unknown-name";
}
