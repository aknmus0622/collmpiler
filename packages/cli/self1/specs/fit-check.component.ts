import { service, value } from "@clp/core/v1";

// Whether a value of one type can be put where another type is expected (packages/cli/src/v1/types.ts `fits`), one level
// at a time: the caller compares what is inside (fields, elements, keys and values) when the answer says so.
export type Kind = "int" | "string" | "bool" | "json" | "enum" | "atom" | "record" | "list" | "set" | "map" | "optional" | "any" | "null" | "void" | "temporal";

export const FitCheck = service("Decides, one level at a time, whether a value of one type fits where another is expected.", {
  queries: {
    Fits(given: Kind, target: Kind, base: "int" | "string" | "bool" | "none", subset: boolean, sameSort: boolean): "yes" | "no" | "inner" | "unwrap" {
      return value.fits(
        "The kind of a value (given) and the expected kind; for an enumeration value, the kind of its members (base) and whether they are all " +
          "members of the expected enumeration (subset); for atoms, whether they are of the same sort. Anything fits where any is " +
          "expected and any fits anywhere. Where JSON is expected, anything fits but nothing (void) and a temporal formula. Null " +
          "fits only where an optional value is expected. Where an optional value is expected, an optional value is compared " +
          "inside (inner), and any other value is compared with what is inside the expected type (unwrap). An optional value " +
          "fits nowhere else. Where an enumeration is expected, only an enumeration whose members are a subset fits. An " +
          "enumeration fits where its base kind is expected. Atoms fit only atoms of the same sort. Where a record, list, set or " +
          "map is expected, the same kind is compared inside, and anything else does not fit. Otherwise only the same kind fits.",
      );
    },
  },
});
