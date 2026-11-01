import { readFileSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { implement } from "./loop.ts";
import type { ImplementOptions } from "./loop.ts";
import type { ImplementationStrategy } from "./strategy.ts";
import { AgentFailure } from "./strategy.ts";
import { FrameworkError } from "./v1/decide.ts";
import { accept8, interpret8 } from "./v1/interpret.ts";
import { readProgram } from "./v1/read.ts";
import type { Unit } from "./v1/read.ts";
import { candidatesOf, proposeSplit, splitChange } from "./v1/split.ts";
import type { SplitPart, SplitProposal } from "./v1/split.ts";
import { anchorOf, diffOf, supplementAll } from "./v1/supplement.ts";
import type { Review } from "./v1/supplement.ts";

// `clp run` (DSL.md §17.19): one run from the specs to verified code. Where to start is read from the state of the
// specs and the output, never from a mode: a large component only of sentences, never interpreted → propose how to
// split it; an interpretation missing or stale → interpret; a draft with open review marks → ask the person; every
// interpretation reviewed → accept, then `clp apply` (whose phases `planOf` decides). Into Layer 1 go the person's
// answers, in their own words (v1/supplement.ts), and a split they saw and accepted (v1/split.ts).
//
// What is done is in `stepsOf`, with no decisions; what comes next is decided by run-flow (Stage 1, generated from the
// framework's own spec) when it can be used, otherwise by `runStage0`.

export type RunResult = "passed" | "stopped" | "failed";
export type Choice = "accept" | "supplement" | "decline" | "stop";
export type QuestionEvent = {
  type: "question";
  id: string;
  kind: "review" | "difference" | "split";
  component: string;
  where: string;
  text: string;
  choices: Choice[];
  /** A proposed split: what it makes, and the change to Layer 1 (accepting writes it: nothing more is confirmed). */
  arrangement?: SplitProposal["arrangement"];
  parts?: SplitPart[];
  diff?: string;
};
export type ConfirmEvent = { type: "confirm"; id: string; diff: string };
export type RunEvent =
  | { type: "step"; step: "check" | "split" | "interpret" | "questions" | "accept" | "apply"; status: "start" | "done" }
  | QuestionEvent
  | ConfirmEvent
  | { type: "diagnostic"; severity: "error" | "warning"; code: string; where: string; message: string }
  | { type: "end"; result: RunResult; reason?: string };
/** An answer: to a question (`accept`, `supplement` with `text`, `decline`, `stop`) or to a confirmation (`yes`, `no`). */
export type Answer = { id: string; answer: string; text?: string };

/** How a run talks to the person: a terminal, JSON lines, or a test. `ask` gives undefined when the input is closed. */
export type Talk = { emit(event: RunEvent): void; ask(event: QuestionEvent | ConfirmEvent): Promise<Answer | undefined> };

export type RunOptions = Omit<ImplementOptions, "strategy" | "log" | "drafts" | "from" | "stopAfter" | "fresh"> & {
  strategy: ImplementationStrategy;
  talk: Talk;
  /** Independent interpretations compared (default 2). */
  sessions?: number;
  /** Write the supplements without asking. */
  yes?: boolean;
  log?: (line: string) => void;
};

// a run that keeps getting new questions stops here (each round is one interpretation and the person's answers)
const MAX_ROUNDS = 10;
const INTERPRETATION_FILE = /\.interpretation(\.draft)?\.ts$/;

/** Why a run ended (what the person is told is in `MESSAGES`). */
export type EndReason = "passed" | "layer1" | "split-agent" | "interpret-failed" | "interpret-agent" | "person" | "unplaced" | "not-written" | "not-accepted" | "not-verified" | "apply-agent" | "spec" | "rounds";
const MESSAGES: Record<Exclude<EndReason, "passed" | "split-agent" | "interpret-agent" | "apply-agent">, string> = {
  layer1: "Layer 1 に誤りがあります。直してから、もう一度実行してください",
  "interpret-failed": "解釈を導けませんでした",
  person: "止めました。Layer 1 を直してから、もう一度実行すると、続きから進みます",
  unplaced: "補足を書き足せませんでした。Layer 1 を直してから、もう一度実行してください",
  "not-written": "Layer 1 に書き込みませんでした",
  "not-accepted": "解釈を確定できませんでした",
  "not-verified": "実装が検証に通りませんでした",
  spec: "仕様に誤りがあります。Layer 1 を直してから、もう一度実行してください",
  rounds: `疑問への応答を ${MAX_ROUNDS} 回繰り返しても、解釈を確定できませんでした`,
};
const FRAMEWORK_MESSAGE = "clp 自身の不具合です。仕様を直しても解決しません。上の内容を添えて、clp の不具合として報告してください";
const RESULTS: Record<EndReason, RunResult> = {
  passed: "passed",
  layer1: "stopped",
  "split-agent": "failed",
  "interpret-failed": "failed",
  "interpret-agent": "failed",
  person: "stopped",
  unplaced: "stopped",
  "not-written": "stopped",
  "not-accepted": "stopped",
  "not-verified": "failed",
  "apply-agent": "failed",
  spec: "stopped",
  rounds: "stopped",
};

export type Interpreted = "up-to-date" | "interpreted" | "failed" | "agent-failed";
export type Proposed = "none" | "proposal" | "agent-failed";
export type Applied = "pass" | "fail" | "agent-failed" | "spec-error";

/** What a run does. No step decides what comes next. */
function stepsOf(options: RunOptions) {
  const { talk } = options;
  const log = options.log ?? (() => {});
  const specsDir = resolve(process.cwd(), options.specs);
  let counter = 0;
  const nextId = (prefix: string) => `${prefix}${++counter}`;
  let agentMessage: string | undefined;
  const declined = new Set<string>();
  let candidates: Unit[] = [];
  let candidate: Unit | undefined;
  let proposal: SplitProposal | undefined;
  let change: ReturnType<typeof splitChange> | undefined;
  let splitting = false;
  let program = readProgram(specsDir, { drafts: true });
  let reviews: Review[] = [];
  let review: Review | undefined;
  let question = false;
  let supplements: { review: Review; words: string }[] = [];
  let written: Map<string, string> = new Map();
  let diff = "";

  return {
    check(): boolean {
      talk.emit({ type: "step", step: "check", status: "start" });
      // what the interpretation cannot fix: Layer 1 that does not read
      const errors = readProgram(specsDir).problems.filter((p) => p.severity === "error" && !(p.at && INTERPRETATION_FILE.test(p.at.file)));
      for (const p of errors) talk.emit({ type: "diagnostic", severity: p.severity, code: p.code, where: p.where, message: p.message });
      if (errors.length > 0) return false;
      talk.emit({ type: "step", step: "check", status: "done" });
      candidates = candidatesOf(readProgram(specsDir, { drafts: true })).filter((unit) => !declined.has(unit.id));
      return true;
    },
    nextCandidate(): boolean {
      candidate = candidates.shift();
      if (candidate && !splitting) {
        splitting = true;
        talk.emit({ type: "step", step: "split", status: "start" });
      }
      if (!candidate && splitting) {
        splitting = false;
        talk.emit({ type: "step", step: "split", status: "done" });
      }
      return candidate !== undefined;
    },
    async propose(): Promise<Proposed> {
      try {
        const proposed = await proposeSplit(candidate!, specsDir, { strategy: options.strategy, maxAttempts: options.maxAttempts, log });
        // a proposal is an aid: without a usable one, the component stays as it is
        if (proposed.problems !== undefined) talk.emit({ type: "diagnostic", severity: "warning", code: "split-failed", where: candidate!.id, message: `分け方の提案を読めなかったので、分けずに進みます: ${proposed.problems}` });
        proposal = proposed.proposal;
        return proposal ? "proposal" : "none";
      } catch (error) {
        if (!(error instanceof AgentFailure)) throw error;
        agentMessage = error.message;
        return "agent-failed";
      }
    },
    async askSplit(): Promise<"accept" | "decline" | "stop"> {
      change = splitChange(candidate!, proposal!);
      const answer = await askUntil(
        talk,
        {
          type: "question",
          id: nextId("s"),
          kind: "split",
          component: candidate!.id,
          where: `${relative(process.cwd(), candidate!.file)}:${candidate!.at.line}`,
          text: proposal!.description,
          choices: ["accept", "decline", "stop"],
          arrangement: proposal!.arrangement,
          parts: proposal!.parts,
          diff: change.diff,
        },
        (a) => a.answer === "accept" || a.answer === "decline" || a.answer === "stop",
      );
      return (answer?.answer ?? "stop") as "accept" | "decline" | "stop";
    },
    writeSplit() {
      writeFileSync(change!.file, change!.text);
    },
    decline() {
      declined.add(candidate!.id);
    },
    startInterpreting() {
      talk.emit({ type: "step", step: "interpret", status: "start" });
    },
    /** One file's interpretation (one per call). */
    async interpret(): Promise<Interpreted> {
      try {
        const interpreted = await interpret8({ specs: options.specs, strategy: options.strategy, sessions: options.sessions ?? 2, assets: options.assets, maxAttempts: options.maxAttempts, log });
        if (interpreted.status === "up-to-date") talk.emit({ type: "step", step: "interpret", status: "done" });
        if (interpreted.status === "failed") talk.emit({ type: "diagnostic", severity: "error", code: "interpretation-failed", where: interpreted.component, message: interpreted.problems ?? "解釈を導けませんでした" });
        return interpreted.status;
      } catch (error) {
        if (!(error instanceof AgentFailure)) throw error;
        agentMessage = error.message;
        return "agent-failed";
      }
    },
    /** The questions of every draft, asked together: one confirmation and one new interpretation for all the answers. */
    readQuestions() {
      program = readProgram(specsDir, { drafts: true });
      reviews = [...program.reviews];
      supplements = [];
      question = false;
    },
    nextQuestion(): boolean {
      review = reviews.shift();
      if (review && !question) {
        question = true;
        talk.emit({ type: "step", step: "questions", status: "start" });
      }
      return review !== undefined;
    },
    async askQuestion(): Promise<"accept" | "supplement" | "stop"> {
      const event: QuestionEvent = {
        type: "question",
        id: nextId("q"),
        kind: review!.by === "clp" ? "difference" : "review",
        component: anchorOf(program, review!)?.unit.id ?? "",
        where: `${review!.file}:${review!.line}`,
        text: review!.text,
        choices: ["accept", "supplement", "stop"],
      };
      const answer = await askUntil(talk, event, (a) => a.answer === "accept" || a.answer === "stop" || (a.answer === "supplement" && (a.text ?? "").trim() !== ""));
      if (answer?.answer === "supplement") supplements.push({ review: review!, words: answer.text! });
      return (answer?.answer ?? "stop") as "accept" | "supplement" | "stop";
    },
    markReviewed() {
      markReviewed(review!);
    },
    /** Where every supplement goes; false when one has no sentence to go to. */
    placeSupplements(): boolean {
      const { files, changes, unplaced } = supplementAll(program, supplements);
      for (const r of unplaced) talk.emit({ type: "diagnostic", severity: "error", code: "unplaced", where: `${r.file}:${r.line}`, message: "補足を書き足す Layer 1 の文が見つかりません" });
      written = files;
      diff = diffOf(changes);
      return unplaced.length === 0;
    },
    async confirmSupplements(): Promise<boolean> {
      const confirmed = await askUntil(talk, { type: "confirm", id: nextId("c"), diff }, (a) => a.answer === "yes" || a.answer === "no");
      return confirmed?.answer === "yes";
    },
    writeSupplements() {
      for (const [file, text] of written) writeFileSync(file, text);
    },
    questionsDone() {
      if (question) talk.emit({ type: "step", step: "questions", status: "done" });
    },
    async accept(): Promise<boolean> {
      talk.emit({ type: "step", step: "accept", status: "start" });
      const { problems } = await accept8({ specs: options.specs });
      for (const problem of problems) talk.emit({ type: "diagnostic", severity: "error", code: "not-accepted", where: "", message: problem });
      if (problems.length === 0) talk.emit({ type: "step", step: "accept", status: "done" });
      return problems.length === 0;
    },
    async apply(): Promise<Applied> {
      talk.emit({ type: "step", step: "apply", status: "start" });
      const { talk: _, sessions: __, yes: ___, ...rest } = options;
      try {
        const result = await implement({ ...rest, log });
        talk.emit({ type: "step", step: "apply", status: "done" });
        return result.status === "pass" ? "pass" : "fail";
      } catch (error) {
        if (error instanceof AgentFailure) {
          agentMessage = error.message;
          return "agent-failed";
        }
        if (error instanceof FrameworkError) throw error;
        // the spec's own errors (spec-check, unobservable-value, Alloy ...): for the person, before any agent
        talk.emit({ type: "diagnostic", severity: "error", code: "spec", where: "", message: (error as Error).message });
        return "spec-error";
      }
    },
    /** The framework contradicted itself: nothing the person can change in the specs, and not for its own flow to decide. */
    abandon(error: FrameworkError): RunResult {
      talk.emit({ type: "diagnostic", severity: "error", code: "framework", where: "", message: error.message });
      talk.emit({ type: "end", result: "failed", reason: FRAMEWORK_MESSAGE });
      return "failed";
    },
    finish(reason: EndReason): RunResult {
      const result = RESULTS[reason];
      const message = reason === "passed" ? undefined : reason === "split-agent" || reason === "interpret-agent" || reason === "apply-agent" ? agentMessage : MESSAGES[reason];
      talk.emit({ type: "end", result, ...(message ? { reason: message } : {}) });
      return result;
    },
  };
}
type Steps = ReturnType<typeof stepsOf>;

export async function run(options: RunOptions): Promise<RunResult> {
  const steps = stepsOf(options);
  try {
    return (await runStage1(steps, options)) ?? (await runStage0(steps, options));
  } catch (error) {
    if (error instanceof FrameworkError) return steps.abandon(error);
    throw error;
  }
}

/** The hand-written procedure. */
async function runStage0(steps: Steps, options: RunOptions): Promise<RunResult> {
  for (let round = 1; ; round++) {
    if (round > MAX_ROUNDS) return steps.finish("rounds");
    if (!steps.check()) return steps.finish("layer1");

    let split = false;
    while (steps.nextCandidate()) {
      const proposed = await steps.propose();
      if (proposed === "agent-failed") return steps.finish("split-agent");
      if (proposed === "none") continue;
      const answer = await steps.askSplit();
      if (answer === "stop") return steps.finish("person");
      if (answer === "accept") {
        steps.writeSplit();
        split = true;
      } else steps.decline();
    }
    // Layer 1 changed: read it again
    if (split) continue;

    steps.startInterpreting();
    for (;;) {
      const interpreted = await steps.interpret();
      if (interpreted === "up-to-date") break;
      if (interpreted === "failed") return steps.finish("interpret-failed");
      if (interpreted === "agent-failed") return steps.finish("interpret-agent");
    }

    steps.readQuestions();
    let supplemented = false;
    while (steps.nextQuestion()) {
      const answer = await steps.askQuestion();
      if (answer === "stop") return steps.finish("person");
      if (answer === "accept") steps.markReviewed();
      else supplemented = true;
    }
    if (supplemented) {
      if (!steps.placeSupplements()) return steps.finish("unplaced");
      if (!options.yes && !(await steps.confirmSupplements())) return steps.finish("not-written");
      steps.writeSupplements();
      steps.questionsDone();
      // Layer 1 changed: its interpretation is stale and is derived again
      continue;
    }
    steps.questionsDone();

    if (!(await steps.accept())) return steps.finish("not-accepted");
    const applied = await steps.apply();
    return steps.finish(applied === "pass" ? "passed" : applied === "fail" ? "not-verified" : applied === "agent-failed" ? "apply-agent" : "spec");
  }
}

/** Stage 1: the generated state machine asks for what it wants done, and is answered with a command. */
async function runStage1(steps: Steps, options: RunOptions): Promise<RunResult | undefined> {
  const { adapterOf, fallback } = await import("./v1/stage1.ts");
  const adapter = await adapterOf("run-flow");
  if (!adapter) return undefined;
  const requested: { name: string; input: Record<string, unknown> }[] = [];
  const names = ["CheckLayer1", "NextCandidate", "Propose", "AskSplit", "WriteSplit", "Decline", "StartInterpreting", "Interpret", "ReadQuestions", "NextQuestion", "AskQuestion", "MarkReviewed", "PlaceSupplements", "ConfirmSupplements", "WriteSupplements", "QuestionsDone", "Accept", "Apply", "Finish"];
  const driver = Object.fromEntries(names.map((name) => [name, (input: Record<string, unknown> = {}) => void requested.push({ name, input })]));
  try {
    await adapter.setupIsolation({ "run-driver": driver });
    await adapter.executeCommand({ name: "Start", input: { rounds: MAX_ROUNDS, yes: options.yes === true } });
  } catch (error) {
    return fallback("run-flow", error);
  }
  const send = (name: string, input: Record<string, unknown> = {}) => adapter.executeCommand({ name, input });
  let result: RunResult | undefined;
  try {
    while (requested.length > 0 && result === undefined) {
      const request = requested.shift()!;
      switch (request.name) {
        case "CheckLayer1":
          await send("Layer1Checked", { ok: steps.check() });
          break;
        case "NextCandidate":
          await send(steps.nextCandidate() ? "Candidate" : "NoMoreCandidates");
          break;
        case "Propose":
          await send("Proposed", { outcome: await steps.propose() });
          break;
        case "AskSplit":
          await send("SplitAnswered", { answer: await steps.askSplit() });
          break;
        case "WriteSplit":
          steps.writeSplit();
          break;
        case "Decline":
          steps.decline();
          break;
        case "StartInterpreting":
          steps.startInterpreting();
          break;
        case "Interpret":
          await send("Interpreted", { outcome: await steps.interpret() });
          break;
        case "ReadQuestions":
          steps.readQuestions();
          break;
        case "NextQuestion":
          await send(steps.nextQuestion() ? "Question" : "NoMoreQuestions");
          break;
        case "AskQuestion":
          await send("QuestionAnswered", { answer: await steps.askQuestion() });
          break;
        case "MarkReviewed":
          steps.markReviewed();
          break;
        case "PlaceSupplements":
          await send("SupplementsPlaced", { placed: steps.placeSupplements() });
          break;
        case "ConfirmSupplements":
          await send("SupplementsConfirmed", { yes: await steps.confirmSupplements() });
          break;
        case "WriteSupplements":
          steps.writeSupplements();
          break;
        case "QuestionsDone":
          steps.questionsDone();
          break;
        case "Accept":
          await send("Accepted", { ok: await steps.accept() });
          break;
        case "Apply":
          await send("Applied", { outcome: await steps.apply() });
          break;
        case "Finish":
          result = steps.finish((request.input as { reason: EndReason }).reason);
          break;
      }
    }
  } finally {
    await adapter.teardownIsolation();
  }
  if (result === undefined) throw new Error("run-flow が、終わりを告げずに止まりました");
  return result;
}

async function askUntil<E extends QuestionEvent | ConfirmEvent>(talk: Talk, event: E, valid: (answer: Answer) => boolean): Promise<Answer | undefined> {
  for (;;) {
    const answer = await talk.ask(event);
    if (answer === undefined || valid(answer)) return answer;
  }
}

/** The person confirmed the reading: the mark stays as the record (`REVIEW` → `REVIEWED`). */
function markReviewed(review: Review) {
  const file = resolve(process.cwd(), review.file);
  const lines = readFileSync(file, "utf8").split("\n");
  lines[review.line - 1] = lines[review.line - 1].replace(/\/\/(\s*)REVIEW(\(clp\))?:/, "//$1REVIEWED$2:");
  writeFileSync(file, lines.join("\n"));
}
