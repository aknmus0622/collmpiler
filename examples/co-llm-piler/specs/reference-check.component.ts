import { component, compose, description, does, from, goTo, input, otherwise, when } from "@clp/core";

// The check of names used by a component's commands (part of packages/cli/src/extract.ts), written as a spec.
// A structured input (commands → cases → references) is not passed as one value but walked by the caller,
// one element per command. What is declared is not remembered here; it is asked of a dependency.
export const ReferenceCheck = component({
  description:
    "Walks the commands of a specification, one element at a time, and reports every reference to a state or an " +
    "effect that is not declared. At the end the walk is accepted if nothing was reported, rejected otherwise.",

  states: ["IDLE", "BETWEEN_COMMANDS", "IN_COMMAND", "IN_CASE", "ACCEPTED", "REJECTED"],
  init: "IDLE",

  // Answers about the name carried by the command being handled
  queries: {
    stateDeclared: "boolean",
    effectDeclared: "boolean",
  },

  effects: {
    ReportDiagnostic: {
      code: ["unknown-state", "unknown-effect"],
      command: "string",
      caseName: "string",
      subject: "string",
    },
  },

  commands: {
    Begin: compose(from("IDLE"), goTo("BETWEEN_COMMANDS"), does("The error count starts at 0.")),

    EnterCommand: compose(
      input({ name: "string" }),
      from("BETWEEN_COMMANDS"),
      goTo("IN_COMMAND"),
      does("The walk remembers the command's name, and an empty case name."),
    ),

    // A state listed in the command's `from`. The walk stays where it is.
    AllowFrom: compose(
      input({ state: "string" }),
      from("IN_COMMAND"),
      when(
        "The named state is not declared",
        does(
          "An unknown-state diagnostic is reported for the remembered command, with an empty case name and the state as the subject. " +
            "The error count goes up by one.",
        ),
      ),
      otherwise(),
    ),

    EnterCase: compose(input({ name: "string" }), from("IN_COMMAND", "IN_CASE"), goTo("IN_CASE"), does("The walk remembers the case's name.")),

    GoTo: compose(
      input({ state: "string" }),
      from("IN_CASE"),
      when(
        "The named state is not declared",
        does(
          "An unknown-state diagnostic is reported for the remembered command and case, with the state as the subject. " +
            "The error count goes up by one.",
        ),
      ),
      otherwise(),
    ),

    UseEffect: compose(
      input({ name: "string" }),
      from("IN_CASE"),
      when(
        "The named effect is not declared",
        does(
          "An unknown-effect diagnostic is reported for the remembered command and case, with the effect as the subject. " +
            "The error count goes up by one.",
        ),
      ),
      otherwise(),
    ),

    LeaveCommand: compose(from("IN_COMMAND", "IN_CASE"), goTo("BETWEEN_COMMANDS")),

    Finish: description("Between commands, the walk can be finished: it is accepted if no error was counted, rejected otherwise."),
  },
});
