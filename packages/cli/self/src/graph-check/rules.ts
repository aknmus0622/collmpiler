import type { GraphFindingCode, GraphFindingSeverity, VocabularyGroup } from "./types.ts";

/**
 * Pure calculation `initiallyReached`: the reached states remembered by `Begin`.
 *
 * @param init the `init` input of `Begin`: the specification's initial state
 * @returns the specification's `data.reached` after `Begin`
 */
export function initiallyReached(init: string): string[] {
  return [init];
}

/**
 * Pure decision: chooses the case of the `Edge` command.
 *
 * @param reached the specification's `data.reached`
 * @param from the `from` input of `Edge`
 * @param to the `to` input of `Edge`
 * @param toDeclared the answer of `stateDeclared` for `to` (the specification's `query:toDeclared`)
 * @returns `true` for the case that stores a newly reached state, `false` for `otherwise`
 */
export function edgeReachesNew(reached: readonly string[], from: string, to: string, toDeclared: boolean): boolean {
  return reached.includes(from) && toDeclared && !reached.includes(to);
}

/**
 * Pure calculation `reachedWithTo`: the reached states stored when `Edge` reaches something new.
 *
 * @param reached the specification's `data.reached` before the command
 * @param to the `to` input of `Edge`
 * @returns the new `data.reached`
 */
export function reachedWithTo(reached: readonly string[], to: string): string[] {
  return [...reached, to];
}

/**
 * Pure calculation `allFromDeclaredNow`, used by the `From` command.
 *
 * @param allFromDeclared the specification's `data.allFromDeclared` before the command
 * @param fromDeclared the answer of `stateDeclared` for the given state (the specification's `query:fromDeclared`)
 * @returns the new `data.allFromDeclared`
 */
export function allFromDeclaredNow(allFromDeclared: boolean, fromDeclared: boolean): boolean {
  return allFromDeclared && fromDeclared;
}

/**
 * Pure calculation `anyFromReachedNow`, used by the `From` command.
 *
 * @param anyFromReached the specification's `data.anyFromReached` before the command
 * @param reached the specification's `data.reached`
 * @param state the `state` input of `From`
 * @returns the new `data.anyFromReached`
 */
export function anyFromReachedNow(anyFromReached: boolean, reached: readonly string[], state: string): boolean {
  return anyFromReached || reached.includes(state);
}

/**
 * Pure decision: chooses the case of the `CheckState` command.
 *
 * @param reached the specification's `data.reached`
 * @param name the `name` input of `CheckState`
 * @returns `true` for the case that reports `unreachable-state`, `false` for `otherwise`
 */
export function stateUnreachable(reached: readonly string[], name: string): boolean {
  return !reached.includes(name);
}

/**
 * Pure decision: chooses the case of the `EndCommand` command.
 *
 * @param allFromDeclared the specification's `data.allFromDeclared`
 * @param anyFromReached the specification's `data.anyFromReached`
 * @returns `true` for the case that reports `unreachable-command`, `false` for `otherwise`
 */
export function commandUnreachable(allFromDeclared: boolean, anyFromReached: boolean): boolean {
  return allFromDeclared && !anyFromReached;
}

/**
 * Pure decision: chooses the case of the `Exit` command.
 *
 * @param exitState the specification's `data.exitState`: the state being judged
 * @param from the `from` input of `Exit`
 * @param to the `to` input of `Exit`
 * @returns `true` for the case that stores `left`, `false` for `otherwise`
 */
export function transitionLeaves(exitState: string, from: string, to: string): boolean {
  return from === exitState && to !== exitState;
}

/**
 * Pure decision: chooses the case of the `EndExits` command.
 *
 * @param finalsAreDeclared the specification's `data.finalsAreDeclared`
 * @param reached the specification's `data.reached`
 * @param exitState the specification's `data.exitState`
 * @param exitFinal the specification's `data.exitFinal`
 * @param left the specification's `data.left`
 * @returns `true` for the case that reports `dead-end-state`, `false` for `otherwise`
 */
export function isDeadEnd(
  finalsAreDeclared: boolean,
  reached: readonly string[],
  exitState: string,
  exitFinal: boolean,
  left: boolean,
): boolean {
  return finalsAreDeclared && reached.includes(exitState) && !exitFinal && !left;
}

/**
 * Pure decision: chooses the case of the `Vocabulary` command.
 *
 * @param group the `group` input of `Vocabulary`
 * @param used the `used` input of `Vocabulary`
 * @param takesInput the `takesInput` input of `Vocabulary`
 * @returns the code of the finding to report, or `null` for `otherwise` (nothing reported)
 */
export function vocabularyFindingCode(group: VocabularyGroup, used: boolean, takesInput: boolean): GraphFindingCode | null {
  if (used) return null;
  switch (group) {
    case "effects":
      return "unused-effect";
    case "data":
      return "unset-data";
    case "queries":
      return takesInput ? "unasked-query" : null;
  }
}

/**
 * Pure calculation `severity`: the severity of a finding reported by `Vocabulary`.
 *
 * @param strictCheck the specification's `data.strictCheck`
 * @param listed the `listed` input of `Vocabulary`
 * @returns the severity to report
 */
export function vocabularySeverity(strictCheck: boolean, listed: boolean): GraphFindingSeverity {
  return strictCheck && !listed ? "error" : "warning";
}
