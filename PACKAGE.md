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
│   ├── typia-transformer/     # (3) Typiaを用いたAOTバリデーション生成ラッパー
│   └── cli/                   # (4) ユーザーが叩くCLIツール (npx aac build 等)
│
├── plugins/                   # 各言語・ツール向けのジェネレータ (Layer 1.5 -> Layer 3)
│   ├── gen-typescript/        # TS向けPBT(fast-check)とZod/Typiaバリデーション生成
│   ├── gen-golang/            # Go向けPBT(rapid)と構造体・バリデーション生成
│   ├── gen-rust/              # Rust向けPBT(proptest)とstruct生成
│   └── gen-mermaid/           # IRからDFDやイベントストーミング図を生成するエクスポーター
│
└── examples/                  # テスト兼デモ用プロジェクト
    ├── e-commerce-spec/       # (Layer 1/2) 共通の仕様定義パッケージ（TSのみ）
    ├── e-commerce-go-backend/ # GoによるLayer 3実装とPBTテスト
    └── e-commerce-ts-backend/ # TSによるLayer 3実装とPBTテスト

```

---

## 3. 各パッケージの責務詳細

### 📁 `packages/core`

ユーザー（PdM・エンジニア）が `specs/` ディレクトリ内でインポートして使う、極めて薄いライブラリです。ランタイムのロジックはほぼ持ちません。

* **責務:**
* 多重度DSLの型定義 (`One<T>`, `Some<T>`, `Many<T>`)
* DMNの型定義 (`DecisionTable<T>`, `applyDecision()`)
* 振る舞い定義のヘルパー (`defineBehaviors()`, `bindDecisionDetails()`)


* **依存関係:** 外部依存ゼロ（ピュアTS）。

### 📁 `packages/compiler`

このプロジェクトの「心臓部」です。`core` を使って書かれたユーザーの `.spec.ts` ファイルを読み込みます。

* **責務:**
* TypeScript Compiler API を用いて AST（抽象構文木）を走査。
* `defineBehaviors` や `DecisionTable` の構造を静的解析（またはSandbox上での安全な動的評価）し、情報を抽出。
* 抽出したデータを言語非依存の **Universal IR (`universal-spec.ir.json`)** にシリアライズして出力。



### 📁 `packages/cli`

ユーザーがプロジェクトのルートで叩くコマンドラインツールです。

* **責務:**
* `aac.config.ts` を読み込み、対象の仕様ファイルと出力先（プラグイン）を解決。
* コマンドの実行:
* `npx aac compile` (TS -> IR)
* `npx aac generate` (IR -> Plugin経由で各言語のコード出力)
* `npx aac test --seed 123` (PBTランナーのキック、Shrinkのログ制御)





### 📁 `plugins/gen-*` (Generator Plugins)

Compilerが出力した Universal IR（JSON）を入力として受け取り、各エコシステムのコードを出力する独立したモジュール群です。

* **責務:**
* **型定義の生成:** IRから、Goの `struct`、Rustの `enum` 等を生成。
* **PBTエンジンの生成:** IRの `arbitrary`（入力生成）と `transition`（期待される次状態）の情報を、ターゲット言語のPBTライブラリ（`fast-check`, `gopter`, `proptest`）が解釈できるテストコードに変換。
* **Adapter Contract の生成:** テスト対象システムが実装すべきインターフェース（`TargetSystemAdapter`）を生成。



---

## 4. `aac.config.ts` (ユーザーのプロジェクト設定例)

ユーザー（例えば `examples/e-commerce-go-backend`）は、このツールを導入する際に以下のような設定ファイルを書きます。これにより、パイプラインが繋がります。

```typescript
// aac.config.ts
import { defineConfig } from "@aac/cli";

export default defineConfig({
  // 1. 仕様書の場所 (Layer 1, 2)
  specs: ["../e-commerce-spec/**/*.spec.ts"],
  
  // 2. 出力する Universal IR の保存先 (Layer 1.5)
  irOutput: "./generated/aac-ir.json",
  
  // 3. 連携するジェネレータプラグインと出力先 (Layer 3)
  plugins: [
    // Go言語向けのコード生成（TargetSystemAdapter と gopter 用テストコード）
    "@aac/gen-golang": {
      outDir: "./internal/generated/",
      packageName: "generated",
    },
    // ドキュメントの自動生成
    "@aac/gen-mermaid": {
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
* `packages/core` (多重度DSLとDMNの型) の実装。
* `packages/compiler` は作らず、**TypeScript (Node.js) 上での動的評価**と `fast-check` だけを使って、`examples/e-commerce-ts-backend` を完成させる。（他言語展開はいったん後回し）。


* **Phase 2 (Universal IR の抽出):**
* 動的評価で動いている TS のステートマシン情報を JSON化（Universal IR化）するロジックを追加。
* `packages/compiler` を切り出す。


* **Phase 3 (マルチ言語展開):**
* `plugins/gen-golang` などを実装し、JSON から Goコードを生成。
* `examples/e-commerce-go-backend` を完成させる。


* **Phase 4 (Observability & Docs):**
* `plugins/gen-mermaid` による DFD 自動生成。
* CLIでの Trace Visualizer ログ出力、Deterministic Replay の洗練。
