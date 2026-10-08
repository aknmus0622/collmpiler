import { asks, component, description, does, from, goTo, input, otherwise, output, ref, when } from "@clp/core";

// The check of names used by a component's commands (part of packages/cli/src/extract.ts), written as a spec.
// A structured input (commands → cases → references) is not passed as one value but walked by the caller,
// one element per command. What is declared is not remembered here; it is asked of a dependency, by name.
export const ReferenceCheck = component({
  description:
    "Walks the commands of a specification, one element at a time, and reports every reference to a state or an " +
    "effect that is not declared. At the end the walk is accepted if nothing was reported, rejected otherwise.",

  states: ["IDLE", "BETWEEN_COMMANDS", "IN_COMMAND", "IN_CASE", "ACCEPTED", "REJECTED"],
  init: "IDLE",

  // Questions about a name. What is asked about is part of the specification: see `asks` in the commands.
  queries: {
    stateDeclared: component(description("Whether the specification declares a state of this name."), input({ name: "string" }), output("boolean")),
    effectDeclared: component(description("Whether the specification declares an effect of this name."), input({ name: "string" }), output("boolean")),
  },

  effects: {
    ReportDiagnostic: input({
      code: ["unknown-state", "unknown-effect"],
      command: "string",
      caseName: "string",
      subject: "string",
    }),
  },

  commands: {
    Begin: component(from("IDLE"), goTo("BETWEEN_COMMANDS"), does("Nothing has been reported yet.")),

    EnterCommand: component(
      input({ name: "string" }),
      from("BETWEEN_COMMANDS"),
      goTo("IN_COMMAND"),
      does("The walk remembers the command's name, and an empty case name."),
    ),

    // A state listed in the command's `from`. The walk stays where it is.
    AllowFrom: component(
      input({ state: "string" }),
      from("IN_COMMAND"),
      asks("declared", "stateDeclared", { name: ref.input("state") }),
      when(
        "The named state is not declared",
        does(
          "An unknown-state diagnostic is reported for the remembered command, with an empty case name and the state as the subject. " +
            "The walk remembers that something was reported.",
        ),
      ),
      otherwise(),
    ),

    EnterCase: component(input({ name: "string" }), from("IN_COMMAND", "IN_CASE"), goTo("IN_CASE"), does("The walk remembers the case's name.")),

    GoTo: component(
      input({ state: "string" }),
      from("IN_CASE"),
      asks("declared", "stateDeclared", { name: ref.input("state") }),
      when(
        "The named state is not declared",
        does(
          "An unknown-state diagnostic is reported for the remembered command and case, with the state as the subject. " +
            "The walk remembers that something was reported.",
        ),
      ),
      otherwise(),
    ),

    UseEffect: component(
      input({ name: "string" }),
      from("IN_CASE"),
      asks("declared", "effectDeclared", { name: ref.input("name") }),
      when(
        "The named effect is not declared",
        does(
          "An unknown-effect diagnostic is reported for the remembered command and case, with the effect as the subject. " +
            "The walk remembers that something was reported.",
        ),
      ),
      otherwise(),
    ),

    LeaveCommand: component(from("IN_COMMAND", "IN_CASE"), goTo("BETWEEN_COMMANDS")),

    Finish: description("Between commands, the walk can be finished: it is accepted if nothing was reported, rejected otherwise."),
  },
});
