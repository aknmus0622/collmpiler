import {
  aroundOutside,
  boundsOf,
  claimCase,
  claimsWithNew,
  earlierOwner,
  failureFinding,
  kindsAfterCell,
  mixedColumn,
  noKinds,
  promiseFindings,
  reservedClaims,
  typeFindings,
} from "./rules.ts";
import type {
  CellKind,
  ClaimInfo,
  FailureInfo,
  NameClaim,
  NumberBounds,
  PromiseInfo,
  TypeFindingCode,
  TypeFindingSink,
  TypeInfo,
} from "./types.ts";

/**
 * The type check component: checks, one fact at a time, what a specification declares: types,
 * decision-table columns, promises, failure conditions and names.
 *
 * It is driven from outside. `type` gives a type, and the `around` calls that follow give that type's
 * thresholds. `beginColumn`, then `cell` once per value, then `endColumn` check one decision-table column.
 * `beginClaims`, then `claim` once per name, check the names of a specification. `promise` and `failure`
 * judge single items and may be called at any time.
 *
 * One instance is one check. The check has a single state (the specification's `READY`), so it exposes no
 * state. A new instance holds the specification's initial value (`model.initial`) in every data getter, and
 * the getters always have a value. Each method below performs one command of the specification; a command
 * returns nothing, and its outcome is observed through the data getters and the findings reported to the
 * sink.
 */
export class TypeCheck {
  private readonly findings: TypeFindingSink;
  private bounds: NumberBounds = { boundedBelow: false, lowest: 0, boundedAbove: false, highest: 0 };
  private columnKinds: string[] = [];
  private nameClaims: NameClaim[] = [];

  /**
   * @param findings receives the effect `Report`
   */
  constructor(findings: TypeFindingSink) {
    this.findings = findings;
  }

  /** The specification's `data.boundedBelow`: whether the number type last given has a minimum. */
  get boundedBelow(): boolean {
    return this.bounds.boundedBelow;
  }

  /** The specification's `data.lowest`: the minimum of the number type last given. */
  get lowest(): number {
    return this.bounds.lowest;
  }

  /** The specification's `data.boundedAbove`: whether the number type last given has a maximum. */
  get boundedAbove(): boolean {
    return this.bounds.boundedAbove;
  }

  /** The specification's `data.highest`: the maximum of the number type last given. */
  get highest(): number {
    return this.bounds.highest;
  }

  /**
   * The specification's `data.kinds`: the kinds of the values seen so far in the column being checked, in the
   * order first seen (spellings of {@link CellKind}).
   */
  get kinds(): readonly string[] {
    return this.columnKinds;
  }

  /** The specification's `data.claims`: the names claimed so far, each with what claimed it, in order. */
  get claims(): readonly NameClaim[] {
    return this.nameClaims;
  }

  /**
   * Performs the command `Type`: a type, on its own. May tell the sink `report` once or more (codes
   * `empty-enum`, `empty-one-of`, `min-above-max`). Stores `boundedBelow`, `lowest`, `boundedAbove` and
   * `highest`.
   *
   * @param type the command's input, field for field (`hasMax`, `hasMin`, `kind`, `max`, `members`, `min`)
   */
  type(type: TypeInfo): void {
    for (const code of typeFindings(type)) {
      this.report(code);
    }
    this.bounds = boundsOf(type);
  }

  /**
   * Performs the command `Around`: a threshold of the type last given. May tell the sink `report` (code
   * `around-outside`).
   *
   * @param value the command's `value` input: the threshold
   */
  around(value: number): void {
    if (aroundOutside(this.bounds, value)) {
      this.report("around-outside");
    }
  }

  /** Performs the command `BeginColumn`: a decision-table column is checked next. Stores `kinds`. */
  beginColumn(): void {
    this.columnKinds = noKinds();
  }

  /**
   * Performs the command `Cell`: one value of the current column, by kind. May store `kinds`.
   *
   * @param kind the command's `kind` input
   */
  cell(kind: CellKind): void {
    this.columnKinds = kindsAfterCell(this.columnKinds, kind);
  }

  /**
   * Performs the command `EndColumn`: the current column is over. May tell the sink `report` (code
   * `mixed-column`). Leaves `kinds` as it is.
   */
  endColumn(): void {
    if (mixedColumn(this.columnKinds)) {
      this.report("mixed-column");
    }
  }

  /**
   * Performs the command `Promise`: a query that declares a promise. May tell the sink `report` once or more
   * (codes `promise-kind`, `promise-input`).
   *
   * @param query the command's input, field for field (`output`, `promise`, `takesInput`)
   */
  promise(query: PromiseInfo): void {
    for (const code of promiseFindings(query)) {
      this.report(code);
    }
  }

  /**
   * Performs the command `Failure`: a condition that a query failed, with what is known of the query it
   * names. May tell the sink `report` at most once (codes `failure-unknown`, `failure-not-may-fail`,
   * `failure-not-asked`).
   *
   * @param failure the command's input, field for field (`asked`, `declared`, `mayFail`, `takesInput`)
   */
  failure(failure: FailureInfo): void {
    const code = failureFinding(failure);
    if (code !== undefined) {
      this.report(code);
    }
  }

  /** Performs the command `BeginClaims`: the names of a specification are checked next. Stores `claims`. */
  beginClaims(): void {
    this.nameClaims = reservedClaims();
  }

  /**
   * Performs the command `Claim`: a name is claimed. May tell the sink `report` (code `name-collision`, with
   * `owner` set to what had claimed the name); may store `claims`.
   *
   * @param claim the command's input, field for field (`name`, `owner`, `shared`)
   */
  claim(claim: ClaimInfo): void {
    switch (claimCase(this.nameClaims, claim)) {
      case "collision":
        this.report("name-collision", earlierOwner(this.nameClaims, claim.name));
        break;
      case "new":
        this.nameClaims = claimsWithNew(this.nameClaims, claim);
        break;
      case "unchanged":
        break;
    }
  }

  /** Tells the sink one finding; `owner` is meaningful only for `name-collision`. */
  private report(code: TypeFindingCode, owner = ""): void {
    this.findings.report({ code, owner });
  }
}
