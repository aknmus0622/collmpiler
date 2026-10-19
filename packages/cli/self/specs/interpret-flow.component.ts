import { commands, data, effects, input, integer, service, states } from "@clp/core";

// How `clp interpret` proceeds (packages/cli/src/interpret.ts), as a state machine: which component is interpreted, from
// what, how many attempts and sessions, when the sessions are compared, and, for `clp interpret --accept`, whether a draft
// is accepted. The procedure turned inside out: this component asks for work with effects (check an interpretation, run a
// session, compare two interpretations, accept a draft), and the driver does the work and answers with a command.
export const State = states({
  IDLE: "Nothing is being done.",
  CHOOSING: "Components are being looked at in order, to find the first one whose interpretation is missing or does not fit.",
  CHECKING: "The current interpretation of a component is being checked.",
  SESSIONS: "Interpretation sessions are running.",
  DONE: { description: "Interpreting is over.", final: true },
  ACCEPTING: "Drafts are being accepted, one component after another, round after round.",
  VERIFYING: "A draft (or a re-stamped interpretation) is being checked before it is accepted.",
  ACCEPTED: { description: "Accepting is over.", final: true },
});

const Count = integer({ min: 1, max: 3 });

export const Data = data({
  sessionCount: { type: Count, description: "How many sessions interpret the component (the first is kept as the draft; the others are compared with it)." },
  attemptLimit: { type: Count, description: "How many attempts a session has before it gives up." },
  runningSession: { type: Count, description: "The session running (1 is the one kept as the draft)." },
  runningAttempt: { type: Count, description: "Its attempt." },
  startsFromCurrent: { type: "boolean", description: "Whether the chosen component starts from its current interpretation (rather than from a skeleton)." },
  acceptedInRound: { type: "boolean", initially: false, description: "Whether some component was accepted in the accepting round being run." },
  failedInRound: { type: "boolean", initially: false, description: "Whether some component could not be accepted in the accepting round being run." },
});

export const Effect = effects({
  ConsiderNext: "Give the next component (Consider), or NoMoreComponents if there is none.",
  CheckCurrent: "Check the current interpretation of the component being considered, and answer with CurrentChecked.",
  StartSession: {
    description: "Run an attempt of an interpretation session, and answer with SessionChecked. `mode`: from a skeleton, from the current interpretation (update), or from a skeleton with the first session's vocabulary fixed (pinned).",
    input: input({ session: Count, attempt: integer({ min: 1, max: 3 }), mode: ["skeleton", "update", "pinned"] }),
  },
  Compare: { description: "Compare the interpretation of this session with the first one, and answer with Compared.", input: input({ session: Count }) },
  RecordUncompared: { description: "This session could not be compared (it found no interpretation that passed).", input: input({ session: Count }) },
  Finish: { description: "Interpreting is over, with this outcome.", input: input({ status: ["up-to-date", "interpreted", "failed"] }) },
  CheckDraft: "Check the draft (or the re-stamped interpretation) of the component being accepted, and answer with DraftChecked.",
  Accept: "Accept it: the draft becomes the interpretation, stamped with the current Layer 1.",
  RefuseAccepting: {
    description: "The component is not accepted, for this reason.",
    input: input({ reason: ["no-interpretation", "open-reviews", "does-not-fit"] }),
  },
  NextToAccept: "Give the next component to accept (ConsiderAccepting), or EndRound if there is none in this round.",
  RetryRefused: "Run another round over the components that were not accepted.",
  AcceptingDone: "Accepting is over.",
});

export const StartInput = input({ sessions: Count, maxAttempts: Count });
export const ConsiderInput = input({ hasCurrent: "boolean" });
export const CheckedInput = input({ passed: "boolean" });
export const SessionInput = input({ outcome: ["ok", "missing", "foreign-change", "check-failed", "boundary-changed"], hasModel: "boolean" });
export const ComparedInput = input({ ok: "boolean" });
export const ConsiderAcceptingInput = input({ hasDraft: "boolean", hasInterpretation: "boolean", openReviews: integer({ min: 0, max: 10 }), stampCurrent: "boolean" });

export const Command = commands({
  Start: {
    input: StartInput,
    from: State.IDLE,
    goTo: State.CHOOSING,
    does: "Interpreting starts with the number of sessions and of attempts per session. The first component is asked for.",
  },
  Consider: {
    input: ConsiderInput,
    from: State.CHOOSING,
    does:
      "A component, in name order. A component without an interpretation (neither a draft nor an accepted one) is chosen, to be " +
      "interpreted from a skeleton: its first session starts (attempt 1). A component with one has it checked first.",
  },
  CurrentChecked: {
    input: CheckedInput,
    from: State.CHECKING,
    does:
      "If the current interpretation passed the check, nothing is to be done for this component: the next one is asked for. " +
      "Otherwise the component is chosen, to be interpreted from its current interpretation (update): its first session starts.",
  },
  NoMoreComponents: { from: State.CHOOSING, goTo: State.DONE, does: "Every component's interpretation fits: interpreting finishes as up-to-date." },
  SessionChecked: {
    input: SessionInput,
    from: State.SESSIONS,
    does:
      "An attempt of the running session is over. If it was not ok and attempts remain, the next attempt of the same session " +
      "starts, in the same mode. If the first session ends without an ok attempt, interpreting finishes as failed. When the first " +
      "session is ok: with one session, or when it gave no vocabulary (hasModel false), interpreting finishes as interpreted; " +
      "otherwise the second session starts (attempt 1, pinned). When a later session is ok, it is compared with the first. When a " +
      "later session ends without an ok attempt, it is recorded as uncompared, and the next session starts (pinned), or, after the " +
      "last one, interpreting finishes as interpreted.",
  },
  Compared: {
    input: ComparedInput,
    from: State.SESSIONS,
    does: "A later session has been compared (ok or not, it counts as done). The next session starts (pinned), or, after the last one, interpreting finishes as interpreted.",
  },
  StartAccepting: { from: State.IDLE, goTo: State.ACCEPTING, does: "Accepting starts: a round over every component. The first component is asked for." },
  ConsiderAccepting: {
    input: ConsiderAcceptingInput,
    from: State.ACCEPTING,
    does:
      "A component to accept. Without a draft or an interpretation, it is refused (no-interpretation). If its draft (or, without a " +
      "draft, its interpretation) has questions or disagreements left open, it is refused (open-reviews). Without a draft, an " +
      "interpretation whose stamp is already the current Layer 1 needs nothing: the next component is asked for. Otherwise it is " +
      "checked. Every refusal counts as a component that could not be accepted in this round, and the next component is asked for.",
  },
  DraftChecked: {
    input: CheckedInput,
    from: State.VERIFYING,
    goTo: State.ACCEPTING,
    does:
      "If it passed, it is accepted, which counts as a component accepted in this round; otherwise it is refused (does-not-fit), " +
      "which counts as one that could not be accepted. The next component is asked for.",
  },
  EndRound: {
    from: State.ACCEPTING,
    does:
      "The round is over. If some component could not be accepted and some was accepted in this round (a component that contains " +
      "another may fit only once the other is accepted), another round runs over those that could not be accepted, starting again " +
      "with nothing accepted or refused in it. Otherwise accepting is over.",
  },
});

export const InterpretFlow = service({
  description:
    "Decides how `clp interpret` proceeds: which component to interpret and from what, how sessions and attempts follow each " +
    "other and when sessions are compared; and for `clp interpret --accept`, which drafts are accepted, round after round.",
  init: State.IDLE,
  uses: [State, Data, Effect, Command],
});
