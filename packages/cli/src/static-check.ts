import type { Violation } from "./check.ts";
import { typecheck } from "./typecheck.ts";

// 実装の静的検査: LLM が書いた本番コードとアダプターを、実行せずに調べる。
//
// 仕様の型チェック (typecheck.ts の typecheckSpecs) とは別物として扱う:
//   仕様   … 常に TypeScript。結び付けの漏れや typo を防ぐ、フレームワークの保証の一部。外せない
//   実装   … 対象システムの言語に依存する。誤りを早く・分かりやすく差し戻すための層で、
//            合否を決めるのは PBT。動的型の言語ではできることが少なく、無くてもよい
// そのため実装の側だけを Strategy にしている。Strategy が担うのは「誤りの一覧を返す」ことだけで、
// どの段階で何を対象にするか、誤りをエージェントにどう伝えるかは、ゲート (gates.ts) が決める。

export type StaticCheckInput = {
  // 出力先のディレクトリ
  dir: string;
  // 調べるファイル (dir からの相対パス)。本番コード、段階によってはアダプターと契約
  files: string[];
};

export interface StaticCheckStrategy {
  name: string;
  check(input: StaticCheckInput): Violation[] | Promise<Violation[]>;
}

// TypeScript: 型チェック。Node がそのまま実行できる構文だけを許す設定なので、
// 「型は通るが実行できない」コードもここで見つかる
export const tscStaticCheck: StaticCheckStrategy = {
  name: "tsc",
  check: ({ dir, files }) => typecheck(dir, files),
};

export function selectStaticCheck(name: string): StaticCheckStrategy | undefined {
  if (name === "off") return undefined;
  // auto: 対象の言語に合う検査を選ぶ。いまは対象が TypeScript だけなので、常に tsc になる
  if (name === "auto" || name === "tsc") return tscStaticCheck;
  throw new Error(`未知の static check: ${name} (auto / tsc / off)`);
}
