import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, posix, relative, sep } from "node:path";
import { sourceFiles } from "./layout.ts";
import type { Workspace } from "./layout.ts";
import { DRAFT_SUFFIX } from "./loader.ts";

// 合格の記録: 「この仕様に対して、このコードが、検証に合格した」ことを、テスト側に残す。
//
// 本番コードがそこにあることは、合格を意味しない。出口ゲートは、採点の前にエージェントの出力を出力先へ写し、
// 不合格でも戻さない。手で書き換えることもできる。そこで、合格したときの仕様とコードのハッシュを記録し、
// コードを「合格済みのもの」として使う側（フレームワーク自身の Stage 1）が、いまの内容と合うかを確かめる。
//
// 記録は、仕様とコードだけから決まる（時刻も、試行回数も入れない）。同じものを採点し直せば、同じ記録になる。
// ファイルのパスは、記録のファイルから見た相対パスで持つ。記録だけを見て、確かめ直せるようにするため

export type Verified = {
  // 仕様のファイル（下書きを除く、仕様のディレクトリの .ts すべて）のハッシュ
  specs: string;
  // 本番コードのファイルと、このコンポーネントのアダプターのハッシュ
  code: string;
  // code に含めたファイル
  files: string[];
};

const toPosix = (path: string) => path.split(sep).join("/");
function hashFiles(base: string, files: readonly string[]): string {
  const hash = createHash("sha256");
  for (const file of [...files].sort()) hash.update(`${file}\0`).update(readFileSync(join(base, file))).update("\0");
  return `sha256:${hash.digest("hex")}`;
}
const specFiles = (specsDir: string) =>
  (readdirSync(specsDir, { recursive: true, encoding: "utf8" }) as string[]).map(toPosix).filter((file) => file.endsWith(".ts") && !file.endsWith(DRAFT_SUFFIX));

// 合格したコンポーネントの記録を書く
export function writeVerified(ws: Workspace, specsDir: string): void {
  const record = join(ws.root, ws.paths.verified);
  const files = [...sourceFiles(ws), ws.paths.adapter].map((rel) => toPosix(relative(dirname(record), join(ws.root, rel)))).sort();
  const verified: Verified = { specs: hashFiles(specsDir, specFiles(specsDir)), code: hashFiles(dirname(record), files), files };
  writeFileSync(record, `${JSON.stringify(verified, null, 2)}\n`);
}
export const clearVerified = (ws: Workspace) => rmSync(join(ws.root, ws.paths.verified), { force: true });

// 記録が、いまの仕様とコードのものかを確かめる。合わなければ、その理由（利用者向け）を返す
export function staleness(record: string, specsDir: string): string | undefined {
  if (!existsSync(record)) return "検証に合格した記録がありません";
  let verified: Verified;
  try {
    verified = JSON.parse(readFileSync(record, "utf8")) as Verified;
  } catch {
    return "検証に合格した記録を読めません";
  }
  if (!existsSync(specsDir) || hashFiles(specsDir, specFiles(specsDir)) !== verified.specs) return "合格したあとで、仕様が変わっています";
  const base = dirname(record);
  const missing = verified.files.find((file) => !existsSync(posix.join(toPosix(base), file)));
  if (missing !== undefined) return `合格したときのコードがありません (${missing})`;
  if (hashFiles(base, verified.files) !== verified.code) return "合格したあとで、コードが変わっています";
  return undefined;
}
