import { component, conditions, data, description, does, effects, from, goTo, input, otherwise, output, queries, states, when } from "@clp/core";
import { ConstantFit, TypeFit } from "./payload-check.decisions.ts";

const FieldKind = ["boolean", "integer", "number", "string", "enum"] as const;
const ConstantKind = ["boolean", "integer", "number", "string"] as const;
export const If = conditions({
  enteredEffectNotDeclared: "The entered effect is not declared",
  effectDeclaredSpecificationGivesNo: "The effect is declared, and the specification gives no value for the declared field",
  effectDeclaredButDoesNot: "The effect is declared but does not declare the given field",
  effectDeclaredDeclaresGivenField: "The effect is declared and declares the given field",
  fieldSValueStillBeing: "The field's value is still being checked, and the constant does not fit the field",
  fieldSValueStillBeing2: "The field's value is still being checked, and a value of that type does not fit the field",
  fieldSValueStillBeing3: "The field's value is still being checked",
});

export const State = states({
  OUTSIDE: description("Between effects."),
  IN_EFFECT: description("In a declared effect, before any given field."),
  IN_UNKNOWN_EFFECT: description("In an effect that is not declared. Nothing is checked and nothing is reported until the walk leaves it."),
  IN_FIELD: description("In a given field of a declared effect whose value is still being checked."),
  IN_SETTLED_FIELD: description("In a given field for which a diagnostic has already been reported. What follows about its value is ignored."),
});

export const Data = data({
  effect: component(description("The name of the effect being walked."), "string"),
  field: component(description("The name of the given field being walked."), "string"),
});

export const Query = queries({
  effectDeclared: component(description("Whether the specification declares an effect of this name."), input({ name: "string" }), output("boolean")),
  fieldDeclared: component(description("Whether that effect declares a field of this name."), input({ effect: "string", field: "string" }), output("boolean")),
  fieldGiven: component(description("Whether the specification gives a value for that field of that effect."), input({ effect: "string", field: "string" }), output("boolean")),
  fieldKind: component(description("What that field takes. \"enum\" means one of a fixed set of strings."), input({ effect: "string", field: "string" }), output(FieldKind)),
  memberOf: component(description("Whether this string is in the fixed set that field takes."), input({ effect: "string", field: "string", value: "string" }), output("boolean")),
  hasMinimum: component(description("Whether that field has a minimum."), input({ effect: "string", field: "string" }), output("boolean")),
  minimum: component(description("That field's minimum. Meaningful only if it has one."), input({ effect: "string", field: "string" }), output("number")),
  hasMaximum: component(description("Whether that field has a maximum."), input({ effect: "string", field: "string" }), output("boolean")),
  maximum: component(description("That field's maximum. Meaningful only if it has one."), input({ effect: "string", field: "string" }), output("number")),
});

export const Effect = effects({
  ReportDiagnostic: component(
    description("A mismatch found in the effect being walked, for the named field."),
    input({ code: ["missing-field", "bad-value"], effect: "string", field: "string" }),
  ),
});

export const EnterEffectInput = input({ name: "string" });

export const DeclaredFieldInput = input({ name: "string" });

export const GivenFieldInput = input({ name: "string" });

export const ConstantInput = input({ kind: ConstantKind, text: "string", number: "number" });

export const TypedInput = input({ type: ConstantKind });

const here = { effect: Data.effect, field: Data.field } as const;


// The check of an effect's payload (part of packages/cli/src/extract.ts), written as a spec: is every declared
// field given, is every given field declared, and does every given value fit its field.
//
// The caller walks one effect at a time. It enters the effect, hands over the fields the effect declares, then
// each field the specification gives, followed by what is known about that field's value, and leaves.
// A value is handed over as one or more of:
//   Constant   - a concrete value: a constant written in the specification, one cell of a decision table's
//                column, or one member of a fixed set of strings the value is taken from
//   Typed      - a value known only by its type (a command input, a remembered field, a query answer, ...)
//   Unresolved - a reference that points at nothing
// What the effect declares is not remembered here; it is asked of a dependency, by name.
export const PayloadCheck = component({
  description:
    "Checks the payload a specification gives to an effect, one effect at a time, and reports every mismatch " +
    "with the effect's declaration: a declared field that is not given, a given field that is not declared, and " +
    "a given value that does not fit its field. For one given field at most one diagnostic is reported: the first. " +
    "An effect that is not declared is reported elsewhere; its fields are not checked here.",

  states: State,
  init: State.OUTSIDE,

  data: Data,

  queries: Query,

  effects: Effect,

  decisions: { constantFit: ConstantFit, typeFit: TypeFit },

  commands: {
    EnterEffect: component(
      description("The walk enters an effect and remembers its name."),
      EnterEffectInput,
      from(State.OUTSIDE),
      Query.effectDeclared({ name: EnterEffectInput.name }).as("declared"),
      when(If.enteredEffectNotDeclared, goTo(State.IN_UNKNOWN_EFFECT)),
      otherwise(goTo(State.IN_EFFECT)),
    ),

    DeclaredField: component(
      description("A field the effect being walked declares. The walk stays where it is."),
      DeclaredFieldInput,
      from(State.IN_EFFECT, State.IN_UNKNOWN_EFFECT),
      Query.fieldGiven({ effect: Data.effect, field: DeclaredFieldInput.name }).as("given"),
      when(If.effectDeclaredSpecificationGivesNo, does("A missing-field diagnostic is reported for the effect and that field.")),
      otherwise(),
    ),

    GivenField: component(
      description("A field the specification gives to the effect being walked. What is known about its value follows."),
      GivenFieldInput,
      from(State.IN_EFFECT, State.IN_FIELD, State.IN_SETTLED_FIELD, State.IN_UNKNOWN_EFFECT),
      Query.fieldDeclared({ effect: Data.effect, field: GivenFieldInput.name }).as("declared"),
      when(
        If.effectDeclaredButDoesNot,
        goTo(State.IN_SETTLED_FIELD),
        does("The walk remembers the field's name. A bad-value diagnostic is reported for the effect and that field."),
      ),
      when(If.effectDeclaredDeclaresGivenField, goTo(State.IN_FIELD), does("The walk remembers the field's name.")),
      // In an effect that is not declared: nothing happens
      otherwise(),
    ),

    Constant: component(
      description(
        "A concrete value for the field being walked. `kind` says what it is. `text` is the value when it is a string, " +
          "and `number` is the value when it is an integer or a number; otherwise they carry nothing.",
      ),
      ConstantInput,
      from(State.IN_FIELD, State.IN_SETTLED_FIELD, State.IN_UNKNOWN_EFFECT),
      Query.fieldKind(here).as("takes"),
      Query.memberOf({ ...here, value: ConstantInput.text }).as("inSet"),
      Query.hasMinimum(here).as("bounded"),
      Query.minimum(here).as("lowest"),
      Query.hasMaximum(here).as("capped"),
      Query.maximum(here).as("highest"),
      when(
        If.fieldSValueStillBeing,
        goTo(State.IN_SETTLED_FIELD),
        does("A bad-value diagnostic is reported for the remembered effect and field."),
      ),
      otherwise(),
    ),

    Typed: component(
      description("A value for the field being walked that is known only by its type."),
      TypedInput,
      from(State.IN_FIELD, State.IN_SETTLED_FIELD, State.IN_UNKNOWN_EFFECT),
      Query.fieldKind(here).as("takes"),
      when(
        If.fieldSValueStillBeing2,
        goTo(State.IN_SETTLED_FIELD),
        does("A bad-value diagnostic is reported for the remembered effect and field."),
      ),
      otherwise(),
    ),

    Unresolved: component(
      description("The value given for the field being walked is a reference that points at nothing."),
      from(State.IN_FIELD, State.IN_SETTLED_FIELD, State.IN_UNKNOWN_EFFECT),
      when(
        If.fieldSValueStillBeing3,
        goTo(State.IN_SETTLED_FIELD),
        does("A bad-value diagnostic is reported for the remembered effect and field."),
      ),
      otherwise(),
    ),

    LeaveEffect: component(from(State.IN_EFFECT, State.IN_FIELD, State.IN_SETTLED_FIELD, State.IN_UNKNOWN_EFFECT), goTo(State.OUTSIDE)),
  },
});
