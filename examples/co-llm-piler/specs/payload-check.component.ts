import { asks, component, compose, description, does, from, goTo, input, otherwise, output, ref, typed, when } from "@clp/core";
import { Compatibility } from "./payload-check.decisions.ts";

const Kind = ["boolean", "integer", "number", "string", "enum"] as const;

// The check of an effect's payload (part of packages/cli/src/extract.ts), written as a spec: is the effect
// declared, is every given field declared and of a kind that fits, is every declared field given.
// The caller walks one effect at a time: it enters the effect, hands over the fields the specification gives,
// then the fields the effect declares, and leaves. What is declared is asked of a dependency, by name.
export const PayloadCheck = component({
  description:
    "Checks the payload a specification gives to an effect, one effect at a time, and reports every mismatch " +
    "with the effect's declaration: an effect that is not declared, a given field that is not declared, a given " +
    "value whose kind does not fit the field, and a declared field that is not given.",

  states: {
    OUTSIDE: description("Between effects."),
    IN_EFFECT: description("Walking the fields of a declared effect."),
    IN_UNKNOWN_EFFECT: description("Walking the fields of an effect that is not declared; its fields are not checked."),
  },
  init: "OUTSIDE",

  data: { effect: compose(description("The name of the effect being walked."), typed("string")) },

  queries: {
    effectDeclared: compose(description("Whether the specification declares an effect of this name."), input({ name: "string" }), output("boolean")),
    fieldDeclared: compose(description("Whether that effect declares a field of this name."), input({ effect: "string", field: "string" }), output("boolean")),
    fieldKind: compose(description("The kind of value that field of that effect takes."), input({ effect: "string", field: "string" }), output(Kind)),
    fieldGiven: compose(description("Whether the specification gives a value for that field of that effect."), input({ effect: "string", field: "string" }), output("boolean")),
  },

  effects: {
    ReportDiagnostic: input({
      code: ["unknown-effect", "missing-field", "bad-value"],
      effect: "string",
      // The field concerned; empty for unknown-effect
      field: "string",
    }),
  },

  decisions: { compatibility: Compatibility },

  commands: {
    // Where the walk goes is pinned down here: two independent interpretations of the prose alone disagreed on it
    EnterEffect: compose(
      description("The walk enters an effect and remembers its name."),
      input({ name: "string" }),
      from("OUTSIDE"),
      asks({ declared: { effectDeclared: { name: ref.input("name") } } }),
      when("The entered effect is not declared", goTo("IN_UNKNOWN_EFFECT"), does("An unknown-effect diagnostic is reported for it.")),
      otherwise(goTo("IN_EFFECT")),
    ),

    GivenField: compose(
      description(
        "A field the specification gives to the effect being walked, with the kind of the value given. The walk stays where it is. " +
          "In a declared effect: if the effect does not declare the field, a bad-value diagnostic is reported for it; " +
          "otherwise, if the value's kind does not fit the kind the field takes, a bad-value diagnostic is reported for it. " +
          "In an effect that is not declared, nothing is checked.",
      ),
      input({ field: "string", kind: Kind }),
      from("IN_EFFECT", "IN_UNKNOWN_EFFECT"),
    ),

    DeclaredField: compose(
      description(
        "A field the effect being walked declares. The walk stays where it is. If the specification gives no value " +
          "for it, a missing-field diagnostic is reported for it.",
      ),
      input({ field: "string" }),
      from("IN_EFFECT"),
    ),

    LeaveEffect: compose(from("IN_EFFECT", "IN_UNKNOWN_EFFECT"), goTo("OUTSIDE")),
  },
});
