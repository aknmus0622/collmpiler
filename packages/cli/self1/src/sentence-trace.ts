/**
 * Sentence trace: decides whether every sentence Layer 1 wrote became
 * something, and whether what the interpretation traces exists.
 *
 * Corresponds to the specification component `sentence-trace`. It has no state
 * and no dependencies; its entries are the queries `Embedded`, `Key`,
 * `Sentence` and `Target`, implemented here by the pure functions
 * {@link checkEmbedded}, {@link checkKey}, {@link checkSentence} and
 * {@link checkTarget}. Each answers the same result for the same arguments and
 * touches nothing.
 */

/**
 * Specification query `sentence-trace.Embedded` (calculation `embedded`):
 * what is found about one name embedded in a component's description as `${X}`.
 *
 * @param embedded what is known about the embedded name (the specification's
 *                 parameters, as one record).
 * @returns the finding about it (the specification's result).
 */
export function checkEmbedded(embedded: EmbeddedName): EmbeddedFinding {
  if (!embedded.isComponent) return "unknown-name";
  if (!embedded.used) return "embedded-unused";
  return "none";
}

/**
 * Specification query `sentence-trace.Key` (calculation `key`): what is found
 * about one key of the interpretation's trace.
 *
 * @param key what is known about the key (the specification's parameters, as one record).
 * @returns the finding about it (the specification's result).
 */
export function checkKey(key: TraceKey): KeyFinding {
  return key.inDescription ? "none" : "unknown-sentence";
}

/**
 * Specification query `sentence-trace.Sentence` (calculation `sentence`): what
 * is found about one sentence of a component's description.
 *
 * @param sentence what is known about the sentence (the specification's
 *                 parameters, as one record).
 * @returns the finding about it (the specification's result).
 */
export function checkSentence(sentence: DescriptionSentence): SentenceFinding {
  return sentence.added && !sentence.covered ? "sentence-unused" : "none";
}

/**
 * Specification query `sentence-trace.Target` (calculation `target`): what is
 * found about one name a key of the trace points to.
 *
 * @param target what is known about the name (the specification's parameters, as one record).
 * @returns the finding about it (the specification's result).
 */
export function checkTarget(target: TraceTarget): TargetFinding {
  return target.exists ? "none" : "unknown-name";
}

/**
 * The input of the `Embedded` query: one name embedded in a description as `${X}`.
 * Each field is the specification parameter of the same name.
 */
export interface EmbeddedName {
  /** Whether the embedded name is a component (specification parameter `isComponent`). */
  isComponent: boolean;
  /** Whether some body of the component uses it (specification parameter `used`). */
  used: boolean;
}

/**
 * The finding about an embedded name (the specification's result of `Embedded`).
 *
 * - `"none"`: nothing to report.
 * - `"unknown-name"`: the name is not known as a component.
 * - `"embedded-unused"`: the embedded name is not used.
 */
export type EmbeddedFinding = "none" | "unknown-name" | "embedded-unused";

/**
 * The input of the `Key` query: one key of the interpretation's trace.
 * Each field is the specification parameter of the same name.
 */
export interface TraceKey {
  /** Whether the key is part of a sentence of the description (specification parameter `inDescription`). */
  inDescription: boolean;
}

/**
 * The finding about a trace key (the specification's result of `Key`).
 *
 * - `"none"`: nothing to report.
 * - `"unknown-sentence"`: the key names no sentence of the description.
 */
export type KeyFinding = "none" | "unknown-sentence";

/**
 * The input of the `Sentence` query: one sentence of a component's description.
 * Each field is the specification parameter of the same name.
 */
export interface DescriptionSentence {
  /**
   * Whether the interpretation added commands or queries Layer 1 did not name
   * (specification parameter `added`).
   */
  added: boolean;
  /** Whether some key of the interpretation's trace is part of this sentence (specification parameter `covered`). */
  covered: boolean;
}

/**
 * The finding about a description sentence (the specification's result of `Sentence`).
 *
 * - `"none"`: nothing to report.
 * - `"sentence-unused"`: the sentence did not become anything.
 */
export type SentenceFinding = "none" | "sentence-unused";

/**
 * The input of the `Target` query: one name a key of the trace points to.
 * Each field is the specification parameter of the same name.
 */
export interface TraceTarget {
  /** Whether the name exists (specification parameter `exists`). */
  exists: boolean;
}

/**
 * The finding about a trace target (the specification's result of `Target`).
 *
 * - `"none"`: nothing to report.
 * - `"unknown-name"`: the name is unknown.
 */
export type TargetFinding = "none" | "unknown-name";
