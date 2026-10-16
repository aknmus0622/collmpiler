import { commands, conditions, effects, input, otherwise, queries, service, states } from "@clp/core";
export const If = conditions({
  namedStateNotDeclared: "The named state is not declared",
  namedEffectNotDeclared: "The named effect is not declared",
});

export const State = states(["IDLE", "BETWEEN_COMMANDS", "IN_COMMAND", "IN_CASE", "ACCEPTED", "REJECTED"]);

export const Query = queries({
  stateDeclared: { description: "Whether the specification declares a state of this name.", input: input({ name: "string" }), output: "boolean" },
  effectDeclared: { description: "Whether the specification declares an effect of this name.", input: input({ name: "string" }), output: "boolean" },
});

export const Effect = effects({
  ReportDiagnostic: input({
    code: ["unknown-state", "unknown-effect"],
    command: "string",
    caseName: "string",
    subject: "string",
  }),
});

export const EnterCommandInput = input({ name: "string" });

export const AllowFromInput = input({ state: "string" });

export const EnterCaseInput = input({ name: "string" });

export const GoToInput = input({ state: "string" });

export const UseEffectInput = input({ name: "string" });

// The check of names used by a component's commands (part of packages/cli/src/extract.ts), written as a spec.
// A structured input (commands → cases → references) is not passed as one value but walked by the caller,
// one element per command. What is declared is not remembered here; it is asked of a dependency, by name.
export const Command = commands({
  Begin: { from: State.IDLE, goTo: State.BETWEEN_COMMANDS, does: "Nothing has been reported yet." },

  EnterCommand: {
    input: EnterCommandInput,
    from: State.BETWEEN_COMMANDS,
    goTo: State.IN_COMMAND,
    does: "The walk remembers the command's name, and an empty case name.",
  },

  // A state listed in the command's `from`. The walk stays where it is.
  AllowFrom: {
    input: AllowFromInput,
    from: State.IN_COMMAND,
    asks: [Query.stateDeclared({ name: AllowFromInput.state }).as("declared")],
    cases: [
      If.namedStateNotDeclared.then({
        does:
          "An unknown-state diagnostic is reported for the remembered command, with an empty case name and the state as the subject. " +
          "The walk remembers that something was reported.",
      }),
      otherwise,
    ],
  },

  EnterCase: { input: EnterCaseInput, from: [State.IN_COMMAND, State.IN_CASE], goTo: State.IN_CASE, does: "The walk remembers the case's name." },

  GoTo: {
    input: GoToInput,
    from: State.IN_CASE,
    asks: [Query.stateDeclared({ name: GoToInput.state }).as("declared")],
    cases: [
      If.namedStateNotDeclared.then({
        does:
          "An unknown-state diagnostic is reported for the remembered command and case, with the state as the subject. " +
          "The walk remembers that something was reported.",
      }),
      otherwise,
    ],
  },

  UseEffect: {
    input: UseEffectInput,
    from: State.IN_CASE,
    asks: [Query.effectDeclared({ name: UseEffectInput.name }).as("declared")],
    cases: [
      If.namedEffectNotDeclared.then({
        does:
          "An unknown-effect diagnostic is reported for the remembered command and case, with the effect as the subject. " +
          "The walk remembers that something was reported.",
      }),
      otherwise,
    ],
  },

  LeaveCommand: { from: [State.IN_COMMAND, State.IN_CASE], goTo: State.BETWEEN_COMMANDS },

  Finish: "Between commands, the walk can be finished: it is accepted if nothing was reported, rejected otherwise.",
});

export const ReferenceCheck = service({
  description:
    "Walks the commands of a specification, one element at a time, and reports every reference to a state or an " +
    "effect that is not declared. At the end the walk is accepted if nothing was reported, rejected otherwise.",
  init: State.IDLE,
  // Questions about a name. What is asked about is part of the specification: see `asks` in the commands.
  uses: [State, Query, Effect, If, Command],
});
