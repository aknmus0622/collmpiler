import type { CaseChoice, CommandChoice } from "./types.ts";

/**
 * Pure decisions and calculations of the step choice. They read only their arguments.
 */

/**
 * Pure decision for the specification's `Choose` command (its calculations `pickedCommand` and
 * `forcedCommand` included).
 *
 * @param enabled the specification's `data.enabled`: the commands that can be executed at this step, in
 *   the order they were considered
 * @param forced the command's `forced`: the command another component called, or `null` when none is forced
 * @param pick the command's `pick`: a whole number, 0 or more
 * @param strict the command's `strict`
 * @returns the answer of `Choose`
 */
export function chooseCommand(
  enabled: readonly string[],
  forced: string | null,
  pick: number,
  strict: boolean,
): CommandChoice {
  if (forced !== null) {
    if (strict && !enabled.includes(forced)) return { chosen: null, refused: true };
    return { chosen: forced, refused: false };
  }
  if (enabled.length === 0) return { chosen: null, refused: false };
  return { chosen: enabled[pick % enabled.length], refused: false };
}

/**
 * Pure decision for the specification's `DecideCase` command (its calculation `onlyHit` included).
 *
 * @param hits the specification's `data.hits`: the cases whose condition holds, in the order they were given
 * @returns the answer of `DecideCase`
 */
export function decideCaseOf(hits: readonly string[]): CaseChoice {
  if (hits.length === 0) return { chosen: "otherwise", conflict: [] };
  if (hits.length === 1) return { chosen: hits[0], conflict: [] };
  return { chosen: null, conflict: [...hits] };
}

/**
 * Pure decision. Whether a case name given to the specification's `Case` command names a condition to ask
 * about (as opposed to the case without a condition).
 *
 * @param name the `Case` command's `name`
 * @returns true when the condition named by `name` is to be asked about
 */
export function hasCondition(name: string): boolean {
  return name !== "otherwise";
}

/**
 * Pure decision for the specification's `PathValue` command. Whether a value can be sent as a path segment
 * of an HTTP route.
 *
 * @param value the `PathValue` command's `value`
 * @returns false when the value cannot be sent in a path
 */
export function isSendablePathValue(value: string): boolean {
  return value !== "." && value !== "..";
}

/**
 * Corresponds to the specification's calculations `enabledWithConsidered` and `hitsWithCase`: a list
 * followed by one more name.
 *
 * @param names the list so far (`data.enabled` or `data.hits`)
 * @param name the name to add (`data.considering`, or the `Case` command's `name`)
 * @returns the new list to remember; `names` is not modified
 */
export function appended(names: readonly string[], name: string): string[] {
  return [...names, name];
}
