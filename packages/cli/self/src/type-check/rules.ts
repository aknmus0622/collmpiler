import type {
  AnswerKind,
  CellKind,
  ClaimInfo,
  FailureInfo,
  NameClaim,
  NumberBounds,
  PromiseInfo,
  PromiseName,
  ReservedOwner,
  TypeFindingCode,
  TypeInfo,
} from "./types.ts";

/** The name every specification reserves before its own names are claimed. */
const RESERVED_NAME = "status";

/** The owner stored for the reserved name. */
const RESERVED_OWNER: ReservedOwner = "reserved";

/**
 * Pure decision: chooses the case of the `Around` command.
 *
 * @param bounds the remembered bounds (the specification's `data.boundedBelow`, `lowest`, `boundedAbove`,
 *   `highest`)
 * @param value the `value` input of `Around`: the threshold
 * @returns `true` for the case that reports `around-outside`, `false` for `otherwise`
 */
export function aroundOutside(bounds: NumberBounds, value: number): boolean {
  const belowMinimum = bounds.boundedBelow && value < bounds.lowest;
  const aboveMaximum = bounds.boundedAbove && value > bounds.highest;
  return belowMinimum || aboveMaximum;
}

/**
 * Pure decision: the findings of the `Type` command, in the order they are reported.
 *
 * @param type the input of `Type`
 * @returns the codes to report, possibly none, in order
 */
export function typeFindings(type: TypeInfo): TypeFindingCode[] {
  const findings: TypeFindingCode[] = [];
  if (type.kind === "enum" && type.members === 0) {
    findings.push("empty-enum");
  }
  if (type.kind === "one-of" && type.members === 0) {
    findings.push("empty-one-of");
  }
  if (type.kind === "number" && type.hasMin && type.hasMax && type.min > type.max) {
    findings.push("min-above-max");
  }
  return findings;
}

/**
 * Pure calculations `hasMinimum`, `minimum`, `hasMaximum` and `maximum`: the bounds remembered after a type
 * is given.
 *
 * @param type the input of `Type`
 * @returns the new `data.boundedBelow`, `lowest`, `boundedAbove` and `highest`
 */
export function boundsOf(type: TypeInfo): NumberBounds {
  const isNumber = type.kind === "number";
  const boundedBelow = isNumber && type.hasMin;
  const boundedAbove = isNumber && type.hasMax;
  return {
    boundedBelow,
    lowest: boundedBelow ? type.min : 0,
    boundedAbove,
    highest: boundedAbove ? type.max : 0,
  };
}

/**
 * Pure calculation `noKinds`: the kinds remembered when a column begins.
 *
 * @returns the new `data.kinds`
 */
export function noKinds(): string[] {
  return [];
}

/**
 * Pure decision and calculation `kindsWithCell`: the kinds remembered after one value of the column is given.
 *
 * @param kinds the remembered `data.kinds`
 * @param kind the `kind` input of `Cell`
 * @returns the new `data.kinds` (the same content as `kinds` in the `otherwise` case)
 */
export function kindsAfterCell(kinds: readonly string[], kind: CellKind): string[] {
  if (kind === "null" || kinds.includes(kind)) {
    return [...kinds];
  }
  return [...kinds, kind];
}

/**
 * Pure decision: chooses the case of the `EndColumn` command.
 *
 * @param kinds the remembered `data.kinds`
 * @returns `true` for the case that reports `mixed-column`, `false` for `otherwise`
 */
export function mixedColumn(kinds: readonly string[]): boolean {
  return kinds.length > 1;
}

/**
 * Whether an answer of the given kind can keep the promise: a structured value, an enumeration or a boolean
 * never can; a string cannot keep `increasing`, nor a number `fresh`; an integer keeps both.
 */
function canKeep(output: AnswerKind, promise: PromiseName): boolean {
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
 * Pure decision: the findings of the `Promise` command, in the order they are reported.
 *
 * @param query the input of `Promise`
 * @returns the codes to report, possibly none, in order
 */
export function promiseFindings(query: PromiseInfo): TypeFindingCode[] {
  const findings: TypeFindingCode[] = [];
  if (!canKeep(query.output, query.promise)) {
    findings.push("promise-kind");
  }
  if (query.takesInput) {
    findings.push("promise-input");
  }
  return findings;
}

/**
 * Pure decision: chooses the case of the `Failure` command.
 *
 * @param failure the input of `Failure`
 * @returns the code to report (`failure-unknown`, `failure-not-may-fail` or `failure-not-asked`), or
 *   `undefined` for `otherwise`
 */
export function failureFinding(failure: FailureInfo): TypeFindingCode | undefined {
  if (!failure.asked && !failure.declared) {
    return "failure-unknown";
  }
  if (!failure.mayFail) {
    return "failure-not-may-fail";
  }
  if (failure.takesInput && !failure.asked) {
    return "failure-not-asked";
  }
  return undefined;
}

/**
 * Pure calculation `reservedClaims`: the claims remembered when the names of a specification begin to be
 * checked.
 *
 * @returns the new `data.claims`
 */
export function reservedClaims(): NameClaim[] {
  return [{ name: RESERVED_NAME, owner: RESERVED_OWNER }];
}

/**
 * The case of the `Claim` command:
 *
 * - `"collision"`: reports `name-collision` with the earlier owner; the claims are unchanged
 * - `"new"`: the name is now claimed by this owner
 * - `"unchanged"`: the specification's `otherwise`; nothing happens
 */
export type ClaimCase = "collision" | "new" | "unchanged";

/**
 * Pure decision: chooses the case of the `Claim` command.
 *
 * @param claims the remembered `data.claims`
 * @param claim the input of `Claim`
 * @returns the case that applies
 */
export function claimCase(claims: readonly NameClaim[], claim: ClaimInfo): ClaimCase {
  const earlier = claims.find((c) => c.name === claim.name);
  if (earlier === undefined) {
    return "new";
  }
  if (claim.shared && earlier.owner === claim.owner) {
    return "unchanged";
  }
  return "collision";
}

/**
 * Pure calculation `earlierOwner`: what had already claimed a name.
 *
 * @param claims the remembered `data.claims`
 * @param name the `name` input of `Claim`
 * @returns the owner of the earlier claim, or the empty string when there is none
 */
export function earlierOwner(claims: readonly NameClaim[], name: string): string {
  return claims.find((c) => c.name === name)?.owner ?? "";
}

/**
 * Pure calculation `claimsWithNew`: the claims remembered after a name is newly claimed.
 *
 * @param claims the remembered `data.claims`
 * @param claim the input of `Claim`
 * @returns the new `data.claims`
 */
export function claimsWithNew(claims: readonly NameClaim[], claim: ClaimInfo): NameClaim[] {
  return [...claims, { name: claim.name, owner: claim.owner }];
}
