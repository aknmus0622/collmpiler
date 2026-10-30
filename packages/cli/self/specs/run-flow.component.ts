import { does, example, external, init, requires, service } from "@clp/core";
import type { Int } from "@clp/core";

export type EndReason = "passed" | "layer1" | "split-agent" | "interpret-failed" | "interpret-agent" | "person" | "unplaced" | "not-written" | "not-accepted" | "not-verified" | "apply-agent" | "spec" | "rounds";

export const RunDriver = external("The driver: it does what the flow asks for, and answers with a command.", {
  commands: {
    /** Read Layer 1, and answer with Layer1Checked. */
    CheckLayer1() {},
    /** Give the next component worth proposing a split for (Candidate), or NoMoreCandidates. */
    NextCandidate() {},
    /** Ask an agent how to split the candidate, and answer with Proposed. */
    Propose() {},
    /** Show the person the proposed split, and answer with SplitAnswered. */
    AskSplit() {},
    /** Write the accepted split into Layer 1. */
    WriteSplit() {},
    /** Remember that this component stays as it is. */
    Decline() {},
    /** Interpreting begins. */
    StartInterpreting() {},
    /** Interpret the next file that needs it, and answer with Interpreted. */
    Interpret() {},
    /** Read the open questions of the drafts. */
    ReadQuestions() {},
    /** Give the next question (Question), or NoMoreQuestions. */
    NextQuestion() {},
    /** Show the person the question, and answer with QuestionAnswered. */
    AskQuestion() {},
    /** Record that the person confirmed the reading. */
    MarkReviewed() {},
    /** Work out where the supplements go, and answer with SupplementsPlaced. */
    PlaceSupplements() {},
    /** Show the person the change to Layer 1, and answer with SupplementsConfirmed. */
    ConfirmSupplements() {},
    /** Write the supplements into Layer 1. */
    WriteSupplements() {},
    /** The questions of this round are over. */
    QuestionsDone() {},
    /** Accept the interpretations, and answer with Accepted. */
    Accept() {},
    /** Bring the code into agreement with the specs, and answer with Applied. */
    Apply() {},
    /** The run is over, for this reason. */
    Finish(reason: EndReason) {},
  },
});

export const RunFlow = service("Decides how `clp run` proceeds, from the specs to verified code: what to do next, where an answer leads, and how the run ends. Each round reads Layer 1, offers the splits, interprets, and asks the open questions; a round that changed Layer 1 is followed by another, and a round with nothing left to change accepts, applies and ends.", {
  state: {
    status: init<"IDLE" | "CHECKING" | "CANDIDATES" | "PROPOSING" | "SPLIT_ASKED" | "INTERPRETING" | "QUESTIONS" | "QUESTION_ASKED" | "PLACING" | "CONFIRMING" | "ACCEPTING" | "APPLYING" | "DONE">("IDLE"),
    // How many rounds a run may take.
    roundLimit: init<Int | null>(null),
    // The round running.
    round: init<Int>(0),
    // Whether the supplements are written without asking the person.
    writeUnasked: init<boolean>(false),
    // Whether a split was accepted in this round.
    splitAccepted: init<boolean>(false),
    // Whether a question was answered with a supplement in this round.
    supplemented: init<boolean>(false),
  },
  commands: {
    Start(rounds: Int, yes: boolean) {
      requires(rounds >= 1 && rounds <= 10 && this.status === "IDLE");
      does.start("A run starts with the most rounds it may take, and whether supplements are written without asking. The first round starts: if a round would go past the limit, the run finishes with rounds; otherwise its supplement and split marks are cleared and Layer 1 is checked.");
    },
    Layer1Checked(ok: boolean) {
      requires(this.status === "CHECKING");
      does.layer1Checked("If Layer 1 does not read, the run finishes with layer1. Otherwise the next candidate is asked for.");
    },
    Candidate() {
      requires(this.status === "CANDIDATES");
      this.status = "PROPOSING";
      does.candidate("A candidate: an agent is asked how to split it.");
    },
    Proposed(outcome: "none" | "proposal" | "agent-failed") {
      requires(this.status === "PROPOSING");
      does.proposed("With no proposal, the next candidate is asked for. With a proposal, the person is asked. If the agent failed, the run finishes with split-agent.");
    },
    SplitAnswered(answer: "accept" | "decline" | "stop") {
      requires(this.status === "SPLIT_ASKED");
      does.splitAnswered("On stop, the run finishes with person. On accept, the split is written and remembered for this round; on decline, the refusal is recorded. Either way the next candidate is asked for.");
    },
    NoMoreCandidates() {
      requires(this.status === "CANDIDATES");
      does.noMoreCandidates("If a split was accepted in this round, Layer 1 changed: the next round starts (as in Start). Otherwise interpreting starts, and the first file is interpreted.");
    },
    Interpreted(outcome: "up-to-date" | "interpreted" | "failed" | "agent-failed") {
      requires(this.status === "INTERPRETING");
      does.interpreted("If a file was interpreted, the next is. When everything is up to date, the questions are read and the next question is asked for. If interpreting failed, the run finishes with interpret-failed; if the agent failed, with interpret-agent.");
    },
    Question() {
      requires(this.status === "QUESTIONS");
      this.status = "QUESTION_ASKED";
      does.question("A question: the person is asked.");
    },
    QuestionAnswered(answer: "accept" | "supplement" | "stop") {
      requires(this.status === "QUESTION_ASKED");
      does.questionAnswered("On stop, the run finishes with person. On accept, the reading is marked as reviewed; on supplement, that a question was supplemented is remembered for this round. Either way the next question is asked for.");
    },
    NoMoreQuestions() {
      requires(this.status === "QUESTIONS");
      does.noMoreQuestions("If a question was supplemented, the supplements are placed. Otherwise the questions are done, and the interpretations are accepted.");
    },
    SupplementsPlaced(placed: boolean) {
      requires(this.status === "PLACING");
      does.supplementsPlaced("If some supplement has no place, the run finishes with unplaced. If supplements are written unasked, they are written, the questions are done, and the next round starts (as in Start). Otherwise the person is asked to confirm.");
    },
    SupplementsConfirmed(yes: boolean) {
      requires(this.status === "CONFIRMING");
      does.supplementsConfirmed("If the person refuses, the run finishes with not-written. Otherwise the supplements are written, the questions are done, and the next round starts (as in Start).");
    },
    Accepted(ok: boolean) {
      requires(this.status === "ACCEPTING");
      does.accepted("If not everything was accepted, the run finishes with not-accepted. Otherwise the code is brought into agreement.");
    },
    Applied(outcome: "pass" | "fail" | "agent-failed" | "spec-error") {
      requires(this.status === "APPLYING");
      this.status = "DONE";
      does.applied("The run finishes: pass with passed, fail with not-verified, agent-failed with apply-agent, spec-error with spec.");
    },
  },
  examples: {
    aSupplementWithNoPlace: example("A supplement with no sentence to go to ends the run.", () => {
      RunFlow.Start(2, false);
      RunFlow.Layer1Checked(true);
      RunFlow.NoMoreCandidates();
      RunFlow.Interpreted("up-to-date");
      RunFlow.Question();
      RunFlow.QuestionAnswered("supplement");
      RunFlow.NoMoreQuestions();
      RunFlow.SupplementsPlaced(false);
    }),
    theLastRoundWritesUnasked: example("Written unasked in the last round: the run ends for lack of rounds.", () => {
      RunFlow.Start(1, true);
      RunFlow.Layer1Checked(true);
      RunFlow.NoMoreCandidates();
      RunFlow.Interpreted("up-to-date");
      RunFlow.Question();
      RunFlow.QuestionAnswered("supplement");
      RunFlow.NoMoreQuestions();
      RunFlow.SupplementsPlaced(true);
    }),
    thePersonRefusesTheChange: example("The person refuses the change to Layer 1.", () => {
      RunFlow.Start(2, false);
      RunFlow.Layer1Checked(true);
      RunFlow.NoMoreCandidates();
      RunFlow.Interpreted("up-to-date");
      RunFlow.Question();
      RunFlow.QuestionAnswered("supplement");
      RunFlow.NoMoreQuestions();
      RunFlow.SupplementsPlaced(true);
      RunFlow.SupplementsConfirmed(false);
    }),
    theLastRoundIsConfirmed: example("Confirmed in the last round: the run ends for lack of rounds.", () => {
      RunFlow.Start(1, false);
      RunFlow.Layer1Checked(true);
      RunFlow.NoMoreCandidates();
      RunFlow.Interpreted("up-to-date");
      RunFlow.Question();
      RunFlow.QuestionAnswered("supplement");
      RunFlow.NoMoreQuestions();
      RunFlow.SupplementsPlaced(true);
      RunFlow.SupplementsConfirmed(true);
    }),
    aSplitInTheLastRound: example("A split accepted in the last round: the run ends for lack of rounds.", () => {
      RunFlow.Start(1, false);
      RunFlow.Layer1Checked(true);
      RunFlow.Candidate();
      RunFlow.Proposed("proposal");
      RunFlow.SplitAnswered("accept");
      RunFlow.NoMoreCandidates();
    }),
    thePersonStopsAtASplit: example("The person stops at a proposed split.", () => {
      RunFlow.Start(2, false);
      RunFlow.Layer1Checked(true);
      RunFlow.Candidate();
      RunFlow.Proposed("proposal");
      RunFlow.SplitAnswered("stop");
    }),
    thePersonStopsAtAQuestion: example("The person stops at a question.", () => {
      RunFlow.Start(2, false);
      RunFlow.Layer1Checked(true);
      RunFlow.NoMoreCandidates();
      RunFlow.Interpreted("up-to-date");
      RunFlow.Question();
      RunFlow.QuestionAnswered("stop");
    }),
    notAccepted: example("The interpretations cannot be accepted.", () => {
      RunFlow.Start(2, false);
      RunFlow.Layer1Checked(true);
      RunFlow.NoMoreCandidates();
      RunFlow.Interpreted("up-to-date");
      RunFlow.NoMoreQuestions();
      RunFlow.Accepted(false);
    }),
    verified: example("The code passes.", () => {
      RunFlow.Start(2, false);
      RunFlow.Layer1Checked(true);
      RunFlow.NoMoreCandidates();
      RunFlow.Interpreted("up-to-date");
      RunFlow.NoMoreQuestions();
      RunFlow.Accepted(true);
      RunFlow.Applied("pass");
    }),
    notVerified: example("The code does not pass.", () => {
      RunFlow.Start(2, false);
      RunFlow.Layer1Checked(true);
      RunFlow.NoMoreCandidates();
      RunFlow.Interpreted("up-to-date");
      RunFlow.NoMoreQuestions();
      RunFlow.Accepted(true);
      RunFlow.Applied("fail");
    }),
    agentFailed: example("The agent fails while applying.", () => {
      RunFlow.Start(2, false);
      RunFlow.Layer1Checked(true);
      RunFlow.NoMoreCandidates();
      RunFlow.Interpreted("up-to-date");
      RunFlow.NoMoreQuestions();
      RunFlow.Accepted(true);
      RunFlow.Applied("agent-failed");
    }),
    specError: example("The specification is wrong.", () => {
      RunFlow.Start(2, false);
      RunFlow.Layer1Checked(true);
      RunFlow.NoMoreCandidates();
      RunFlow.Interpreted("up-to-date");
      RunFlow.NoMoreQuestions();
      RunFlow.Accepted(true);
      RunFlow.Applied("spec-error");
    }),
  },
});
