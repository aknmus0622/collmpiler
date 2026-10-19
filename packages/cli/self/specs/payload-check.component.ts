import { commands, data, effects, input, number, queries, service, states } from "@clp/core";
import { ConstantFitIf, Decision, TypeFitIf } from "./payload-check.decisions.ts";

// The check of what a specification gives wherever a value is placed (packages/cli/src/slots.ts): an effect's payload,
// the input of an asked query, the input of a command of a contained component, remembered data, a command's answer,
// a contained component created or removed, a data field's initial value, and an effect's condition. Each place is a
// slot: a set of declared fields, and the fields the specification gives, each with what is known about its value.
//
// The walk over the specification is not this component's job. It enters a slot with the facts about it, hands over the
// declared and the given fields, what is known about each given value, and leaves. What a slot declares is asked of a
// dependency, by field name. Comparing structured types (records, lists, optional values, oneOf) is outside this
// component: for those, the walk hands over whether the value fits (Judged), as the framework compared it.
const FieldKind = ["boolean", "integer", "number", "string", "enum", "value", "structured"] as const;
const ConstantKind = ["boolean", "integer", "number", "string"] as const;
const SlotKind = ["effect", "asks", "calls", "set", "responds", "change", "adds", "initially", "onlyWhen"] as const;

export const State = states({
  OUTSIDE: "Between slots.",
  INACTIVE: "In a slot whose fields are not checked (its target is unknown, or its shape is already wrong). Nothing is reported until the walk leaves it.",
  ACTIVE: "In a slot whose fields are checked, with no given field being checked.",
  CHECKING: "A given, declared field's value is being checked.",
  SETTLED: "A given field has already been reported; what follows about its value is ignored.",
});

export const Data = data({
  slotKind: { type: SlotKind, description: "The kind of slot being walked." },
  variants: { type: "boolean", description: "Whether the slot is a command's answer of the form 'one of several variants'." },
  checkedField: { type: "string", description: "The given field being walked." },
});

const At = input({ field: "string" });
export const Query = queries({
  fieldDeclared: { description: "Whether the slot declares a field of this name.", input: At, output: "boolean" },
  fieldGiven: { description: "Whether the specification gives a value for that field.", input: At, output: "boolean" },
  fieldKind: { description: "What that field takes: a primitive, one of a fixed set of strings (enum), any value, or a structured type.", input: At, output: FieldKind },
  fieldOptional: { description: "Whether that field may be absent (null).", input: At, output: "boolean" },
  memberOf: { description: "Whether this string is in the fixed set that field takes.", input: input({ field: "string", value: "string" }), output: "boolean" },
  hasMinimum: { description: "Whether that field has a minimum.", input: At, output: "boolean" },
  minimum: { description: "That field's minimum. Meaningful only if it has one.", input: At, output: number() },
  hasMaximum: { description: "Whether that field has a maximum.", input: At, output: "boolean" },
  maximum: { description: "That field's maximum. Meaningful only if it has one.", input: At, output: number() },
});

export const Effect = effects({
  Report: {
    description: "Something is wrong in the slot being walked, about this field (the empty name for the slot as a whole).",
    input: input({
      code: ["unknown-target", "keyed-mismatch", "unknown-command", "missing-field", "unknown-field", "bad-source", "mismatch", "no-output", "missing-response", "wrong-shape"],
      field: "string",
    }),
  },
});

export const EnterInput = input({
  kind: SlotKind,
  declared: "boolean",
  keyedOk: "boolean",
  commandDeclared: "boolean",
  output: ["none", "single", "fields", "variant"],
  given: ["none", "single", "fields"],
  givenCount: number({ min: 0, max: 100 }),
});
export const FieldInput = input({ name: "string" });
export const SourceInput = input({ kind: ["constant", "input", "data", "other"] });
export const ConstantInput = input({ kind: ConstantKind, text: "string", number: "number" });
export const TypedInput = input({ type: ConstantKind });
export const JudgedInput = input({ fits: "boolean" });

const value = { from: [State.ACTIVE, State.CHECKING, State.SETTLED, State.INACTIVE] } as const;

export const Command = commands({
  EnterSlot: {
    input: EnterInput,
    from: State.OUTSIDE,
    does:
      "The walk enters a slot, with what is known about it. Its kind is remembered, and whether it is an answer of variants. " +
      "Whether its fields are checked, and what is reported about the slot as a whole (as the empty field), depends on the kind: " +
      "an effect that is not declared is not checked (it is reported elsewhere). An asked query that is not declared is reported as " +
      "unknown-target and not checked. For a contained component's command: a part that is not declared is unknown-target; " +
      "otherwise a part asked with a key it does not have (or without the key it needs) is keyed-mismatch (keyedOk false); otherwise " +
      "a command the part does not have is unknown-command; in any of these cases it is not checked. A contained component created " +
      "or removed (change) that is not declared as one of many is unknown-target. A command's answer (responds): with no declared " +
      "output, an answer that is given is no-output and nothing is checked; with an output declared and no answer given, " +
      "missing-response and not checked; with fields declared and a single value given, wrong-shape and not checked; with variants " +
      "declared and not exactly one field given (or a single value), wrong-shape and not checked; with a single value declared and " +
      "fields given, wrong-shape and not checked. Every other slot is checked.",
  },
  DeclaredField: {
    input: FieldInput,
    from: [State.INACTIVE, State.ACTIVE, State.CHECKING, State.SETTLED],
    does:
      "A field the slot declares. In a slot that is checked and whose declared fields must all be given (an effect, an asked query, " +
      "a contained component's command, an answer with fields), a field the specification does not give is reported as " +
      "missing-field. The field being checked, if any, stays as it is.",
  },
  GivenField: {
    input: FieldInput,
    from: [State.INACTIVE, State.ACTIVE, State.CHECKING, State.SETTLED],
    does:
      "A field the specification gives; what is known about its value follows. In a slot that is not checked, nothing happens. " +
      "A field the slot does not declare is reported: in an answer of variants as wrong-shape (for the slot), otherwise as " +
      "unknown-field (for that field); what follows about its value is ignored. A declared field is checked next.",
  },
  Source: {
    input: SourceInput,
    ...value,
    does:
      "Where the value of the field being checked comes from. It is given only where that matters (the input of an asked query). " +
      "A value that is neither a constant, a command input nor remembered data is reported as bad-source, and what follows about it " +
      "is ignored.",
  },
  Null: { ...value, does: "The value is null. It fits only a field that may be absent or that takes any value; otherwise it is reported as mismatch." },
  Constant: {
    input: ConstantInput,
    ...value,
    does:
      "A concrete value for the field being checked (`text` when it is a string, `number` when it is a number). If it does not " +
      "fit, it is reported as mismatch and what follows is ignored.",
  },
  Typed: { input: TypedInput, ...value, does: "A value known only by its type. If a value of that type does not fit, mismatch, and what follows is ignored." },
  Unresolved: { ...value, does: "The value is a reference that points at nothing: mismatch, and what follows is ignored." },
  Judged: { input: JudgedInput, ...value, does: "Whether a value of a structured type fits, as the framework compared it. If not, mismatch, and what follows is ignored." },
  LeaveSlot: { from: [State.INACTIVE, State.ACTIVE, State.CHECKING, State.SETTLED], goTo: State.OUTSIDE },
});

export const PayloadCheck = service({
  description:
    "Checks, slot by slot, what a specification gives wherever a value is placed, and reports every mismatch with what is " +
    "declared: an unknown target, a shape that does not fit, a declared field that is not given, a given field that is not " +
    "declared, and a value that does not fit its field. For one given field at most one is reported: the first.",
  init: State.OUTSIDE,
  uses: [State, Data, Query, Effect, Decision, ConstantFitIf, TypeFitIf, Command],
});
