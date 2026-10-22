// The decisions of the oracle that are self-hosted (SELF_HOSTING.md §10, R4) for 1.0. The simulator runs
// synchronously, so it always decides with Stage 0 and records each question with Stage 0's answer; after the trial
// (before its result counts), the same questions are put to the generated components (Stage 1) and every answer must
// agree. A disagreement is a framework error: verification stops, nothing goes back to an agent.

import { isDeepStrictEqual } from "node:util";

export class FrameworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FrameworkError";
  }
}

/** A grading component (its name, as in packages/cli/self/specs) and what it was asked. */
export type Asked = { component: string; question: unknown; answer: unknown };
/** Per component: ask Stage 1. `undefined` when it cannot answer (then Stage 0 alone decides). */
export type Deciders8 = Record<string, (question: unknown) => Promise<unknown>>;

let log: Asked[] | undefined;

/** Stage 0's answer, recorded when a log is open. */
export function decided<T>(component: string, question: unknown, answer: T): T {
  log?.push({ component, question, answer });
  return answer;
}

/** Runs `fn` with a log open, and returns what was asked. */
export function recording<T>(fn: () => T): { result: T; asked: Asked[] } {
  const previous = log;
  log = [];
  try {
    const result = fn();
    return { result, asked: log };
  } finally {
    log = previous;
  }
}
export async function recordingAsync<T>(fn: () => Promise<T>): Promise<{ result: T; asked: Asked[] }> {
  const previous = log;
  log = [];
  const mine = log;
  try {
    const result = await fn();
    return { result, asked: mine };
  } finally {
    log = previous;
  }
}

const labels: Record<string, string> = {
  "step-choice": "場合の選び方",
  "promise-keeper": "依存の約束",
  "input-candidates": "入力の候補",
  "observation-compare": "観測値の比較",
  "outcome-apply": "起きることの適用",
};

/** Puts every question to Stage 1 (each distinct one once). Throws FrameworkError on the first disagreement. */
export async function agree(asked: Asked[], deciders: Deciders8 | undefined, cache = new Map<string, unknown>()): Promise<void> {
  if (!deciders) return;
  for (const { component, question, answer } of asked) {
    const decide = deciders[component];
    if (!decide) continue;
    const key = `${component}\0${JSON.stringify(question)}`;
    let stage1: unknown;
    if (cache.has(key)) stage1 = cache.get(key);
    else {
      stage1 = await decide(question);
      cache.set(key, stage1);
    }
    if (stage1 !== undefined && !isDeepStrictEqual(stage1, answer)) {
      throw new FrameworkError(`${labels[component] ?? component}が、Stage 0 (${JSON.stringify(answer)}) と Stage 1 (${component}: ${JSON.stringify(stage1)}) で食い違いました: ${JSON.stringify(question)}`);
    }
  }
}
