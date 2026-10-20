import { commands, data, input, integer, list, optional, queries, record, service, string } from "@clp/core";

// How the simulator of a specification chooses one step (packages/cli/src/choose.ts, used by `simulator` in runtime.ts):
// which commands can be executed now, which of them is executed, and, for the executed command, which of its cases
// happens. The same choice of a case is made wherever a list of conditions picks one (the rows of a decision table, an
// effect's `onlyWhen`). Walking the specification is not this component's job: it is fed the facts one at a time, and it
// asks whether a condition holds; running the meaning of a condition is the caller's (the bridge to meaning functions).
//
// This is a grading component (SELF_HOSTING.md §10.3, R1): what it decides is a value of the oracle's run, so in use it
// must agree with Stage 0 (R4).
export const Query = queries({
  holds: {
    description: "Whether the named condition holds in the situation being considered (for the command being considered, or for the case being chosen).",
    input: { condition: "string" },
    output: "boolean",
  },
});

export const Data = data({
  stepState: { type: "string", initially: "", description: "The state the component is in at this step." },
  enabled: { type: list("string"), initially: [], description: "The commands that can be executed at this step, in the order they were considered." },
  considering: { type: "string", initially: "", description: "The command being considered." },
  possible: { type: "boolean", initially: false, description: "Whether the command being considered can still be executed, as far as the facts given so far say." },
  hits: { type: list("string"), initially: [], description: "The cases whose condition holds, in the order they were given." },
});

const Names = ["OPEN", "DONE", "Add", "Remove", ""];
export const BeginStepInput = input({ state: string({ examples: Names }) });
export const ConsiderInput = input({ command: string({ examples: Names }), everywhere: "boolean" });
export const FromInput = input({ state: string({ examples: Names }) });
export const PathValueInput = input({ value: string({ examples: [".", "..", "x", "..."] }) });
export const ConditionInput = input({ condition: string({ examples: ["paid", "late", "otherwise"] }) });
export const ChooseInput = input({ pick: integer({ min: 0 }), forced: optional(string({ examples: Names })), strict: "boolean" });
export const CaseInput = input({ name: string({ examples: ["paid", "late", "otherwise"] }) });

export const Command = commands({
  BeginStep: {
    input: BeginStepInput,
    does:
      "A new step, from the given state. No command has been considered yet: the commands that can be executed are forgotten. " +
      "The cases given so far (Case) are not forgotten; only BeginCases forgets them.",
  },
  Consider: {
    input: ConsiderInput,
    does:
      "A command is considered next. It can be executed in every state when `everywhere` is true (it names no states it is executed " +
      "from); otherwise only in the states given next (From). The facts about it come in this order: every From, then every " +
      "PathValue, then every OnlyIf, then Considered.",
  },
  From: {
    input: FromInput,
    does: "A state the command being considered can be executed from. If it is the state of this step, the command can be executed (unless a later fact says otherwise).",
  },
  PathValue: {
    input: PathValueInput,
    does:
      "A value the command being considered would put into a path segment of its HTTP route. The values \".\" and \"..\" cannot be " +
      "sent in a path, so the command cannot be executed with them.",
  },
  OnlyIf: {
    input: ConditionInput,
    does:
      "A condition that must hold for the command being considered to be executed. It is asked about (whether it holds) only " +
      "while the command can still be executed as far as the facts so far say; if it does not hold, the command cannot be " +
      "executed. Once the command cannot be executed, later conditions are not asked about.",
  },
  Considered: {
    does:
      "Every fact about the command being considered has been given. If it can be executed, it is added to the commands that can " +
      "be executed at this step (each time Considered is given, even for the same command).",
  },
  Choose: {
    input: ChooseInput,
    output: record({ chosen: optional("string"), refused: "boolean" }),
    does:
      "Which command is executed at this step. When no command is forced: none if no command can be executed; otherwise the one " +
      "at position `pick` modulo their number, counting from 0 in the order they were added. When a command is forced (another " +
      "component called it): that command, whether or not it can be executed; but if `strict` is true and it cannot be executed, " +
      "none is chosen and the call is refused. Refused is false in every other case.",
  },
  BeginCases: {
    does: "A case is chosen next, from the cases given (Case); none has been given yet.",
  },
  Case: {
    input: CaseInput,
    does:
      "A case, named by its condition. The case `otherwise` has no condition and is not asked about; every other case is asked " +
      "about (whether its condition holds), even when another one already holds.",
  },
  DecideCase: {
    output: record({ chosen: optional("string"), conflict: list("string") }),
    does:
      "Which case happens. If exactly one case's condition holds, that case; if none holds, `otherwise` (whether or not it was given). " +
      "If more than one holds, none is chosen and the conflict lists those cases in the order given; otherwise the conflict is empty.",
  },
});

export const StepChoice = service({
  description: "Chooses, for the simulator of a specification, the command executed at a step and the case that happens.",
  uses: [Query, Data, Command],
});
