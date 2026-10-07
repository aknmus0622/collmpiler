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
| **IN SCOPE**(プラットフォーム) | **Layer 1: Spec** | 業務の真実（What）を宣言する。部品を境界と構造（状態・アクション・依存への問い合わせ・依存への指示・覚えるデータ）の純粋データで記述し、そこにアクションごとの case を取り付けてコンポーネントとする。条件・計算・不変条件は自然言語の名前として書く。`as const` と `satisfies` で型安全にする。関数は `cases` のマッピングだけで、構文を制限する（§3.1）。 | 人 |
|  | **Layer 2: Binding** | Layer 1 に自然言語で書いた名前（条件・計算・不変条件）に、評価関数（How）を結び付ける。PBT の正解として使い、IR には含めない。 | 人 |
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
             検査: 型チェック、読み込めること、仕様の文を書き写していないこと
      │
      ▼
 ② 配線      見せる: アダプターの契約、骨組み          ← IR は見せない
             書かせる: アダプター
             検査: 型チェック、PBT が「未実装」で失敗すること（赤）
      │
      ▼
 ③ 実装      見せる: IR、骨組み、設計方針              ← アダプターと契約は見せない
             書かせる: 本番コードの中身
             検査: 型チェック、PBT に合格すること（緑）、ミューテーション
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
* 骨組みのシグネチャを実装の段階が変えると、アダプターが型エラーになります。出口ゲートの型チェックで見つかり、「公開している名前かシグネチャが変わった」として実装の段階に差し戻されます（実装の段階はアダプターを見られないので、何が起きたかを言葉で伝えます）。
* 設計の段階のあとで止めて、人が骨組みを確認してから続ける機能は、まだありません（今後の課題）。

#### 仕様の型チェックと事前検査（LLM を呼ぶ前）

まず仕様を型チェックします。結び付けの漏れや余り、フィールド名や条件の typo、存在しない状態や指示は、ここで見つかります（§3.1、§3.2）。

IR の抽出に続いて、仕様だけをランダムなアクション列で実行します（実装は使いません）。次のものを見つけたら、**仕様の誤りとして人に報告して止まり、LLM には渡しません。**

* 2つの条件が同時に成り立つ（決定表でも、case の分かれ方でも）
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
  import { defineComponent, dir, file, text } from "@aac/core";

  const OrderBoundary = defineComponent({
    assets: [
      file("docs/architecture.md"),                              // ファイル（このファイルからの相対パス）
      dir("docs/conventions"),                                   // ディレクトリの中のファイルすべて
      text("Money is always handled as whole yen."),             // 短い文言
      text("Adapters are named *Gateway.", { phases: ["wiring"] }),  // 第2引数で、渡す段階を指定する
    ],
    initial: "DRAFT",
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
| 型チェック | 設計の段階は本番コード、以降は本番コード・アダプター・契約を型チェックする。Node がそのまま実行できる構文だけを許す | 骨組みに無いメンバーの呼び出しや、シグネチャの変更を、実行する前に見つける |
| 段階ごとの検査 | 下の表 | |

| 段階 | 段階ごとの検査 |
| --- | --- |
| 設計 | 仕様の文（条件・計算・不変条件）を骨組みに書き写していない。全ファイルを1回 import して読み込める |
| 配線 | PBT が失敗する（赤）。合格したら不合格。アダプター自身の誤りで失敗した場合（エラーの文言が「未実装」でない）も不合格 |
| 実装 | PBT に合格する（緑）。ミューテーションのゲートに合格する |

PBT は別プロセスで実行します。LLM が書いたコードが実行されるのは、出口ゲートが初めてです。骨組みの未実装部分は `not implemented` という文言のエラーを投げる取り決めにしており、配線の段階はこれで「未実装による失敗」を見分けます。

余計なもの検査は構文解析ではなくトークン単位の機械的な判定であり、グローバル（`fetch` や `process`）経由の抜け道までは塞いでいません。

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

### 3.1. Layer 1: コンポーネントと自然言語DMN (Spec)

ランタイムライブラリを排除し、純粋なデータ定義を中心に業務ルールを宣言します。書くものは3つです。

| 書くもの | 内容 | Layer |
| --- | --- | --- |
| コンポーネント | 境界と構造（純粋データ）に、アクションごとの case を取り付けたもの | 1 |
| 決定表 | 条件から定数を選ぶ表 | 1 |
| 結び付け | 自然言語の名前に対する評価関数（§3.2） | 2 |

シナリオ（ユースケース）、ドメインの部品、UI の部品は、どれも同じ形のコンポーネントとして書きます。

#### コンポーネントの境界と構造（値が源泉、型は導出）

部品を**境界と構造だけ**で記述します。どの層の部品も、外から見れば次のものしか持ちません。ここまでは関数を含まない純粋データです。

| 宣言 | 意味 | 例 |
| --- | --- | --- |
| `states` / `initial` | 状態名と初期状態 | 下書き、決済待ち、決済済み |
| `actions` | 外から部品を動かすアクション。入力（`input`）、実行できる状態（`from`）、事前条件（`where`） | 注文する（会員ランクと価格を受け取る。下書きのときだけ） |
| `queries` | 依存への問い合わせ（部品が外に尋ねて答えをもらう値） | 時計、設定、決済サービスの応答 |
| `commands` | 依存への指示（部品が外に対して行う副作用） | 領収書の送信、返金 |
| `data` | 部品が覚えているデータ。遷移の `set` で書き、後のアクションで読む | 注文時の会員ランクと価格 |
| `formulas` | 計算。名前（自然言語）と結果の型 | 請求金額 |
| `invariants` | 不変条件。名前（自然言語） | 下書き以外の注文には会員ランクと価格がある |
| `assets` | 実装を LLM に依頼するときに添付する資料（§2.3）。仕様の意味には影響しない | アーキテクチャの決まり、用語集 |

`states`・`initial`・`actions` 以外は省略できます。値として宣言するので、IR に出力でき、PBT の入力生成にも、LLM への情報提供にもそのまま使えます。TypeScript の型はここから導出します。

```typescript
// --- specs/order.component.ts (Layer 1) ---
import { applyDecision, applyFormula, defineComponent } from "@aac/core";
import type { CommandsOf, DecisionTable } from "@aac/core";

const Rank = ["Gold", "Silver", "Bronze"] as const;   // 配列は列挙
// 数値の制約。around は、その前後を PBT が重点的に生成するしきい値
const Yen = { type: "integer", min: 0, max: 1_000_000, around: [10_000] } as const;

const OrderBoundary = defineComponent({
  initial: "DRAFT",
  states: ["DRAFT", "PENDING", "PAID", "SHIPPED", "CANCELLED"],
  data: { rank: Rank, price: Yen },
  queries: {
    isMonthEnd: "boolean",                // 文字列はプリミティブ型
    paymentModuleActive: "boolean",
    paymentResult: ["succeeded", "failed"],
  },
  commands: {
    SendOrderConfirmation: {},
    SendReceipt: { discountPercent: "integer", amount: "integer" },
    IssueCoupon: { type: ["Premium", "Standard"] },
    NotifyPaymentFailure: {},
    SendShippingNotice: { priority: "boolean" },
    Refund: {},
  },
  // 計算。名前に式と丸め方を書く
  formulas: {
    "Amount charged: price × (100 − discount percent) ÷ 100, rounded down to a whole yen": "integer",
  },
  // 不変条件。どのアクションの後でも成り立つべき性質
  invariants: [
    "Every order past the draft state has a member rank and a price",
  ],
  // アクション: 入力、実行できる状態 (from)、事前条件 (where)
  actions: {
    PlaceOrder: { input: { customerRank: Rank, listPrice: Yen }, from: ["DRAFT"] },
    Checkout: { from: ["PENDING"], where: ["The external payment module is active"] },
    Ship: { from: ["PAID"] },
    Cancel: { from: ["PENDING", "PAID"] },
  },
});
```

* **型の付け方**: `defineComponent` に直接書いた値は、`as const` を付けなくても文字列リテラルや列挙として推論されます。ただし `Rank` のように変数に取り出した配列には `as const` が必要です。忘れると `string[]` に広がって列挙の検査が効かなくなるため、広がった配列は型エラーにしています。
* **構造の検査**: `initial` と `from` に `states` にない名前を書くと型エラーになります。
* **`from` と `where`**: `from` を省略すると全状態で実行できます。`from` と `where` を満たさない場合の挙動は仕様の対象外で、PBT も検証しません。構造がデータだけで書かれているので、状態遷移図をここから直接作れます。
* **名前の重複**: 条件・計算・case からは、状態名（`status`）、覚えているデータ、問い合わせの答え、アクションの入力が同じ階層で見えます。そのため `data`・`queries`・入力のフィールド名は重複できません（入力どうしは、アクションが違えば同名で構いません）。覚えているデータは未設定があり得るので、型の上でも省略可能です。
* **数値**: 金額は整数で扱い、丸め方を計算の名前に明記します。小数の計算は式の順序だけで結果がずれ、正解と実装が正当な理由なく食い違うためです。例の割引率も整数のパーセントで持っています。
* **しきい値**: 条件に数値の境目があるときは、`around` に宣言します。ちょうどその値と前後の値を重点的に生成しないと、「以上」と「より大きい」の取り違えを見逃します。

今後の課題:

* 多重度（`One<T>` / `Lone<T>` / `Some<T>` / `Many<T>`）は型としてのみ提供しています。値として宣言できる形への拡張が必要です。
* 戻り値を持つ操作（値オブジェクトの演算など）は書けません。アクションの結果は「次の状態」と「指示」だけです。
* 読み込めるコンポーネントは1つだけです。複数のコンポーネントと、その組み合わせ（ある部品の依存を、代役ではなく別の本物の部品につなぐ）は未実装です。

#### 自然言語の名前と、3種類の役割

条件・計算・不変条件は、Layer 1 には**自然言語の名前だけ**を書き、中身は Layer 2 で結び付けます（§3.2）。IR に載るのは名前（と型）だけで、それを解釈して実装するのが LLM の仕事です。解釈が正しいかは、Layer 2 を正解として PBT が判定します。

| 種類 | 名前が現れる場所 | 使われ方 |
| --- | --- | --- |
| 条件 | 決定表の行、事前条件（`where`）、case のキー | どの行・どの case に当たるかを決める。同時に成り立つのは1つまで（Hit Policy: Unique）。どれも成り立たなければ `default` |
| 計算 | コンポーネントの `formulas` | 指示の中身や、覚えるデータの値になる |
| 不変条件 | コンポーネントの `invariants` | 仕様自身の矛盾を見つける（実装ではなく仕様を検証する） |

同じ文は、どこに書かれても同じ意味になります。

#### 決定表

決定表は「どの条件に当たるかを選び、定数を返す」ものです。セルに計算は書きません。表が率や区分といったパラメータを決め、計算がそれを使って金額を出す、という分担です。`DecisionTable` 型により、フォールバック（`default`）の記述をコンパイルレベルで強制します。セルに書く指示の型は、コンポーネントの境界から導出します。

```typescript
// --- specs/order.component.ts（続き） ---
type Command = CommandsOf<typeof OrderBoundary>;

// as const: キーを厳密な文字列リテラルとして推論させる（結び付けの漏れを型で検出するため）
// satisfies: as const の推論を保ちつつ、default の記述漏れや型エラーを検査する
export const CampaignRules = {
  "The customer is a Gold member and it is month-end": {
    discountPercent: 20,
    effects: [{ action: "IssueCoupon", payload: { type: "Premium" } }]
  },
  "The customer is a Silver member": { discountPercent: 5, effects: [] },
  "default": { discountPercent: 0, effects: [] } // 必須フォールバック
} as const satisfies DecisionTable<{ discountPercent: number; effects: Command[] }>;

export const CancelRules = {
  "The order has been paid": { effects: [{ action: "Refund", payload: {} }] },
  "default": { effects: [] }
} as const satisfies DecisionTable<{ effects: Command[] }>;

export const ShippingRules = {
  "The customer is a Gold member, or the order is 10,000 yen or more": { priority: true },
  "default": { priority: false }
} as const satisfies DecisionTable<{ priority: boolean }>;
```

決定表は名前で IR に出すため、`export` が必要です。

#### case（アクションごとの遷移）

境界と構造に `.cases()` で case を取り付けると、コンポーネントが完成します。境界 → 決定表 → case の順に書くのは、決定表が境界の型を使い、case が決定表を使うためです。決定表が要らなければ、`defineComponent({...}).cases({...})` と1つの式で書けます。

```typescript
// --- specs/order.component.ts（続き） ---
export const Order = OrderBoundary.cases({
  // 条件で分かれないアクションは、関数1つで書く
  PlaceOrder: (state) => state.PENDING({
    event: "Order placed",
    // 入力の会員ランクと価格を注文に覚えさせる（決済と出荷で使う）
    set: { rank: state.customerRank, price: state.listPrice },
    effects: [{ action: "SendOrderConfirmation", payload: {} }]
  }),

  // 条件で分かれるアクションは、条件をキーにした表で書く。default が必須
  Checkout: {
    "The payment succeeded": (state) => {
      // ロジックは持たず、表データ(DMN)と計算を適用し、その結果をマッピングするのみ
      const campaign = applyDecision(CampaignRules, state);
      const amount = applyFormula(OrderBoundary, "Amount charged: price × (100 − discount percent) ÷ 100, rounded down to a whole yen", state);

      return state.PAID({
        event: "Payment completed",
        effects: [
          { action: "SendReceipt", payload: { discountPercent: campaign.discountPercent, amount } },
          ...campaign.effects
        ]
      });
    },
    "default": (state) => state.PENDING({
      event: "Payment failed",
      effects: [{ action: "NotifyPaymentFailure", payload: {} }]
    })
  },

  Ship: (state) => {
    const shipping = applyDecision(ShippingRules, state);

    return state.SHIPPED({
      event: "Order shipped",
      effects: [{ action: "SendShippingNotice", payload: { priority: shipping.priority } }]
    });
  },

  Cancel: (state) => {
    const cancel = applyDecision(CancelRules, state);

    return state.CANCELLED({ event: "Order cancelled", effects: [...cancel.effects] });
  }
});

```

* 境界に宣言したアクションすべてに、case を1つずつ書きます。過不足は型エラーになります。
* case は「遷移を出力とする決定表」です。キーは条件で、決定表と同じく `default` が必須です。次の状態・指示・覚えるデータを、条件ごとに変えられます。外部サービスの応答で分かれる場合は、その応答を `queries` に宣言し、条件で読みます（上の `paymentResult`）。関数1つで書いた case は、`default` だけの表と同じ意味です。
* `set` は、遷移のときに覚えるデータです。書いたフィールドだけが更新されます。case の中で読めるのは、そのアクション自身の入力だけです（他のアクションの入力を読むと型エラー）。

#### case 本体の構文制限

`cases` の関数は「表（DMN）を適用し、その結果を遷移にマッピングする」ことだけを行います。IR はこの関数を記号的な `state` で抽象実行して抽出するため、分岐や演算を書くと片方の経路だけが記録された誤った IR になります。そこで case 本体に書ける構文をホワイトリストで制限し、違反はコンパイル時に `forbidden-syntax` エラーとします。

* **書けるもの:** `const` 宣言、`return`、リテラル、プロパティ参照、関数呼び出し、配列・オブジェクトのスプレッド、分割代入。
* **書けないもの:** `if` / `switch` / 三項演算子、比較（`===`, `>` 等）、論理演算（`&&`, `||`, `??`, `!`, `?.`）、算術・文字列連結・テンプレートリテラルへの埋め込み、既定値、`let` / 再代入、ループ、`try`、`async` / `await`。

**分岐は条件（決定表の行、case のキー）に、演算は計算（`formulas`）に寄せます。** case 本体は、それらを適用した結果を遷移に並べるだけです。

### 3.2. Layer 2: 仕様の結び付け (Binding)

Layer 1 に自然言語で書いた名前に、評価関数を結び付けます。結び付けは `bindSpecification` の1か所にまとめます。

```typescript
// --- specs/order.binding.ts (Layer 2) ---
import { applyDecision, bindSpecification } from "@aac/core";
import { CampaignRules, CancelRules, Order, ShippingRules } from "./order.component.ts";

export const Specification = bindSpecification(Order, {
  // このコンポーネントの case が使う決定表
  tables: { CampaignRules, CancelRules, ShippingRules },

  // 条件: 決定表の行、事前条件 (where)、case のキー。
  // 同時に複数が成立した場合は RuleConflictError (Hit Policy: Unique)
  conditions: {
    "The customer is a Gold member and it is month-end": (state) => state.rank === "Gold" && state.isMonthEnd,
    "The customer is a Silver member": (state) => state.rank === "Silver",
    "The order has been paid": (state) => state.status === "PAID",
    "The customer is a Gold member, or the order is 10,000 yen or more": (state) => state.rank === "Gold" || (state.price ?? 0) >= 10_000,
    "The external payment module is active": (state) => state.paymentModuleActive,
    "The payment succeeded": (state) => state.paymentResult === "succeeded"
  },

  // 計算（決定表の結果を使える）
  formulas: {
    "Amount charged: price × (100 − discount percent) ÷ 100, rounded down to a whole yen": (state) =>
      Math.floor(((state.price ?? 0) * (100 - applyDecision(CampaignRules, state).discountPercent)) / 100)
  },

  // 不変条件: 仕様自身の矛盾を見つけるためのもの
  invariants: {
    "Every order past the draft state has a member rank and a price": (state) =>
      state.status === "DRAFT" || (state.rank !== undefined && state.price !== undefined)
  }
});

```

* **漏れも余りもコンパイルエラー**: 結び付けるべき条件は、事前条件・case のキー・`tables` に渡した決定表の行から型で集めます。結び付けの漏れも、どこにも使われていない条件（typo）も、型エラーになります。計算と不変条件も同様です。
* **型**: 評価関数の `state` はコンポーネントから型が決まります。フィールド名の typo はコンパイルエラーになります。
* **`tables` の渡し忘れ**: 決定表を `tables` に入れ忘れると、その行は型では検査されません。その場合も、IR 抽出時と仕様の事前検査でエラーになります。
* **同じ文は1つの意味**: 同じ名前を別の関数に結び付けるとエラーになります。
* **不変条件が見るもの**: 状態名と覚えているデータだけです（問い合わせや入力は見ません）。検証するのは仕様であって実装ではありません。覚えているデータを本番システムから読まない方針のため、実装に対しては確かめられません。IR には名前を載せるので、LLM には前提として伝わります。

Layer 2 は PBT が期待値を算出するための「正解」であり、IR には含まれません。したがって実装のエージェントには渡りません（§2.3）。

#### 結び付けの下書き（LLM による補助）

結び付けを書く手間を減らすため、LLM に下書きを書かせることができます。これは実装のループとは別の、仕様を書く人のための補助です。

```bash
pnpm -s run draft-binding --agent '<エージェントのコマンド>'
```

**結び付けは採点の正解なので、LLM が書いたものをそのまま正解にはしません。** 実装と正解の両方を LLM が同じ文から書くと、同じ読み違いをしたまま合格するためです。

* 下書きは `<名前>.binding.draft.ts` に書き出します。仕様の読み込みは既定で `*.draft.ts` を無視するので、**人が中身を確認してファイル名から `.draft` を外すまで、検証には使われません。**
* エージェントには、仕様のファイル（コンポーネント）と、結び付けるべき名前の一覧を渡します。確定版がまだ無ければ、名前をすべて並べた雛形から始めます。確定版があれば、足りない名前だけを対象に、確定版の内容から始めます（確定版のファイルは書き換えません）。
* 書き出す前に、下書きを確定版の代わりに読み込んで、型チェックと仕様の事前検査にかけます。型エラー、結び付け漏れ、条件の衝突、不変条件の破れ、型に合わない値は、エージェントに差し戻します。
* コンポーネントの `assets` に宣言した添付資料（用語集など）が渡ります。コマンドの `--asset <file>` でも追加できます。
* **意味が合っているかは、人が読んで確かめます。** 機械的な検査に通ることは、関数が正しいことを意味しません。
* **人の確認を待たずに流すこともできます。** `implement --drafts` は、下書きを正解としてそのまま使います。下書きから実装までを CI で自動的に流すためのものです。この場合、実装と正解の両方が LLM の解釈に基づくので、同じ読み違いは検出できません。結果には `oracle: "draft"` と記録され、実行時にも警告が出ます。確定版に切り替えるには、従来どおりファイル名から `.draft` を外します。
* エージェントには「最も文字どおりの読み方で書き、2通りに読める名前には `// REVIEW:` で疑問点を書く」よう指示します。このコメントは、名前の曖昧さを人に知らせる役割を持ちます。例えば例の仕様では、「1万円以上の注文」が定価なのか割引後の請求額なのか、「決済済みの注文」に出荷済みを含むのか、という指摘が得られました。

### 3.3. Universal IR (中間表現へのコンパイル)

プラットフォームはコンポーネントを読み込み、case を抽象実行して、フラットな JSON (Universal IR) を出力します。IR では、アクションの入力を `model.actions` に、`from`・事前条件・遷移を `behaviors` に分けて出します。キーはソートされ、同じ仕様からは常にバイト一致する出力が得られます。

```json
// --- aac/ir.json（抜粋） ---
{
  "irVersion": 1,
  "model": {
    "initial": "DRAFT",
    "states": ["DRAFT", "PENDING", "PAID", "SHIPPED", "CANCELLED"],
    "data": { "rank": ["Gold", "Silver", "Bronze"], "price": { "type": "integer", "min": 0, "max": 1000000, "around": [10000] } },
    "actions": { "PlaceOrder": { "customerRank": [ ... ], "listPrice": { ... } }, "Checkout": {}, "Ship": {}, "Cancel": {} },
    "queries": { "isMonthEnd": "boolean", "paymentModuleActive": "boolean", "paymentResult": ["succeeded", "failed"] },
    "commands": { "SendReceipt": { "discountPercent": "integer", "amount": "integer" }, "Refund": {}, ... },
    "formulas": { "Amount charged: price × (100 − discount percent) ÷ 100, rounded down to a whole yen": "integer" },
    "invariants": ["Every order past the draft state has a member rank and a price"]
  },
  "decisions": {
    "CampaignRules": {
      "bound": true,
      "rows": {
        "The customer is a Gold member and it is month-end": { "discountPercent": 20, "effects": [ ... ] },
        "The customer is a Silver member": { "discountPercent": 5, "effects": [] },
        "default": { "discountPercent": 0, "effects": [] }
      }
    },
    "CancelRules": { ... },
    "ShippingRules": { ... }
  },
  "behaviors": [
    {
      "name": "PlaceOrder",
      "from": ["DRAFT"],
      "preconditions": [],
      "transitions": {
        "default": {
          "nextState": "PENDING",
          "set": { "rank": { "$ref": "input:customerRank" }, "price": { "$ref": "input:listPrice" } },
          "emittedCommands": [ { "action": "SendOrderConfirmation", "payload": {}, "payloadSchema": {} } ]
        }
      }
    },
    {
      "name": "Checkout",
      "from": ["PENDING"],
      "preconditions": ["The external payment module is active"],
      "transitions": {
        "The payment succeeded": {
          "nextState": "PAID",
          "event": "Payment completed",
          "emittedCommands": [
            { "action": "SendReceipt",
              "payload": {
                "discountPercent": { "$ref": "decision:CampaignRules.discountPercent" },
                "amount": { "$ref": "formula:Amount charged: price × (100 − discount percent) ÷ 100, rounded down to a whole yen" } },
              "payloadSchema": { "discountPercent": "number", "amount": "integer" } },
            { "$spread": "decision:CampaignRules.effects" }
          ]
        },
        "default": { "nextState": "PENDING", ... }
      }
    },
    { "name": "Cancel", "from": ["PENDING", "PAID"], ... },
    { "name": "Ship", "from": ["PAID"], ... }
  ]
}

```

* `transitions` のキーは条件の文です（どれも成り立たなければ `default`）。
* `{"$ref": "input:<名前>"}`、`{"$ref": "data:<名前>"}`、`{"$ref": "query:<名前>"}` は、それぞれアクションの入力、覚えているデータ、問い合わせの答えを指します。
* `{"$ref": "formula:<名前>"}` は、その名前の計算の結果を指します。
* `{"$ref": "decision:<表>.<列>"}` は「現在の状態に一致した行の、その列の値」を指します。
* `{"$spread": "decision:<表>.<列>"}` は、その列の配列の全要素をその位置に展開することを指します。
* 条件・計算・不変条件は自然言語の名前のまま出力されます。評価関数は含みません。
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
3. Layer 2 の評価関数で、成り立つ case を決める。その case を具体値で実行し、期待される次状態と Command の列を得る（決定表の行と計算も、Layer 2 で評価する）。
4. `executeAction(action)` を呼び、`getCurrentState` の結果と、その手の間に代役が受けた指示の列（順序を含む）が期待と一致することを確かめる。
5. 一致すれば、遷移の `set` を仕様側の「覚えているデータ」に反映して次の手へ進む。最後に `teardownIsolation` を呼ぶ。

仕様側の評価で問題が起きた場合（条件の衝突、不変条件の破れなど）は、実装の誤りではなく仕様の誤りとして報告します（§2.3 の事前検査）。

覚えているデータは、本番システムから直接は読みません。後のアクションの振る舞いを通してだけ確かめます（例えば、注文時の会員ランクを正しく覚えているかは、決済時の割引と出荷時の優先扱いで分かります）。

不一致が見つかると fast-check がアクション列を最小化し、シード・パス・**最短のアクション列**・期待値と実際の値を報告します。例えば「決済後のキャンセルで返金されない」という不具合は、「注文 → 決済成功 → キャンセル」の3手として報告され、各手の時点で覚えているはずのデータと、成り立った条件も併せて示されます。`node aac/verify.ts --seed X --path Y` で同じ反例を再現できます。

## 4. イベントストーミング＆DFDの自動生成

Layer 1が「純粋なデータ」であることと、Universal IR の存在により、ドメイン駆動設計のモデリング結果をシステムと直接同期できます。

* **付箋との1対1マッピング:** イベントストーミングで定義した Command (青)、Domain Event (オレンジ)、Policy (薄紫) が、そのまま Layer 1 の `behaviors`、`cases`、`DMN` に直結します。
* **DFD / アーキテクチャ図の自動出力:** プラットフォームのビルドステップで、Universal IR を解析して Mermaid.js 等のアーキテクチャ図を自動出力します。ドキュメントはソースコードから錬成されるため、絶対に腐敗しません。
