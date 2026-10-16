import { conditions, decisionTable, otherwise, when } from "@clp/core";
export const ConstantFitIf = conditions({
  fieldTakesBooleanValueBoolean: "The field takes a boolean and the value is a boolean",
  fieldTakesStringValueString: "The field takes a string and the value is a string",
  fieldTakesOneFixedSet: "The field takes one of a fixed set of strings, and the value is a string in that set",
  fieldTakesIntegerValueInteger: "The field takes an integer, and the value is an integer within the field's bounds",
  fieldTakesNumberValueInteger: "The field takes a number, and the value is an integer or a number within the field's bounds",
});

export const TypeFitIf = conditions({
  valueSTypeSameAs: "The value's type is the same as what the field takes",
  valueSTypeIntegerField: "The value's type is integer and the field takes a number",
});


// Whether a concrete value may be put into a field (packages/cli/src/schema.ts, `conforms`).
// "Within the field's bounds" means: not below the field's minimum if it has one, and not above its maximum
// if it has one. Both bounds are inclusive.
export const ConstantFit = decisionTable(
  when(ConstantFitIf.fieldTakesBooleanValueBoolean, { fits: true }),
  when(ConstantFitIf.fieldTakesStringValueString, { fits: true }),
  when(ConstantFitIf.fieldTakesOneFixedSet, { fits: true }),
  when(ConstantFitIf.fieldTakesIntegerValueInteger, { fits: true }),
  when(ConstantFitIf.fieldTakesNumberValueInteger, { fits: true }),
  otherwise({ fits: false }),
);

// Whether a value known only by its type may be put into a field (`compatible`). Bounds are not looked at.
// A field that takes one of a fixed set of strings never accepts a value known only by its type.
export const TypeFit = decisionTable(
  when(TypeFitIf.valueSTypeSameAs, { fits: true }),
  when(TypeFitIf.valueSTypeIntegerField, { fits: true }),
  otherwise({ fits: false }),
);
