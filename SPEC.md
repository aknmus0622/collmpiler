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
| **IN SCOPE**(プラットフォーム) | **Layer 1: Spec** | 業務の真実（What）を宣言する。決定表（条件から値を選ぶ）と、コンポーネント（語彙、状態機械の骨組み、アクションの説明の文）。**関数は一切書かない。**`as const` と `satisfies` で型安全にする。関数は `cases` のマッピングだけで、構文を制限する（§3.1）。 | 人 |
|  | **Layer 2: Binding** | Layer 1 の文と名前に内容を結び付ける。アクションの構造（宣言。IR に出る）と、名前の意味（関数。PBT の正解として使い、IR には含めない）。 | 人（LLM が下書きできる） |
|  | **Universal IR** | Layer 1 と、Layer 2 の構造から作る、**完全な言語非依存のJSON**。Layer 2 の関数は含まない。 | 生成 |
|  | **Layer 3: Verification** | Layer 1, 2 から構築されるPBTエンジン。Target System をアダプター経由で操作して検証する。テスト側にのみ生成される。 | 生成 |
| **境界線** | **Adapter Contract** | テストごとの状態リセット（`setupIsolation` / `teardownIsolation`）を強制し、決定論的なリプレイを可能にするインターフェース。本番システムの依存は、フレームワークが用意する代役（Ports）に置き換える。型は生成され、中身は実装エージェントが書く。 | 生成＋LLM |
| **OUT OF SCOPE**(開発者の自由) | **Target System** | 本番のアプリケーション実装。**プラットフォームはここに一切コードを置かない**（型もシグネチャも生成しない）。 | LLM（または人） |

### 2.2. PBTエンジンの可観測性（デバッグ体験）

PBTエンジンがエラーを発見した場合、巨大なログダンプを避け、以下のステップでデバッグ体験を提供します。

* **自動 Shrinking:** エラー発見後、エンジンがアダプターの「状態リセット」を駆使して再試行を繰り返し、エラーが発生する最短手順（例: 15手 → 3手）を特定する。
* **State Diff の可視化:** Trace Visualizer にて、最小化された手順ごとに「直前の状態から何が変化したか（Delta）」と「発行されたCommand」のみをハイライトする。
* **決定論的リプレイ:** エンジニアが `npx pbt-runner --seed X --path Y` をローカルで実行。「DBの初期化契約」により、CI上のクラッシュをローカル環境で100%再現する。

### 2.3. LLM による実装ループ

本番コードは人が手で書いても構いませんが、既定の経路は「IR を入力に LLM エージェントが書き、PBT が採点する」ループです。

実装は **TDD の流れに沿った3つの段階**に分け、段階ごとに別のセッションとしてエージェントを起動します。エージェントの起動は **Strategy** として差し替え可能にし、その前後に **ゲート** を置きます。隔離と採点はゲートの責任で、Strategy は「与えられた作業場所で依頼を実行する」ことだけを担います。

```text
 specs/*.ts (Layer 1 / 2)
      │ 抽出、仕様の事前検査
      ▼
 Universal IR
      │
      ▼
 ① 設計      見せる: IR、設計方針
             書かせる: 本番コードの骨組み（型とシグネチャ。中身は未実装）
             検査: 静的検査、読み込めること、仕様の文を書き写していないこと
      │
      ▼
 ② 配線      見せる: アダプターの契約、骨組み          ← IR は見せない
             書かせる: アダプター
             検査: 静的検査、PBT が「未実装」で失敗すること（赤）
      │
      ▼
 ③ 実装      見せる: IR、骨組み、設計方針              ← アダプターと契約は見せない
             書かせる: 本番コードの中身
             検査: 静的検査、PBT に合格すること（緑）、ミューテーション
      │
      ▼
 出力先の src/ を成果物として確定
```

各段階は「入口ゲート → Strategy → 出口ゲート」で、検査に落ちたら、その内容を同じ段階の次の依頼文に載せて差し戻します。

#### 段階を分ける理由

段階ごとに見せる情報を変えることで、これまで事後に検出していた問題を、構造で防ぎます。

* **アダプターが業務上の判断を肩代わりできません。** 配線の段階のエージェントは IR を見ていないので、決定表の値も条件も知りません。
* **本番コードがテストの口の形に引きずられません。** 設計と実装の段階のエージェントは、アダプターの契約（代役の形）を一度も見ません。
* **「赤」を検査に使えます。** 配線のあと、骨組みのまま PBT を走らせます。ここで失敗しなければならず、合格したらアダプターが振る舞いを実装していると判断できます。

ただし、設計の段階が骨組みのコメントに業務ルールを書くと、それが配線の段階に伝わります。仕様の文（条件・計算・不変条件）の書き写しは検査で弾きますが、言い換えまでは検出できません。ミューテーションのゲートは、その場合の備えとして残しています。

#### やり直し

* 1つの段階の中で、上限回数（既定 3）まで差し戻します。
* それでも直らなければ、成果を捨てて設計の段階からやり直します（既定で計2周まで）。失敗の原因がどの段階にあるか（実装の誤りか、配線の誤りか、骨組みの設計不足か）は機械的に分からないためです。実装の段階のエージェントはアダプターを直せないので、配線に誤りがあると実装の段階では直りません。
* 出力先に本番コードとアダプターがすでにあれば、実装の段階から始めます。仕様を少し変えただけなら、骨組みと配線はそのままで実装だけをやり直せます（`--from` で段階を指定、`--fresh` で設計からやり直し）。
* 骨組みのシグネチャを実装の段階が変えると、アダプターが型エラーになります。出口ゲートの静的検査で見つかり、「公開している名前かシグネチャが変わった」として実装の段階に差し戻されます（実装の段階はアダプターを見られないので、何が起きたかを言葉で伝えます）。
* 設計の段階のあとで止めて、人が骨組みを確認してから続ける機能は、まだありません（今後の課題）。

#### 仕様の型チェックと事前検査（LLM を呼ぶ前）

まず仕様を型チェックします。結び付けの漏れや余り、フィールド名や条件の typo、存在しない状態や指示、型の合わない参照は、ここで見つかります（§3.1、§3.2）。続いて IR を作るときに、同じ種類の誤りを実行時にも検査し、場所と理由を添えて報告します。

IR の抽出に続いて、仕様だけをランダムなアクション列で実行します（実装は使いません）。次のものを見つけたら、**仕様の誤りとして人に報告して止まり、LLM には渡しません。**

* 2つの条件が同時に成り立つ（決定表でも、アクションの `when` でも）
* 結び付けの無い条件・計算・不変条件がある
* 不変条件が破れる（最短のアクション列つきで報告）
* 覚えるデータや指示の値が、宣言した型・範囲に合わない（計算の結果が整数でない、など）

PBT の実行中に同じ種類の問題が見つかった場合も、実装の誤りとは区別し、エージェントへは差し戻しません。

#### 役割分担

| 書くもの | 書き手 | 置き場所 | 決定的か |
| --- | --- | --- | --- |
| 仕様 | 人 | `specs/` | はい |
| IR、PBT のグルー、アダプターの型と雛形 | プラットフォーム | テスト側（`aac/`） | はい |
| 本番コードの骨組み | LLM（設計の段階） | 本番側（`src/`。構成もAPIも自由） | いいえ |
| アダプターの中身 | LLM（配線の段階） | テスト側（`aac/adapter.ts`） | いいえ |
| 本番コードの中身 | LLM（実装の段階） | 本番側（`src/`） | いいえ |

* **テストケースは LLM に書かせません。** 採点基準を LLM に書かせると、実装とテストが同じ誤解をして合格してしまいます。
* **仕様について LLM に見せるのは IR だけです。** 仕様の TypeScript（特に Layer 2 の評価関数）は見せません。自然言語の条件（「The customer is a Gold member and it is month-end」）をデータ定義に照らして解釈し実装するのが LLM の仕事であり、その解釈が正しいかを Layer 2 を正解として PBT が判定します。これは「IR が実装に十分な情報を持っているか」の検証も兼ねます。
* **決定性は検証側で保ちます。** LLM の出力は毎回変わるので、合格した本番コードを成果物として保存します。出口ゲートは決定的で、PBT のシードは仕様のハッシュから決めます。

#### 入口ゲート（隔離）

エージェントに渡すものを、段階ごとの許可リストで絞ります。

| 段階 | 作業場所に置くもの |
| --- | --- |
| 設計 | 依頼文、IR、添付資料（やり直しのときは前回の骨組み） |
| 配線 | 依頼文、アダプターの契約、アダプター（雛形か前回の成果）、骨組み |
| 実装 | 依頼文、IR、添付資料、本番コード（骨組みか前回の成果） |

* 作業場所は OS の一時ディレクトリに作り、リポジトリの内側になる場合はエラーにします。試行ごとに作り直し、終了後に削除します。
* **仕様のソースと PBT のグルー（`verify.ts`）は、どの段階にも渡しません。** `verify.ts` は仕様の場所を知っているため、それ自体が手がかりになるからです。
* 渡すファイルの内容にリポジトリのパスが含まれていたらエラーにします。環境変数からもリポジトリのパスを取り除きます（`PWD`、`INIT_CWD`、`PATH` 内の `node_modules/.bin` など）。
* 依頼文は段階ごとに違い、その段階で見えるものだけに触れます。2回目以降は前回の差し戻しが載ります。
* 渡したファイルの一覧は、試行ごとの結果に証跡として記録します。

エージェントは作業場所で PBT を実行できません。確認手段は差し戻しだけです。

#### 設計方針と添付資料

本番コードの設計について実装者に伝えたいことは、フレームワークの規則ではなく、依頼に添える文書として渡します。

* **既定の設計方針**が、設計と実装の段階の依頼文に載ります（配線の段階には載りません）。内容は「実システムとして設計し、テスト専用の入口を作らない」「依存は本番コード自身の言葉で定義し、外から受け取る」「仕様の名前や形は写すべき API ではない」「業務上の判断は小さな純粋関数に分ける」です。
* **添付資料**として、任意のファイルや文言を依頼に添えられます。アーキテクチャの決まり、命名規約、用語集などを想定しています。コンポーネントの `assets` に、`file` / `dir` / `text` で包んで並べます。

  ```typescript
  import { component, dir, file, text } from "@aac/core";

  export const Order = component({
    assets: [
      file("docs/architecture.md"),                              // ファイル（このファイルからの相対パス）
      dir("docs/conventions"),                                   // ディレクトリの中のファイルすべて
      text("Money is always handled as whole yen."),             // 短い文言
      text("Adapters are named *Gateway.", { phases: ["wiring"] }),  // 第2引数で、渡す段階を指定する
    ],
    states: ["DRAFT", "PENDING", "PAID", "SHIPPED", "CANCELLED"],
    // ...
  });
  ```

  | 書き方 | 渡り方 |
  | --- | --- |
  | `file(path)` | 作業場所の `aac/assets/` に、相対パスの構造を保って置く。依頼文がその場所を案内する |
  | `dir(path)` | 中のファイルすべてを、同じように置く（ドットファイルは除く） |
  | `text(content)` | 依頼文の中に直接載せる |

  包まずに文字列を並べることはできません（パスなのか文言なのか区別がつかないため、型エラーになります）。既定の設計方針と食い違う場合は、添付資料が優先です。コマンドの `--asset <path>` で、実行のたびに追加することもできます。
* 添付資料は、既定では設計と実装の段階に渡ります。第2引数の `phases` で段階を指定できます。**配線の段階（`"wiring"`）に渡すときは注意が必要です。** 配線の段階に仕様を見せないことが、アダプターの肩代わりを防ぐ仕組みだからです。結び付けの下書きには、設計の段階に渡るものが渡ります。
* 添付資料は仕様の意味ではないので、IR には出ません。内容を変えても、検証のシードは変わりません。
* **強制しません。** 方針や添付資料に従わなくても不合格にはなりません。合否を決めるのは出口ゲートだけです。
* **仕様の中身（業務ルール）に触れる内容を書いてはいけません。** 書けば「IR だけで実装できた」が崩れます。機械的には判定できないため、運用の規則です。
* 添付資料は読み取り専用です。エージェントが書き換えると差し戻されます。

人が書いた既存のコードを検証する場合、設計方針は関係なく、アダプターだけで本番コードに合わせます。

#### Strategy（エージェントの起動）

`run({ dir, phase, attempt, env })` だけを持つインターフェースです。標準の実装は外部コマンドを起動するもので、claude / codex / 自作スクリプトなどを差し替えられます。プラットフォーム自体の依存は増えません。

* 作業場所をカレントディレクトリとして起動します。段階ごと・試行ごとに別のプロセスなので、記憶は引き継がれません。
* 依頼は `aac/REQUEST.md` に書かれています（環境変数 `AAC_REQUEST`）。段階は `AAC_PHASE`、試行回数は `AAC_ATTEMPT` で渡します。
* エージェントは、その段階で許可された場所（設計と実装は `src/`、配線は `aac/adapter.ts`）だけを書いて終了します。

#### 出口ゲート（取り出しと採点）

どの段階でも、次の順に進みます。

| 手順 | 内容 | 目的 |
| --- | --- | --- |
| 監査と取り出し | その段階で書いてよい場所だけを出力先へ写す。それ以外のファイルの追加、渡したファイルの書き換えや削除、シンボリックリンクは違反 | 採点基準の改ざんと、段階をまたいだ書き換え、リンク経由で仕様を持ち込む抜け道を防ぐ |
| 採点基準の生成 | `ir.json` / `adapter.contract.ts` / `verify.ts` を出力先に生成し直す | 採点基準は作業場所を経由しない |
| 余計なもの検査（本番コード） | `src/` 内の相対 import しか使っていない（パッケージ、`node:` 組み込み、`import()` / `require()` は不可） | 本番コードがフレームワーク・仕様・テスト側に依存しないことの保証 |
| 余計なもの検査（アダプター） | `adapter.contract.ts` と `src/` しか import していない。中身は制限しない | アダプターが仕様や採点基準を読み込まないことの保証 |
| 静的検査 | 設計の段階は本番コード、以降は本番コード・アダプター・契約を、実行せずに調べる（下の「2種類の検査」） | 骨組みに無いメンバーの呼び出しや、シグネチャの変更を、実行する前に見つける |
| 段階ごとの検査 | 下の表 | |

| 段階 | 段階ごとの検査 |
| --- | --- |
| 設計 | 仕様の文（条件・アクションの説明・計算の式・不変条件）を骨組みに書き写していない。全ファイルを1回 import して読み込める |
| 配線 | PBT が失敗する（赤）。合格したら不合格。アダプター自身の誤りで失敗した場合（エラーの文言が「未実装」でない）も不合格 |
| 実装 | PBT に合格する（緑）。ミューテーションのゲートに合格する |

PBT は別プロセスで実行します。LLM が書いたコードが実行されるのは、出口ゲートが初めてです。骨組みの未実装部分は `not implemented` という文言のエラーを投げる取り決めにしており、配線の段階はこれで「未実装による失敗」を見分けます。

余計なもの検査は構文解析ではなくトークン単位の機械的な判定であり、グローバル（`fetch` や `process`）経由の抜け道までは塞いでいません。

#### 2種類の検査: 仕様の型チェックと、実装の静的検査

どちらもいまは TypeScript の型チェックを使っていますが、別のものとして扱います。

| | 仕様の型チェック | 実装の静的検査 |
| --- | --- | --- |
| 対象 | 人が書くコンポーネントと結び付け | LLM が書く本番コードとアダプター |
| 言語 | 常に TypeScript（仕様を書く言語） | 対象システムの言語 |
| 役割 | 結び付けの漏れや typo を防ぐ。フレームワークの保証の一部 | 誤りを早く、分かりやすく差し戻す。合否を決めるのは PBT |
| 外せるか | 外せない（固定で組み込む） | 外せる（Strategy。`--static-check auto\|tsc\|off`） |

* **実装の静的検査は Strategy です。** Strategy が担うのは「誤りの一覧を返す」ことだけで、どの段階で何を対象にするか、誤りをエージェントにどう伝えるかは、ゲートが決めます（ミューテーションで合否の基準をゲートが持つのと同じ分け方です）。使った Strategy は結果に記録します。
* **無しでも成り立ちます。** 動的型の言語では、静的に分かることが少なくなります。その場合、骨組みに無いメンバーの呼び出しやシグネチャの変更は、PBT の実行時の失敗として見つかり、差し戻されます。静的検査は「あれば早く分かる」層で、正しさの保証は PBT に置いています。
* TypeScript 用の Strategy は型チェックで、Node がそのまま実行できる構文だけを許す設定にしています。

#### 対象言語（Target）

本番システムを書く言語に依存する処理は、「対象言語」という1つのインターフェースにまとめています。実装の流れとゲートは、このインターフェースだけに依存する型どおりの流れで、言語を知りません。

| 対象言語が担うもの | 内容 |
| --- | --- |
| テスト側の生成 | アダプターの契約、アダプターの雛形、テストの入口。それぞれのファイル名 |
| 余計なもの検査 | 本番コードとアダプターの依存、生成ファイルの改ざん |
| 実装の静的検査 | Strategy。言語によっては無い |
| 読み込めることの確認 | 設計の段階で、骨組みを実行せずに読み込む |
| PBT の実行 | テストを走らせて、結果（合格、または最小の反例）を返す |
| ミューテーションの壊し方 | Strategy。言語によっては無い |
| 「未実装」の印 | 骨組みの未実装部分が出すエラーの文言 |
| 依頼文の言語に依存する部分 | 本番コードの規則、骨組みの本体に書く文、アダプターの書き方 |

対象言語に依存しないものは、流れとゲートの側に残しています。仕様の読み込み・型チェック・事前検査・IR の抽出、隔離、段階ごとに見せるものの制御、監査と取り出し、仕様の文の書き写しの検査、赤と緑の判定、ミューテーションの合否の基準です。

**現在の実装は TypeScript 用だけです。** インターフェースは TypeScript 用の処理から切り出したもので、2つ目の言語で確かめてはいません。他の言語を足すときに、形を直す必要が出る可能性があります。

特に PBT の実行は、言語によって作りが大きく変わります。期待値の計算は常に TypeScript（人が書いた結び付け）で行うので、対象が別の言語のときは、期待値を計算する側と本番システムを動かす側が別のプロセスになります。TypeScript 用の実装は両方を同じプロセスで動かしていますが、インターフェース上は「テストを走らせて結果を返す」だけなので、この違いは各言語の実装の内側に収まります。

#### 本番コードに条件を課さない

本番コードは、フレームワークの import も、配られた型も、決められた命名も、依存を差し込める設計も、仕様と同じ語彙も要求されません。**本番コードの作りに合わせるのは、常にアダプター側です。** 依存を引数で受け取る作りなら代役を変換して渡し、そうでなければモジュールやグローバルの差し替え、偽のサーバーなど、アダプターが手段を選びます。語彙の違い（仕様は「月末かどうか」の真偽値、本番コードは時計から日付を受け取る、など）もアダプターが変換します。

そのため、アダプターの中身を字面で制限することはしません。代わりにミューテーションで、業務上の判断が本番コードで行われていることを確かめます。

ただし、検証できる細かさは本番コードの作りで決まります。依存をすべて内部に抱え込んだ作りでは、実行時の差し替えができない言語（Go や Rust）の場合、システム全体を外から叩く検証だけになります。

#### ミューテーションのゲート

目的はテストの質の評価ではなく、「検証結果が本当に本番コードで決まっているか」の判定です。実装の段階でだけ実行します。配線の段階に IR を見せないことでアダプターの肩代わりは構造的に起きにくくなっていますが、骨組みのコメント経由で業務ルールが伝わる余地が残るため、その備えを兼ねます。

* **壊し方は Strategy として差し替えられます。** 自前の Strategy は、本番コードの実行時のリテラル（型の中は除く）を1つずつ変えます。数値は +1、真偽値は反転、文字列は決定表の値に一致するものだけ末尾に文字を足します。軽量な外部ツールが環境にあればそれを使い、無ければ自前に落とす、という選択を想定しています（`--mutation auto|builtin|off`。外部ツールの接続は未実装で、現状は常に自前です）。使った Strategy と件数、生き残った箇所は、毎回結果に記録します。
* **合否の基準はゲートが持ちます。** どの Strategy でも同じ基準で判定します。

| 状況 | 判定 |
| --- | --- |
| 決定表の値（割引率、クーポン種別など）が本番コードにあり、その出現箇所のどれを変えても PBT が合格する | 不合格（`mutation-survived`）。その値は本番コードで決まっていない |
| 決定表の数値が本番コードに無く、アダプターにある | 不合格（`decision-in-adapter`） |
| 決定表の値が本番コードに1つも見つからず（別の表現で書かれている等）、どの変異も検出されない | 不合格（`mutation-ineffective`） |
| それ以外の生き残り | 合格。報告のみ |

「それ以外の生き残り」は、仕様の語彙では試せない本番コードのロジックを指していることがあります。例えば本番コードが日付から月末を計算している場合、仕様が与えるのは「月末かどうか」の2通りだけなので、その計算の細部は検証されません。

限界: 判定はリテラルの一致に基づくヒューリスティックです。決定表の文字列の値をアダプターが返す形の肩代わりや、値を別の表現に変えたうえでの部分的な肩代わりは見逃し得ます。

#### 隔離の限界

入口ゲートが保証するのは「手がかりを一切渡さない」ことまでです。作業場所は同じマシン上にあるため、絶対パスを知っているエージェントが仕様を読むことを OS レベルでは防いでいません。

* エージェント側の権限設定で、読み書きを作業場所に限定してください（例: claude は許可していない場所の読み取りを拒否します）。
* エージェントの実行記録を保存すれば、作業場所の外に触れていないことを事後に確認できます。
* 読めないことを保証するには、コンテナや別ユーザーで起動する Strategy を追加します（未実装）。

---

## 3. 詳細スキーマ (Detailed Schema)

各レイヤーの実体となる TypeScript スキーマおよびコード設計です。

### 3.1. Layer 1: 決定表とコンポーネント (Spec)

仕様は3つのものでできています。Layer 1（決定表とコンポーネント）には関数を一切書きません。

| 書くもの | 内容 | 関数 | Layer |
| --- | --- | --- | --- |
| 決定表 | 条件から値を選ぶ表 | なし | 1 |
| コンポーネント | 語彙、状態機械の骨組み、アクションの説明（文） | なし | 1 |
| 結び付け | アクションの構造（宣言）と、名前の意味（関数）（§3.2） | 意味の部分だけ | 2 |

シナリオ（ユースケース）、ドメインの部品、UI の部品は、どれも同じ形のコンポーネントとして書きます。値として宣言するので、IR に出力でき、PBT の入力生成にも、LLM への情報提供にもそのまま使えます。TypeScript の型は、宣言した値から導出します。

#### 決定表

条件（自然言語）から値を選ぶ表です。コンポーネントとは別に定義します。

```typescript
// --- specs/order.decisions.ts ---
import { decisionTable } from "@aac/core";

// 割引率は整数のパーセントで持つ（小数だと金額の計算に誤差が出る）
export const Campaign = decisionTable({
  "The customer is a Gold member and it is month-end": { discountPercent: 20, grantsCoupon: true, coupon: "Premium" },
  "The customer is a Silver member": { discountPercent: 5, grantsCoupon: false, coupon: "Standard" },
  otherwise: { discountPercent: 0, grantsCoupon: false, coupon: "Standard" },
});

export const Shipping = decisionTable({
  "The customer is a Gold member, or the order is 10,000 yen or more": { priority: true },
  otherwise: { priority: false },
});
```

* どの条件にも当たらないときの `otherwise` が必須で、全行が同じ列を持ちます（どちらも型エラーになります）。
* **セルに書けるのは値だけです。** 表が決めるのは率や区分といったパラメータで、指示や計算は書きません。「指示を出すかどうか」は真偽値の列にし、結び付けの構造の側で条件として使います（§3.2）。
* 同時に成り立つ条件は1つまでです（Hit Policy: Unique）。

#### コンポーネント

部品を、語彙と骨組みと文で記述します。

| 宣言 | 意味 | 例 |
| --- | --- | --- |
| `states` / `startsIn` | 状態名と初期状態 | 下書き、決済待ち、決済済み |
| `remembers` | 部品が覚えているデータ。初めは未設定 | 注文時の会員ランクと価格 |
| `asks` | 依存への問い合わせ（部品が外に尋ねて答えをもらう値） | 時計、設定、決済サービスの応答 |
| `tells` | 依存への指示（部品が外に対して行う副作用） | 領収書の送信、返金 |
| `decisions` | 使う決定表 | キャンペーン、出荷 |
| `calculations` | 計算。短い名前と、式を述べる文（`is`）と、結果の型 | 請求金額 |
| `alwaysTrue` | 不変条件（文） | 下書き以外の注文には会員ランクと価格がある |
| `actions` | 外から部品を動かすアクション（下記） | 注文する、決済する |
| `assets` | 実装を LLM に依頼するときに添付する資料（§2.3）。仕様の意味には影響しない | アーキテクチャの決まり、用語集 |

`states`・`startsIn`・`actions` 以外は省略できます。

アクションには、次のものを書きます。

| キー | 意味 |
| --- | --- |
| `takes` | 入力 |
| `allowedIn` | 実行できる状態。省略すると全状態 |
| `onlyIf` | 事前条件（条件の文）。`allowedIn` と `onlyIf` を満たさない場合の挙動は仕様の対象外で、PBT も検証しない |
| `then` | 何が起きるか。遷移先（`goTo`）と、説明の文（`does`） |
| `when` | 条件で分かれるとき、`then` の代わりに書く。キーは条件の文で、`otherwise` が必須 |

**状態機械の骨組み（どの状態から、どの状態へ）は構造として書き、何が起きるかの中身は文で書きます。** 文が意味する構造（どの指示を、どの順で、どの値で出すか）は、結び付けに書きます。

```typescript
// --- specs/order.component.ts ---
import { component } from "@aac/core";
import { Campaign, Shipping } from "./order.decisions.ts";

const Rank = ["Gold", "Silver", "Bronze"] as const;   // 配列は列挙
// 数値の制約。around は、その前後を PBT が重点的に生成するしきい値
const Yen = { type: "integer", min: 0, max: 1_000_000, around: [10_000] } as const;

export const Order = component({
  // 語彙
  states: ["DRAFT", "PENDING", "PAID", "SHIPPED", "CANCELLED"],
  startsIn: "DRAFT",
  remembers: { rank: Rank, price: Yen },
  asks: {
    isMonthEnd: "boolean",
    paymentModuleActive: "boolean",
    paymentResult: ["succeeded", "failed"],
  },
  tells: {
    SendOrderConfirmation: {},
    SendReceipt: { discountPercent: "integer", amount: "integer" },
    IssueCoupon: { type: ["Premium", "Standard"] },
    NotifyPaymentFailure: {},
    SendShippingNotice: { priority: "boolean" },
    Refund: {},
  },

  // 決めごとと計算
  decisions: { campaign: Campaign, shipping: Shipping },
  calculations: {
    amountCharged: {
      is: "price × (100 − discount percent) ÷ 100, rounded down to a whole yen",
      type: "integer",
    },
  },
  alwaysTrue: ["Every order past the draft state has a member rank and a price"],

  // アクション
  actions: {
    PlaceOrder: {
      takes: { customerRank: Rank, listPrice: Yen },
      allowedIn: ["DRAFT"],
      then: {
        goTo: "PENDING",
        does: "The order remembers the customer's rank and the list price. An order confirmation is sent.",
      },
    },
    Checkout: {
      allowedIn: ["PENDING"],
      onlyIf: ["The external payment module is active"],
      when: {
        "The payment succeeded": {
          goTo: "PAID",
          does:
            "A receipt is sent with the campaign's discount percent and the amount charged. " +
            "Then a coupon is issued if the campaign grants one.",
        },
        otherwise: { goTo: "PENDING", does: "The customer is notified of the payment failure." },
      },
    },
    Ship: {
      allowedIn: ["PAID"],
      then: { goTo: "SHIPPED", does: "A shipping notice is sent, with priority as the shipping decision says." },
    },
    Cancel: {
      allowedIn: ["PENDING", "PAID"],
      then: { goTo: "CANCELLED", does: "If the order had been paid, a refund is issued." },
    },
  },
});
```

* **型の付け方**: `component` に直接書いた値は、`as const` を付けなくても文字列リテラルや列挙として推論されます。ただし `Rank` のように変数に取り出した配列には `as const` が必要です。忘れると `string[]` に広がって列挙の検査が効かなくなるため、広がった配列は型エラーにしています。
* **構造の検査**: `startsIn`・`allowedIn`・`goTo` に `states` にない名前を書く、`then` も `when` もない、`when` に `otherwise` がない、キーを書き間違える、はどれも型エラーになります。コンポーネントに指示の構造（`tell` など）を書くこともできません。
* **名前の重複**: 条件と計算からは、状態名（`status`）、覚えているデータ、問い合わせの答え、アクションの入力が同じ階層で見えます。そのため `remembers`・`asks`・入力のフィールド名は重複できません（入力どうしは、アクションが違えば同名で構いません）。
* **数値**: 金額は整数で扱い、丸め方を計算の文に明記します。小数の計算は式の順序だけで結果がずれ、正解と実装が正当な理由なく食い違うためです。
* **しきい値**: 条件に数値の境目があるときは、`around` に宣言します。ちょうどその値と前後の値を重点的に生成しないと、「以上」と「より大きい」の取り違えを見逃します。

今後の課題:

* 多重度（`One<T>` / `Lone<T>` / `Some<T>` / `Many<T>`）は型としてのみ提供しています。値として宣言できる形への拡張が必要です。
* 戻り値を持つ操作（値オブジェクトの演算など）は書けません。アクションの結果は「次の状態」と「指示」だけです。
* 決定表のセルに「値が無い」ことは書けません。指示を出さない行にも、列の値を埋める必要があります（上の例の `coupon: "Standard"`）。この値は使われないので、実装が忠実に写すと「変えても結果が変わらない値」になり、ミューテーションのゲートが差し戻します（1回の差し戻しで直りますが、仕様の側の埋め草が原因です）。
* 読み込めるコンポーネントは1つだけです。複数のコンポーネントと、その組み合わせ（ある部品の依存を、代役ではなく別の本物の部品につなぐ）は未実装です。

#### 自然言語で書くもの

Layer 1 では、次のものを自然言語で書きます。意味や構造は Layer 2 で結び付けます。

| 種類 | 書く場所 | 結び付けに書くもの |
| --- | --- | --- |
| 条件 | 決定表の行、`onlyIf`、`when` のキー | 真偽を返す関数 |
| アクションの説明 | `does` | 構造（指示と覚えるデータの宣言） |
| 計算 | `calculations` の `is` | 値を返す関数 |
| 不変条件 | `alwaysTrue` | 真偽を返す関数 |

同じ条件の文は、どこに書かれても同じ意味になります。

### 3.2. Layer 2: 結び付け (Binding)

コンポーネントの文と名前に、内容を結び付けます。`bind` の1か所に、性質の違う2種類を書きます。

| | 構造（`actions`） | 意味（`conditions` / `calculations` / `alwaysTrue`） |
| --- | --- | --- |
| 何を書くか | アクションの文（`does`）が意味すること。どの指示を、どの順で、どの値で出すか。何を覚えるか | 名前が指すもの。条件の真偽、計算の値、不変条件の真偽 |
| 書き方 | 宣言と参照（関数は書かない） | 関数 |
| IR に出るか | **出る。** 実装する LLM に渡る | **出ない。** PBT が期待値を計算するための正解 |

```typescript
// --- specs/order.binding.ts ---
import { bind, calculated, decide, decided, given, was } from "@aac/core";
import { Order } from "./order.component.ts";

export const Binding = bind(Order, {
  // 構造: 文が何を意味するか（宣言。IR に出る）
  actions: {
    PlaceOrder: {
      remember: { rank: given("customerRank"), price: given("listPrice") },
      tell: [{ SendOrderConfirmation: {} }],
    },
    Checkout: {
      "The payment succeeded": {
        tell: [
          { SendReceipt: { discountPercent: decided("campaign", "discountPercent"), amount: calculated("amountCharged") } },
          { IssueCoupon: { type: decided("campaign", "coupon") }, when: decided("campaign", "grantsCoupon") },
        ],
      },
      otherwise: { tell: [{ NotifyPaymentFailure: {} }] },
    },
    Ship: { tell: [{ SendShippingNotice: { priority: decided("shipping", "priority") } }] },
    Cancel: { tell: [{ Refund: {}, when: was("PAID") }] },
  },

  // 意味: 名前が何を指すか（関数。IR に出ない）
  conditions: {
    "The customer is a Gold member and it is month-end": (state) => state.rank === "Gold" && state.isMonthEnd,
    "The customer is a Silver member": (state) => state.rank === "Silver",
    "The customer is a Gold member, or the order is 10,000 yen or more": (state) =>
      state.rank === "Gold" || (state.price ?? 0) >= 10_000,
    "The external payment module is active": (state) => state.paymentModuleActive,
    "The payment succeeded": (state) => state.paymentResult === "succeeded",
  },
  calculations: {
    amountCharged: (state) =>
      Math.floor(((state.price ?? 0) * (100 - decide(Order, "campaign", state).discountPercent)) / 100),
  },
  alwaysTrue: {
    "Every order past the draft state has a member rank and a price": (state) =>
      state.status === "DRAFT" || (state.rank !== undefined && state.price !== undefined),
  },
});
```

#### 構造の書き方

アクションごとに（`when` のあるアクションは、その条件ごとに）、次のものを書きます。遷移先はコンポーネントの `goTo` にあるので、ここには書きません。

* `tell`: 出す指示を、順に並べます。各要素は `{ 指示名: { フィールド: 値 } }` です。`when` を添えると、それが成り立つときだけ出します。
* `remember`: 覚えるデータです。書いたフィールドだけが更新されます。

値は、定数か参照です。

| 参照 | 指すもの |
| --- | --- |
| `given("名前")` | そのアクションの入力 |
| `remembered("名前")` | 覚えているデータ |
| `asked("名前")` | 問い合わせの答え |
| `decided("表", "列")` | 決定表の、当たった行の列の値 |
| `calculated("名前")` | 計算の結果 |
| `was("状態", ...)` | アクションの実行前の状態が、挙げたどれかであること（真偽値） |

指示の `when` には、条件の文か、真偽値の参照を書けます。表を引くだけの判断や、実行前の状態による判断は、参照で書けば条件の文と関数を増やさずに済みます。条件の文として書くのは、業務上の判断を表すものです。

参照の名前と値の型は、コンポーネントの宣言と突き合わせて検査します。存在しない表や列、他のアクションの入力、型の合わない列（真偽値の列を整数のフィールドに渡す、など）は型エラーになります。

#### 意味の書き方

* 条件と計算の関数は、状態名（`status`）、覚えているデータ（未設定があり得る）、問い合わせの答え、アクションの入力を受け取ります。不変条件の関数が受け取るのは、状態名と覚えているデータだけです。型はコンポーネントから決まるので、フィールド名の typo はコンパイルエラーになります。
* 関数の中では、`decide(コンポーネント, "表", state)` で決定表の当たった行を、`calculate(コンポーネント, "名前", state)` で別の計算の結果を使えます。
* **漏れも余りもコンパイルエラーになります。** 結び付けるべき条件は、決定表の行・`onlyIf`・`when` のキー（コンポーネント）と、指示の `when` に書いた文（構造）から型で集めます。計算と不変条件も同様です。アクションや、`when` の条件ごとの構造が抜けていても型エラーになります。
* 不変条件が検証するのは仕様であって実装ではありません。覚えているデータを本番システムから読まない方針のため、実装に対しては確かめられません。IR には文を載せるので、LLM には前提として伝わります。

型エラーの文面には、何が間違っているかの説明が出ます（例: `"Z" は states にありません`）。型チェックをすり抜けた誤りは、IR を作るときの検査が、場所と理由を添えて報告します（例: `Notify.count: 決定表の値 true は integer に入りません`）。

#### 文と構造・意味の一致

文と、それに結び付けた構造や関数が合っているかを、機械的に照合する手段はありません。人が読んで確かめます。採点は構造と意味で行われるので、文と食い違っていた場合、実装する LLM は構造に従うことになります。

#### 結び付けの下書き（LLM による補助）

結び付けを書く手間を減らすため、LLM に下書きを書かせることができます。これは実装のループとは別の、仕様を書く人のための補助です。下書きには構造と意味の両方が含まれます。

```bash
pnpm -s run draft-binding --agent '<エージェントのコマンド>'
```

**結び付けは採点の正解なので、LLM が書いたものをそのまま正解にはしません。** 実装と正解の両方を LLM が同じ文から書くと、同じ読み違いをしたまま合格するためです。

* 下書きは `<名前>.binding.draft.ts` に書き出します。仕様の読み込みは既定で `*.draft.ts` を無視するので、**人が中身を確認してファイル名から `.draft` を外すまで、検証には使われません。**
* 結び付けがまだ無いときに使います。エージェントには、仕様のファイル（決定表とコンポーネント）と、アクションと名前をすべて並べた雛形を渡します。雛形の構造は空で、アクションの文がコメントとして添えてあります。
* 書き出す前に、下書きを型チェックと仕様の検査にかけます。型エラー、参照の誤り、意味の書かれていない名前、条件の衝突、不変条件の破れ、型に合わない値は、エージェントに差し戻します。
* コンポーネントの `assets` に宣言した添付資料（用語集など）が渡ります。コマンドの `--asset <file>` でも追加できます。
* **文と合っているかは、人が読んで確かめます。** 機械的な検査に通ることは、下書きが正しいことを意味しません。
* **人の確認を待たずに流すこともできます。** `implement --drafts` は、下書きを正解としてそのまま使います。下書きから実装までを CI で自動的に流すためのものです。この場合、実装と正解の両方が LLM の解釈に基づくので、同じ読み違いは検出できません。結果には `oracle: "draft"` と記録され、実行時にも警告が出ます。
* `// REVIEW:` の指摘を集めて警告として出す仕組み（一覧の報告や、指摘が残っている間は実行を止める、など）は、まだありません（今後の課題）。いまは人が下書きを読んで見つけます。
* エージェントには「最も文字どおりの読み方で書き、2通りに読める文には `// REVIEW:` で疑問点を書く」よう指示します。このコメントは、文の曖昧さを人に知らせる役割を持ちます。例えば例の仕様では、「1万円以上の注文」が定価なのか割引後の請求額なのか、「クーポンを発行する」の種類が文に書かれていない、という指摘が得られました。

### 3.3. Universal IR (中間表現)

プラットフォームは、コンポーネントの骨組みと文に、決定表と、結び付けの構造を重ねて、フラットな JSON (Universal IR) を出力します。どれも関数を含まない宣言なので、並べ直すだけで作れます。結び付けの意味（関数）は含めません。キーはソートされ、同じ仕様からは常にバイト一致する出力が得られます。

```json
// --- aac/ir.json（抜粋） ---
{
  "irVersion": 2,
  "model": {
    "initial": "DRAFT",
    "states": ["DRAFT", "PENDING", "PAID", "SHIPPED", "CANCELLED"],
    "data": { "rank": ["Gold", "Silver", "Bronze"], "price": { "type": "integer", "min": 0, "max": 1000000, "around": [10000] } },
    "actions": { "PlaceOrder": { "customerRank": [ ... ], "listPrice": { ... } }, "Checkout": {}, "Ship": {}, "Cancel": {} },
    "queries": { "isMonthEnd": "boolean", "paymentModuleActive": "boolean", "paymentResult": ["succeeded", "failed"] },
    "commands": { "SendReceipt": { "discountPercent": "integer", "amount": "integer" }, "Refund": {}, ... },
    "formulas": { "amountCharged": { "is": "price × (100 − discount percent) ÷ 100, rounded down to a whole yen", "type": "integer" } },
    "invariants": ["Every order past the draft state has a member rank and a price"]
  },
  "decisions": {
    "campaign": {
      "rows": {
        "The customer is a Gold member and it is month-end": { "discountPercent": 20, "grantsCoupon": true, "coupon": "Premium" },
        "The customer is a Silver member": { "discountPercent": 5, "grantsCoupon": false, "coupon": "Standard" },
        "otherwise": { "discountPercent": 0, "grantsCoupon": false, "coupon": "Standard" }
      }
    },
    "shipping": { ... }
  },
  "behaviors": [
    {
      "name": "Checkout",
      "from": ["PENDING"],
      "preconditions": ["The external payment module is active"],
      "transitions": {
        "The payment succeeded": {
          "nextState": "PAID",
          "description": "A receipt is sent with the campaign's discount percent and the amount charged. Then a coupon is issued if the campaign grants one.",
          "emittedCommands": [
            { "action": "SendReceipt",
              "payload": { "discountPercent": { "$ref": "decision:campaign.discountPercent" }, "amount": { "$ref": "formula:amountCharged" } } },
            { "action": "IssueCoupon",
              "payload": { "type": { "$ref": "decision:campaign.coupon" } },
              "when": { "$ref": "decision:campaign.grantsCoupon" } }
          ]
        },
        "otherwise": { "nextState": "PENDING", ... }
      }
    },
    { "name": "Cancel", "from": ["PENDING", "PAID"],
      "transitions": { "otherwise": { "nextState": "CANCELLED",
        "emittedCommands": [ { "action": "Refund", "payload": {}, "when": { "$was": ["PAID"] } } ], ... } } },
    ...
  ]
}

```

* IR のキーは、言語に依存しない語彙にしています（`remembers` → `data`、`asks` → `queries`、`tells` → `commands`、`calculations` → `formulas`、`alwaysTrue` → `invariants`、`allowedIn` → `from`、`onlyIf` → `preconditions`、`goTo` → `nextState`、`does` → `description`、`tell` → `emittedCommands`、`remember` → `set`）。
* `transitions` のキーは条件の文です（どれも成り立たなければ `otherwise`）。条件で分かれないアクションは、`otherwise` だけを持ちます。
* `description` は文、`emittedCommands` と `set` はその正確な形です。LLM には両方が渡ります。
* 指示の `when` は、条件の文か、真偽値の参照です。
* 参照: `{"$ref": "input:<名前>"}`、`{"$ref": "data:<名前>"}`、`{"$ref": "query:<名前>"}` は、アクションの入力、覚えているデータ、問い合わせの答え。`{"$ref": "formula:<名前>"}` は計算の結果。`{"$ref": "decision:<表>.<列>"}` は当たった行の列の値。`{"$was": [...]}` は、実行前の状態が挙げたどれかであること。
* 条件・計算・不変条件は自然言語のまま出力されます。評価関数は含みません。
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
export type StateName = "DRAFT" | "PENDING" | "PAID" | "SHIPPED" | "CANCELLED";

/** 実行するアクション1つ。名前と、それに対応する入力。 */
export type Action =
  | { name: "Cancel"; input: {} }
  | { name: "Checkout"; input: {} }
  | { name: "PlaceOrder"; input: { customerRank: "Gold" | "Silver" | "Bronze"; listPrice: number } }
  | { name: "Ship"; input: {} };

export type Ports = {
  /** 問い合わせ（時計、設定、外部サービスの応答）。答えはアクションごとに変わり得るので、必要なときに尋ねる（保持しない）。 */
  queries: {
    isMonthEnd(): boolean;
    paymentModuleActive(): boolean;
    paymentResult(): "succeeded" | "failed";
  };
  /** 指示。呼び出しは発行順に記録され、仕様と照合される。 */
  commands: {
    IssueCoupon(payload: { type: "Premium" | "Standard" }): void;
    NotifyPaymentFailure(payload: {}): void;
    Refund(payload: {}): void;
    SendOrderConfirmation(payload: {}): void;
    SendReceipt(payload: { amount: number; discountPercent: number }): void;
    SendShippingNotice(payload: { priority: boolean }): void;
  };
};

export interface TargetSystemAdapter {
  /** 【分離契約】試行の開始前に呼ばれる。初期状態の本番システムを新しく作り、ports につなぐ。 */
  setupIsolation(ports: Ports): Promise<void>;

  /** 【分離契約】試行の終了後（成功・失敗問わず）に呼ばれる。試行が作ったものを完全に破棄する。 */
  teardownIsolation(): Promise<void>;

  /** アクションを1つ実行する。1回の試行で、同じシステムに対して複数のアクションが順に実行される。 */
  executeAction(action: Action): Promise<void>;

  /** 現在の状態名を返す（Upcaster等のマイグレーション処理は本番側で完了していること）。 */
  getCurrentState(): Promise<StateName>;
}

```

`Ports` はテスト側の型であり、本番コードがこれを import することはありません。本番コードの依存の受け取り方に `Ports` をつなぐのはアダプターの仕事です。

### 3.6. Layer 3: PBT の検証内容

1回の試行は、初期状態から始まるアクション列（最大8手）です。

1. `setupIsolation(ports)` で、初期状態の本番システムを代役につないで作る。
2. 1手ごとに、入力と問い合わせの答えをランダムに決める。数値は、範囲の端としきい値（`around`）の前後を重点的に生成する。現在の状態で実行でき（`from`）、事前条件（`where`）を満たすアクションの中から1つを選ぶ。
3. 結び付けの意味（関数）で、成り立つ条件を決める。その条件の構造（宣言）の参照を解決して、期待される次状態と Command の列を得る。`when` が成り立たない指示は含めない（決定表の行と計算も、意味の関数で評価する）。
4. `executeAction(action)` を呼び、`getCurrentState` の結果と、その手の間に代役が受けた指示の列（順序を含む）が期待と一致することを確かめる。
5. 一致すれば、構造の `remember` を仕様側の「覚えているデータ」に反映して次の手へ進む。最後に `teardownIsolation` を呼ぶ。

仕様側の評価で問題が起きた場合（条件の衝突、不変条件の破れなど）は、実装の誤りではなく仕様の誤りとして報告します（§2.3 の事前検査）。

覚えているデータは、本番システムから直接は読みません。後のアクションの振る舞いを通してだけ確かめます（例えば、注文時の会員ランクを正しく覚えているかは、決済時の割引と出荷時の優先扱いで分かります）。

不一致が見つかると fast-check がアクション列を最小化し、シード・パス・**最短のアクション列**・期待値と実際の値を報告します。例えば「決済後のキャンセルで返金されない」という不具合は、「注文 → 決済成功 → キャンセル」の3手として報告され、各手の時点で覚えているはずのデータと、成り立った条件も併せて示されます。`node aac/verify.ts --seed X --path Y` で同じ反例を再現できます。

## 4. イベントストーミング＆DFDの自動生成

Layer 1が「純粋なデータ」であることと、Universal IR の存在により、ドメイン駆動設計のモデリング結果をシステムと直接同期できます。

* **付箋との1対1マッピング:** イベントストーミングで定義した Command (青)、Domain Event (オレンジ)、Policy (薄紫) が、そのまま Layer 1 の `behaviors`、`cases`、`DMN` に直結します。
* **DFD / アーキテクチャ図の自動出力:** プラットフォームのビルドステップで、Universal IR を解析して Mermaid.js 等のアーキテクチャ図を自動出力します。ドキュメントはソースコードから錬成されるため、絶対に腐敗しません。
