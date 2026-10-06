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
| **IN SCOPE**(プラットフォーム) | **Layer 1: Spec** | 業務の真実（What）を宣言する純粋データ（ドメインモデルとDMN）。部品を境界（入力・依存への問い合わせ・依存への指示）だけで記述する。`as const` と `satisfies` で型安全にする。関数は `cases` のマッピングだけで、構文を制限する（§3.1）。 | 人 |
|  | **Layer 2: Binding** | Layer 1 の自然言語キー（DMN の条件、`where` の事前条件）に評価関数（How）を結び付ける。 | 人 |
|  | **Universal IR** | Layer 1 をプラットフォームが抽象実行して出力する、**完全な言語非依存のJSON**。Layer 2 の関数は含まない。 | 生成 |
|  | **Layer 3: Verification** | Layer 1, 2 から構築されるPBTエンジン。Target System をアダプター経由で操作して検証する。テスト側にのみ生成される。 | 生成 |
| **境界線** | **Adapter Contract** | テストごとの状態リセット（`setupIsolation` / `teardownIsolation`）を強制し、決定論的なリプレイを可能にするインターフェース。本番システムの依存は、フレームワークが用意する代役（Ports）に置き換える。型は生成され、中身は実装エージェントが書く。 | 生成＋LLM |
| **OUT OF SCOPE**(開発者の自由) | **Target System** | 本番のアプリケーション実装。**プラットフォームはここに一切コードを置かない**（型もシグネチャも生成しない）。 | LLM（または人） |

### 2.2. PBTエンジンの可観測性（デバッグ体験）

PBTエンジンがエラーを発見した場合、巨大なログダンプを避け、以下のステップでデバッグ体験を提供します。

* **自動 Shrinking:** エラー発見後、エンジンがアダプターの「状態リセット」を駆使して再試行を繰り返し、エラーが発生する最短手順（例: 15手 → 3手）を特定する。
* **State Diff の可視化:** Trace Visualizer にて、最小化された手順ごとに「直前の状態から何が変化したか（Delta）」と「発行されたCommand」のみをハイライトする。
* **決定論的リプレイ:** エンジニアが `npx pbt-runner --seed X --path Y` をローカルで実行。「DBの初期化契約」により、CI上のクラッシュをローカル環境で100%再現する。

### 2.3. LLM による実装ループ

本番コードは人が手で書いても構いませんが、既定の経路は「IR を入力に LLM エージェントが書き、PBT が採点する」ループです。違反や反例は上限回数まで差し戻します。

実装の工程は **Strategy** として差し替え可能にし、その前後に **ゲート** を置きます。エージェントの隔離と採点はゲートの責任で、Strategy は「与えられた作業場所でコードを書く」ことだけを担います。

```text
 specs/*.ts (Layer 1 / 2)
      │
      │ 抽出
      ▼
 Universal IR
      │
      ▼
 ┌─ 入口ゲート ──────────────────────────────────────────┐
 │ リポジトリの外に作業場所を作り、許可した入力だけを置く      │◀─┐
 │   aac/ir.json  aac/adapter.contract.ts                │  │
 │   aac/adapter.ts (雛形か前回の成果)  aac/REQUEST.md     │  │
 │   src/ (前回の成果があれば)                             │  │
 └──────────────────────────────────────────────────────┘  │
      │                                                    │
      ▼                                                    │
 ┌─ Strategy ───────────────────────────────────────────┐  │ 差し戻し
 │ 作業場所の中で、エージェントが本番コードとアダプターを書く │  │ （違反または
 │ （claude / codex / 自作スクリプトなど）                 │  │   最小の反例）
 └──────────────────────────────────────────────────────┘  │
      │                                                    │
      ▼                                                    │
 ┌─ 出口ゲート ──────────────────────────────────────────┐  │
 │ 1. 作業場所を監査し、src/ とアダプターだけを取り出す      │  │
 │ 2. 採点基準 (ir.json / 契約 / verify.ts) を出力先に生成  │  │
 │ 3. 余計なもの検査                                      │──┤
 │ 4. PBT (仕様を具体実行した期待値と突き合わせる)           │──┘
 └──────────────────────────────────────────────────────┘
      │ 合格
      ▼
 出力先の src/ を成果物として確定
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
* **決定性は検証側で保ちます。** LLM の出力は毎回変わるので、合格した本番コードを成果物として保存します。出口ゲートは決定的で、PBT のシードは仕様のハッシュから決めます。

#### 入口ゲート（隔離）

エージェントに渡すものを許可リストで絞ります。

* 作業場所は OS の一時ディレクトリに作り、リポジトリの内側になる場合はエラーにします。試行ごとに作り直し、終了後に削除します。
* 置くのは IR、アダプターの型、アダプター（雛形か前回の成果）、依頼文、前回の本番コードだけです。**仕様のソースと PBT のグルー（`verify.ts`）は渡しません。** `verify.ts` は仕様の場所を知っているため、それ自体が手がかりになるからです。
* 渡すファイルの内容にリポジトリのパスが含まれていたらエラーにします。環境変数からもリポジトリのパスを取り除きます（`PWD`、`INIT_CWD`、`PATH` 内の `node_modules/.bin` など）。
* 2回目以降の依頼文には、前回の検査違反または PBT の最小反例が載ります。
* 渡したファイルの一覧は、試行ごとの結果に証跡として記録します。

エージェントは作業場所で PBT を実行できません。確認手段は差し戻しだけです。

#### Strategy（実装）

`run({ dir, attempt, env })` だけを持つインターフェースです。標準の実装は外部コマンドを起動するもので、claude / codex / 自作スクリプトなどを差し替えられます。プラットフォーム自体の依存は増えません。

* 作業場所をカレントディレクトリとして起動します。
* 依頼は `aac/REQUEST.md` に書かれています（環境変数 `AAC_REQUEST`）。試行回数は `AAC_ATTEMPT` で渡します。
* エージェントは `src/` に本番コードを書き、`aac/adapter.ts` を埋めて終了します。

#### 出口ゲート（取り出しと採点）

| 段階 | 内容 | 目的 |
| --- | --- | --- |
| 監査と取り出し | 作業場所から `src/` と `aac/adapter.ts` だけを出力先へ写す。それ以外のファイルの追加、渡した IR・契約の書き換えや削除、シンボリックリンクは違反 | 採点基準の改ざんと、リンク経由で仕様を持ち込む抜け道を防ぐ |
| 採点基準の生成 | `ir.json` / `adapter.contract.ts` / `verify.ts` を出力先に生成し直す | 採点基準は作業場所を経由しない |
| 余計なもの検査（本番コード） | `src/` 内の相対 import しか使っていない（パッケージ、`node:` 組み込み、`import()` / `require()` は不可） | 本番コードがフレームワーク・仕様・テスト側に依存しないことの保証 |
| 余計なもの検査（アダプター） | `adapter.contract.ts` と `src/` しか import していない。数値リテラル、入力のフィールド名とその値、DMN の条件キーを含まない（問い合わせ・指示の名前は配線に必要なので可） | アダプターに業務ロジックを書いて本番コードを空のまま合格する抜け道を塞ぐ。**暫定の規則**で、ミューテーションによる検査に置き換える予定（後述） |
| PBT | 別プロセスで `verify.ts` を実行する | LLM が書いたコードはここで初めて実行される |

検査は構文解析ではなくトークン単位の機械的な判定であり、グローバル（`fetch` や `process`）経由の抜け道までは塞いでいません。

**今後の変更（決定済み・未実装）:** 本番コードに課す条件をゼロにするため、本番コードの作りに合わせるのは常にアダプター側とします（依存の差し込み、モジュールやグローバルの差し替え、偽のサーバーなど、手段はアダプターが選ぶ）。そのためアダプターの字面の規則は廃止し、代わりに「本番コードをわざと壊して PBT が落ちることを確かめる」ミューテーションの検査で、検証結果が本番コードで決まっていることを確認します。ミューテーションの検査も Strategy として差し替え可能にし、合否の基準（IR 由来の値を変えて合格したら不合格）はゲート側が持ちます。設計方針（依存の受け取り方など）は、プロジェクトが用意する文書として依頼文に組み込みます。

#### 隔離の限界

入口ゲートが保証するのは「手がかりを一切渡さない」ことまでです。作業場所は同じマシン上にあるため、絶対パスを知っているエージェントが仕様を読むことを OS レベルでは防いでいません。

* エージェント側の権限設定で、読み書きを作業場所に限定してください（例: claude は許可していない場所の読み取りを拒否します）。
* エージェントの実行記録を保存すれば、作業場所の外に触れていないことを事後に確認できます。
* 読めないことを保証するには、コンテナや別ユーザーで起動する Strategy を追加します（未実装）。

---

## 3. 詳細スキーマ (Detailed Schema)

各レイヤーの実体となる TypeScript スキーマおよびコード設計です。

### 3.1. Layer 1: ドメインモデルと自然言語DMN (Spec)

ランタイムライブラリを排除し、純粋なデータ定義のみで業務ルールを宣言します。

#### ドメインモデル（値が源泉、型は導出）

部品を**境界だけ**で記述します。どの層の部品（ドメイン、ユースケース、UI）も、外から見れば次の3種類の境界しか持ちません。

| 境界 | 意味 | 例 |
| --- | --- | --- |
| `input` | アクションの入力（外から部品を動かす呼び出しの引数） | 会員ランク |
| `queries` | 依存への問い合わせ（部品が外に尋ねて答えをもらう値） | 時計、設定 |
| `commands` | 依存への指示（部品が外に対して行う副作用） | 領収書の送信、返金 |

これらと状態名は値として宣言し、TypeScript の型はそこから導出します。値として残るので、IR に出力でき、PBT の入力生成にも、LLM への情報提供にもそのまま使えます。

```typescript
// --- specs/order.model.ts (Layer 1) ---
import type { CommandsOf, DomainModel, StatesOf } from "@aac/core";

export const OrderModel = {
  initial: "PENDING",
  states: ["PENDING", "PAID", "SHIPPED", "CANCELLED"],
  // アクションの入力
  input: {
    rank: ["Gold", "Silver", "Bronze"],   // 配列は列挙
  },
  // 依存への問い合わせ
  queries: {
    isMonthEnd: "boolean",                // 文字列はプリミティブ型
    paymentModuleActive: "boolean",
  },
  // 依存への指示（仕様として許可される副作用）
  commands: {
    SendReceipt: { discount: "number" },
    IssueCoupon: { type: ["Premium", "Standard"] },
    NotifyPaymentFailure: {},
    SendShippingNotice: {},
    Refund: {},
  },
} as const satisfies DomainModel;

export type OrderStates = StatesOf<typeof OrderModel>;
export type DomainCommand = CommandsOf<typeof OrderModel>;
```

条件の評価関数と case が読めるデータは、入力・問い合わせの答え・現在の状態名（`status`）です。

現在の制約と今後の課題:

* 入力はモデル全体で1つで、アクションごとには分けられません。
* 状態が持つのは状態名だけです。前のアクションの入力を後のアクションで使う、といったデータの持ち越しは表現できません。
* 多重度（`One<T>` / `Lone<T>` / `Some<T>` / `Many<T>`）は型としてのみ提供しています。型は IR に出せないため、値として宣言できる形への拡張が必要です。数値の範囲などの制約、値オブジェクトの不変条件も同じ枠組みで扱う予定です。
* 部品どうしの組み合わせ（ある部品の依存を、代役ではなく別の本物の部品につなぐ）は未実装です。

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

// --- specs/cancel.dmn.ts (Layer 1) ---
export const CancelRules = {
  "決済済みの注文の場合": { effects: [{ action: "Refund", payload: {} }] },
  "default": { effects: [] }
} as const satisfies DecisionTable<CancelOutputs>;

// --- specs/order.spec.ts (Layer 1) ---
import { defineBehaviors, applyDecision } from "@aac/core";
import { CampaignRules } from "./campaign.dmn.ts";
import { CancelRules } from "./cancel.dmn.ts";
import type { OrderStates, DomainCommand } from "./order.model.ts";

export const behaviors = defineBehaviors<OrderStates, DomainCommand>({
  Checkout: {
    from: ["PENDING"],
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
      },
      "PaymentFailure": (state) => state.PENDING({
        event: "Payment failed",
        effects: [{ action: "NotifyPaymentFailure", payload: {} }]
      })
    }
  },
  Ship: {
    from: ["PAID"],
    cases: {
      "Shipped": (state) => state.SHIPPED({
        event: "Order shipped",
        effects: [{ action: "SendShippingNotice", payload: {} }]
      })
    }
  },
  Cancel: {
    from: ["PENDING", "PAID"],
    cases: {
      "Cancelled": (state) => {
        const cancel = applyDecision(CancelRules, state);

        return state.CANCELLED({ event: "Order cancelled", effects: [...cancel.effects] });
      }
    }
  }
});

```

* `from` は、そのアクションを実行できる状態です。省略すると全状態になります。
* `where` は事前条件です。`from` と `where` を満たさない場合の挙動は仕様の対象外で、PBT も検証しません。
* `cases` のキー（`"PaymentSuccess"` など）は、アクションの結果を決める外部要因の応答（outcome）です。決済の成否のように、依存先が返す結果を表します。

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

// 条件は現在の状態名 (status) も参照できる
export const CancelEvaluator = bindDecisionDetails<keyof typeof CancelRules>(CancelRules, {
  "決済済みの注文の場合": (state) => state.status === "PAID",
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
    "states": ["PENDING", "PAID", "SHIPPED", "CANCELLED"],
    "input": { "rank": ["Gold", "Silver", "Bronze"] },
    "queries": { "isMonthEnd": "boolean", "paymentModuleActive": "boolean" },
    "commands": { "SendReceipt": { "discount": "number" }, "Refund": {}, ... }
  },
  "decisions": {
    "CampaignRules": {
      "bound": true,
      "rows": {
        "ゴールド会員であり、かつ月末の場合": { "discount": 0.2, "effects": [ ... ] },
        "シルバー会員の場合": { "discount": 0.05, "effects": [] },
        "default": { "discount": 0, "effects": [] }
      }
    },
    "CancelRules": { ... }
  },
  "behaviors": [
    {
      "name": "Checkout",
      "from": ["PENDING"],
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
        },
        "PaymentFailure": { "nextState": "PENDING", ... }
      }
    },
    { "name": "Cancel", "from": ["PENDING", "PAID"], ... },
    { "name": "Ship", "from": ["PAID"], ... }
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

`aac/verify.ts` は出力先にのみ生成され、エージェントの作業場所には置かれません（§2.3）。

現在の PBT は TypeScript（fast-check）向けで、期待値は仕様を Node 上で具体実行して得ています。他言語（Go の `rapid`、Rust の `proptest` など）向けには、IR から同じ構成のテスト側コードを生成する計画です。

### 3.5. テスト境界: 状態分離契約を備えた Target System Adapter

PBTエンジン（Layer 3）と本番システムを安全に接続し、決定論的なテストを成立させるためのアダプター・インターフェースです。型は IR から生成されます。

本番システムが外部に頼るものは、フレームワークが用意する代役（`Ports`）に置き換えます。代役は問い合わせに対して生成した答えを返し、受けた指示を記録します。本番システムに状態を外から流し込む口はありません。任意の状態には、初期状態からアクションを積み重ねて到達します。

```typescript
// --- aac/adapter.contract.ts（生成物。コメントはエージェント向けに英語） ---
export type StateName = "PENDING" | "PAID" | "SHIPPED" | "CANCELLED";
export type ActionName = "Cancel" | "Checkout" | "Ship";
export type ActionInput = { rank: "Gold" | "Silver" | "Bronze" };

export type Ports = {
  /** 問い合わせ。答えはアクションごとに変わり得るので、必要なときに尋ねる（保持しない）。 */
  queries: {
    isMonthEnd(): boolean;
    paymentModuleActive(): boolean;
  };
  /** アクションの結果を決める外部要因の応答。そのアクションの実行中だけ有効。 */
  outcomes: {
    Cancel(): "Cancelled";
    Checkout(): "PaymentFailure" | "PaymentSuccess";
    Ship(): "Shipped";
  };
  /** 指示。呼び出しは発行順に記録され、仕様と照合される。 */
  commands: {
    IssueCoupon(payload: { type: "Premium" | "Standard" }): void;
    NotifyPaymentFailure(payload: {}): void;
    Refund(payload: {}): void;
    SendReceipt(payload: { discount: number }): void;
    SendShippingNotice(payload: {}): void;
  };
};

export interface TargetSystemAdapter {
  /** 【分離契約】試行の開始前に呼ばれる。初期状態の本番システムを新しく作り、ports につなぐ。 */
  setupIsolation(ports: Ports): Promise<void>;

  /** 【分離契約】試行の終了後（成功・失敗問わず）に呼ばれる。試行が作ったものを完全に破棄する。 */
  teardownIsolation(): Promise<void>;

  /** アクションを1つ実行する。1回の試行で、同じシステムに対して複数のアクションが順に実行される。 */
  executeAction(action: ActionName, input: ActionInput): Promise<void>;

  /** 現在の状態名を返す（Upcaster等のマイグレーション処理は本番側で完了していること）。 */
  getCurrentState(): Promise<StateName>;
}

```

`Ports` はテスト側の型であり、本番コードがこれを import することはありません。本番コードの依存の受け取り方に `Ports` をつなぐのはアダプターの仕事です。

### 3.6. Layer 3: PBT の検証内容

1回の試行は、初期状態から始まるアクション列（最大8手）です。

1. `setupIsolation(ports)` で、初期状態の本番システムを代役につないで作る。
2. 1手ごとに、入力・問い合わせの答え・outcome をランダムに決める。現在の状態で実行でき（`from`）、事前条件（`where`）を満たすアクションの中から1つを選ぶ。
3. 仕様の case を具体値で実行し、期待される次状態と Command の列を得る（Layer 2 の評価関数で DMN の行を決める）。
4. `executeAction(action, input)` を呼び、`getCurrentState` の結果と、その手の間に代役が受けた指示の列（順序を含む）が期待と一致することを確かめる。
5. 一致すれば次の手へ進む。最後に `teardownIsolation` を呼ぶ。

不一致が見つかると fast-check がアクション列を最小化し、シード・パス・**最短のアクション列**・期待値と実際の値を報告します。例えば「決済後のキャンセルで返金されない」という不具合は、「決済成功 → キャンセル」の2手として報告されます。`node aac/verify.ts --seed X --path Y` で同じ反例を再現できます。

## 4. イベントストーミング＆DFDの自動生成

Layer 1が「純粋なデータ」であることと、Universal IR の存在により、ドメイン駆動設計のモデリング結果をシステムと直接同期できます。

* **付箋との1対1マッピング:** イベントストーミングで定義した Command (青)、Domain Event (オレンジ)、Policy (薄紫) が、そのまま Layer 1 の `behaviors`、`cases`、`DMN` に直結します。
* **DFD / アーキテクチャ図の自動出力:** プラットフォームのビルドステップで、Universal IR を解析して Mermaid.js 等のアーキテクチャ図を自動出力します。ドキュメントはソースコードから錬成されるため、絶対に腐敗しません。
