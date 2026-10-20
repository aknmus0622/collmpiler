import { commands, data, effects, input, service, string, value } from "@clp/core";

// How the simulator of a specification applies what happens in the case that was chosen (packages/cli/src/outcome.ts, used
// by `simulator` in runtime.ts): the state the step ends in, which effects are performed, and whether what the case says
// is consistent with what the specification declares. It is fed the facts one at a time, in the order the simulator meets
// them; resolving values (references to the value at that moment) and comparing a structured value with its type are the
// caller's, which gives the results as facts. When something is wrong with the specification, it says what kind of fault
// it is (Fail); the wording is the caller's. Whether a contained component is called at all is asked separately (Call),
// before the case is chosen.
//
// This is a grading component (SELF_HOSTING.md §10.3, R1): what it decides is a value of the oracle's run, so in use it
// must agree with Stage 0 (R4).
export const Data = data({
  current: { type: "string", initially: "", description: "The state the step starts from." },
  destination: { type: "string", initially: "", description: "The state the step ends in, as far as the facts so far say." },
});

export const Effect = effects({
  Fail: {
    description: "Something the case says does not fit what the specification declares: the kind of fault.",
    input: input({ code: ["undeclared-state", "undeclared-effect", "undeclared-data", "missing-responds", "bad-value", "not-many", "duplicate-key"] }),
  },
});

const States = ["OPEN", "DONE", ""];
export const BeginInput = input({ state: string({ examples: States }) });
export const GoToInput = input({ target: string({ examples: States }), declared: "boolean" });
export const EffectInput = input({ guard: ["none", "condition", "value"], chosen: "boolean", guardValue: value(), declared: "boolean" });
export const DeclaredInput = input({ declared: "boolean" });
export const FitsInput = input({ fits: "boolean" });
export const RespondsInput = input({ given: "boolean" });
export const RespondFieldInput = input({ isNull: "boolean", anyValue: "boolean", optional: "boolean", fits: "boolean" });
export const ManyInput = input({ many: "boolean" });
export const KeyInput = input({ exists: "boolean" });
export const CallInput = input({ keyed: "boolean", found: "boolean" });

export const Command = commands({
  Begin: {
    input: BeginInput,
    does: "A case is applied, in a step from the given state. Unless a GoTo says otherwise, the step ends in the state it starts from.",
  },
  GoTo: {
    input: GoToInput,
    does:
      "The case goes to the state `target` (the value is already resolved). If that state is declared, the step ends in it; " +
      "otherwise it is the fault undeclared-state, and the state the step ends in does not change.",
  },
  Effect: {
    input: EffectInput,
    output: "boolean",
    does:
      "An effect the case may perform, in the order written. The answer is whether it is performed: always when it has no guard " +
      "(`none`); for a guard that is a condition, when that condition's case was chosen (`chosen`); for a guard that is a value, " +
      "when the value (already resolved) is exactly true. An effect that is performed but not declared is the fault undeclared-effect " +
      "(one that is not performed is never a fault).",
  },
  Set: {
    input: DeclaredInput,
    does: "A datum the case remembers. If it is not declared, it is the fault undeclared-data.",
  },
  Fits: {
    input: FitsInput,
    does: "A value the case gives (an effect's input field, a remembered datum, an answer, a field of a new item) has been compared with its declared type. If it does not fit, it is the fault bad-value.",
  },
  Responds: {
    input: RespondsInput,
    does: "The command answers (declares an output). If the case gives no answer, it is the fault missing-responds.",
  },
  RespondField: {
    input: RespondFieldInput,
    does:
      "A field of a record answer. A null value fits only if the field is optional, unless the field takes any value (`anyValue`), " +
      "in which case it fits as the comparison says; a value that is not null fits as the comparison (`fits`) says. If it does not " +
      "fit, it is the fault bad-value.",
  },
  Add: {
    input: ManyInput,
    does: "The case adds an item to a contained component. If that component is not one of many (`many` is false), it is the fault not-many.",
  },
  Key: {
    input: KeyInput,
    does: "The key of the item being added. If an item with that key exists already, it is the fault duplicate-key.",
  },
  AddField: {
    input: DeclaredInput,
    does: "A datum given to the item being added. If the contained component does not declare it, it is the fault undeclared-data.",
  },
  Remove: {
    input: ManyInput,
    does: "The case removes an item from a contained component. If that component is not one of many, it is the fault not-many.",
  },
  End: {
    output: "string",
    does: "Every fact has been given. The answer is the state the step ends in.",
  },
  Call: {
    input: CallInput,
    output: "boolean",
    does:
      "Before the case is chosen, a command of a contained component is called. The answer is whether it is run: not when the " +
      "component is one of many (`keyed`) and no item has the key asked for (`found` is false); in every other case, yes. Nothing is remembered.",
  },
});

export const OutcomeApply = service({
  description: "Applies, for the simulator of a specification, what happens in the chosen case, and finds where it does not fit the declarations.",
  uses: [Data, Effect, Command],
});
