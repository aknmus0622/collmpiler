/**
 * Pure decisions and calculations of the outcome applier. They read only their arguments.
 */

import type { AnyValue, EffectGuard } from "./types.ts";

/**
 * Corresponds to the specification's calculation `performed`: whether an effect of the case is performed.
 *
 * @param guard the `Effect` command's `guard`
 * @param chosen the `Effect` command's `chosen`: whether the guard condition's case was chosen
 * @param guardValue the `Effect` command's `guardValue`: the resolved value of a value guard
 * @returns true when the effect is performed
 */
export function isPerformed(guard: EffectGuard, chosen: boolean, guardValue: AnyValue): boolean {
  switch (guard) {
    case "none":
      return true;
    case "condition":
      return chosen;
    case "value":
      return guardValue === true;
  }
}

/**
 * Pure decision. Whether the `Call` command's contained command is run.
 *
 * @param keyed the `Call` command's `keyed`: whether the contained component is one of many
 * @param found the `Call` command's `found`: whether an item has the key asked for
 * @returns the `Call` command's answer
 */
export function callRuns(keyed: boolean, found: boolean): boolean {
  return !keyed || found;
}

/**
 * Pure decision. Whether a field of a record answer fits, for the `RespondField` command.
 *
 * @param isNull the command's `isNull`: whether the field's value is null
 * @param optional the command's `optional`: whether the field is declared optional
 * @param anyValue the command's `anyValue`: whether the field takes any value
 * @param fits the command's `fits`: the result of comparing the value with the field's declared type
 * @returns true when the field fits (no fault)
 */
export function respondFieldFits(isNull: boolean, optional: boolean, anyValue: boolean, fits: boolean): boolean {
  if (isNull && !anyValue) return optional;
  return fits;
}
