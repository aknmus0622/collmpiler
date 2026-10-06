import { extract, stableStringify } from "./extract.ts";
import { loadSpecs } from "./loader.ts";

// 暫定エントリ: node packages/cli/src/compile.ts <specs-dir>  → IR を stdout へ
const { ir, diagnostics } = await extract(await loadSpecs(process.argv[2] ?? "specs"));
for (const d of diagnostics) {
  console.error(`${d.severity}[${d.code}] ${d.behavior}.${d.case}: ${d.message}`);
}
process.stdout.write(stableStringify(ir));
if (diagnostics.some((d) => d.severity === "error")) process.exitCode = 1;
