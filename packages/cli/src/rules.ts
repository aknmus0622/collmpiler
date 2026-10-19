// 出口の門の判定 (採点の部品 gate-rules の Stage 0、手書き)。判断を持たない糊 (gates.ts) が事実を集めて尋ね、判定はここが下す。
// 同じ判定を、フレームワーク自身の仕様から生成した部品 (self/specs/gate-rules.*) も下せる。採点の部品なので、R1〜R5 に従う
// (SELF_HOSTING.md §10.3): 普段は両方を走らせて厳しい側を取り、その部品を作り直すときは Stage 0 だけで採点する

// 作業場所のファイル1つ: 取り出すか、違反か
export type SandboxFileFacts = {
  hidden: boolean; // 隠しファイルか、依頼文
  toolchain: boolean; // 道具のファイル（型定義）か
  toolchainIntact: boolean;
  regular: boolean; // ふつうのファイルか（シンボリックリンクなどでない）
  phase: "design" | "wiring" | "implementation";
  isAdapter: boolean;
  isSource: boolean;
  input: boolean; // 入口で置いたものか
  inputIntact: boolean;
};
export type SandboxFileVerdict = "skip" | "take" | "keep" | "toolchain-modified" | "not-regular" | "unexpected" | "input-modified";
export function sandboxFileStage0(facts: SandboxFileFacts): SandboxFileVerdict {
  if (facts.hidden) return "skip";
  if (facts.toolchain) return facts.toolchainIntact ? "keep" : "toolchain-modified";
  if (!facts.regular) return "not-regular";
  if (facts.phase === "wiring" ? facts.isAdapter : facts.isSource) return "take";
  if (!facts.input) return "unexpected";
  return facts.inputIntact ? "keep" : "input-modified";
}

// 入口で置いたのに、作業場所から消えたファイル
export type RemovedInputFacts = { phase: "design" | "wiring" | "implementation"; isAdapter: boolean; isSource: boolean };
export const removedInputStage0 = (facts: RemovedInputFacts): "ok" | "removed" => ((facts.phase === "wiring" ? facts.isAdapter : facts.isSource) ? "ok" : "removed");

// 含む部品のファイル: 書き換えられていたら、元に戻して差し戻す
export type PartFileFacts = { changed: boolean; existedBefore: boolean };
export const partFileStage0 = (facts: PartFileFacts): "keep" | "restore" => (facts.changed && facts.existedBefore ? "restore" : "keep");

// 配線の段階の赤: 本番コードに未実装の部分が残っているなら、PBT は合格してはならない。
// 失敗したなら、未実装のためでなければならない（アダプターの誤りで先に落ちていない）
export type WiringFacts = { passed: boolean; unimplemented: boolean; error: "none" | "not-implemented" | "other" };
export const wiringStage0 = (facts: WiringFacts): "ok" | "passes-unimplemented" | "adapter-error" =>
  facts.passed ? (facts.unimplemented ? "passes-unimplemented" : "ok") : facts.error === "other" ? "adapter-error" : "ok";

// 緑と回帰: 合格しなければならない
export type TestsFacts = { passed: boolean; purpose: "implementation" | "regression" };
export const testsStage0 = (facts: TestsFacts): "ok" | "failed" | "regression" => (facts.passed ? "ok" : facts.purpose === "regression" ? "regression" : "failed");

// 書いてよい範囲: ほかのコンポーネントだけが使っているコードは、書き換えられない
export type ChangedFileFacts = { changed: boolean; usedByThis: boolean; inert: boolean; usedByOthers: boolean };
export const changedFileStage0 = (facts: ChangedFileFacts): "keep" | "out-of-scope" =>
  facts.changed && !facts.usedByThis && !facts.inert && facts.usedByOthers ? "out-of-scope" : "keep";

// 壊す範囲: このコンポーネントが実行した所は壊す。ほかが実行した所は壊さない。だれも実行していない所は、
// このコンポーネントが使うファイルか、だれも使わないファイルの中なら壊す（アダプターが判断を肩代わりすると、本番コードの
// 判断は実行されなくなる。それを見逃さないため）
export type MutationSiteFacts = { executedByThis: boolean; executedByOthers: boolean; fileUsedByThis: boolean; fileUsedByOthers: boolean };
export const mutationSiteStage0 = (facts: MutationSiteFacts): boolean =>
  facts.executedByThis || (!facts.executedByOthers && (facts.fileUsedByThis || !facts.fileUsedByOthers));
