import type { Violation } from "./check.ts";
import type { Ir } from "./generate.ts";
import type { Workspace } from "./layout.ts";
import type { MutationStrategy } from "./mutation.ts";
import type { PbtResult } from "./runtime.ts";
import type { StaticCheckStrategy } from "./static-check.ts";

// 対象言語: 本番システムを書く言語に依存する処理を、1つにまとめたもの。
//
// 実装の流れ (loop.ts) とゲート (gates.ts) は、このインターフェースだけに依存する「型どおりの流れ」で、
// 言語を知らない。言語ごとの違いは、すべてここの実装の内側に置く。
//   - 仕様の読み込み・型チェック・事前検査・IR の抽出は、対象言語に依存しない（仕様は常に TypeScript）
//   - 期待値の計算も常に TypeScript で行う。対象が別の言語のとき、本番システムとのやり取りが
//     プロセスをまたぐことになるが、それは runTests の実装の内側の話で、ゲートからは見えない
//
// 現在の実装は TypeScript 用 (target-typescript.ts) だけ。

// そのコンポーネントの検証が、本番コードのどこを実行したか。
// ファイルとコンポーネントは多対多で、「だれのコードか」は書いた経緯ではなく、使っている事実で決める
export type Usage = {
  // そのファイルの振る舞い（関数の中身。関数を持たないファイルは、読み込まれたこと）を実行したか
  uses(file: string): boolean;
  // そのファイルの、その位置（文字のオフセット）を実行したか
  executed(file: string, offset: number): boolean;
};

export type TestRun = {
  // テストを最後まで実行できたときの結果
  result?: PbtResult;
  // 実行した範囲（usage: true で実行し、対象言語が調べられるとき）
  usage?: Usage;
  // 実行できなかったとき（構文エラーなど）の出力
  crash?: string;
};

export interface Target {
  name: string;

  // --- テスト側の生成 ---
  // テスト側のファイル名（置き場所と接頭辞は配置 (layout.ts) が決める）
  files: {
    // アダプターが満たすべき契約（生成。書き換え不可）
    contract: string;
    // アダプター（雛形を生成し、配線の段階でエージェントが埋める）
    adapter: string;
    // テストの入口（生成。書き換え不可。作業場所には渡さない）
    verify: string;
  };
  generate: {
    contract(ir: Ir): string;
    adapterSkeleton(ws: Workspace): string;
    verify(ir: Ir, ws: Workspace, specsDir: string): string;
  };

  // --- 出口ゲートの検査 ---
  // 余計なもの検査: 本番コードとアダプターの依存、生成ファイルの改ざん。scope が "source" なら本番コードだけ
  check(ws: Workspace, ir: Ir, specsDir: string, scope: "all" | "source"): Violation[];
  // 実装の静的検査。言語によっては無い
  staticCheck: StaticCheckStrategy | undefined;
  // 本番コードを実行せずに読み込めることを確かめる。失敗したら、その出力を返す
  load(ws: Workspace): string | undefined;
  // PBT を実行する。期待値の計算と本番システムの操作をどうつなぐかは、実装が決める
  // usage: true なら、実行した範囲も調べる（調べられない言語では、TestRun.usage は無い。
  // そのときゲートは、範囲を本番コードの全体として扱う）
  runTests(input: { ws: Workspace; seed: number; runs: number; drafts: boolean; usage?: boolean }): TestRun;
  // 振る舞いを持たないファイル（型だけ、など）か。実行されないので、だれが使っているかを調べられない
  inert?(ws: Workspace, rel: string): boolean;
  // ミューテーションの壊し方。言語によっては無い
  mutation: MutationStrategy | undefined;

  // --- エージェントとの取り決め ---
  // 骨組みの未実装部分が出すエラーの文言。配線の段階で「未実装による失敗」を見分けるのに使う
  notImplemented: string;
  // 依頼文のうち、言語に依存する部分（英語）。パスの書き方は配置による
  request(ws: Workspace): {
    // 本番コードが守る、言語と依存に関する規則（箇条書き）
    sourceRules: string;
    // 骨組みの、振る舞いを持つはずの本体に書く文
    skeletonBody: string;
    // アダプターの各メンバーに何を書くか（箇条書き）
    adapterGuide: string;
    // アダプターが依存してよいもの（1文）
    adapterImports: string;
    // 公開している名前やシグネチャを変えたときに、差し戻しに現れるエラーの例
    signatureErrorExample: string;
  };
}
