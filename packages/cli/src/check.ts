import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { stableStringify } from "./extract.ts";
import { FILES, SOURCE_DIR, TEST_DIR, generateContract, generateVerify, requireModel } from "./generate.ts";
import type { Ir } from "./generate.ts";
import { importsOf, scan } from "./scan.ts";

// LLM が書いたものに「余計なもの」が無いかの検査。PBT の前に走り、違反は LLM に差し戻す。
//  1. 本番コードがフレームワーク・仕様・テスト側に依存していないこと
//  2. 生成したテスト側ファイル（採点基準）が書き換えられていないこと
//  3. アダプターが薄いこと（業務ロジックを持たない）
// メッセージはエージェントに渡すため英語。

export type Violation = { file: string; rule: string; message: string };

const ALLOWED_TOP_LEVEL = new Set([TEST_DIR, SOURCE_DIR, "package.json", "node_modules"]);

const isInside = (dir: string, path: string) => path === dir || path.startsWith(dir + sep);

export function checkWorkspace(out: string, ir: Ir, specs: string): Violation[] {
  const outDir = resolve(process.cwd(), out);
  const specsDir = resolve(process.cwd(), specs);
  const model = requireModel(ir);
  const testDir = join(outDir, TEST_DIR);
  const sourceDir = join(outDir, SOURCE_DIR);
  const violations: Violation[] = [];
  const report = (path: string, rule: string, message: string) =>
    violations.push({ file: relative(outDir, path).split(sep).join("/"), rule, message });

  for (const entry of readdirSync(outDir)) {
    if (!ALLOWED_TOP_LEVEL.has(entry)) {
      report(join(outDir, entry), "unexpected-file", `Only ${SOURCE_DIR}/ and ${TEST_DIR}/ may be written.`);
    }
  }
  const testFiles = new Set<string>(Object.values(FILES));
  for (const entry of readdirSync(testDir)) {
    if (!testFiles.has(entry)) {
      report(join(testDir, entry), "unexpected-file", `Do not add files to ${TEST_DIR}/. Put code in ${SOURCE_DIR}/.`);
    }
  }

  const generated = {
    [FILES.ir]: stableStringify(ir),
    [FILES.contract]: generateContract(ir),
    [FILES.verify]: generateVerify(ir, testDir, specsDir),
  };
  for (const [name, expected] of Object.entries(generated)) {
    const path = join(testDir, name);
    if (!existsSync(path) || readFileSync(path, "utf8") !== expected) {
      report(path, "generated-file-modified", "This file is generated and must not be edited or removed.");
    }
  }

  const checkImports = (path: string, tokens: ReturnType<typeof scan>, allowContract: boolean) => {
    const { specifiers, dynamic } = importsOf(tokens);
    if (dynamic) report(path, "dynamic-import", "import() and require() are not allowed.");
    for (const specifier of specifiers) {
      const target = specifier.startsWith(".") ? resolve(dirname(path), specifier) : undefined;
      const ok =
        target !== undefined &&
        (isInside(sourceDir, target) || (allowContract && target === join(testDir, FILES.contract)));
      if (ok) continue;
      report(
        path,
        "forbidden-import",
        allowContract
          ? `"${specifier}": the adapter may only import ./${FILES.contract} and files under ../${SOURCE_DIR}/.`
          : `"${specifier}": production code may only import other files under ${SOURCE_DIR}/ by relative path.`,
      );
    }
  };

  // --- アダプター ---
  const adapterPath = join(testDir, FILES.adapter);
  if (!existsSync(adapterPath)) {
    report(adapterPath, "missing-file", "The adapter is missing.");
  } else {
    const tokens = scan(readFileSync(adapterPath, "utf8"));
    checkImports(adapterPath, tokens, true);

    // data の中身に触れられなければ、アダプター内で業務上の分岐はできない
    const dataFields = new Set(Object.keys(model.data));
    const dataValues = new Set([
      ...Object.values(model.data).flatMap((schema) => (typeof schema === "string" ? [] : schema)),
      ...Object.values(ir.decisions).flatMap((decision) => Object.keys(decision.rows)),
    ]);
    const seen = new Set<string>();
    const logic = (key: string, message: string) => {
      if (seen.has(key)) return;
      seen.add(key);
      report(adapterPath, "adapter-logic", `${message} The adapter must only forward calls; move this logic to ${SOURCE_DIR}/.`);
    };
    for (const token of tokens) {
      if (token.kind === "number") logic("number", `Numeric literal ${token.text} found.`);
      if (token.kind === "word" && dataFields.has(token.text)) {
        logic(token.text, `State data field "${token.text}" is referenced. Pass \`data\` through unchanged.`);
      }
      if (token.kind === "string" && dataValues.has(token.text)) {
        logic(token.text, `State data value or rule name "${token.text}" is referenced.`);
      }
    }
  }

  // --- 本番コード ---
  const sourceFiles = existsSync(sourceDir)
    ? (readdirSync(sourceDir, { recursive: true, withFileTypes: true }) as import("node:fs").Dirent[])
        .filter((entry) => entry.isFile())
        .map((entry) => join(entry.parentPath, entry.name))
    : [];
  if (sourceFiles.length === 0) {
    report(sourceDir, "missing-file", `No production code found under ${SOURCE_DIR}/.`);
  }
  for (const path of sourceFiles.sort()) {
    if (!path.endsWith(".ts")) {
      report(path, "unexpected-file", `Only .ts files are allowed under ${SOURCE_DIR}/.`);
      continue;
    }
    checkImports(path, scan(readFileSync(path, "utf8")), false);
  }

  return violations;
}
