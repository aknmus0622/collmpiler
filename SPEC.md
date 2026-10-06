# 企画・詳細設計書: Specification & Verification Engine

## 1. 全体企画 (Overall Concept)

本プラットフォームは、本番システムの実装アーキテクチャ（MVC、DDD、DB選定等）には一切干渉せず、「仕様（Spec）と検証（Verification）の完全なる同期」のみを責務とする独立したテスト・検証エンジンです。

「仕様書がそのまま動く」という幻想を捨て、「仕様は純粋なデータとして存在し、プラットフォームはそれをステートマシンとして解釈し、本番実装を外部から数学的に検証する」というアプローチをとります。

### コア・バリュー

### コア・バリュー

1. **実装の完全解放 (Zero Lock-in):** プラットフォームは「検証」のみを担います。DB設計、状態のマイグレーション（Upcaster）、トランザクション制御など、本番のアーキテクチャには一切の制約を与えません。
2. **TS-Native 純粋データ仕様:** 仕様書は、ロジックを含まない純粋な TypeScript データとして記述されます。多重度DSLと自然言語キーを用いたデシジョンテーブル（DMN）を「真の源泉」とします。
3. **完全な決定論的テスト (Deterministic PBT):** ランダム生成を行うPBTエンジンと、DB等の副作用を持つ本番システムを安全に接続するため、厳格な「状態分離契約（Isolation Contract）」を導入します。
4. **極限のデバッグ体験 (Observability):** エラー発見時、「最小失敗経路（Shrinking）」への自動圧縮、「状態差分（State Diff）」の可視化、「1-Clickリプレイ」を提供し、原因特定を数分で完了させます。
5. **TypeScript as IDL (仕様記述言語としてのTS):** YAMLやカスタム言語の劣悪なDXを排し、世界最高峰の型システムを持つ TypeScript を「仕様とドメインを記述するためのメタ言語」として採用します。
6. **Universal IR (中間表現) によるマルチ言語展開:** TSで書かれた仕様をプラットフォームがコンパイルし、言語非依存の `Universal IR (JSON)` を出力します。これを元に、各言語向けのネイティブなPBT（プロパティベーステスト）コードを自動生成します。
7. **イベントストーミング＆DFDの自動同期:** 仕様書（Layer 1）から、データフロー図（DFD）や状態遷移図を動的に自動生成し、モデリングの付箋とコードが永久に同期する世界を実現します。


---

## 2. 詳細設計 (Detailed Design)

本基盤は、プラットフォームが統治する「3層の検証レイヤー（IN SCOPE）」**と、開発者が自由に実装する**「ターゲットシステム（OUT OF SCOPE）」**、そして両者を繋ぐ**「アダプター」によって構成されます。

### 2.1. 究極の関心事の分離

| 領域 | レイヤー | 責務と特性 |
| --- | --- | --- |
| **IN SCOPE**(プラットフォーム) | **Layer 1: Spec** | 業務の真実（What）を宣言する純粋データ。関数は一切禁止。`as const` と `satisfies` を用いた型安全なDMN。 |
|  | **Layer 2: Binding** | Layer 1から推論された自然言語キーに基づき、内部状態の評価関数（How）を実装し詳細を隔離する。 |
|  | **Layer 2.5: Universal IR** | Layer 1と2をプラットフォームが評価・コンパイルして出力する、**完全な言語非依存のJSON AST**。 |
|  | **Layer 3: Verification** | Layer 1, 2から構築されるPBTエンジン。State-Drivenで経路探索を行い、Target Systemのアダプターを操作して検証する。 |
| **境界線** | **Adapter Contract** | テストごとの状態リセット（`setup` / `teardown`）を強制し、決定論的なリプレイを可能にするインターフェース。 |
| **OUT OF SCOPE**(開発者の自由) | **Target System** | 本番のアプリケーション実装。DB操作、非同期処理、古いデータのUpcaster処理等のアーキテクチャ全般。 |

### 2.2. PBTエンジンの可観測性（デバッグ体験）

PBTエンジンがエラーを発見した場合、巨大なログダンプを避け、以下のステップでデバッグ体験を提供します。

* **自動 Shrinking:** エラー発見後、エンジンがアダプターの「状態リセット」を駆使して再試行を繰り返し、エラーが発生する最短手順（例: 15手 → 3手）を特定する。
* **State Diff の可視化:** Trace Visualizer にて、最小化された手順ごとに「直前の状態から何が変化したか（Delta）」と「発行されたCommand」のみをハイライトする。
* **決定論的リプレイ:** エンジニアが `npx pbt-runner --seed X --path Y` をローカルで実行。「DBの初期化契約」により、CI上のクラッシュをローカル環境で100%再現する。

---

## 3. 詳細スキーマ (Detailed Schema)

各レイヤーの実体となる TypeScript スキーマおよびコード設計です。

### 3.1. Layer 1: 多重度DSLと自然言語DMN (Spec)

ランタイムライブラリを排除し、純粋なデータ定義のみで業務ルールを宣言します。プラットフォームが提供する `DecisionTable` 型により、フォールバック（`default`）の記述をコンパイルレベルで強制します。

```typescript
// --- platform-core/types.ts ---
export type One<T> = T;
export type Lone<T> = T | undefined;
export type Some<T> = [T, ...T[]];
export type Many<T> = T[];

// DMNのコア型。文字列キーに加え、必ず "default" キーを要求する
export type DecisionTable<Outputs> = Record<string, Outputs> & { "default": Outputs };

// --- specs/campaign.dmn.ts (Layer 1) ---
import type { DecisionTable } from "platform-core";
import type { DomainCommand } from "./vocabulary.ts";

export type CampaignOutputs = { discount: number; effects: DomainCommand[] };

// 【真の源泉】
// as const: キーを厳密な文字列リテラルとして推論させ、Layer 2でのInferred Dictionaryを実現する。
// satisfies: as constの推論を保ちつつ、defaultの記述漏れや型エラーを厳格にチェックする。
export const CampaignRules = {
  "ゴールド会員であり、かつ月末の場合": {
    discount: 0.20,
    effects: [{ action: "IssueCoupon", payload: { type: "Premium" } }]
  },
  "シルバー会員の場合": { discount: 0.05, effects: [] },
  "default": { discount: 0.0, effects: [] } // 必須フォールバック
} as const satisfies DecisionTable<CampaignOutputs>;

// --- specs/order.spec.ts (Layer 1) ---
import { defineBehaviors, applyDecision } from "platform-core";
import { CampaignRules } from "./campaign.dmn.ts";
import type { OrderStates, DomainCommand } from "./vocabulary.ts";

export const behaviors = defineBehaviors<OrderStates, DomainCommand>({
  Checkout: {
    where: ["外部決済モジュールが有効な場合"],
    cases: {
      "PaymentSuccess": (state) => {
        // ロジックは持たず、表データ(DMN)を適用（applyDecision）し、その結果をマッピングするのみ
        const campaign = applyDecision(CampaignRules, state);
        
        return state.PAID({
          event: "決済完了",
          effects: [
            { action: "SendReceipt", payload: { discount: campaign.discount } },
            ...campaign.effects
          ]
        });
      }
    }
  }
});

```

#### case 本体の構文制限

`cases` の関数は「表（DMN）を適用し、その結果を遷移にマッピングする」ことだけを行います。IR はこの関数を記号的な `state` で抽象実行して抽出するため、分岐や演算を書くと片方の経路だけが記録された誤った IR になります。そこで case 本体に書ける構文をホワイトリストで制限し、違反はコンパイル時に `forbidden-syntax` エラーとします。

* **書けるもの:** `const` 宣言、`return`、リテラル、プロパティ参照、関数呼び出し、配列・オブジェクトのスプレッド、分割代入。
* **書けないもの:** `if` / `switch` / 三項演算子、比較（`===`, `>` 等）、論理演算（`&&`, `||`, `??`, `!`, `?.`）、算術・文字列連結・テンプレートリテラルへの埋め込み、既定値、`let` / 再代入、ループ、`try`、`async` / `await`。

**分岐と演算はすべて DMN の行と列に寄せます。** 例えば「割引の2倍」が必要なら、計算結果を列として表に持たせます。

### 3.2. Layer 2: 逆引き推論とバインディング (Binding)

Layer 1の自然言語キーから型を自動抽出し（Inferred Dictionary）、実装漏れをコンパイルエラーとして防ぎます。

```typescript
// --- specs/vocabulary.ts (Layer 2) ---
import { bindDecisionDetails } from "platform-core";
import { CampaignRules } from "./campaign.dmn.ts";

// Layer 1のキーから推論（二重管理・ボイラープレートの排除）
type CampaignConditions = keyof typeof CampaignRules;

// 実行時に複数の true が出た場合は RuleConflictError (Hit Policy: Unique) を投げる
export const CampaignEvaluator = bindDecisionDetails<CampaignConditions>(CampaignRules, {
  "ゴールド会員であり、かつ月末の場合": (state) => state.rank === "Gold" && state.isMonthEnd,
  "シルバー会員の場合": (state) => state.rank === "Silver",
  "default": () => true
});

// 仕様として許可される副作用（Command）の型定義
export type DomainCommand = 
  | { action: "SendReceipt"; payload: { discount: number } }
  | { action: "IssueCoupon"; payload: { type: "Premium" | "Standard" } };

```
### 3.3. Layer 2.5: Universal IR (中間表現へのコンパイル)

プラットフォームは Layer 1 と Layer 2 の TypeScript を評価し、対象言語のジェネレータが読み込めるフラットな JSON (Universal IR) を出力します。

```json
// --- generated/universal-spec.ir.json (Layer 1.5) ---
{
  "behaviors": [
    {
      "name": "Checkout",
      "preconditions": ["IsPaymentModuleActive"],
      "transitions": {
        "PaymentSuccess": {
          "nextState": "PAID",
          "emittedCommands": [
            { "action": "SendReceipt", "payloadSchema": { "discount": "number" } }
          ]
        }
      }
    }
  ],
  "multiplicity": { ... }
}

```

### 3.4. Layer 3: 各言語向け PBT Verification Engine

Universal IR から、対象システムの実装言語（例: Go言語）に合わせたPBT（例: `gopter` や `rapid`）のテストコードと、ターゲットシステム用のアダプターインターフェースを自動生成します。

```go
// --- generated/pbt/target_adapter.go (Go言語向け生成コード例) ---
package pbt

// プラットフォームが要求する状態分離・実行コントラクト
type TargetSystemAdapter interface {
    SetupIsolation() error
    TeardownIsolation() error
    ExecuteAction(actionName string, input map[string]interface{}) error
    GetCurrentState() (OrderState, error)
    GetFiredCommands() ([]DomainCommand, error)
}

// --- generated/pbt/engine.go ---
// State-Driven な PBT の自動生成コード。
// (GoのネイティブPBTライブラリを使って数十万件のエッジケースを回す)

```

---

### 3.5. テスト境界: 状態分離契約を備えた Target System Adapter

PBTエンジン（Layer 3）と本番システムを安全に接続し、決定論的なテストを成立させるためのアダプター・インターフェースです。

```typescript
// --- platform-core/adapter.ts ---
export interface TargetSystemAdapter<State, Command> {
  /**
   * 【分離契約】テストパス（またはShrinkの1試行）の開始前に呼ばれる。
   * 実装側はDBトランザクションの開始や、インメモリDBの初期化を行う。
   */
  setupIsolation(): Promise<void>;

  /**
   * 【分離契約】テストパスの終了後（成功・失敗問わず）に呼ばれる。
   * 実装側はDBへの変更（副作用）を完全にロールバックし、クリーンな状態に戻す。
   */
  teardownIsolation(): Promise<void>;

  // アクションの実行（本番のディスパッチャを叩く）
  executeAction(actionName: string, input: any): Promise<void>;
  
  // 現在の最新状態の取得（Upcaster等のマイグレーション処理は本番側で完了していること）
  getCurrentState(): Promise<State>;
  
  // 送信されたメールやキュー等の副作用を収集
  getFiredCommands(): Promise<Command[]>;
}

```

### 3.6. Layer 3: PBT Action Descriptor (Verification Engine)

Layer 1 と Layer 2 は、最終的に基盤内部で以下のステートマシン記述子に変換され、PBTエンジンへと引き渡されます。

```typescript
// --- platform-core/pbt-schema.ts (Internal) ---
import * as fc from "fast-check";

/**
 * PBTステートマシン（fast-check）が直接解釈できるアクション記述子
 */
export interface PBTActionDescriptor<State, Input> {
  name: string;
  
  // State-Driven: 事前条件で弾かれる無駄なテストを避けるため、現在の状態に応じた入力を生成
  arbitrary: (state: State) => fc.Arbitrary<Input>;
  
  // Layer 1の where/while と Layer 2の評価ロジックを合成
  check: (state: State) => boolean;
  
  // Layer 1の状態遷移（次状態と副作用のインテント）の導出
  transition: (state: State, input: Input) => { nextState: State, effects: DomainCommand[] };
}

```

## 4. イベントストーミング＆DFDの自動生成

Layer 1が「純粋なデータ」であることと、Layer 1.5（Universal IR）の存在により、ドメイン駆動設計のモデリング結果をシステムと直接同期できます。

* **付箋との1対1マッピング:** イベントストーミングで定義した Command (青)、Domain Event (オレンジ)、Policy (薄紫) が、そのまま Layer 1 の `behaviors`、`cases`、`DMN` に直結します。
* **DFD / アーキテクチャ図の自動出力:** プラットフォームのビルドステップで、Universal IR を解析して Mermaid.js 等のアーキテクチャ図を自動出力します。ドキュメントはソースコードから錬成されるため、絶対に腐敗しません。
