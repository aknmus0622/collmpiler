import { parseArgs } from "node:util";
import { implement } from "./loop.ts";

// 暫定エントリ:
//   node packages/cli/src/implement.ts --out <dir> --agent "<command>" [--specs specs] [--max-attempts 3]
const { values } = parseArgs({
  options: {
    specs: { type: "string", default: "specs" },
    out: { type: "string" },
    agent: { type: "string" },
    "max-attempts": { type: "string", default: "3" },
  },
});
if (!values.out || !values.agent) {
  console.error('usage: implement --out <dir> --agent "<command>" [--specs specs] [--max-attempts 3]');
  process.exit(2);
}

const result = await implement({
  specs: values.specs,
  out: values.out,
  agent: values.agent,
  maxAttempts: Number(values["max-attempts"]),
  log: (line) => console.error(line),
});
console.log(JSON.stringify(result, null, 2));
if (result.status !== "pass") process.exitCode = 1;
