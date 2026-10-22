import { CONTROL_DIR, DEFAULT_SOURCE_DIR } from "./layout.ts";
import type { Workspace } from "./layout.ts";
import type { Ir8 } from "./v1/ir.ts";
import { adapterSkeleton8, contract8, specHash8, stableStringify8, verify8 } from "./v1/generate.ts";

// テスト側ファイルの生成 (TypeScript を対象とするとき)。フレームワークが生成するのはテスト側だけで、本番コードには何も置かない。
// 出力は IR だけから決まる（日時・CLI バージョンは埋めない）。中身は v1/generate.ts にある。

export type Ir = Ir8;

// 作業場所の中で、依頼文と添付資料を置くディレクトリ
export const TEST_DIR = CONTROL_DIR;
// 本番コードの既定のディレクトリ名
export const SOURCE_DIR = DEFAULT_SOURCE_DIR;

// 対象言語によらないファイル
export const FILES = {
  ir: "ir.json",
  request: "REQUEST.md",
} as const;

// TypeScript を対象とするときの、テスト側のファイル名
export const TS_FILES = {
  contract: "adapter.contract.ts",
  adapter: "adapter.ts",
  verify: "verify.ts",
} as const;

// アダプターの雛形が出すエラー。本番コードの「未実装」とは別の文言にする。
// 同じだと、配線の段階が何も書かなくても「未実装で失敗した」ように見えて、赤の確認を通ってしまう
export { ADAPTER_NOT_WRITTEN } from "./v1/generate.ts";

export const stableStringify = stableStringify8;
export const specHash = specHash8;
export const generateContract = (ir: Ir): string => contract8(ir);
export const generateAdapterSkeleton = (ws: Workspace, ir: Ir): string => adapterSkeleton8(ws, ir);
export const generateVerify = (ir: Ir, ws: Workspace, specsDir: string): string => verify8(ir, ws, specsDir);

// 検証のシード。仕様のハッシュから決める（検証を決定的にするため）
export const seedOf = (ir: Ir): number => Number.parseInt(specHash(ir).slice("sha256:".length, "sha256:".length + 7), 16);
