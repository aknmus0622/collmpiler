import { decisionTable } from "@clp/core";

// Whether a value of one kind may be put into a field of another kind (packages/cli/src/schema.ts, `compatible`).
// Simplification: two fixed sets of strings are taken to fit each other; the real check compares their members.
export const Compatibility = decisionTable({
  "The value and the field are of the same kind": { fits: true },
  "The value is an integer and the field takes a number": { fits: true },
  "The value is one of a fixed set of strings and the field takes a string": { fits: true },
  otherwise: { fits: false },
});
