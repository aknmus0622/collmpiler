import { createHash } from "node:crypto";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, posix, relative, sep } from "node:path";
import { sourceFiles } from "./layout.ts";
import type { Workspace } from "./layout.ts";

// 合格の記録: 「この仕様に対して、このコードが、検証に合格した」ことを、テスト側に残す。
//
// 本番コードがそこにあることは、合格を意味しない。出口ゲートは、採点の前にエージェントの出力を出力先へ写し、
// 不合格でも戻さない。手で書き換えることもできる。そこで、合格したときの仕様とコードのハッシュを記録し、
// コードを「合格済みのもの」として使う側（フレームワーク自身の Stage 1）が、いまの内容と合うかを確かめる。
//
// 記録は、仕様とコードだけから決まる（時刻も、試行回数も入れない）。同じものを採点し直せば、同じ記録になる。
// ファイルのパスは、記録のファイルから見た相対パスで持つ。記録だけを見て、確かめ直せるようにするため

export type Verified = {
  // このコンポーネントの仕様の起点（Layer 1 と解釈のファイル。仕様のディレクトリからの相対パス）
  roots: string[];
  // 起点と、そこから相対パスで import されるファイル（たどったものすべて）のハッシュ。
  // ほかのコンポーネントの仕様を直しても、このコンポーネントの記録は古くならない
  specs: string;
  // 本番コードのファイルと、このコンポーネントのアダプターのハッシュ
  code: string;
  // code に含めたファイル
  files: string[];
  // 採点した側 (R2)。採点の部品を作り直す実行は、Stage 0 だけで採点する (R1)
  gradedBy?: "stage0" | "stage1";
  // 採点の部品だけ: 対になる Stage 0 (手書き) のファイルのハッシュ (R5)。人が Stage 0 を直したら、記録は古くなる
  stage0?: string;
};

const toPosix = (path: string) => path.split(sep).join("/");
export function hashFiles(base: string, files: readonly string[]): string {
  const hash = createHash("sha256");
  for (const file of [...files].sort()) hash.update(`${file}\0`).update(readFileSync(join(base, file))).update("\0");
  return `sha256:${hash.digest("hex")}`;
}
// 起点から、相対パスの import をたどったファイル（仕様のディレクトリの中にあるものだけ。仕様のディレクトリからの相対パス）
export function specClosure(specsDir: string, roots: readonly string[]): string[] {
  const found = new Set<string>();
  const visit = (rel: string) => {
    if (found.has(rel) || rel.startsWith("..") || !existsSync(join(specsDir, rel))) return;
    found.add(rel);
    const text = readFileSync(join(specsDir, rel), "utf8");
    for (const match of text.matchAll(/(?:^|[\s;])(?:import|export)\b[^"'`;]*?from\s*["'](\.{1,2}\/[^"']+)["']/g)) {
      visit(posix.normalize(posix.join(posix.dirname(rel), match[1])));
    }
  };
  for (const root of roots) visit(toPosix(root));
  return [...found].sort();
}

// 合格したコンポーネントの記録を書く。roots: そのコンポーネントの仕様の起点（Layer 1 と解釈のファイル）
export function writeVerified(ws: Workspace, specsDir: string, roots: readonly string[], grading: { gradedBy: "stage0" | "stage1"; stage0?: string } = { gradedBy: "stage1" }): void {
  const record = join(ws.root, ws.paths.verified);
  const files = [...sourceFiles(ws), ws.paths.adapter].map((rel) => toPosix(relative(dirname(record), join(ws.root, rel)))).sort();
  const sortedRoots = [...roots].map(toPosix).sort();
  const verified: Verified = {
    roots: sortedRoots,
    specs: hashFiles(specsDir, specClosure(specsDir, sortedRoots)),
    code: hashFiles(dirname(record), files),
    files,
    gradedBy: grading.gradedBy,
    ...(grading.stage0 === undefined ? {} : { stage0: grading.stage0 }),
  };
  writeFileSync(record, `${JSON.stringify(verified, null, 2)}\n`);
}
export const clearVerified = (ws: Workspace) => rmSync(join(ws.root, ws.paths.verified), { force: true });

// 記録が、いまの仕様とコードのものかを確かめる。合わなければ、その理由（利用者向け）を返す
// grading: 採点の部品の記録に求めること（Stage 0 が採点したこと (R2)、Stage 0 のファイルが変わっていないこと (R5)）
export function staleness(record: string, specsDir: string, grading?: { stage0: string }): string | undefined {
  if (!existsSync(record)) return "検証に合格した記録がありません";
  let verified: Verified;
  try {
    verified = JSON.parse(readFileSync(record, "utf8")) as Verified;
  } catch {
    return "検証に合格した記録を読めません";
  }
  if (!Array.isArray(verified.roots)) return "検証に合格した記録が、古い形です（clp apply で採点し直してください）";
  if (!existsSync(specsDir) || verified.roots.some((root) => !existsSync(join(specsDir, root)))) return "合格したあとで、仕様が変わっています";
  if (hashFiles(specsDir, specClosure(specsDir, verified.roots)) !== verified.specs) return "合格したあとで、仕様が変わっています";
  const base = dirname(record);
  const missing = verified.files.find((file) => !existsSync(posix.join(toPosix(base), file)));
  if (missing !== undefined) return `合格したときのコードがありません (${missing})`;
  if (hashFiles(base, verified.files) !== verified.code) return "合格したあとで、コードが変わっています";
  if (grading) {
    if (verified.gradedBy !== "stage0") return "採点の部品なのに、Stage 0 が採点した記録ではありません (R2)";
    if (verified.stage0 !== grading.stage0) return "合格したあとで、対になる Stage 0 (手書き) が変わっています (R5)";
  }
  return undefined;
}
