import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, posix, relative, resolve, sep } from "node:path";
import { stableStringify } from "./extract.ts";
import { generateContract, generateVerify } from "./generate.ts";
import type { Ir } from "./generate.ts";
import { dirFrom, importPath, isSource, label, sourceFiles, testsDirOf } from "./layout.ts";
import type { Workspace } from "./layout.ts";
import { importsOf, scan } from "./scan.ts";

// LLM が書いたものに「余計なもの」が無いかの検査 (TypeScript を対象とするとき)。PBT の前に走り、違反は LLM に差し戻す。
//  1. 本番コードがフレームワーク・仕様・テスト側に依存していないこと
//  2. 生成したテスト側ファイル（採点基準）が書き換えられていないこと
//  3. アダプターが仕様や採点基準を import していないこと
// アダプターの中身は制限しない（本番コードの作りに合わせるのはアダプターの仕事）。
// 業務上の判断がアダプターに書かれていないかは、ミューテーションのゲート (mutation.ts) が確かめる。
// メッセージはエージェントに渡すため英語。

export type Violation = { file: string; rule: string; message: string };

// scope: "source" は本番コードだけを調べる（アダプターがまだ無い、設計の段階用）
export function checkWorkspace(ws: Workspace, ir: Ir, specs: string, scope: "all" | "source" = "all"): Violation[] {
  const specsDir = resolve(process.cwd(), specs);
  const violations: Violation[] = [];
  const report = (rel: string, rule: string, message: string) => violations.push({ file: rel, rule, message });
  const sources = label(ws.src);

  // テスト側のファイルは決まった4つだけ。テスト側だけの専用のディレクトリなら、ほかのファイルを置かせない。
  // 本番コードと同じ場所や、ほかのテストと共用のディレクトリ (接頭辞つき) では、接頭辞の付いた名前だけを見る
  const testsDir = testsDirOf(ws);
  const known = new Set(Object.values(ws.paths));
  const dedicated = ws.prefix === "" && ws.tests !== ws.src;
  for (const entry of existsSync(testsDir) ? readdirSync(testsDir) : []) {
    const rel = relative(ws.root, join(testsDir, entry)).split(sep).join("/");
    if (known.has(rel)) continue;
    if (dedicated || (ws.prefix !== "" && entry.startsWith(ws.prefix))) {
      report(rel, "unexpected-file", `Do not add test-side files. Put code in ${sources}.`);
    }
  }

  const generated = {
    [ws.paths.ir]: stableStringify(ir),
    [ws.paths.contract]: generateContract(ir),
    [ws.paths.verify]: generateVerify(ir, ws, specsDir),
  };
  for (const [rel, expected] of Object.entries(generated)) {
    const path = join(ws.root, rel);
    if (!existsSync(path) || readFileSync(path, "utf8") !== expected) {
      report(rel, "generated-file-modified", "This file is generated and must not be edited or removed.");
    }
  }

  const checkImports = (rel: string, tokens: ReturnType<typeof scan>, isAdapter: boolean) => {
    const { specifiers, dynamic } = importsOf(tokens);
    if (dynamic) report(rel, "dynamic-import", "import() and require() are not allowed.");
    for (const specifier of specifiers) {
      const target = specifier.startsWith(".") ? posix.normalize(posix.join(posix.dirname(rel), specifier)) : undefined;
      const ok = target !== undefined && !target.startsWith("..") && (isSource(ws, target) || (isAdapter && target === ws.paths.contract));
      if (ok) continue;
      report(
        rel,
        "forbidden-import",
        isAdapter
          ? `"${specifier}": the adapter may only import ${importPath(ws.paths.adapter, ws.paths.contract)} and production files under ${dirFrom(ws.paths.adapter, ws.src)}.`
          : `"${specifier}": production code may only import other production files under ${sources} by relative path.`,
      );
    }
  };

  // --- アダプター ---
  const adapterPath = join(ws.root, ws.paths.adapter);
  if (scope === "source") {
    // アダプターは対象外
  } else if (!existsSync(adapterPath)) {
    report(ws.paths.adapter, "missing-file", "The adapter is missing.");
  } else {
    checkImports(ws.paths.adapter, scan(readFileSync(adapterPath, "utf8")), true);
  }

  // --- 本番コード ---
  const files = sourceFiles(ws);
  if (files.length === 0) report(ws.src || ".", "missing-file", `No production code found under ${sources}.`);
  for (const rel of files) {
    if (!rel.endsWith(".ts")) {
      report(rel, "unexpected-file", `Only .ts files are allowed under ${sources}.`);
      continue;
    }
    checkImports(rel, scan(readFileSync(join(ws.root, rel), "utf8")), false);
  }

  return violations;
}
