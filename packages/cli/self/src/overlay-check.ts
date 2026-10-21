/**
 * Overlay check: reports the problems found when an interpretation is laid
 * over Layer 1, one fact at a time.
 *
 * Corresponds to the specification component "overlay-check". One
 * `OverlayCheck` object checks one overlay. It has no states of its own (it
 * is always in the specification's single state `READY`) and remembers
 * nothing between commands. It is driven from outside: whoever owns it
 * feeds it facts about the overlay by calling its methods, and it tells its
 * `OverlayCheckListener` each problem the fact just given shows.
 *
 * Command -> method:
 *   `Asks`      -> `asks`
 *   `Branching` -> `branching`
 *   `Call`      -> `call`
 *   `Entry`     -> `entry`
 *   `Key`       -> `key`
 *   `Slot`      -> `slot`
 *   `Stamp`     -> `stamp`
 *   `State`     -> `state`
 *
 * Effect -> listener method:
 *   `Problem` -> `OverlayCheckListener.problem`
 *
 * The component asks its environment nothing (no queries).
 */

/** Kind of problem (spec field `code` of the `Problem` effect); values identical to the specification's. */
export type OverlayProblemCode =
  | "unknown-key"
  | "conflict"
  | "undescribed"
  | "closed"
  | "flat-in-cases"
  | "layer1-outside-cases"
  | "branch-over-goto"
  | "one-query"
  | "no-part"
  | "key-missing"
  | "key-extra"
  | "stale";

/**
 * Input of `branching` (spec command `Branching`): how one command branches
 * into cases. Field names identical to the specification's.
 */
export interface BranchingFacts {
  /** `true` if Layer 1 wrote the cases of the command. */
  layer1Cases: boolean;
  /** `true` if the interpretation wrote the cases of the command. */
  interpretationCases: boolean;
  /** `true` if an outcome is written outside the cases. */
  flat: boolean;
  /** `true` if Layer 1 wrote a goTo, does or responds outside the cases. */
  layer1Outcome: boolean;
  /** `true` if Layer 1 wrote a goTo. */
  layer1GoTo: boolean;
}

/** Dependency: told what the check finds (spec effect `Problem`). */
export interface OverlayCheckListener {
  /**
   * Spec effect `Problem`: one problem, with its code, shown by the fact
   * passed in the command just performed. A single command may report
   * several problems, told in the order the specification lists them.
   */
  problem(code: OverlayProblemCode): void;
}

/**
 * Checks one overlay of an interpretation on Layer 1. Each method performs
 * one specification command, can be called at any time and in any order,
 * and reports through the listener the problems (zero or more) that its
 * fact shows.
 */
export class OverlayCheck {
  private readonly listener: OverlayCheckListener;

  /** @param listener receives the problems found. */
  constructor(listener: OverlayCheckListener) {
    this.listener = listener;
  }

  /**
   * Spec command `Asks`: one thing a command asks, with `count`, the number
   * of queries it names (whole number, 0 to 3). May report `"one-query"`.
   */
  asks(count: number): void {
    this.report(asksProblems(count));
  }

  /**
   * Spec command `Branching`: how one command branches into cases (see
   * `BranchingFacts`). May report `"flat-in-cases"`,
   * `"layer1-outside-cases"` and `"branch-over-goto"` (more than one
   * possible, told in that order).
   */
  branching(facts: BranchingFacts): void {
    this.report(branchingProblems(facts));
  }

  /**
   * Spec command `Call`: a command calls a contained component.
   * @param exists `true` if there is such a contained component.
   * @param keyedPart `true` if it is one of many (keyed), `false` if it is
   *   a single component.
   * @param keyGiven `true` if a key was written for the call.
   * May report `"no-part"`, `"key-missing"` or `"key-extra"` (at most one).
   */
  call(exists: boolean, keyedPart: boolean, keyGiven: boolean): void {
    this.report(callProblems(exists, keyedPart, keyGiven));
  }

  /**
   * Spec command `Entry`: an entry the interpretation wrote into a group
   * (a datum, a command, a case, ...).
   * @param listed `true` if Layer 1 lists that group's entries.
   * @param closed `true` if the group is closed to new entries.
   * @param inLayer1 `true` if Layer 1 has this entry.
   * May report `"closed"`.
   */
  entry(listed: boolean, closed: boolean, inLayer1: boolean): void {
    this.report(entryProblems(listed, closed, inLayer1));
  }

  /**
   * Spec command `Key`: a key the interpretation wrote.
   * @param known `true` if the key can be written there.
   * May report `"unknown-key"`.
   */
  key(known: boolean): void {
    this.report(keyProblems(known));
  }

  /**
   * Spec command `Slot`: one place, and who wrote it.
   * @param known `true` if it is a place that can be written.
   * @param layer1 `true` if Layer 1 wrote it.
   * @param interpretation `true` if the interpretation wrote it.
   * May report `"unknown-key"` or `"conflict"` (at most one).
   */
  slot(known: boolean, layer1: boolean, interpretation: boolean): void {
    this.report(slotProblems(known, layer1, interpretation));
  }

  /**
   * Spec command `Stamp`: the hash of Layer 1 recorded in the
   * interpretation and the hash of Layer 1 now (strings such as
   * `"sha256:a"`).
   * @param recorded the recorded hash, or `null` if none was recorded.
   * @param current the hash of Layer 1 now.
   * May report `"stale"`.
   */
  stamp(recorded: string | null, current: string): void {
    this.report(stampProblems(recorded, current));
  }

  /**
   * Spec command `State`: a state Layer 1 listed by name.
   * @param described `true` if the state has a description.
   * May report `"undescribed"`.
   */
  state(described: boolean): void {
    this.report(stateProblems(described));
  }

  /** Tells the listener each problem, in order. */
  private report(codes: readonly OverlayProblemCode[]): void {
    for (const code of codes) this.listener.problem(code);
  }
}

// Decisions: pure functions from one fact to the problems it shows, in the
// order the specification lists them.

/** Problems of `Asks`: one-query unless exactly one query is named. */
function asksProblems(count: number): OverlayProblemCode[] {
  return count === 1 ? [] : ["one-query"];
}

/**
 * Problems of `Branching`. When Layer 1 wrote the cases, flat outcomes and
 * Layer 1 outcomes outside them are problems; otherwise, when the
 * interpretation wrote them, flat outcomes and a Layer 1 goTo are.
 */
function branchingProblems(facts: BranchingFacts): OverlayProblemCode[] {
  const problems: OverlayProblemCode[] = [];
  if (facts.layer1Cases) {
    if (facts.flat) problems.push("flat-in-cases");
    if (facts.layer1Outcome) problems.push("layer1-outside-cases");
  } else if (facts.interpretationCases) {
    if (facts.flat) problems.push("flat-in-cases");
    if (facts.layer1GoTo) problems.push("branch-over-goto");
  }
  return problems;
}

/** Problems of `Call`: at most one of no-part, key-missing, key-extra. */
function callProblems(exists: boolean, keyedPart: boolean, keyGiven: boolean): OverlayProblemCode[] {
  if (!exists) return ["no-part"];
  if (keyedPart && !keyGiven) return ["key-missing"];
  if (!keyedPart && keyGiven) return ["key-extra"];
  return [];
}

/** Problems of `Entry`: closed if Layer 1 lists a closed group without this entry. */
function entryProblems(listed: boolean, closed: boolean, inLayer1: boolean): OverlayProblemCode[] {
  return listed && closed && !inLayer1 ? ["closed"] : [];
}

/** Problems of `Key`: unknown-key if the key cannot be written there. */
function keyProblems(known: boolean): OverlayProblemCode[] {
  return known ? [] : ["unknown-key"];
}

/** Problems of `Slot`: unknown-key for an unwritable place, else conflict if both wrote it. */
function slotProblems(known: boolean, layer1: boolean, interpretation: boolean): OverlayProblemCode[] {
  if (!known) return ["unknown-key"];
  return layer1 && interpretation ? ["conflict"] : [];
}

/** Problems of `Stamp`: stale if a hash was recorded and differs from the current one. */
function stampProblems(recorded: string | null, current: string): OverlayProblemCode[] {
  return recorded !== null && recorded !== current ? ["stale"] : [];
}

/** Problems of `State`: undescribed if the state has no description. */
function stateProblems(described: boolean): OverlayProblemCode[] {
  return described ? [] : ["undescribed"];
}
