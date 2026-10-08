> **現状との関係:** 本書は長期的な到達点を描いたものです。当面の構成は `DISTRIBUTION.md` §6 に従い、`packages/core` と `packages/cli` だけを作っています（`packages/compiler` と `plugins/` は未作成で、相当する機能は `packages/cli/src/` 内にあります）。
> また、フレームワークが生成するのは**テスト側のコードだけ**です。本番コードは IR を入力に LLM エージェントが書きます（`SPEC.md` §2.3）。

## 1. モノレポ・ツールチェーンの選定

* **パッケージマネージャー:** `pnpm` (Workspace機能による高速な依存解決)
* **タスクランナー:** `Turborepo` または `Nx` (依存関係を解釈したキャッシュと並列ビルド)
* **パッケージ公開:** `changesets` (バージョン管理とChangelogの自動化)

---

## 2. パッケージ構成 (Directory Structure)

リポジトリルートを `packages/`（基盤のコアモジュール）、`plugins/`（各言語向けジェネレータ等）、`examples/`（サンプルプロジェクト）の3つに大きく分割します。

```text
aac-engine-monorepo/
├── pnpm-workspace.yaml
├── turbo.json
├── package.json
│
├── packages/                  # プラットフォームのコアモジュール
│   ├── core/                  # (1) Layer 1/2 を記述するための型・ユーティリティ
│   ├── compiler/              # (2) TS(AST) -> Universal IR に変換する中核エンジン
│   ├── typia-transformer/     # (3) 【不採用】Typia はビルド時の変換が必要で、ビルドなし方針と衝突する。
│   │                          #     代わりに値として書くドメインモデルから型を導出する (SPEC.md §3.1)
│   └── cli/                   # (4) ユーザーが叩くCLIツール (npx clp build 等)
│
├── plugins/                   # 各言語・ツール向けのジェネレータ (IR -> Layer 3)。生成するのはテスト側のみ
│   ├── gen-typescript/        # TS向けPBT(fast-check)のグルーとアダプター契約
│   ├── gen-golang/            # Go向けPBT(rapid)のグルーとアダプター契約
│   ├── gen-rust/              # Rust向けPBT(proptest)のグルーとアダプター契約
│   └── gen-mermaid/           # IRからDFDやイベントストーミング図を生成するエクスポーター
│
└── examples/                  # テスト兼デモ用プロジェクト（本番コードは LLM エージェントが書いた成果物）
    ├── e-commerce-spec/       # (Layer 1/2) 共通の仕様定義パッケージ（TSのみ）。現在は examples/<名前>/specs/
    ├── e-commerce-go-backend/ # Goの本番コード(src)とテスト側(clp)
    └── e-commerce-ts-backend/ # TSの本番コード(src)とテスト側(clp)。現在は examples/checkout-ts

```

---

## 3. 各パッケージの責務詳細

### 📁 `packages/core`

ユーザー（PdM・エンジニア）が `specs/` ディレクトリ内でインポートして使う、極めて薄いライブラリです。ランタイムのロジックはほぼ持ちません。

* **責務:**
* 仕様を書くための語彙（`DSL.md`）。すべての要素は節で、`component()` が節を束ねる。`{}` から節への変換、文法の表、木の検査。
* 決定表の定義 (`decisionTable()`)
* 解釈 (`interpretation()`)。Layer 2。LLM が導く。Layer 1 が書かなかった構造（宣言と参照: `ref.input` / `ref.data` / `ref.query` / `ref.decision` / `ref.calculation` / `ref.was`）と、名前の意味（関数）。Layer 1 への重ね合わせ (`resolveComponent()`)、意味の評価 (`decide()`, `calculate()`)


* **依存関係:** 外部依存ゼロ（ピュアTS）。

### 📁 `packages/compiler`

このプロジェクトの「心臓部」です。`core` を使って書かれたユーザーの `.spec.ts` ファイルを読み込みます。

* **責務:**
* TypeScript Compiler API を用いて AST（抽象構文木）を走査。
* `component` や `decisionTable` の構造を静的解析（またはSandbox上での安全な動的評価）し、情報を抽出。
* 抽出したデータを言語非依存の **Universal IR (`universal-spec.ir.json`)** にシリアライズして出力。



### 📁 `packages/cli`

ユーザーがプロジェクトのルートで叩くコマンドラインツールです。

* **責務:**
* `clp.config.ts` を読み込み、対象の仕様ファイルと出力先（プラグイン）を解決。
* コマンドの実行:
* `clp compile`（仕様の検査と、IR の出力）
* `clp interpret`（解釈を LLM に導かせる。`--accept` で確定する）
* `clp verify --seed 123`（すでにある本番コードを検証する。PBT の実行と、反例の再現）
* `clp apply --agent "<command>"` (LLM エージェントに本番コードを書かせ、検査と PBT を合格するまで差し戻す)





### 📁 `plugins/gen-*` (Generator Plugins)

Compilerが出力した Universal IR（JSON）を入力として受け取り、各エコシステムのコードを出力する独立したモジュール群です。

* **責務:**
* **型定義の生成:** IRから、アダプター契約で使う型（Goの `struct`、Rustの `enum` 等）を**テスト側に**生成。本番コード用の型は生成しない。
* **PBTエンジンの生成:** IRの `arbitrary`（入力生成）と `transition`（期待される次状態）の情報を、ターゲット言語のPBTライブラリ（`fast-check`, `gopter`, `proptest`）が解釈できるテストコードに変換。
* **Adapter Contract の生成:** テスト側のアダプターが実装すべきインターフェース（`TargetSystemAdapter`）と、その雛形を生成。



---

## 4. `clp.config.ts` (ユーザーのプロジェクト設定例)

ユーザー（例えば `examples/e-commerce-go-backend`）は、このツールを導入する際に以下のような設定ファイルを書きます。これにより、パイプラインが繋がります。

```typescript
// clp.config.ts
import { defineConfig } from "@clp/cli";

export default defineConfig({
  // 1. 仕様書の場所 (Layer 1, 2)
  specs: ["../e-commerce-spec/**/*.spec.ts"],
  
  // 2. 出力する Universal IR の保存先 (Layer 1.5)
  irOutput: "./generated/clp-ir.json",
  
  // 3. 連携するジェネレータプラグインと出力先 (Layer 3)
  plugins: [
    // Go言語向けのコード生成（TargetSystemAdapter と gopter 用テストコード）
    "@clp/gen-golang": {
      outDir: "./internal/generated/",
      packageName: "generated",
    },
    // ドキュメントの自動生成
    "@clp/gen-mermaid": {
      outDir: "./docs/diagrams/",
      format: "markdown"
    }
  ]
});

```

---

## 5. 開発の進め方（フェーズ分け）

これだけ巨大な構想を一気に作ると頓挫します。以下のフェーズで順にマイルストーンを置くことをお勧めします。

* **Phase 1 (Proof of Concept):**
* `packages/core` (ドメインモデル、多重度DSL、DMNの型) の実装。
* `packages/compiler` は作らず、**TypeScript (Node.js) 上での動的評価**と `fast-check` だけを使って、TS の例を完成させる。（他言語展開はいったん後回し）。
* 本番コードを LLM エージェントに書かせるループ（生成 → エージェント → 余計なもの検査 → PBT → 差し戻し）を通す。
* 残り: 複数ステップの経路探索、値オブジェクトと制約、多重度の値レベル化、`clp` コマンド。


* **Phase 2 (Universal IR の抽出):**
* 動的評価で動いている TS のステートマシン情報を JSON化（Universal IR化）するロジックを追加。（LLM への入力として必要になったため、Phase 1 で先行実装済み。仕様に関数が無いので、宣言を並べ直すだけで抽出できる）
* `packages/compiler` を切り出す。


* **Phase 3 (マルチ言語展開):**
* `plugins/gen-golang` などを実装し、JSON から Goコードを生成。
* `examples/e-commerce-go-backend` を完成させる。


* **Phase 4 (Observability & Docs):**
* `plugins/gen-mermaid` による DFD 自動生成。
* CLIでの Trace Visualizer ログ出力、Deterministic Replay の洗練。
