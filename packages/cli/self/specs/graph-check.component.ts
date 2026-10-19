import { among, commands, data, effects, input, list, queries, service, states } from "@clp/core";

// The graph check (packages/cli/src/graph.ts): what follows from the written structure of a specification alone, without
// running it. The walk over the specification is not this component's job: it is fed one fact after another, and it asks
// whether a state is declared. It reports what it finds; the wording is added by the framework.
export const State = states({
  IDLE: "Nothing has been checked yet.",
  REACHING: "The states that can be reached from the initial state are being found, one round over the transitions at a time.",
  JUDGING: "The reachable states are known; states, commands and the vocabulary are being judged one by one.",
});

// What the check remembers between facts
export const Data = data({
  reached: { type: list("string"), description: "The states reached so far, in the order they were reached (the initial state first)." },
  foundNew: { type: "boolean", description: "Whether the current round has found something new." },
  strictCheck: { type: "boolean", description: "Whether the check is strict." },
  finalsAreDeclared: { type: "boolean", description: "Whether the specification declares final states." },
  commandName: { type: "string", description: "The command being judged." },
  allFromDeclared: { type: "boolean", description: "Whether every state given so far for the command being judged is declared." },
  anyFromReached: { type: "boolean", description: "Whether some state given so far for the command being judged is reached." },
  exitState: { type: "string", description: "The state being judged for whether it can be left." },
  exitFinal: { type: "boolean", description: "Whether the state being judged is final." },
  left: { type: "boolean", description: "Whether a transition given so far leaves the state being judged." },
});

export const Query = queries({
  stateDeclared: { description: "Whether the specification declares a state with this name.", input: input({ name: "string" }), output: "boolean" },
});

export const Effect = effects({
  RunRound: "Feed every transition (Edge) once more, then RoundEnd.",
  ReachingDone: "The reachable states are known: feed the states, the commands, the exits and the vocabulary to be judged.",
  Report: {
    description: "Something is reported about the specification: what it is, about which name, and how serious it is.",
    input: input({
      code: ["unreachable-state", "unreachable-command", "dead-end-state", "unused-effect", "unset-data", "unasked-query"],
      subject: "string",
      severity: ["error", "warning"],
    }),
  },
});

export const BeginInput = input({ init: "string", strict: "boolean", finalsDeclared: "boolean" });
// The names given are usually states reached so far (the walk gives the states of the specification)
export const EdgeInput = input({ from: among(Data.reached), to: "string" });
export const StateInput = input({ name: among(Data.reached) });
export const CommandInput = input({ name: "string" });
export const FromInput = input({ state: among(Data.reached) });
export const ExitsInput = input({ state: among(Data.reached), final: "boolean" });
export const VocabularyInput = input({ group: ["effects", "data", "queries"], name: "string", used: "boolean", listed: "boolean", takesInput: "boolean" });

export const Command = commands({
  Begin: {
    input: BeginInput,
    from: State.IDLE,
    goTo: State.REACHING,
    does:
      "A specification is checked. Only its initial state is reached so far (it counts as reached whether or not it is declared). " +
      "Whether the check is strict and whether the " +
      "specification declares final states are remembered. A first round over the transitions is asked for.",
  },
  Edge: {
    input: EdgeInput,
    from: State.REACHING,
    does:
      "A transition: a command that can be executed in the state `from` can go to the state `to`. If `from` is reached (declared " +
      "or not) and `to` is a declared state (as the dependency answers for `to`; any name, the empty one included, can be declared) " +
      "that is not reached yet, `to` becomes reached, and the round has found something new. Nothing else changes.",
  },
  RoundEnd: {
    from: State.REACHING,
    does:
      "The round is over. If it found something new, another round is asked for (and the next round starts having found nothing). " +
      "Otherwise the reachable states are known: the check moves on to judging, and says so.",
  },
  CheckState: {
    input: StateInput,
    from: State.JUDGING,
    does: "One of the declared states (only declared states are given here). If it is not reached, it is reported as unreachable-state, an error, about that state.",
  },
  BeginCommand: { input: CommandInput, from: State.JUDGING, does: "A command is judged next: the states it can be executed in follow." },
  From: {
    input: FromInput,
    from: State.JUDGING,
    does: "One state the command can be executed in. Whether it is declared, and whether it is reached (declared or not), is taken into account. It always follows a BeginCommand.",
  },
  EndCommand: {
    from: State.JUDGING,
    does:
      "If every state the command can be executed in is declared (which holds when there is none), and none of them is reached, " +
      "the command is reported as unreachable-command, an error, about that command. An undeclared state is reported elsewhere. " +
      "EndCommand always follows a BeginCommand.",
  },
  BeginExits: { input: ExitsInput, from: State.JUDGING, does: "A state is judged for whether it can be left: the transitions follow." },
  Exit: { input: EdgeInput, from: State.JUDGING, does: "A transition. It leaves the state being judged if it goes from that state to a different state." },
  EndExits: {
    from: State.JUDGING,
    does:
      "Only if the specification declares final states: a reached state that is not final and that no transition leaves is " +
      "reported as dead-end-state, an error, about that state. EndExits always follows a BeginExits.",
  },
  Vocabulary: {
    input: VocabularyInput,
    from: State.JUDGING,
    does:
      "An entry of the vocabulary, with whether it is used (an effect emitted, data set or given by a containing component, a " +
      "query asked), whether Layer 1 lists it, and whether it takes an input. An effect that is not used is reported as " +
      "unused-effect, data that is not used as unset-data, and a query that takes an input and is not used as unasked-query; " +
      "a query without input is never reported. What is reported is a warning, except in a strict check, where an entry " +
      "Layer 1 does not list (the interpretation added it) is an error; an entry Layer 1 lists stays a warning even then.",
  },
});

export const GraphCheck = service({
  description:
    "Checks what follows from the written structure of a specification: states that cannot be reached from the initial state, " +
    "commands that can never be executed, states that cannot be left, and vocabulary that is never used.",
  init: State.IDLE,
  uses: [State, Data, Query, Effect, Command],
});
