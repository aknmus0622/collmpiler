import { answer, decisions, does, external, failed, init, is, otherwise, requires, service, value } from "@clp/core/v1";
import type { Int, Json } from "@clp/core/v1";

export const InterpretDriver = external("The driver: it does what the flow asks for, and answers with a command.", {
  commands: {
    /** Give the next component (Consider), or NoMoreComponents if there is none. */
    ConsiderNext() {},
    /** Check the current interpretation of the component being considered, and answer with CurrentChecked. */
    CheckCurrent() {},
    /** Run an attempt of an interpretation session, and answer with SessionChecked. `mode`: from a skeleton, from the current interpretation (update), or from a skeleton with the first session's vocabulary fixed (pinned). */
    StartSession(session: Int, attempt: Int, mode: "skeleton" | "update" | "pinned") {},
    /** Compare the interpretation of this session with the first one, and answer with Compared. */
    Compare(session: Int) {},
    /** This session could not be compared (it found no interpretation that passed). */
    RecordUncompared(session: Int) {},
    /** Interpreting is over, with this outcome. */
    Finish(status: "up-to-date" | "interpreted" | "failed") {},
    /** Check the draft (or the re-stamped interpretation) of the component being accepted, and answer with DraftChecked. */
    CheckDraft() {},
    /** Accept it: the draft becomes the interpretation, stamped with the current Layer 1. */
    Accept() {},
    /** The component is not accepted, for this reason. */
    RefuseAccepting(reason: "no-interpretation" | "open-reviews" | "does-not-fit") {},
    /** Give the next component to accept (ConsiderAccepting), or EndRound if there is none in this round. */
    NextToAccept() {},
    /** Run another round over the components that were not accepted. */
    RetryRefused() {},
    /** Accepting is over. */
    AcceptingDone() {},
  },
});

export const InterpretFlow = service("Decides how `clp interpret` proceeds: which component to interpret and from what, how sessions and attempts follow each other and when sessions are compared; and for `clp interpret --accept`, which drafts are accepted, round after round.", {
  state: {
    status: init<"IDLE" | "CHOOSING" | "CHECKING" | "SESSIONS" | "DONE" | "ACCEPTING" | "VERIFYING" | "ACCEPTED">("IDLE"),
    // How many sessions interpret the component (the first is kept as the draft; the others are compared with it).
    sessionCount: init<Int | null>(null),
    // How many attempts a session has before it gives up.
    attemptLimit: init<Int | null>(null),
    // The session running (1 is the one kept as the draft).
    runningSession: init<Int | null>(null),
    // Its attempt.
    runningAttempt: init<Int | null>(null),
    // Whether the chosen component starts from its current interpretation (rather than from a skeleton).
    startsFromCurrent: init<boolean | null>(null),
    // Whether some component was accepted in the accepting round being run.
    acceptedInRound: init<boolean>(false),
    // Whether some component could not be accepted in the accepting round being run.
    failedInRound: init<boolean>(false),
  },
  commands: {
    Start(sessions: Int, maxAttempts: Int) {
      requires(sessions >= 1 && sessions <= 3 && maxAttempts >= 1 && maxAttempts <= 3 && this.status === "IDLE");
      this.status = "CHOOSING";
      does.start("Interpreting starts with the number of sessions and of attempts per session. The first component is asked for.");
    },
    Consider(hasCurrent: boolean) {
      requires(this.status === "CHOOSING");
      does.consider("A component, in name order. A component without an interpretation (neither a draft nor an accepted one) is chosen, to be interpreted from a skeleton: its first session starts (attempt 1). A component with one has it checked first.");
    },
    CurrentChecked(passed: boolean) {
      requires(this.status === "CHECKING");
      does.currentChecked("If the current interpretation passed the check, nothing is to be done for this component: the next one is asked for. Otherwise the component is chosen, to be interpreted from its current interpretation (update): its first session starts.");
    },
    NoMoreComponents() {
      requires(this.status === "CHOOSING");
      this.status = "DONE";
      does.noMoreComponents("Every component's interpretation fits: interpreting finishes as up-to-date.");
    },
    SessionChecked(outcome: "ok" | "missing" | "foreign-change" | "check-failed" | "boundary-changed", hasModel: boolean) {
      requires(this.status === "SESSIONS");
      does.sessionChecked("An attempt of the running session is over. If it was not ok and attempts remain, the next attempt of the same session starts, in the same mode. If the first session ends without an ok attempt, interpreting finishes as failed. When the first session is ok: with one session, or when it gave no vocabulary (hasModel false), interpreting finishes as interpreted; otherwise the second session starts (attempt 1, pinned). When a later session is ok, it is compared with the first. When a later session ends without an ok attempt, it is recorded as uncompared, and the next session starts (pinned), or, after the last one, interpreting finishes as interpreted.");
    },
    Compared(ok: boolean) {
      requires(this.status === "SESSIONS");
      does.compared("A later session has been compared (ok or not, it counts as done). The next session starts (pinned), or, after the last one, interpreting finishes as interpreted.");
    },
    StartAccepting() {
      requires(this.status === "IDLE");
      this.status = "ACCEPTING";
      does.startAccepting("Accepting starts: a round over every component. The first component is asked for.");
    },
    ConsiderAccepting(hasDraft: boolean, hasInterpretation: boolean, openReviews: Int, stampCurrent: boolean) {
      requires(openReviews >= 0 && openReviews <= 10 && this.status === "ACCEPTING");
      does.considerAccepting("A component to accept. Without a draft or an interpretation, it is refused (no-interpretation). If its draft (or, without a draft, its interpretation) has questions or disagreements left open, it is refused (open-reviews). Without a draft, an interpretation whose stamp is already the current Layer 1 needs nothing: the next component is asked for. Otherwise it is checked. Every refusal counts as a component that could not be accepted in this round, and the next component is asked for.");
    },
    DraftChecked(passed: boolean) {
      requires(this.status === "VERIFYING");
      this.status = "ACCEPTING";
      does.draftChecked("If it passed, it is accepted, which counts as a component accepted in this round; otherwise it is refused (does-not-fit), which counts as one that could not be accepted. The next component is asked for.");
    },
    EndRound() {
      requires(this.status === "ACCEPTING");
      does.endRound("The round is over. If some component could not be accepted and some was accepted in this round (a component that contains another may fit only once the other is accepted), another round runs over those that could not be accepted, starting again with nothing accepted or refused in it. Otherwise accepting is over.");
    },
  },
});
