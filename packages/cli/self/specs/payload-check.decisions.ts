import { decisionTable } from "@clp/core";

// Whether a concrete value may be put into a field (packages/cli/src/schema.ts, `conforms`).
// "Within the field's bounds" means: not below the field's minimum if it has one, and not above its maximum
// if it has one. Both bounds are inclusive.
export const ConstantFit = decisionTable({
  "The field takes a boolean and the value is a boolean": { fits: true },
  "The field takes a string and the value is a string": { fits: true },
  "The field takes one of a fixed set of strings, and the value is a string in that set": { fits: true },
  "The field takes an integer, and the value is an integer within the field's bounds": { fits: true },
  "The field takes a number, and the value is an integer or a number within the field's bounds": { fits: true },
  otherwise: { fits: false },
});

// Whether a value known only by its type may be put into a field (`compatible`). Bounds are not looked at.
// A field that takes one of a fixed set of strings never accepts a value known only by its type.
export const TypeFit = decisionTable({
  "The value's type is the same as what the field takes": { fits: true },
  "The value's type is integer and the field takes a number": { fits: true },
  otherwise: { fits: false },
});
