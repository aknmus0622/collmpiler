import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { implement } from "./loop.ts";
import { selectMutation } from "./mutation.ts";
import { PHASES } from "./request.ts";
import type { Phase } from "./request.ts";
import { commandStrategy } from "./strategy.ts";

// 暫定エントリ:
//   node packages/cli/src/implement.ts --out <dir> --agent "<command>"
//     [--specs specs] [--max-attempts 3] [--max-rounds 2] [--from design|wiring|implementation]
//     [--fresh] [--keep-sandbox] [--transcripts <dir>]
//     [--guide <file>] [--mutation auto|builtin|off]
const { values } = parseArgs({
  options: {
    specs: { type: "string", default: "specs" },
    out: { type: "string" },
    agent: { type: "string" },
    "max-attempts": { type: "string", default: "3" },
    "max-rounds": { type: "string", default: "2" },
    from: { type: "string" },
    fresh: { type: "boolean", default: false },
    "keep-sandbox": { type: "boolean", default: false },
    transcripts: { type: "string" },
    guide: { type: "string" },
    mutation: { type: "string", default: "auto" },
  },
});
if (values.from !== undefined && !PHASES.includes(values.from as Phase)) {
  console.error(`--from は ${PHASES.join(" / ")} のいずれかです`);
  process.exit(2);
}
if (!values.out || !values.agent) {
  console.error('usage: implement --out <dir> --agent "<command>" [--specs specs] [--max-attempts 3] [--max-rounds 2] [--from design|wiring|implementation] [--fresh] [--keep-sandbox] [--transcripts <dir>] [--guide <file>] [--mutation auto|builtin|off]');
  process.exit(2);
}

const result = await implement({
  specs: values.specs,
  out: values.out,
  strategy: commandStrategy(values.agent, { transcriptDir: values.transcripts }),
  maxAttempts: Number(values["max-attempts"]),
  maxRounds: Number(values["max-rounds"]),
  from: values.from as Phase | undefined,
  fresh: values.fresh,
  keepSandbox: values["keep-sandbox"],
  guide: values.guide === undefined ? undefined : readFileSync(values.guide, "utf8"),
  mutation: selectMutation(values.mutation) ?? null,
  log: (line) => console.error(line),
});
console.log(JSON.stringify(result, null, 2));
if (result.status !== "pass") process.exitCode = 1;
