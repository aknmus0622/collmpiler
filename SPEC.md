# 企画・詳細設計書: Specification & Verification Engine

## 1. 全体企画 (Overall Concept)

本プラットフォームは、本番システムの実装アーキテクチャ（MVC、DDD、DB選定等）には一切干渉せず、「仕様（Spec）と検証（Verification）の完全なる同期」のみを責務とする独立したテスト・検証エンジンです。

「仕様書がそのまま動く」という幻想を捨て、「仕様は純粋なデータとして存在し、プラットフォームはそれをステートマシンとして解釈し、本番実装を外部から数学的に検証する」というアプローチをとります。

### コア・バリュー

1. **実装の完全解放 (Zero Lock-in):** プラットフォームは「検証」のみを担います。DB設計、状態のマイグレーション（Upcaster）、トランザクション制御など、本番のアーキテクチャには一切の制約を与えません。
2. **TS-Native 純粋データ仕様:** 仕様書は、ロジックを含まない純粋な TypeScript データとして記述されます。多重度DSLと自然言語キーを用いたデシジョンテーブル（DMN）を「真の源泉」とします。状態・データ・Command も値として宣言し、型は値から導出します（型は実行時に消えるため、値を源泉にしないと IR にも PBT にも渡せません）。
3. **完全な決定論的テスト (Deterministic PBT):** ランダム生成を行うPBTエンジンと、DB等の副作用を持つ本番システムを安全に接続するため、厳格な「状態分離契約（Isolation Contract）」を導入します。
4. **極限のデバッグ体験 (Observability):** エラー発見時、「最小失敗経路（Shrinking）」への自動圧縮、「状態差分（State Diff）」の可視化、「1-Clickリプレイ」を提供し、原因特定を数分で完了させます。
5. **TypeScript as IDL (仕様記述言語としてのTS):** YAMLやカスタム言語の劣悪なDXを排し、世界最高峰の型システムを持つ TypeScript を「仕様とドメインを記述するためのメタ言語」として採用します。
6. **Universal IR (中間表現) によるマルチ言語展開:** TSで書かれた仕様をプラットフォームがコンパイルし、言語非依存の `Universal IR (JSON)` を出力します。これを元に、各言語向けのネイティブなPBT（プロパティベーステスト）コードを自動生成します。
7. **イベントストーミング＆DFDの自動同期:** 仕様書（Layer 1）から、データフロー図（DFD）や状態遷移図を動的に自動生成し、モデリングの付箋とコードが永久に同期する世界を実現します。
8. **LLM をコンパイラとして使う (LLM as a Compiler):** 本番コードは、Universal IR を入力として LLM エージェントが書きます。フレームワークが生成するのはテスト側のコードだけで、PBT が合否を判定し、不合格なら反例をエージェントに差し戻します。PBT の反例が「コンパイルエラー」に相当します。


---

## 2. 詳細設計 (Detailed Design)

本基盤は、プラットフォームが統治する「3層の検証レイヤー（IN SCOPE）」**と、開発者が自由に実装する**「ターゲットシステム（OUT OF SCOPE）」**、そして両者を繋ぐ**「アダプター」によって構成されます。

### 2.1. 究極の関心事の分離

| 領域 | レイヤー | 責務と特性 | 書き手 |
| --- | --- | --- | --- |
| **IN SCOPE**(プラットフォーム) | **Layer 1: Spec** | 業務の真実（What）を宣言する純粋データ（ドメインモデルとDMN）。`as const` と `satisfies` で型安全にする。関数は `cases` のマッピングだけで、構文を制限する（§3.1）。 | 人 |
|  | **Layer 2: Binding** | Layer 1 の自然言語キー（DMN の条件、`where` の事前条件）に評価関数（How）を結び付ける。 | 人 |
|  | **Universal IR** | Layer 1 をプラットフォームが抽象実行して出力する、**完全な言語非依存のJSON**。Layer 2 の関数は含まない。 | 生成 |
|  | **Layer 3: Verification** | Layer 1, 2 から構築されるPBTエンジン。Target System をアダプター経由で操作して検証する。テスト側にのみ生成される。 | 生成 |
| **境界線** | **Adapter Contract** | テストごとの状態リセット（`setupIsolation` / `teardownIsolation`）を強制し、決定論的なリプレイを可能にするインターフェース。型は生成され、中身は実装エージェントが書く。 | 生成＋LLM |
| **OUT OF SCOPE**(開発者の自由) | **Target System** | 本番のアプリケーション実装。**プラットフォームはここに一切コードを置かない**（型もシグネチャも生成しない）。 | LLM（または人） |

### 2.2. PBTエンジンの可観測性（デバッグ体験）

PBTエンジンがエラーを発見した場合、巨大なログダンプを避け、以下のステップでデバッグ体験を提供します。

* **自動 Shrinking:** エラー発見後、エンジンがアダプターの「状態リセット」を駆使して再試行を繰り返し、エラーが発生する最短手順（例: 15手 → 3手）を特定する。
* **State Diff の可視化:** Trace Visualizer にて、最小化された手順ごとに「直前の状態から何が変化したか（Delta）」と「発行されたCommand」のみをハイライトする。
* **決定論的リプレイ:** エンジニアが `npx pbt-runner --seed X --path Y` をローカルで実行。「DBの初期化契約」により、CI上のクラッシュをローカル環境で100%再現する。

### 2.3. LLM による実装ループ

本番コードは人が手で書いても構いませんが、既定の経路は「IR を入力に LLM エージェントが書き、PBT が採点する」ループです。違反や反例は上限回数まで差し戻します。

```text
 specs/*.ts (Layer 1 / 2) ─────────────────────────────┐
      │                                                │
      │ ① 抽出                                         │ 具体実行
      ▼                                                │ （期待値の算出）
 Universal IR                                          │
      │                                                │
      │ ② テスト側を生成                                 │
      ▼                                                │
 aac/ ir.json, adapter.contract.ts, verify.ts          │
      adapter.ts (雛形), REQUEST.md ◀── 差し戻し ──┐     │
      │                                          │     │
      │ ③ 実装エージェント (外部コマンド)            │     │
      ▼                                          │     │
 src/ の本番コード + aac/adapter.ts の中身          │     │
      │                                          │     │
      ▼                                          │     │
 ④ 余計なもの検査 ───── 違反 ─────────────────────▶┤     │
      │ 合格                                      │     │
      ▼                                          │     │
 ⑤ PBT (verify.ts) ◀─────────────────────────────┼─────┘
      │        └── 反例（シード・最小入力・        │
      │            期待と実際の値）───────────────▶┘
      │ 合格
      ▼
 src/ を成果物として確定
```

#### 役割分担

| 書くもの | 書き手 | 置き場所 | 決定的か |
| --- | --- | --- | --- |
| 仕様 | 人 | `specs/` | はい |
| IR、PBT のグルー、アダプターの型と雛形 | プラットフォーム | テスト側（`aac/`） | はい |
| アダプターの中身 | LLM | テスト側（`aac/adapter.ts`） | いいえ |
| 本番コード | LLM | 本番側（`src/`。構成もAPIも自由） | いいえ |

* **テストケースは LLM に書かせません。** 採点基準を LLM に書かせると、実装とテストが同じ誤解をして合格してしまいます。
* **LLM に見せるのは IR だけです。** 仕様の TypeScript（特に Layer 2 の評価関数）は見せません。自然言語の条件（「ゴールド会員であり、かつ月末の場合」）をデータ定義に照らして解釈し実装するのが LLM の仕事であり、その解釈が正しいかを Layer 2 を正解として PBT が判定します。これは「IR が実装に十分な情報を持っているか」の検証も兼ねます。
* **決定性は検証側で保ちます。** LLM の出力は毎回変わるので、合格した本番コードを成果物として保存します。検証（④⑤）は決定的で、PBT のシードは仕様のハッシュから決めます。

#### 実装エージェントの取り決め

エージェントは外部コマンドとして呼びます（claude / codex / 自作スクリプトなどを差し替えられます）。プラットフォーム自体の依存は増えません。

* 作業ディレクトリをカレントディレクトリとして起動します。
* 依頼は `aac/REQUEST.md` に書かれています（環境変数 `AAC_REQUEST`）。試行回数は `AAC_ATTEMPT` で渡します。
* 2回目以降の `REQUEST.md` には、前回の検査違反または PBT の最小反例と、再現コマンドが載ります。
* エージェントは `src/` に本番コードを書き、`aac/adapter.ts` を埋めて終了します。

#### 余計なもの検査（PBT の前に実行）

| 検査 | 目的 |
| --- | --- |
| 本番コードが `src/` 内の相対 import しか使っていない（パッケージ、`node:` 組み込み、`import()` / `require()` は不可） | 本番コードがフレームワーク・仕様・テスト側に依存しないことの保証。仕様を読んで答えを写す抜け道も塞ぐ |
| 生成ファイル（`ir.json` / `adapter.contract.ts` / `verify.ts`）が再生成結果とバイト一致する。`src/` と `aac/` 以外にファイルが無い | 採点基準の改ざん防止 |
| アダプターが `adapter.contract.ts` と `src/` しか import していない。数値リテラル、状態データのフィールド名とその値、DMN の条件キーを含まない | アダプターに業務ロジックを書いて本番コードを空のまま合格する抜け道を塞ぐ。データの中身に触れられなければ業務上の分岐は書けない |

検査は構文解析ではなくトークン単位の機械的な判定であり、グローバル（`fetch` や `process`）経由の抜け道までは塞いでいません。また「仕様のソースを読まない」ことはエージェントへの指示に留まり、機械的には強制していません。

---

## 3. 詳細スキーマ (Detailed Schema)

各レイヤーの実体となる TypeScript スキーマおよびコード設計です。

### 3.1. Layer 1: ドメインモデルと自然言語DMN (Spec)

ランタイムライブラリを排除し、純粋なデータ定義のみで業務ルールを宣言します。

#### ドメインモデル（値が源泉、型は導出）

状態名・状態データ・Command は値として宣言し、TypeScript の型はそこから導出します。値として残るので、IR に出力でき、PBT の入力生成にも、LLM への情報提供にもそのまま使えます。

```typescript
// --- specs/order.model.ts (Layer 1) ---
import type { CommandsOf, DomainModel, StatesOf } from "@aac/core";

export const OrderModel = {
  initial: "PENDING",
  states: ["PENDING", "PAID"],
  data: {
    rank: ["Gold", "Silver", "Bronze"],   // 配列は列挙
    isMonthEnd: "boolean",                // 文字列はプリミティブ型
    paymentModuleActive: "boolean",
  },
  // 仕様として許可される副作用（Command）
  commands: {
    SendReceipt: { discount: "number" },
    IssueCoupon: { type: ["Premium", "Standard"] },
  },
} as const satisfies DomainModel;

export type OrderStates = StatesOf<typeof OrderModel>;
export type DomainCommand = CommandsOf<typeof OrderModel>;
```

多重度（`One<T>` / `Lone<T>` / `Some<T>` / `Many<T>`）は現時点では型としてのみ提供しています。型は IR に出せないため、値として宣言できる形への拡張が今後の課題です。数値の範囲などの制約、値オブジェクトの不変条件も同じ枠組みで扱う予定です。

#### デシジョンテーブルと振る舞い

プラットフォームが提供する `DecisionTable` 型により、フォールバック（`default`）の記述をコンパイルレベルで強制します。

```typescript
// --- packages/core ---
// DMNのコア型。文字列キーに加え、必ず "default" キーを要求する
export type DecisionTable<Outputs> = Record<string, Outputs> & { "default": Outputs };

// --- specs/campaign.dmn.ts (Layer 1) ---
import type { DecisionTable } from "@aac/core";
import type { DomainCommand } from "./order.model.ts";

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
import { defineBehaviors, applyDecision } from "@aac/core";
import { CampaignRules } from "./campaign.dmn.ts";
import type { OrderStates, DomainCommand } from "./order.model.ts";

export const behaviors = defineBehaviors<OrderStates, DomainCommand>({
  Checkout: {
    where: ["外部決済モジュールが有効な場合"],
    cases: {
      "PaymentSuccess": (state) => {
        // ロジックは持たず、表データ(DMN)を適用（applyDecision）し、その結果をマッピングするのみ
        const campaign = applyDecision(CampaignRules, state);

        return state.PAID({
          event: "Payment completed",
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

* `where` は事前条件です。満たさない状態での挙動は仕様の対象外で、PBT も検証しません。
* `cases` のキー（`"PaymentSuccess"`）は、アクションの結果の種類（outcome）です。決済の成否のような外部要因を表し、アクション実行時の入力として与えられます。

#### case 本体の構文制限

`cases` の関数は「表（DMN）を適用し、その結果を遷移にマッピングする」ことだけを行います。IR はこの関数を記号的な `state` で抽象実行して抽出するため、分岐や演算を書くと片方の経路だけが記録された誤った IR になります。そこで case 本体に書ける構文をホワイトリストで制限し、違反はコンパイル時に `forbidden-syntax` エラーとします。

* **書けるもの:** `const` 宣言、`return`、リテラル、プロパティ参照、関数呼び出し、配列・オブジェクトのスプレッド、分割代入。
* **書けないもの:** `if` / `switch` / 三項演算子、比較（`===`, `>` 等）、論理演算（`&&`, `||`, `??`, `!`, `?.`）、算術・文字列連結・テンプレートリテラルへの埋め込み、既定値、`let` / 再代入、ループ、`try`、`async` / `await`。

**分岐と演算はすべて DMN の行と列に寄せます。** 例えば「割引の2倍」が必要なら、計算結果を列として表に持たせます。

### 3.2. Layer 2: 逆引き推論とバインディング (Binding)

Layer 1の自然言語キーから型を自動抽出し（Inferred Dictionary）、実装漏れをコンパイルエラーとして防ぎます。`where` の事前条件にも同様に評価関数を結び付けます（こちらの漏れは IR 抽出時のエラーになります）。

```typescript
// --- specs/vocabulary.ts (Layer 2) ---
import { bindDecisionDetails, bindPreconditions } from "@aac/core";
import { CampaignRules } from "./campaign.dmn.ts";

// Layer 1のキーから推論（二重管理・ボイラープレートの排除）
type CampaignConditions = keyof typeof CampaignRules;

// 実行時に複数の true が出た場合は RuleConflictError (Hit Policy: Unique) を投げる。
// "default" はフォールバックであり、Unique 判定の対象外。
export const CampaignEvaluator = bindDecisionDetails<CampaignConditions>(CampaignRules, {
  "ゴールド会員であり、かつ月末の場合": (state) => state.rank === "Gold" && state.isMonthEnd,
  "シルバー会員の場合": (state) => state.rank === "Silver",
  "default": () => true
});

// behaviors の where に書いた事前条件の評価関数
export const Preconditions = bindPreconditions({
  "外部決済モジュールが有効な場合": (state) => state.paymentModuleActive
});

```

Layer 2 は PBT が期待値を算出するための「正解」であり、IR には含まれません。したがって LLM エージェントには渡りません（§2.3）。

### 3.3. Universal IR (中間表現へのコンパイル)

プラットフォームは Layer 1 を抽象実行し、フラットな JSON (Universal IR) を出力します。キーはソートされ、同じ仕様からは常にバイト一致する出力が得られます。

```json
// --- aac/ir.json（抜粋） ---
{
  "irVersion": 1,
  "model": {
    "initial": "PENDING",
    "states": ["PENDING", "PAID"],
    "data": { "rank": ["Gold", "Silver", "Bronze"], "isMonthEnd": "boolean", "paymentModuleActive": "boolean" },
    "commands": { "SendReceipt": { "discount": "number" }, "IssueCoupon": { "type": ["Premium", "Standard"] } }
  },
  "decisions": {
    "CampaignRules": {
      "bound": true,
      "rows": {
        "ゴールド会員であり、かつ月末の場合": { "discount": 0.2, "effects": [ ... ] },
        "シルバー会員の場合": { "discount": 0.05, "effects": [] },
        "default": { "discount": 0, "effects": [] }
      }
    }
  },
  "behaviors": [
    {
      "name": "Checkout",
      "preconditions": ["外部決済モジュールが有効な場合"],
      "transitions": {
        "PaymentSuccess": {
          "nextState": "PAID",
          "event": "Payment completed",
          "emittedCommands": [
            { "action": "SendReceipt",
              "payload": { "discount": { "$ref": "decision:CampaignRules.discount" } },
              "payloadSchema": { "discount": "number" } },
            { "$spread": "decision:CampaignRules.effects" }
          ]
        }
      }
    }
  ]
}

```

* `{"$ref": "decision:<表>.<列>"}` は「現在の状態に一致した行の、その列の値」を指します。
* `{"$spread": "decision:<表>.<列>"}` は、その列の配列の全要素をその位置に展開することを指します。
* 事前条件と DMN の条件は自然言語のまま出力されます。識別子への変換や評価関数は含みません。
* `irVersion`（整数、単調増加）が唯一の互換性契約です。

### 3.4. Layer 3: PBT Verification Engine

Universal IR から、テスト側のファイルだけを生成します。生成物は薄いグルーに留め、PBT のロジックはランタイムライブラリ（`@aac/cli/runtime`）に置きます。

| 生成物 | 内容 | 書き換え |
| --- | --- | --- |
| `aac/ir.json` | Universal IR | 不可 |
| `aac/adapter.contract.ts` | 状態名・状態データ・Command・アクション名の型と、`TargetSystemAdapter` インターフェース | 不可 |
| `aac/verify.ts` | アダプターと仕様を PBT ランタイムに渡すだけのグルー | 不可 |
| `aac/adapter.ts` | アダプターの雛形（全メソッドが未実装） | 実装エージェントが埋める |

生成ファイルのヘッダには `ir-version` と `spec-hash` のみを書き、日時やCLIのバージョンは埋めません。

現在の PBT は TypeScript（fast-check）向けで、期待値は仕様を Node 上で具体実行して得ています。他言語（Go の `rapid`、Rust の `proptest` など）向けには、IR から同じ構成のテスト側コードを生成する計画です。

### 3.5. テスト境界: 状態分離契約を備えた Target System Adapter

PBTエンジン（Layer 3）と本番システムを安全に接続し、決定論的なテストを成立させるためのアダプター・インターフェースです。型は IR から生成されます。

```typescript
// --- aac/adapter.contract.ts（生成物） ---
export type StateName = "PENDING" | "PAID";
export type StateData = { isMonthEnd: boolean; paymentModuleActive: boolean; rank: "Gold" | "Silver" | "Bronze" };
export type Command =
  | { action: "IssueCoupon"; payload: { type: "Premium" | "Standard" } }
  | { action: "SendReceipt"; payload: { discount: number } };
export type ActionName = "Checkout";
export type Outcome = "PaymentSuccess";

export interface TargetSystemAdapter {
  /** 【分離契約】1回の試行の開始前に呼ばれる。本番システムをまっさらな状態にする。 */
  setupIsolation(): Promise<void>;

  /** 【分離契約】試行の終了後（成功・失敗問わず）に呼ばれる。副作用を完全に破棄する。 */
  teardownIsolation(): Promise<void>;

  /** 検証の出発点となる状態を本番システムに用意する。data は加工せずそのまま本番コードへ渡す。 */
  givenState(state: StateName, data: StateData): Promise<void>;

  /** アクションを実行する。outcome は IR の transitions のキー（アクションの結果の種類）。 */
  executeAction(action: ActionName, outcome: Outcome): Promise<void>;

  /** 現在の状態名を返す（Upcaster等のマイグレーション処理は本番側で完了していること）。 */
  getCurrentState(): Promise<StateName>;

  /** setupIsolation 以降に発行された Command（メールやキュー等の副作用）を発行順に返す。 */
  getFiredCommands(): Promise<Command[]>;
}

```

アダプターは呼び出しを本番コードへ取り次ぐだけの薄い層でなければなりません（§2.3 の検査）。

### 3.6. Layer 3: PBT の検証内容

現在の PBT は1ステップの検証です。1回の試行は次のとおりです。

1. ドメインモデルの `data` からランダムな状態データを、`behaviors` からアクションと outcome の組を生成する。`where` を満たさない入力は捨てる。
2. 仕様の case を具体値で実行し、期待される次状態と Command の列を得る（Layer 2 の評価関数で DMN の行を決める）。
3. `setupIsolation` → `givenState(initial, data)` → `executeAction(action, outcome)` → `getCurrentState` / `getFiredCommands` → `teardownIsolation` の順にアダプターを呼ぶ。
4. 次状態と、Command の列（順序を含む）が期待と一致することを確かめる。

不一致が見つかると fast-check が入力を最小化し、シード・パス・最小の入力・期待値と実際の値を報告します。`node aac/verify.ts --seed X --path Y` で同じ反例を再現できます。

複数ステップの経路探索（アクション列の生成と、その Shrinking）は今後の課題です。その際は以下のステートマシン記述子へ変換して PBT エンジンに渡す設計です。

```typescript
// --- 計画中 ---
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

Layer 1が「純粋なデータ」であることと、Universal IR の存在により、ドメイン駆動設計のモデリング結果をシステムと直接同期できます。

* **付箋との1対1マッピング:** イベントストーミングで定義した Command (青)、Domain Event (オレンジ)、Policy (薄紫) が、そのまま Layer 1 の `behaviors`、`cases`、`DMN` に直結します。
* **DFD / アーキテクチャ図の自動出力:** プラットフォームのビルドステップで、Universal IR を解析して Mermaid.js 等のアーキテクチャ図を自動出力します。ドキュメントはソースコードから錬成されるため、絶対に腐敗しません。
