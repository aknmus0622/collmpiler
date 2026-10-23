import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Asset } from "./assets.ts";
import { implement } from "./loop.ts";
import type { ImplementOptions } from "./loop.ts";
import type { ImplementationStrategy } from "./strategy.ts";
import { AgentFailure } from "./strategy.ts";
import { accept8, interpret8 } from "./v1/interpret.ts";
import { readProgram } from "./v1/read.ts";
import { anchorOf, diffOf, supplementAll } from "./v1/supplement.ts";
import type { Review } from "./v1/supplement.ts";

// `clp run` (DSL.md §17.19): one run from the specs to verified code. Where to start is read from the state of the
// specs and the output, never from a mode: an interpretation missing or stale → interpret; a draft with open review
// marks → ask the person; every interpretation reviewed → accept, then `clp apply` (whose phases `planOf` decides).
// The person's answers are the only thing written into Layer 1, in their own words (v1/supplement.ts).

export type RunResult = "passed" | "stopped" | "failed";
export type Choice = "accept" | "supplement" | "stop";
export type QuestionEvent = { type: "question"; id: string; kind: "review" | "difference"; component: string; where: string; text: string; choices: Choice[] };
export type ConfirmEvent = { type: "confirm"; id: string; diff: string };
export type RunEvent =
  | { type: "step"; step: "check" | "interpret" | "questions" | "accept" | "apply"; status: "start" | "done" }
  | QuestionEvent
  | ConfirmEvent
  | { type: "diagnostic"; severity: "error" | "warning"; code: string; where: string; message: string }
  | { type: "end"; result: RunResult; reason?: string };
/** An answer: to a question (`accept`, `supplement` with `text`, `stop`) or to a confirmation (`yes`, `no`). */
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

export async function run(options: RunOptions): Promise<RunResult> {
  const { talk } = options;
  const log = options.log ?? (() => {});
  const end = (result: RunResult, reason?: string): RunResult => {
    talk.emit({ type: "end", result, ...(reason ? { reason } : {}) });
    return result;
  };
  const specsDir = resolve(process.cwd(), options.specs);
  let counter = 0;
  const nextId = (prefix: string) => `${prefix}${++counter}`;

  for (let round = 1; ; round++) {
    if (round > MAX_ROUNDS) return end("stopped", `疑問への応答を ${MAX_ROUNDS} 回繰り返しても、解釈を確定できませんでした`);

    // what the interpretation cannot fix: Layer 1 that does not read
    talk.emit({ type: "step", step: "check", status: "start" });
    const errors = readProgram(specsDir).problems.filter((p) => p.severity === "error" && !(p.at && INTERPRETATION_FILE.test(p.at.file)));
    for (const p of errors) talk.emit({ type: "diagnostic", severity: p.severity, code: p.code, where: p.where, message: p.message });
    if (errors.length > 0) return end("stopped", "Layer 1 に誤りがあります。直してから、もう一度実行してください");
    talk.emit({ type: "step", step: "check", status: "done" });

    // every interpretation that is missing or stale (one file per call)
    talk.emit({ type: "step", step: "interpret", status: "start" });
    for (;;) {
      const interpreted = await interpret8({ specs: options.specs, strategy: options.strategy, sessions: options.sessions ?? 2, assets: options.assets, maxAttempts: options.maxAttempts, log });
      if (interpreted.status === "up-to-date") break;
      if (interpreted.status === "failed") {
        talk.emit({ type: "diagnostic", severity: "error", code: "interpretation-failed", where: interpreted.component, message: interpreted.problems ?? "解釈を導けませんでした" });
        return end("failed", "解釈を導けませんでした");
      }
    }
    talk.emit({ type: "step", step: "interpret", status: "done" });

    // the questions of every draft, asked together; one confirmation and one new interpretation for all the answers
    const program = readProgram(specsDir, { drafts: true });
    if (program.reviews.length > 0) {
      talk.emit({ type: "step", step: "questions", status: "start" });
      const supplements: { review: Review; words: string }[] = [];
      for (const review of program.reviews) {
        const question: QuestionEvent = {
          type: "question",
          id: nextId("q"),
          kind: review.by === "clp" ? "difference" : "review",
          component: anchorOf(program, review)?.unit.id ?? "",
          where: `${review.file}:${review.line}`,
          text: review.text,
          choices: ["accept", "supplement", "stop"],
        };
        const answer = await askUntil(talk, question, (a) => a.answer === "accept" || a.answer === "stop" || (a.answer === "supplement" && (a.text ?? "").trim() !== ""));
        if (!answer || answer.answer === "stop") return end("stopped", "止めました。Layer 1 を直してから、もう一度実行すると、続きから進みます");
        if (answer.answer === "accept") markReviewed(review);
        else supplements.push({ review, words: answer.text! });
      }
      if (supplements.length > 0) {
        const { files, changes, unplaced } = supplementAll(program, supplements);
        for (const review of unplaced) {
          talk.emit({ type: "diagnostic", severity: "error", code: "unplaced", where: `${review.file}:${review.line}`, message: "補足を書き足す Layer 1 の文が見つかりません" });
        }
        if (unplaced.length > 0) return end("stopped", "補足を書き足せませんでした。Layer 1 を直してから、もう一度実行してください");
        if (!options.yes) {
          const confirmed = await askUntil(talk, { type: "confirm", id: nextId("c"), diff: diffOf(changes) }, (a) => a.answer === "yes" || a.answer === "no");
          if (confirmed?.answer !== "yes") return end("stopped", "Layer 1 に書き込みませんでした");
        }
        for (const [file, text] of files) writeFileSync(file, text);
        talk.emit({ type: "step", step: "questions", status: "done" });
        // Layer 1 changed: its interpretation is stale and is derived again
        continue;
      }
      talk.emit({ type: "step", step: "questions", status: "done" });
    }

    talk.emit({ type: "step", step: "accept", status: "start" });
    const { problems } = await accept8({ specs: options.specs });
    for (const problem of problems) talk.emit({ type: "diagnostic", severity: "error", code: "not-accepted", where: "", message: problem });
    if (problems.length > 0) return end("stopped", "解釈を確定できませんでした");
    talk.emit({ type: "step", step: "accept", status: "done" });

    talk.emit({ type: "step", step: "apply", status: "start" });
    const { talk: _, sessions: __, yes: ___, ...rest } = options;
    try {
      const result = await implement({ ...rest, log });
      talk.emit({ type: "step", step: "apply", status: "done" });
      return result.status === "pass" ? end("passed") : end("failed", "実装が検証に通りませんでした");
    } catch (error) {
      if (error instanceof AgentFailure) return end("failed", error.message);
      // the spec's own errors (spec-check, unobservable-value, Alloy ...): for the person, before any agent
      talk.emit({ type: "diagnostic", severity: "error", code: "spec", where: "", message: (error as Error).message });
      return end("stopped", "仕様に誤りがあります。Layer 1 を直してから、もう一度実行してください");
    }
  }
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
