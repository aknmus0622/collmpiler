import { asks, component, compose, description, does, from, goTo, input, otherwise, output, ref, typed, when } from "@clp/core";
import { ConstantFit, TypeFit } from "./payload-check.decisions.ts";

const FieldKind = ["boolean", "integer", "number", "string", "enum"] as const;
const ConstantKind = ["boolean", "integer", "number", "string"] as const;
const here = { effect: ref.data("effect"), field: ref.data("field") } as const;

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

  states: {
    OUTSIDE: description("Between effects."),
    IN_EFFECT: description("In a declared effect, before any given field."),
    IN_UNKNOWN_EFFECT: description("In an effect that is not declared. Nothing is checked and nothing is reported until the walk leaves it."),
    IN_FIELD: description("In a given field of a declared effect whose value is still being checked."),
    IN_SETTLED_FIELD: description("In a given field for which a diagnostic has already been reported. What follows about its value is ignored."),
  },
  init: "OUTSIDE",

  data: {
    effect: compose(description("The name of the effect being walked."), typed("string")),
    field: compose(description("The name of the given field being walked."), typed("string")),
  },

  queries: {
    effectDeclared: compose(description("Whether the specification declares an effect of this name."), input({ name: "string" }), output("boolean")),
    fieldDeclared: compose(description("Whether that effect declares a field of this name."), input({ effect: "string", field: "string" }), output("boolean")),
    fieldGiven: compose(description("Whether the specification gives a value for that field of that effect."), input({ effect: "string", field: "string" }), output("boolean")),
    fieldKind: compose(description("What that field takes. \"enum\" means one of a fixed set of strings."), input({ effect: "string", field: "string" }), output(FieldKind)),
    memberOf: compose(description("Whether this string is in the fixed set that field takes."), input({ effect: "string", field: "string", value: "string" }), output("boolean")),
    hasMinimum: compose(description("Whether that field has a minimum."), input({ effect: "string", field: "string" }), output("boolean")),
    minimum: compose(description("That field's minimum. Meaningful only if it has one."), input({ effect: "string", field: "string" }), output("number")),
    hasMaximum: compose(description("Whether that field has a maximum."), input({ effect: "string", field: "string" }), output("boolean")),
    maximum: compose(description("That field's maximum. Meaningful only if it has one."), input({ effect: "string", field: "string" }), output("number")),
  },

  effects: {
    ReportDiagnostic: compose(
      description("A mismatch found in the effect being walked, for the named field."),
      input({ code: ["missing-field", "bad-value"], effect: "string", field: "string" }),
    ),
  },

  decisions: { constantFit: ConstantFit, typeFit: TypeFit },

  commands: {
    EnterEffect: compose(
      description("The walk enters an effect and remembers its name."),
      input({ name: "string" }),
      from("OUTSIDE"),
      asks({ declared: { effectDeclared: { name: ref.input("name") } } }),
      when("The entered effect is not declared", goTo("IN_UNKNOWN_EFFECT")),
      otherwise(goTo("IN_EFFECT")),
    ),

    DeclaredField: compose(
      description("A field the effect being walked declares. The walk stays where it is."),
      input({ name: "string" }),
      from("IN_EFFECT", "IN_UNKNOWN_EFFECT"),
      asks({ given: { fieldGiven: { effect: ref.data("effect"), field: ref.input("name") } } }),
      when("The effect is declared, and the specification gives no value for the declared field", does("A missing-field diagnostic is reported for the effect and that field.")),
      otherwise(),
    ),

    GivenField: compose(
      description("A field the specification gives to the effect being walked. What is known about its value follows."),
      input({ name: "string" }),
      from("IN_EFFECT", "IN_FIELD", "IN_SETTLED_FIELD", "IN_UNKNOWN_EFFECT"),
      asks({ declared: { fieldDeclared: { effect: ref.data("effect"), field: ref.input("name") } } }),
      when(
        "The effect is declared but does not declare the given field",
        goTo("IN_SETTLED_FIELD"),
        does("The walk remembers the field's name. A bad-value diagnostic is reported for the effect and that field."),
      ),
      when("The effect is declared and declares the given field", goTo("IN_FIELD"), does("The walk remembers the field's name.")),
      // In an effect that is not declared: nothing happens
      otherwise(),
    ),

    Constant: compose(
      description(
        "A concrete value for the field being walked. `kind` says what it is. `text` is the value when it is a string, " +
          "and `number` is the value when it is an integer or a number; otherwise they carry nothing.",
      ),
      input({ kind: ConstantKind, text: "string", number: "number" }),
      from("IN_FIELD", "IN_SETTLED_FIELD", "IN_UNKNOWN_EFFECT"),
      asks({
        takes: { fieldKind: here },
        inSet: { memberOf: { ...here, value: ref.input("text") } },
        bounded: { hasMinimum: here },
        lowest: { minimum: here },
        capped: { hasMaximum: here },
        highest: { maximum: here },
      }),
      when(
        "The field's value is still being checked, and the constant does not fit the field",
        goTo("IN_SETTLED_FIELD"),
        does("A bad-value diagnostic is reported for the remembered effect and field."),
      ),
      otherwise(),
    ),

    Typed: compose(
      description("A value for the field being walked that is known only by its type."),
      input({ type: ConstantKind }),
      from("IN_FIELD", "IN_SETTLED_FIELD", "IN_UNKNOWN_EFFECT"),
      asks({ takes: { fieldKind: here } }),
      when(
        "The field's value is still being checked, and a value of that type does not fit the field",
        goTo("IN_SETTLED_FIELD"),
        does("A bad-value diagnostic is reported for the remembered effect and field."),
      ),
      otherwise(),
    ),

    Unresolved: compose(
      description("The value given for the field being walked is a reference that points at nothing."),
      from("IN_FIELD", "IN_SETTLED_FIELD", "IN_UNKNOWN_EFFECT"),
      when(
        "The field's value is still being checked",
        goTo("IN_SETTLED_FIELD"),
        does("A bad-value diagnostic is reported for the remembered effect and field."),
      ),
      otherwise(),
    ),

    LeaveEffect: compose(from("IN_EFFECT", "IN_FIELD", "IN_SETTLED_FIELD", "IN_UNKNOWN_EFFECT"), goTo("OUTSIDE")),
  },
});
