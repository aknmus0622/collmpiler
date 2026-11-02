/**
 * Decides, for one level of a type only, how a value of one type relates to the
 * place where another type is expected. Nested types are not walked here: the
 * caller looks at the answer and goes on with the inner types itself.
 *
 * Stateless and free of dependencies: nothing is remembered between calls,
 * nothing needs to be constructed, and calling it has no effect on anything.
 * It corresponds to the specification's component `fit-check`.
 */

/**
 * The kind of a type, or of an expression's value. Specification name: the
 * parameters `given` and `target`, which share these values; the values are the
 * specification's own.
 *
 * - `"int"`, `"string"`, `"bool"`: the plain value types.
 * - `"json"`: any JSON value.
 * - `"enum"`: an enumeration.
 * - `"atom"`: an identifier of some sort.
 * - `"record"`, `"list"`, `"set"`, `"map"`: the composite types.
 * - `"optional"`: a value or nothing.
 * - `"any"`: the wildcard kind, whose type is not known or not constrained.
 * - `"null"`: the null value.
 * - `"void"`: nothing at all, as answered by something that gives no value.
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
 * The kind of the members of an enumeration. Specification name: parameter
 * `base`; the values are the specification's own, and `"none"` means there is no
 * such kind to name.
 */
export type EnumBase = "int" | "string" | "bool" | "none";

/**
 * The answer for one level. Specification name: the result of the query `Fits`;
 * the values are the specification's own.
 *
 * - `"yes"`: it fits; nothing further needs comparing.
 * - `"no"`: it does not fit.
 * - `"inner"`: undecided at this level; the caller compares the two types'
 *   corresponding inner types.
 * - `"unwrap"`: undecided at this level; the caller compares the given type, as
 *   it is, with the type inside the expected one.
 */
export type FitAnswer = "yes" | "no" | "inner" | "unwrap";

/**
 * Everything known about one comparison. The field names are the specification's
 * parameter names. The caller works out `base`, `subset` and `sameSort` from the
 * two types beforehand and always supplies all five fields.
 */
export interface FitFacts {
  /** The kind of the value being placed (specification parameter `given`). */
  given: TypeKind;
  /** The kind expected at that place (specification parameter `target`). */
  target: TypeKind;
  /** The kind of the given enumeration's members (specification parameter `base`). */
  base: EnumBase;
  /**
   * Whether the given enumeration's members are all members of the expected
   * enumeration (specification parameter `subset`).
   */
  subset: boolean;
  /** Whether the two atoms are of the same sort (specification parameter `sameSort`). */
  sameSort: boolean;
}

/**
 * Performs the specification's query `Fits` (`fit-check.Fits`).
 *
 * Accepts any combination of the five facts and always answers. Reads no state,
 * so the same facts always give the same answer.
 *
 * @param facts the comparison's five facts, one field per specification parameter.
 * @returns how the given kind relates to the expected kind at this level.
 */
export function decideFit(facts: FitFacts): FitAnswer {
  const { given, target, base, subset, sameSort } = facts;

  if (target === "any" || given === "any") return "yes";
  if (target === "json") return given === "void" || given === "temporal" ? "no" : "yes";
  if (given === "null") return target === "optional" ? "yes" : "no";
  if (target === "optional") return given === "optional" ? "inner" : "unwrap";
  if (given === "optional") return "no";
  if (target === "enum") return given === "enum" && subset ? "yes" : "no";
  if (given === "enum") return base === target ? "yes" : "no";
  if (given === "atom" || target === "atom") {
    return given === "atom" && target === "atom" && sameSort ? "yes" : "no";
  }
  if (target === "record" || target === "list" || target === "set" || target === "map") {
    return given === target ? "inner" : "no";
  }
  return given === target ? "yes" : "no";
}
