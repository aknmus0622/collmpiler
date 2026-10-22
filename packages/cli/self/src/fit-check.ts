/**
 * Fit check: decides, one level at a time, whether a value of one type fits
 * where another type is expected.
 *
 * Corresponds to the specification component `fit-check`. It has no state
 * and no dependencies; its only entry is the query `Fits`, implemented here
 * by the pure function {@link fitCheck}.
 */

/**
 * Specification query `fit-check.Fits` (calculation `fits`).
 *
 * Pure: answers the same result for the same arguments, touches nothing.
 *
 * @param fit the kind of the given value, the expected kind, and what is known
 *            about them (the specification's parameters, as one record).
 * @returns whether the value fits at this level (the specification's result).
 */
export function fitCheck(fit: FitQuestion): FitAnswer {
  const { given, target, base, subset, sameSort } = fit;
  // Anything fits where any is expected, and any fits anywhere.
  if (target === "any" || given === "any") return "yes";
  // Where JSON is expected, anything fits but nothing and a temporal formula.
  if (target === "json") {
    return given === "void" || given === "temporal" ? "no" : "yes";
  }
  // Null fits only where an optional value is expected.
  if (given === "null") return target === "optional" ? "yes" : "no";
  // Where an optional value is expected: compare inside, or with its inside.
  if (target === "optional") return given === "optional" ? "inner" : "unwrap";
  // An optional value fits nowhere else.
  if (given === "optional") return "no";
  // Where an enumeration is expected, only a subset enumeration fits.
  if (target === "enum") return given === "enum" && subset ? "yes" : "no";
  // An enumeration fits where its base kind is expected.
  if (given === "enum") return base === target ? "yes" : "no";
  // Atoms fit only atoms of the same sort.
  if (given === "atom" || target === "atom") {
    return given === "atom" && target === "atom" && sameSort ? "yes" : "no";
  }
  // Composites of the same kind are compared inside.
  if (COMPOSITE_KINDS.has(target)) return given === target ? "inner" : "no";
  // Otherwise only the same kind fits.
  return given === target ? "yes" : "no";
}

/** The composite kinds, whose contents are compared at the next level. */
const COMPOSITE_KINDS: ReadonlySet<TypeKind> = new Set<TypeKind>([
  "record",
  "list",
  "set",
  "map",
]);

/**
 * The input of the `Fits` query: one comparison of a given type with an
 * expected type, at one level. Each field is the specification parameter of
 * the same name.
 */
export interface FitQuestion {
  /** The kind of the value being placed (specification parameter `given`). */
  given: TypeKind;
  /** The kind expected where it is placed (specification parameter `target`). */
  target: TypeKind;
  /**
   * When the given value is an enumeration: the kind of its members
   * (specification parameter `base`); `"none"` when there is no such kind.
   */
  base: EnumBase;
  /**
   * When both are enumerations: whether every member of the given enumeration
   * is a member of the expected one (specification parameter `subset`).
   */
  subset: boolean;
  /**
   * When atoms are involved: whether they are identifiers of the same sort
   * (specification parameter `sameSort`).
   */
  sameSort: boolean;
}

/**
 * The kind of a type, at its outermost level (specification parameters
 * `given` and `target`).
 *
 * - `"int"`, `"string"`, `"bool"`: the plain value kinds.
 * - `"json"`: any JSON value.
 * - `"enum"`: an enumeration of literal values.
 * - `"atom"`: an opaque identifier of some sort.
 * - `"record"`, `"list"`, `"set"`, `"map"`: the composite kinds.
 * - `"optional"`: a value or null.
 * - `"any"`: a type that is not known.
 * - `"null"`: the null value itself.
 * - `"void"`: nothing (no value at all).
 * - `"temporal"`: a temporal formula.
 */
export type TypeKind =
  | "int"
  | "string"
  | "bool"
  | "json"
  | "enum"
  | "atom"
  | "record"
  | "list"
  | "set"
  | "map"
  | "optional"
  | "any"
  | "null"
  | "void"
  | "temporal";

/**
 * The kind of the members of an enumeration (specification parameter `base`):
 * `"int"`, `"string"` or `"bool"`, or `"none"` when there is none.
 */
export type EnumBase = "int" | "string" | "bool" | "none";

/**
 * The answer of the `Fits` query (the specification's result of `Fits`).
 *
 * - `"yes"`: it fits; nothing more to compare.
 * - `"no"`: it does not fit.
 * - `"inner"`: it fits at this level if what is inside the given type fits
 *   what is inside the expected type; compare those next.
 * - `"unwrap"`: compare the given type itself with what is inside the
 *   expected type next.
 */
export type FitAnswer = "yes" | "no" | "inner" | "unwrap";
