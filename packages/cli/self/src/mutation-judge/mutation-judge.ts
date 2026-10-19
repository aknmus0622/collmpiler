import { anyKilledNow, isInAdapter, isIneffective, locatedNow, survives, valueInAdapterNow } from "./judgement.ts";
import type { MutationGateFindings, MutationJudgeState } from "./types.ts";

/**
 * The mutation-judge component: decides whether a mutation report passes the mutation gate, value by value
 * and as a whole. It is driven as a walk over the report: for each decision-table value, `beginValue`, then
 * one `site` call per place in production code where the value was changed, then `endValue`; after all the
 * values, one `mutant` call per mutant (the sites of values included); then `finish` once. Once the first
 * `mutant` call is made, no further value can be begun. Findings go to the `MutationGateFindings` passed to the constructor.
 *
 * One instance judges one report. A new instance starts in the specification's initial state (`"values"`)
 * with the specification's initial data. Each method below performs one command of the specification; a
 * command returns nothing, and its outcome is observed through `state`, the data getters, and the calls
 * made on the dependency.
 */
export class MutationJudge {
  private readonly findings: MutationGateFindings;
  private current: MutationJudgeState = "values";
  private killedSoFar = false;
  private locatedSoFar = false;
  private siteSeen = false;
  private someSiteKilled = false;
  private numberInAdapter = false;

  /**
   * @param findings receives the effects `Survived`, `InAdapter` and `Ineffective`
   */
  constructor(findings: MutationGateFindings) {
    this.findings = findings;
  }

  /** The current state. `MutationJudgeState` lists the specification name of each value. */
  get state(): MutationJudgeState {
    return this.current;
  }

  /** The specification's `data.anyKilled`: whether some mutant so far was killed. */
  get anyKilled(): boolean {
    return this.killedSoFar;
  }

  /** The specification's `data.located`: whether some value so far had a site. */
  get located(): boolean {
    return this.locatedSoFar;
  }

  /** The specification's `data.sawSite`: whether the value being judged has a site. */
  get sawSite(): boolean {
    return this.siteSeen;
  }

  /** The specification's `data.siteKilled`: whether some site of the value being judged was killed. */
  get siteKilled(): boolean {
    return this.someSiteKilled;
  }

  /**
   * The specification's `data.valueInAdapter`: whether the value being judged is a number that appears in
   * the adapter.
   */
  get valueInAdapter(): boolean {
    return this.numberInAdapter;
  }

  /**
   * Performs the command `BeginValue`: a decision-table value is judged next. Valid in `"values"`.
   *
   * @param numeric the command's `numeric`: whether the value is a number
   * @param inAdapter the command's `inAdapter`: whether the value appears in the adapter
   */
  beginValue(numeric: boolean, inAdapter: boolean): void {
    this.siteSeen = false;
    this.someSiteKilled = false;
    this.numberInAdapter = valueInAdapterNow(numeric, inAdapter);
    this.current = "inValue";
  }

  /**
   * Performs the command `Site`: one place in production code where the value being judged was changed.
   * Valid in `"inValue"`.
   *
   * @param killed the command's `killed`: whether changing the value there made the tests fail
   */
  site(killed: boolean): void {
    this.siteSeen = true;
    if (killed) this.someSiteKilled = true;
  }

  /**
   * Performs the command `EndValue`: the sites of the value being judged are over. Valid in `"inValue"`.
   * May tell the findings `survived` or `inAdapter`.
   */
  endValue(): void {
    if (survives(this.siteSeen, this.someSiteKilled)) this.findings.survived();
    if (isInAdapter(this.siteSeen, this.numberInAdapter)) this.findings.inAdapter();
    this.locatedSoFar = locatedNow(this.locatedSoFar, this.siteSeen);
    this.current = "values";
  }

  /**
   * Performs the command `Mutant`: one mutant of the report. Valid in `"values"` and `"mutants"`.
   *
   * @param killed the command's `killed`: whether the mutant made the tests fail
   */
  mutant(killed: boolean): void {
    this.killedSoFar = anyKilledNow(this.killedSoFar, killed);
    this.current = "mutants";
  }

  /**
   * Performs the command `Finish`: the judgement is over. Valid in `"values"` and `"mutants"`. May tell the
   * findings `ineffective`.
   *
   * @param shared the command's `shared`: whether the production code is shared with other components in a
   *   way that could not be narrowed
   */
  finish(shared: boolean): void {
    if (isIneffective(this.locatedSoFar, this.killedSoFar, shared)) this.findings.ineffective();
    this.current = "done";
  }
}
