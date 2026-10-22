import { service, value } from "@clp/core";

// What a verdict of the formal checker (Alloy 6) means for the person (packages/cli/src/v1/reported.ts, used by `checkSpec`
// in v1/prepare.ts).
export const CheckerVerdict = service("Decides how serious each verdict of the formal checker is.", {
  queries: {
    Verdict(
      kind: "property" | "defined" | "requires" | "reach" | "skipped",
      status: "holds" | "broken" | "reached" | "unreachable" | "out-of-range" | "skipped",
    ): { severity: "error" | "warning" | "none"; code: "property" | "undefined-value" | "requires-broken" | "unreached-case" | "out-of-range" | "none" } {
      return value.verdict(
        "A verdict: what was checked (a property, that a value read is defined, that a component is called within its requires, " +
          "that an event can happen, or something the checker could not express at all) and how it came out. Something skipped, " +
          "or out of range, is a warning (out-of-range). An event no trace reaches is a warning (unreached-case); one that is " +
          "reached says nothing. A broken property, a value read where it is not defined, and a call outside the callee's requires " +
          "are errors (property, undefined-value, requires-broken); anything that holds says nothing.",
      );
    },
  },
});
