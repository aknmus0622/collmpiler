// What a spec declares but never uses (1.0): the Stage 0 of usage-check. A state field nothing reads cannot show in
// any observation; a port of the outside world nothing asks or calls is not part of the behaviour. Both are warnings:
// the spec says more than it means.

import type { Ir8 } from "./ir.ts";
import { decided } from "./decide.ts";

export type UsageFacts = { kind: "state" | "query" | "command"; read: boolean; written: boolean };
export type UsageProblem = "none" | "never-read" | "never-asked" | "never-called";

export function usageStage0({ kind, read, written }: UsageFacts): UsageProblem {
  if (kind === "state") return read ? "none" : "never-read";
  if (kind === "query") return read ? "none" : "never-asked";
  return written ? "none" : "never-called";
}

/** The facts, collected from the IR (glue without decisions), and what usage-check makes of them. */
export function usageWarnings(ir: Ir8): string[] {
  const warnings: string[] = [];
  const text = (x: unknown) => JSON.stringify(x);
  for (const [id, c] of Object.entries(ir.components)) {
    if (c.external) {
      const everything = text(Object.values(ir.components).filter((x) => !x.external));
      for (const port of Object.keys(c.external.queries)) {
        const asked = everything.includes(text(["ask", id, port]).slice(0, -1));
        if (decided("usage-check", { kind: "query", read: asked, written: false }, usageStage0({ kind: "query", read: asked, written: false })) !== "none") {
          warnings.push(`warning[unused] ${id}.${port}: 外の世界の問い合わせを、どの本体も尋ねていません`);
        }
      }
      for (const port of Object.keys(c.external.commands)) {
        const called = Object.values(ir.components).some((x) => Object.values(x.events ?? {}).some((e) => e.calls.some((call) => call.component === id && call.command === port)));
        if (decided("usage-check", { kind: "command", read: false, written: called }, usageStage0({ kind: "command", read: false, written: called })) !== "none") {
          warnings.push(`warning[unused] ${id}.${port}: 外の世界のコマンドを、どの本体も呼んでいません`);
        }
      }
      continue;
    }
    const readers = text([c.events && Object.values(c.events).map((e) => [e.guard, e.assign, e.calls, e.output]), c.queries, c.conditions, c.calcs, c.decisions, c.properties, c.commands]);
    for (const field of Object.keys(c.state ?? {})) {
      const read = readers.includes(text(["state", field]));
      const facts = { kind: "state", read, written: true } as const;
      if (decided("usage-check", facts, usageStage0(facts)) !== "none") warnings.push(`warning[unused] ${id}.state.${field}: この状態を読む所がありません。答えにも外の世界へのコマンドにも現れないので、検証されません`);
    }
  }
  return warnings;
}
