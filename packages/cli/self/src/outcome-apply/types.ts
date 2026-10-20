/**
 * Vocabulary of the outcome applier: the position it reports, the values it is handed, and the dependency it
 * tells its faults to.
 */

/**
 * Position of the applier. Corresponds to the specification's states:
 *
 * - `"ready"`: `READY` (the only state; every command is valid at any time)
 */
export type OutcomeApplyState = "ready";

/**
 * Any JSON value, `null` included. Corresponds to the specification's `value` type (the `Effect` command's
 * `guardValue`).
 */
export type AnyValue =
  | null
  | boolean
  | number
  | string
  | readonly AnyValue[]
  | { readonly [key: string]: AnyValue };

/**
 * What guards an effect of the case. Corresponds to the `Effect` command's `guard`, with the same spellings:
 *
 * - `"none"`: the effect has no guard
 * - `"condition"`: the guard is a condition sentence
 * - `"value"`: the guard is a value (a constant or a reference, already resolved)
 */
export type EffectGuard = "none" | "condition" | "value";

/**
 * The kind of fault found. Corresponds to the `code` of the specification's `Fail` effect, with the same
 * spellings.
 */
export type FaultCode =
  | "undeclared-state"
  | "undeclared-effect"
  | "undeclared-data"
  | "missing-responds"
  | "bad-value"
  | "not-many"
  | "duplicate-key";

/** Dependency: the receiver of the faults found in the case being applied. */
export interface OutcomeFaults {
  /**
   * Called synchronously from inside a command method, at most once per command. Corresponds to the
   * specification's `Fail` effect: something the case says does not fit what the specification declares.
   *
   * @param code the effect's `code`: the kind of fault
   */
  fail(code: FaultCode): void;
}
