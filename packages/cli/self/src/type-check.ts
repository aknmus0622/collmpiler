/**
 * Type check over a specification: checks, one fact at a time, what a
 * specification declares (types and their thresholds, decision-table
 * columns, query promises, failure conditions and names), and reports each
 * finding.
 *
 * Corresponds to the specification component "type-check". One `TypeCheck`
 * object checks one specification. It has no states of its own (it is
 * always in the specification's single state `READY`). It is driven from
 * outside: whoever owns it feeds it the specification fact by fact by
 * calling its methods, and it tells its `TypeCheckListener` each finding.
 * It asks its environment nothing (the specification has no queries).
 *
 * Command -> method:
 *   `Type`        -> `type`
 *   `Around`      -> `around`
 *   `BeginColumn` -> `beginColumn`
 *   `Cell`        -> `cell`
 *   `EndColumn`   -> `endColumn`
 *   `Promise`     -> `promise`
 *   `Failure`     -> `failure`
 *   `BeginClaims` -> `beginClaims`
 *   `Claim`       -> `claim`
 *
 * Effect -> listener method:
 *   `Report` -> `TypeCheckListener.report`
 */

/** Kind of finding (spec field `code` of the `Report` effect); values identical to the specification's. */
export type TypeFindingCode =
  | "empty-enum"
  | "empty-one-of"
  | "min-above-max"
  | "around-outside"
  | "mixed-column"
  | "promise-kind"
  | "promise-input"
  | "failure-unknown"
  | "failure-not-may-fail"
  | "failure-not-asked"
  | "name-collision";

/**
 * Kind of a type given to `type` (spec input `kind` of `Type`); values
 * identical to the specification's: an enumeration, a oneOf, a number type,
 * or any other type.
 */
export type TypeKind = "enum" | "one-of" | "number" | "other";

/** Kind of a decision-table cell value (spec input `kind` of `Cell`); values identical to the specification's. */
export type CellKind = "number" | "string" | "boolean" | "null";

/**
 * Kind of a query's answer (spec input `output` of `Promise`); values
 * identical to the specification's. `"structured"` is a record, list or
 * other composite value; `"enum"` an enumeration.
 */
export type AnswerKind = "structured" | "enum" | "boolean" | "string" | "integer" | "number";

/** Promise a query declares (spec input `promise` of `Promise`); values identical to the specification's. */
export type PromiseKind = "fresh" | "increasing";

/**
 * What claims a name (spec input `owner` of `Claim`); values identical to
 * the specification's: `"data"` a remembered datum, `"queries"` a query
 * without input, `"asks"` an asked answer, `"parts"` a part, `"input"` a
 * command input field.
 */
export type ClaimOwner = "data" | "queries" | "asks" | "parts" | "input";

/**
 * What holds a claimed name in the remembered claims: one of the
 * `ClaimOwner`s, or `"reserved"` for the names the format reserves itself
 * (placed by `beginClaims`).
 */
export type ClaimHolder = ClaimOwner | "reserved";

/** One claimed name with what claimed it (an element of spec data `claims`). */
export interface NameClaim {
  name: string;
  owner: ClaimHolder;
}

/**
 * Input of `type`: one type on its own (types nested inside it are given
 * by separate calls). Field names identical to the specification's.
 */
export interface TypeFacts {
  kind: TypeKind;
  /** Number of members (enumeration) or variants (oneOf); whole number, 0 or more. Meaningful only for those kinds. */
  members: number;
  /** `true` if the type is a number type with a minimum. */
  hasMin: boolean;
  /** Its minimum; meaningful only when `hasMin`. */
  min: number;
  /** `true` if the type is a number type with a maximum. */
  hasMax: boolean;
  /** Its maximum; meaningful only when `hasMax`. */
  max: number;
}

/** Input of `promise`: a query that declares a promise. Field names identical to the specification's. */
export interface PromiseFacts {
  /** Kind of the query's answer. */
  output: AnswerKind;
  /** The promise it declares. */
  promise: PromiseKind;
  /** `true` if the query takes an input. */
  takesInput: boolean;
}

/**
 * Input of `failure`: what is known of the query named by a
 * `query "<name>" failed` condition. Field names identical to the
 * specification's.
 */
export interface FailureFacts {
  /** `true` if the command of the condition asks a query under that name (an `asks` entry). */
  asked: boolean;
  /** `true` if a query of that name is declared. */
  declared: boolean;
  /** `true` if that query is declared with `mayFail`. */
  mayFail: boolean;
  /** `true` if that query takes an input. */
  takesInput: boolean;
}

/** Dependency: told what the check finds (spec effect `Report`). */
export interface TypeCheckListener {
  /**
   * Spec effect `Report`: one finding about the fact passed in the command
   * just performed. `owner` is what had already claimed the name, for
   * `"name-collision"`; `""` for every other code. A single command may
   * report several findings, told in the order the specification lists
   * them.
   */
  report(code: TypeFindingCode, owner: ClaimHolder | ""): void;
}

/**
 * What the check remembers between commands (spec `model.data`; field
 * names identical to the specification's).
 */
export interface TypeCheckProgress {
  /** Set by `type`: whether the type last given is a number type with a minimum. */
  boundedBelow: boolean;
  /** Set by `type`: whether the type last given is a number type with a maximum. */
  boundedAbove: boolean;
  /** Set by `type`: the minimum of the type last given (spec calculation `minimum`). */
  lowest: number;
  /** Set by `type`: the maximum of the type last given (spec calculation `maximum`). */
  highest: number;
  /** Set by `beginColumn` / `cell`: the kinds seen so far in the column being checked, each once, in the order first seen. */
  kinds: CellKind[];
  /** Set by `beginClaims` / `claim`: the names claimed so far, in claim order, each with what claimed it. */
  claims: NameClaim[];
}

/**
 * Checks one specification. Each method performs one specification
 * command; all can be called at any time. Typical order: `type` then the
 * `around` calls for its thresholds; per decision-table column
 * `beginColumn`, one `cell` per value, `endColumn`; `beginClaims` then one
 * `claim` per name.
 */
export class TypeCheck {
  private readonly listener: TypeCheckListener;
  private boundedBelow = false;
  private boundedAbove = false;
  private lowest = 0;
  private highest = 0;
  private kinds: CellKind[] = [];
  private claims: NameClaim[] = [];

  /** @param listener receives the findings. */
  constructor(listener: TypeCheckListener) {
    this.listener = listener;
  }

  /**
   * What the check currently remembers (spec data), as a copy. Before any
   * command it holds the specification's initial values.
   */
  get progress(): TypeCheckProgress {
    return {
      boundedBelow: this.boundedBelow,
      boundedAbove: this.boundedAbove,
      lowest: this.lowest,
      highest: this.highest,
      kinds: [...this.kinds],
      claims: this.claims.map((c) => ({ ...c })),
    };
  }

  /**
   * Spec command `Type`: one type, on its own. Replaces the remembered
   * bounds (`boundedBelow`, `boundedAbove`, `lowest`, `highest`) used by the
   * following `around` calls. May report `"empty-enum"`, `"empty-one-of"`
   * and `"min-above-max"`.
   */
  type(facts: TypeFacts): void {
    for (const code of typeFindings(facts)) this.listener.report(code, "");
    const isNumber = facts.kind === "number";
    this.boundedBelow = isNumber && facts.hasMin;
    this.boundedAbove = isNumber && facts.hasMax;
    this.lowest = this.boundedBelow ? facts.min : 0;
    this.highest = this.boundedAbove ? facts.max : 0;
  }

  /**
   * Spec command `Around`: one threshold `value` of the number type last
   * given to `type`, checked against the remembered bounds. May report
   * `"around-outside"`.
   */
  around(value: number): void {
    const below = this.boundedBelow && value < this.lowest;
    const above = this.boundedAbove && value > this.highest;
    if (below || above) this.listener.report("around-outside", "");
  }

  /**
   * Spec command `BeginColumn`: a decision-table column is checked next.
   * Resets the remembered `kinds`. Reports nothing.
   */
  beginColumn(): void {
    this.kinds = [];
  }

  /**
   * Spec command `Cell`: one value of the current column, by its `kind`
   * (`"null"` when the row does not use the column). May add to the
   * remembered `kinds`. Reports nothing.
   */
  cell(kind: CellKind): void {
    if (kind !== "null" && !this.kinds.includes(kind)) this.kinds = [...this.kinds, kind];
  }

  /**
   * Spec command `EndColumn`: the current column is over. Reads the
   * remembered `kinds` and leaves them as they are. May report
   * `"mixed-column"`.
   */
  endColumn(): void {
    if (this.kinds.length > 1) this.listener.report("mixed-column", "");
  }

  /**
   * Spec command `Promise`: a query that declares a promise. May report
   * `"promise-kind"` and `"promise-input"` (both possible, in that order).
   */
  promise(facts: PromiseFacts): void {
    if (!canKeepPromise(facts.output, facts.promise)) this.listener.report("promise-kind", "");
    if (facts.takesInput) this.listener.report("promise-input", "");
  }

  /**
   * Spec command `Failure`: a `query "<name>" failed` condition, with what
   * is known of the query it names. May report one of `"failure-unknown"`,
   * `"failure-not-may-fail"` and `"failure-not-asked"`.
   */
  failure(facts: FailureFacts): void {
    const code = failureFinding(facts);
    if (code !== null) this.listener.report(code, "");
  }

  /**
   * Spec command `BeginClaims`: the names of a specification are checked
   * next. Replaces the remembered `claims` with the reserved ones (spec
   * calculation `reservedClaims`). Reports nothing.
   */
  beginClaims(): void {
    this.claims = reservedClaims();
  }

  /**
   * Spec command `Claim`: `name` is claimed by `owner`; `shared` is the
   * spec input of the same name (`true` for a claim of a kind that the
   * specification allows to be shared between commands). May
   * add to the remembered `claims`. May report `"name-collision"`, telling
   * the listener what had already claimed the name.
   */
  claim(name: string, owner: ClaimOwner, shared: boolean): void {
    const earlier = earlierOwner(this.claims, name);
    if (collides(this.claims, name, owner, shared)) {
      this.listener.report("name-collision", earlier);
    } else if (earlier === "") {
      this.claims = [...this.claims, { name, owner }];
    }
  }
}

/** Pure calculation `reservedClaims`: the claims a new name check starts with. */
export function reservedClaims(): NameClaim[] {
  return [{ name: "status", owner: "reserved" }];
}

/** Pure calculation `earlierOwner`: what had already claimed `name` among `claims`, or `""` if nothing. */
export function earlierOwner(claims: readonly NameClaim[], name: string): ClaimHolder | "" {
  return claims.find((c) => c.name === name)?.owner ?? "";
}

/**
 * Pure decision for `claim`: whether claiming `name` by `owner` (with
 * `shared` as given to `claim`) collides with the remembered `claims`.
 */
export function collides(
  claims: readonly NameClaim[],
  name: string,
  owner: ClaimOwner,
  shared: boolean,
): boolean {
  const earlier = earlierOwner(claims, name);
  if (earlier === "") return false;
  return !(shared && earlier === owner);
}

/** Pure decision for `promise`: whether an answer of kind `output` can keep `promise`. */
export function canKeepPromise(output: AnswerKind, promise: PromiseKind): boolean {
  switch (output) {
    case "integer":
      return true;
    case "string":
      return promise !== "increasing";
    case "number":
      return promise !== "fresh";
    default:
      return false;
  }
}

/**
 * Pure decision for `failure`: the finding to report about a failure
 * condition, or `null` when there is none.
 */
export function failureFinding(facts: FailureFacts): TypeFindingCode | null {
  if (!facts.asked && !facts.declared) return "failure-unknown";
  if (!facts.mayFail) return "failure-not-may-fail";
  if (facts.takesInput && !facts.asked) return "failure-not-asked";
  return null;
}

/**
 * Pure decision for `type`: the findings to report about a type, in
 * reporting order. Empty when none.
 */
export function typeFindings(facts: TypeFacts): TypeFindingCode[] {
  const findings: TypeFindingCode[] = [];
  if (facts.kind === "enum" && facts.members === 0) findings.push("empty-enum");
  if (facts.kind === "one-of" && facts.members === 0) findings.push("empty-one-of");
  if (facts.kind === "number" && facts.hasMin && facts.hasMax && facts.min > facts.max) {
    findings.push("min-above-max");
  }
  return findings;
}
