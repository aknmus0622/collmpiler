/**
 * How a finished walk ends. Names the outcome of the specification's `Finish` command that applies:
 *
 * - `"accepted"`: the outcome that goes to `ACCEPTED`;
 * - `"rejected"`: the outcome that goes to `REJECTED`.
 */
export type Verdict = "accepted" | "rejected";

/**
 * Pure calculation. Corresponds to the specification's `nextErrors`.
 *
 * @param errors the current error count (`data.errors`)
 */
export function nextErrors(errors: number): number {
  return errors + 1;
}

/**
 * Pure decision. Chooses among the outcomes the specification gives for the `Finish` command.
 *
 * @param errors the remembered error count (`data.errors`)
 * @returns the outcome that applies
 */
export function verdictFor(errors: number): Verdict {
  return errors === 0 ? "accepted" : "rejected";
}
