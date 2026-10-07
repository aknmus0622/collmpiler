import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import type { Dirent } from "node:fs";
import { join, normalize, relative, resolve, sep } from "node:path";
import type { AssetDeclaration, AssetPhase } from "@aac/core";

// 依頼に添付する資料（設計の決まり、用語集、コーディング規約など）。
//   ファイル … 作業場所の aac/assets/ に、相対パスの構造を保って置く
//   文言     … 依頼文の中に直接載せる
// 既定では設計と実装の段階に渡す。配線の段階に渡すと、その段階に仕様を見せない意味が薄れ得るので、
// 渡したいときは phases で明示する。業務ルール（仕様の中身）を書いてはいけない
export type Asset =
  | { kind: "file"; name: string; content: string; phases?: readonly AssetPhase[] }
  | { kind: "text"; text: string; phases?: readonly AssetPhase[] };

export const DEFAULT_ASSET_PHASES: readonly AssetPhase[] = ["design", "implementation"];
const PHASES: readonly AssetPhase[] = ["design", "wiring", "implementation"];

export const assetsFor = (assets: Asset[], phase: AssetPhase) =>
  assets.filter((asset) => (asset.phases ?? DEFAULT_ASSET_PHASES).includes(phase));

// 作業場所での名前: 書かれた相対パスから、上位へ出る部分 (../) を取り除いたもの
const nameOf = (path: string) =>
  normalize(path)
    .split(sep)
    .filter((part) => part !== ".." && part !== "." && part !== "")
    .join("/");

function readFile(path: string, name: string, phases: readonly AssetPhase[] | undefined): Asset {
  const content = readFileSync(path, "utf8");
  if (content.includes("\0")) throw new Error(`添付資料 ${name} はテキストではありません`);
  return { kind: "file", name, content, ...(phases ? { phases } : {}) };
}

// 宣言 (file / dir / text) を、内容を読み込んだ資料にする。パスは baseDir からの相対
export function resolveAssets(declarations: readonly AssetDeclaration[], baseDir: string): Asset[] {
  const assets: Asset[] = [];
  for (const declaration of declarations) {
    const phases = declaration.phases;
    if (declaration.kind === "text") {
      assets.push({ kind: "text", text: declaration.text, ...(phases ? { phases } : {}) });
      continue;
    }
    const path = resolve(baseDir, declaration.path);
    if (!existsSync(path)) throw new Error(`添付資料がありません: ${declaration.path}`);
    const isDirectory = statSync(path).isDirectory();
    if (declaration.kind === "file") {
      if (isDirectory) throw new Error(`添付資料 ${declaration.path} はディレクトリです。dir() で指定してください`);
      assets.push(readFile(path, nameOf(declaration.path), phases));
    } else {
      if (!isDirectory) throw new Error(`添付資料 ${declaration.path} はファイルです。file() で指定してください`);
      const entries = (readdirSync(path, { recursive: true, withFileTypes: true }) as Dirent[])
        .filter((entry) => entry.isFile() && !entry.name.startsWith("."))
        .map((entry) => join(entry.parentPath, entry.name))
        .sort();
      for (const entry of entries) {
        assets.push(readFile(entry, `${nameOf(declaration.path)}/${relative(path, entry).split(sep).join("/")}`, phases));
      }
    }
  }
  checkNames(assets);
  return assets;
}

function checkNames(assets: Asset[]) {
  const seen = new Set<string>();
  for (const asset of assets) {
    if (asset.kind !== "file") continue;
    if (seen.has(asset.name)) throw new Error(`添付資料の名前が重なっています: ${asset.name}`);
    seen.add(asset.name);
  }
}

// コマンドラインの --asset の指定を読む。ファイルでもディレクトリでもよい。
//   "docs/architecture.md"            … 既定の段階 (設計と実装) に添付
//   "wiring,design=docs/naming.md"    … 指定した段階に添付
export function readAssets(specs: string[]): Asset[] {
  return specs.flatMap((spec) => {
    const separator = spec.indexOf("=");
    const phases = separator === -1 ? undefined : (spec.slice(0, separator).split(",") as AssetPhase[]);
    const unknown = phases?.find((phase) => !PHASES.includes(phase));
    if (unknown !== undefined) throw new Error(`--asset: 段階 "${unknown}" はありません (${PHASES.join(" / ")})`);
    const path = spec.slice(separator + 1);
    const kind = existsSync(resolve(process.cwd(), path)) && statSync(resolve(process.cwd(), path)).isDirectory() ? "dir" : "file";
    return resolveAssets([{ kind, path, ...(phases ? { phases } : {}) }], process.cwd());
  });
}

// 仕様に宣言された資料と、コマンドで渡された資料をまとめる。名前の重複はエラー
export function mergeAssets(fromSpec: Asset[], fromCommand: Asset[]): Asset[] {
  const merged = [...fromSpec, ...fromCommand];
  checkNames(merged);
  return merged;
}
