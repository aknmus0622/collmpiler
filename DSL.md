# DSL の設計（次の書き方）

仕様の書き方（Layer 1 と解釈）を見直した、設計の記録です。`ROADMAP.md` の M3 に当たります。

**実装の状況**（詳しくは §13）:

* 実装済み: 節と `component`、`{}` の糖衣構文、宣言と動詞の語（`emits` / `set` / `asks` / `onlyWhen`）、裸の型、
  解釈の書き方、木の検査、グラフの検査（たどり着けない状態、使われない語彙）、コマンドの結果（`output` / `responds`）、構造を持つ値（`record` / `list` / `optional` を、型を書けるどこにでも）、`initially`、状態を持たない部品、
  依存の約束（`fresh` / `increasing`）、入力の選び方（`among` / `examples`、自動で集めた数を常に使う）。
  既存の例は、この書き方に移してある。いま動く書き方の説明は `SPEC.md` §3。
* まだ: 名前を付けた条件、Layer 1 に書いた `set` / `emits`、部品の中の部品。IR の語は、版 6 でそろえた。
  書くと、「まだ使えません」と報告される。

## 1. 方針

1. **書くときは木、意味はグラフ。**
   * 仕様のすべての要素は「節」で、節は節を入れ子にできる（Composite）。部品の中に部品も入れられる。
   * 入れ子は「含む」の辺になる。参照 (`ref.*`) や遷移がそのほかの辺になり、木はグラフになる。
   * 検査と IR は、このグラフを土台にする。
2. **「何でも入れ子にできる」は、「どの組み合わせも意味を持つ」ではない。**
   親と子の種類の組ごとに、意味を決める。意味を決めていない組み合わせは、エラーにする。
   この対応表（§3）が、DSL の文法である。
3. **節を束ねる語は `component` だけ。`compose` は無くす。**
   Composite パターンの Component（節そのもの）に当たる。何の節かは、置き場所（dict のキー）か、
   種類つきの作り方（`command("Add", ...)`）で決まる。
   * **名前のある節は、親に含まれる。** `commands: { Add: component(...) }` は、コマンド `Add`。
   * **名前の無い節は、親に溶け込む。** `const rejected = component(when(...), otherwise(...))` を
     コマンドの中に置くと、その子が、そのコマンドの子になる（共有する断片）。
   * 検証の単位（アダプターとテストを持つもの）は、export された部品である。
   * `component("Name", ...)` の最初の文字列は、名前である。型を子として書くときは、型を作る語を使う
     （`component(integer(), initially(0))`。`component("integer", ...)` は、`integer` という名前の部品になる）。
4. **正規形は、節だけ。`{}` は、「名前つきの子の並び」の糖衣構文。**
   `{ k: v }` は、「`k` という名前の子で、中身が `v`」を並べたものと同じ意味。子の種類は、それを受け取る語が決める。
   `commands: { Add: X }` は `command("Add", X)`、`record({ id: "string" })` は `record(field("id", "string"))`。
   * **どの語も、`{}` で略せる子の種類を、1つだけ持つ**（§4.8）。裸の `{}`（受け取る語が無いもの）は書けない。
   * **書くのは糖衣構文、正規形は内部の形。** 人も LLM も、糖衣構文で書く。どちらで書いても、同じ IR になる。
5. **宣言は名詞、起きることは動詞。** 宣言と使用、排他の条件とそうでない条件を、語で見分けられるようにする。
   置き場所だけで意味が決まる書き方は、語は減るが、読み間違えやすい。
6. **語は、どの層でも同じ。** Layer 1、解釈、IR で、同じものを同じ語で呼ぶ。
7. **検査の主役は、型ではなく、木の検査。**
   文法（§3 の入れ子の対応表）をデータとして持ち、読み込んだ木を `clp compile` が照らす。合否を決めるのは、こちら。
   型（tsc）は、補完と軽い誤りの検出に絞り、複雑な型の計算はやめる（§8）。
8. **解釈は、同じ木に節を足したもの。** LLM は、人が書かなかった節を足す。人が書いた節は変えられない。
   意味の関数は、条件・計算・不変条件の節に付ける。
9. **大きな作り直しになることは、受け入れる。** 対象は `packages/core`、ローダー、IR、既存の例の仕様。
   IR の変更は、1回にまとめる。

## 2. 節の種類

### 宣言する節（名詞）

「何があるか」を言う節。部品の直下に置く。

| 節 | 何か | 名前 | dict 形式でのまとまり |
| --- | --- | --- | --- |
| 部品 `component` | 1つのまとまり。根にも、ほかの部品の中にも置ける | あり | `parts`（中に置くとき） |
| 説明 `description` | 親が何であるかを言う文 | なし | `description` |
| 状態 `state` | 部品がとりうる状態 | あり | `states`、`init` |
| データ `data` | コマンドをまたいで覚える値 | あり | `data` |
| 問い合わせ `query` | 依存に尋ねること | あり | `queries` |
| 副作用 `effect` | 依存に対して行うこと | あり | `effects` |
| 決定表 `decision` | 条件から、値の行への対応 | あり | `decisions` |
| 計算 `calculation` | 文で定めた値 | あり | `calculations` |
| 条件 `condition` | 成り立つかどうかを言う文 | 文そのもの、または付けた名前 | `conditions`（名前を付けるとき） |
| 不変条件 `invariant` | いつも成り立つことを言う文 | 文そのもの、または付けた名前 | `invariants` |
| コマンド `command` | 部品を外から動かすもの | あり | `commands` |
| 添付資料 `asset` | エージェントへの依頼に添えるもの（仕様の意味ではない） | なし | `assets` |

### 型の節

値の形を言う節。**型は、それ自体が節**である。

| 節 | 何か |
| --- | --- |
| `"boolean"` / `"integer"` / `"number"` / `"string"` | 平らな値 |
| `["a", "b"]` | 列挙 |
| `integer({ min, max })`、`number({ min, max })`、`string({ examples })` | 制約や、試す例を付けた値 |
| `record({ 名前: 型, ... })` | 名前つきの子を持つ値。`input({...})` の中身と同じもの |
| `list(型)` | 並び |
| `optional(型)` | 無いことがある値。無いときの値は `null` |
| 部品 | 部品を型として使うと、「キー・状態・データ」の組になる（§6） |

### 場面を言う節

| 節 | 置き場所 | 何か |
| --- | --- | --- |
| `input(型)` | コマンド、問い合わせ、副作用 | 受け取るものの形 |
| `output(型)` | コマンド、問い合わせ、計算 | 返すものの形 |
| `from(状態...)` | コマンド | 実行できる状態 |
| `onlyIf(条件)` | コマンド | 事前条件。成り立たない場面は、仕様の外 |
| `when(条件, ...)` / `otherwise(...)` | コマンド | 場合。同時に成り立つのは1つだけ |

### 起きることを言う節（動詞）

「この場合に何が起きるか」を言う節。コマンドか、場合の中に置く。

| 節 | 何か |
| --- | --- |
| `goTo(状態)` | 遷移する。無ければ、とどまる |
| `set({ データ: 値 })` | 覚える |
| `asks(別名, 問い合わせ, { 引数 })` | 尋ねる（コマンドの中に置く）。引数の無い問い合わせは、書かなくてよい |
| `emits(副作用, { 値 }, onlyWhen(条件))` | 副作用を起こす。値も条件も、無ければ書かない |
| `responds(値)` | 結果を返す |
| `adds(部品のまとまり, キー, { 値 })` / `removes(部品のまとまり, キー)` | 含む部品を作る、消す（§6） |
| `forwards(部品のまとまり, コマンド, { missing })` | 含む部品のコマンドを、この部品の口に出す（§6） |
| `does(文)` | 起きることを、文で言う（構造にしていない部分） |

### 性質を言う節

| 節 | 置き場所 | 何か |
| --- | --- | --- |
| `initially(値)` | データ | はじめの値。無ければ、未設定 |
| `fresh()` | 問い合わせ | 一度返した値は、二度と返さない |
| `increasing()` | 問い合わせ | 前の答えより小さくならない |
| `among(覚えているもの)` | 入力のフィールド | 生成する入力を、いま覚えているものから選ぶ（ときどき、無いものも試す） |
| `onlyWhen(条件)` | `emits` | その副作用を起こすかどうかを決める条件 |
| `many(部品, { by })` / `optional(部品)` | 含む部品 | 多重度 |

## 3. 入れ子の対応表

親の種類 × 子の種類 → 意味。**表に無い組み合わせは、書けない（エラー）。**

### 部品の中

| 子 | 意味 |
| --- | --- |
| 説明 | この部品の説明 |
| 状態 | この部品の状態。1つも無ければ、状態を持たない部品 |
| データ、問い合わせ、副作用、決定表、計算、条件、不変条件、コマンド | この部品の語彙 |
| 名前のある部品 | この部品が含む部品 |
| 名前の無い `component(...)` | 溶け込む: その子が、この部品の子になる |
| 添付資料 | この部品についての依頼に添える |

### コマンドの中

| 子 | 意味 |
| --- | --- |
| 説明 | このコマンドの説明（構造にしていない部分を含む） |
| `input`、`output` | このコマンドが受け取るもの、返すものの形 |
| `from`、`onlyIf` | 実行できる場面。その外は、仕様の外 |
| `asks` | このコマンドが尋ねること |
| 場合 | 条件ごとの結果。1つも無ければ、「起きること」の節を直下に書く |
| 起きることの節 | 場合に分かれないコマンドの結果 |
| 名前の無い `component(...)` | 溶け込む: その子が、このコマンドの子になる |

### 場合の中

| 子 | 意味 |
| --- | --- |
| 起きることの節（`goTo`、`set`、`emits`、`responds`、`adds`、`removes`、`does`） | この場合に起きること |

### そのほか

| 親 | 子 | 意味 |
| --- | --- | --- |
| データ | 説明、型、`initially` | このデータの説明、形、はじめの値 |
| 問い合わせ | 説明、`input`、`output`、`fresh` / `increasing` | 何について尋ね、何が返り、依存が何を守るか |
| 副作用 | 説明、`input` | 何を渡すか |
| 計算 | 説明、`output` | 説明が、計算を定める文 |
| 状態 | 説明 | この状態の説明 |
| 条件、計算、不変条件 | 意味の関数 | 成り立つか、いくつかを決める関数。解釈が付ける。IR には出ない |
| 型 | 型 | レコードのフィールド、並びの要素、無いことがある値の中身 |
| 入力のフィールド | `among` | 入力の選び方 |

### 書かないと決めたもの

| 組み合わせ | 理由 |
| --- | --- |
| 状態の中のコマンド | `from` の別の書き方になり、同じことの書き方が2つになる。複数の状態から実行できるコマンドは入れ子にできない。状態ごとの見方は、IR から図を作ればよい |
| 場合の中の `when` | 排他の条件と、そうでない条件を、同じ語にしない（§4.2） |
| 場合の中の `description` | 場合の中の文は `does`（§4.3） |

## 4. 語の決まり

### 4.1. いまの書き方からの変更

| 意味 | いま（Layer 1 / 解釈 / IR） | これから（どの層でも） |
| --- | --- | --- |
| 節を束ねる | `compose(...)` | `component(...)` |
| データの形 | `typed(型)` / `{ type }` / `type` | 型をそのまま書く。足すものがあれば `component(list(Todo), initially([]))` |
| 返すものの形 | `output(型)` / 計算は `{ is, output }` / 計算は `{ is, type }` | `output(型)` |
| 計算を定める文 | `description(...)` / `is` / `is` | `description` |
| 副作用を起こす | （文だけ） / `effects: [{ 名前: 値, when }]` / `effects: [{ name, payload, when }]` | `emits(名前, { 値 }, onlyWhen(条件))` |
| 制約つきの値 | `{ type: "integer", min, max, around }` | `integer({ min, max })` |
| 結果を返す | 無い | `responds(値)` |
| 覚える | （文だけ） / `set` / `set` | `set({ ... })` |
| 尋ねる | `asks({ 別名: { 問い合わせ: { 引数 } } })` | `asks(別名, 問い合わせ, { 引数 })` |
| 解釈が無い、という診断 | `unbound-*`、`BINDING` | `uninterpreted-*` |

### 4.2. 条件の2つの種類

| 語 | 置き場所 | 意味 |
| --- | --- | --- |
| `when(条件, ...)` / `otherwise(...)` | コマンドの中 | 場合。**同時に成り立つのは1つだけ**。どれも成り立たなければ `otherwise` |
| `onlyWhen(条件)` | `emits` の中 | その副作用を起こすかどうかだけを決める。ほかと排他ではない |

### 4.3. `description` と `does`

分けたままにする。`description` は「それが何か」、`does` は「何が起きるか」を言う文。

### 4.4. 裸の型

**裸の型は、その節の値の形。** データなら覚える値、問い合わせなら答え、計算なら結果。

```ts
data:    { price: Yen },
queries: { isMonthEnd: "boolean" },      // output("boolean") と同じ
```

入力を取るもの（コマンド、副作用、引数つきの問い合わせ）は、`input` / `output` を明示する。

### 4.5. 条件の名前

条件は、計算と同じ形（名前 + 文）で書ける。文が名前を兼ねる書き方も残す。

```ts
when("The payment succeeded", ...)           // 文が名前を兼ねる

conditions: { paid: "The payment succeeded" },
when("paid", ...)                            // 名前を付ける。文を直しても、名前は変わらない
```

名前つきの条件は、文を直しても、導き直さずに `clp interpret --accept` で済む。不変条件と決定表の行も同じ。

### 4.6. `asks` の引数

同じコマンドのほかの `asks` の答えと、計算を書ける。尋ねる順は、参照の向きから決める。循環はエラー。

```ts
asks("user", "userOf", { token: ref.input("token") }),
asks("quota", "quotaOf", { user: ref.query("user") }),
```

### 4.7. 結果の区別

列挙 + 無いことがある値で書く。

```ts
output(record({ result: ["created", "invalid"], todo: optional(Todo) })),
when("The title is blank", responds({ result: "invalid", todo: null })),
```

場合ごとに形が違う書き方（`oneOf` のような型の節）は、web の例を通して要ると分かったら足す。
いまの書き方は、足しても無効にならない。

### 4.8. `{}` の読み方

`{}` は、名前つきの子の並びの略である。キーが何の名前かは、受け取る語で決まる。語ごとに、1種類だけ。

| 語 | `{}` のキーが表すもの | 正規形 |
| --- | --- | --- |
| `component`、`interpretation`（dict 形式） | 節の種類のまとまり（`data`、`commands`…）。その中の `{}` は、節の名前 | `command("Add", ...)`、`data("price", Yen)` |
| `record`、`input` | フィールド（値は型）。`input({...})` は `input(record({...}))` の短い書き方 | `record(field("id", "string"))` |
| `responds`、`set`、`emits`、`adds`、`asks` | フィールド（値は定数か参照） | `set(field("rank", ref.input("customerRank")))` |
| `integer`、`number`、`string`、`many`、`forwards`、`file` / `dir` / `text` | 設定（`min`、`examples`、`by`、`missing`、`phases`） | 内部の形（設定の語は、書き手には公開しない） |
| `decisionTable` | 行。その中の `{}` は、列（値はセル） | — |

* **裸の `{}` は書けない。** 型の位置に `{ type: "integer", min: 1 }` と書くと、フィールドを持つレコードにも読めてしまう。
  `integer({ min: 1, max: 30 })` と書く。
* **1つの `{}` に、種類の違う名前を混ぜない。** `emits` の `{}` はフィールドだけを表し、条件は節で書く
  （`emits("IssueCoupon", { type: ... }, onlyWhen(...))`）。混ぜると、`onlyWhen` という名前のフィールドと区別できない。
* **`{}` は、語の引数として1段だけ現れる。** 段ごとに意味が変わる入れ子（いまの `asks`）は、作らない。

## 5. 依存の約束と、入力の選び方

```ts
queries: {
  newId: component(description("A fresh identifier."), output("string"), fresh()),
  now: component(description("The current time, in seconds."), output("integer"), increasing()),
},
commands: {
  Complete: component(input({ id: among("items") }), ...),
  Register: component(input({ email: string({ examples: ["a@example.com", "not-an-address"] }) }), ...),
},
```

| 点 | 決めたこと |
| --- | --- |
| 依存の約束 | 問い合わせの節に付ける性質。`fresh()` と `increasing()` の2つから始める。代役が守り、契約にも書く |
| 経過時間 | `increasing()` の問い合わせで書く。増える幅を、仕様の中の数の前後から選ぶので、「発行から N 秒」のしきい値に届く |
| 保存したものを、あとで読める | 約束としては書かない。**状態を持つ依存は、それ自体が部品である。** 0.1 では部品の内側（覚えるデータ、含む部品）に持つ。別の部品としてつなぐのは、1.0 の「部品をつなぐ」で扱う |
| しきい値 (`around`) | 数を書き写さない。仕様の中の数（決定表の値、関数の中の定数）は、自動で集めて試す。`around` を書いても、自動で集めた数は使い続ける（いまは、書くと使われなくなる）。足したいときは、数か、参照（`ref.decision(...)`）を書く |
| いまの状態から選ぶ | `among(覚えているもの)`。含む部品のキー、覚えている並びの要素 |
| 形式の決まった文字列 | `string({ examples: [...] })`。生成器が混ぜる |

## 6. 多数ある部品

`many(部品, { by: キー })` で、キーごとに多数ある部品を、親の中に置く（例は §10.4）。

| 点 | 決めたこと |
| --- | --- |
| 子のコマンドを親の口に出す | 明示する（`forwards`）。親の口に何があるかが、親の仕様だけで分かる。キーが無いときの結果も、ここで言う。入力は「キー + 子の入力」、結果は「子の結果 + キーが無いときの結果」 |
| 作る、消す | 起きることの節 `adds` / `removes`。作るときは、キーと、子のデータのはじめの値を渡す。子は、自分の `init` の状態から始まる |
| 親が子を読む | 条件と計算の関数は、`state.items`（キーから「状態・データ」への対応）を読める。値として返すときは `list(Todo)` |
| 検証の単位 | 親（export された部品）。子の状態は直接は観測せず、結果と、あとの振る舞いで確かめる。子だけの契約は作らない（本番コードに「todo 1件」という単位を強いないため） |

### 一覧を覚える形との違い

同じものは、部品を入れ子にしなくても書ける（`items: list(Todo)` を覚え、足す・消す・書き換えるは計算に任せる。§10.3）。
違いは、項目の振る舞いが、どこに書かれるかである。

| | 一覧を覚える形 | 部品を入れ子にする形 |
| --- | --- | --- |
| 項目の振る舞い（未完了 → 完了） | 計算の関数の中。正解の側にしか無い | 子の状態機械。構造として書かれる |
| IR に出るもの | 計算を定める文だけ | 子の状態、遷移、場合 |
| グラフの検査、入力の生成 | 項目については効かない | 項目にも効く |
| 足す仕組み | `list` と `record` だけ | それに加えて、`many`、`adds` / `removes` / `forwards`、検証の実行、IR、契約 |

### 実装の時期

1. `list` と `record` を先に入れる（どちらの形にも要る）。
2. web の例を、一覧を覚える形で一度通す。項目の振る舞いが計算に埋もれて困るかどうかを、そこで確かめる。
3. 困ると分かったら、0.1 の中で入れ子を実装する。そうでなければ 1.0 に送る。

IR の形は、部品の入れ子を表せるものにしておく（あとから足して、IR をもう一度変えないため）。

## 7. 解釈

解釈は、同じ木に節を足したものである。語は Layer 1 と同じ。

* **正規形は、1つの木。** 関数は、条件・計算・不変条件の節に付ける。同じ文（または名前）は同じ節を指すので、
  関数は1回だけ付ける。
* **糖衣構文は、dict 形式。** 関数は `meanings` の表にまとめる。表の各行が、その名前の節に関数を付ける。
* 関数は、節に付いた属性で、IR には出ない。
* 人が書いた節は、変えられない（いまの決まりと同じ）。
* 古くなったかどうかの判定は、変えない。Layer 1 の木のハッシュ（決定表の値と添付資料を除く）を、解釈に記録する。

```ts
// 正規形
export const Interpretation = interpretation(Order,
  condition("The payment succeeded", (state) => state.paymentResult === "succeeded"),
  command("Checkout",
    when("The payment succeeded", emits("SendReceipt", { ... })),
    otherwise(emits("NotifyPaymentFailure")),
  ),
);

// 糖衣構文
export const Interpretation = interpretation(Order, {
  commands: {
    Checkout: component(when("The payment succeeded", emits("SendReceipt", { ... })), otherwise(emits("NotifyPaymentFailure"))),
  },
  meanings: {
    conditions: { "The payment succeeded": (state) => state.paymentResult === "succeeded" },
  },
});
```

## 8. グラフと、検査

| 辺 | どこからどこへ | 何から決まるか |
| --- | --- | --- |
| 含む | 親 → 子 | 入れ子 |
| 実行できる | 状態 → コマンド | `from` |
| 遷移 | 状態 → 状態（コマンドと場合つき） | `from` と `goTo` |
| 尋ねる | コマンド → 問い合わせ | `asks` |
| 起こす | 場合 → 副作用 | `emits` |
| 覚える | 場合 → データ | `set` |
| 返す | 場合 → 結果 | `responds` |
| 読む | 値を書いた場所 → 値の出どころ（入力、データ、問い合わせの答え、決定表の列、計算、実行前の状態） | `ref.*` |
| 決める | 条件 → 場合、決定表の行 | `when`、決定表 |
| つなぐ | ある部品の副作用 → 別の部品のコマンド | 1.0 で扱う |

### 木の検査（linter）

**検査の主役は、型ではなく、読み込んだ木に対する検査である。** `clp compile` が行い、合否を決める。

* 文法（§3 の入れ子の対応表）を、データとして持つ: 親の種類 × 子の種類 → 書けるか、いくつまでか。
* 正規形でも糖衣構文でも、検査の相手は変換後の木なので、同じ検査が効く。
* 節を作るときに、呼び出し元の位置（ファイルと行）を記録する。診断は「`order.component.ts` の 42 行目:
  コマンドの中に `initially` は書けません」のように、場所と直し方を、日本語で出す。
* 書いている最中に確かめるには、ファイルの変更を見張って実行し直す（`clp compile --watch`）。

| 検査 | 型で | 木の検査で |
| --- | --- | --- |
| 置き場所の誤り（表に無い組み合わせ） | 難しい | 表を引く |
| 重複（同じ名前、2つ書いた `input`） | 難しい | できる |
| 名前の参照の誤り（無い状態、無いデータ） | できるが、文面が書き手に届いていない | できる |
| 値と型の不一致 | できる | できる |
| 到達しない状態、使われない語彙 | できない | グラフの検査として、同じ場所でできる |

型（tsc）の役割は、補完と、軽い誤りの検出（`{}` のキー、`ref.*` の名前）に絞る。
いまの型の検査は、型エラーの1行目が `No overload matches this call.` になって文面が届かない、置き場所の誤りが
解釈ができるまで分からない、Layer 1 の誤り1つが解釈の側に十数件の型エラーを生む、という問題を抱えている。

これは、これまでの前提（「誤った書き方は、型エラーになる」「解釈は LLM が書くが、型が通らなければ使えない」）を
変える。守りの強さは変えず、確かめる場所を tsc から `clp` に移す。解釈の下書きを受け入れる前の検査も、木の検査で行う。

木の検査は「表を引いて、合わなければ報告する」判定なので、フレームワーク自身の仕様として書ける
（`reference-check` と同じ形。文法の表は決定表になる）。

### グラフで言い直せる検査

| 検査 | グラフでの言い方 | いま |
| --- | --- | --- |
| 到達しない状態・コマンド | 初期状態から、遷移の辺でたどれない | 無い |
| 使われない語彙 | 入ってくる辺が1本も無い | 無い |
| 検証に現れない値 | 値から、観測される節（副作用、結果、状態）への道が無い | 仕様を実行して確かめている（決定表の値だけ） |
| 事前条件にしか現れない値 | 道が、`onlyIf` にしか通じていない | 同上 |
| `asks` の循環 | 「読む」の辺の循環 | 引数に、ほかの答えを書けない |
| 部品どうしの接続 | 「つなぐ」の辺の両端で、型が合う | 無い |
| 深い判断に入力が届かない | 遷移のグラフの上の、道の網羅 | 回数を増やしている |

### グラフだけでは分からないこと

**条件と計算の意味は、関数である。** 関数が何を読むかは、書かれたものからは分からない。

* 構造の中の参照（`ref.*`）は、静的に辺を引ける。
* 関数が読むものは、仕様を実行して記録する（関数に渡す状態への読み出しを記録すれば、辺として足せる）。
* 「値を変えても結果が変わらない」こと（数えているが、見るのは有無だけ、という書きすぎ）は、道があっても起こる。
  これは、いまの仕様のミューテーションのように、実行して確かめるしかない。

つまり、グラフは「道が無い」ことを安く確実に言えるが、「道があるのに効かない」ことは言えない。両方を使う。

## 9. IR の形

* **いまの形を保つ。** 種類と名前で入れ子にした JSON。「含む」は入れ子、そのほかの辺は `$ref`。
  IR を読むのは実装するエージェント（LLM）なので、コマンドごとに「何が起きるか」がまとまって読める形にする。
  検査に使う辺の一覧は、読み込んだあとに、メモリの上で作る。
* **キーを、決めた語にそろえる。**

  | いま | これから |
  | --- | --- |
  | 計算 `{ is, type }` | `{ description, output }` |
  | 場合の中の `effects: [{ name, payload, when }]` | `emits: [{ effect, input, onlyWhen }]` |
  | （無い） | 場合の中の `responds`、コマンドの `output` |
  | 説明は、別の表（`descriptions: { "queries.isMonthEnd": ... }`） | **変えない**（下の注） |
  | （無い） | 問い合わせの `promise`、`model.initial`、`model.outputs`、場合の `responds`（使った仕様にだけ出る） |

* **変更は1回にまとめる。** IR の版を1つ上げ（5 → 6）、上の変更をまとめて入れた（実装済み）。
  既存の例は、生成物を作り直すだけで済んだ（境界は変わらないので、エージェントは呼ばれない）。
* 注: 説明は `descriptions` の表のまま。語彙の項目は型そのもの（`model.data.price` は `{ type: "integer", ... }`）なので、
  節ごとに `description` を入れると、すべての型をオブジェクトで包むことになり、読みにくくなる。
* 部品の入れ子（`parts`）は、0.1 には入れない（web の例で要らなかった）。入れるときに、版を上げる。

## 10. 例

### 10.1. 注文（いまの例。変わるのは語だけ）

```ts
export const Order = component({
  description: "An order: placed by a customer, paid through an external payment module, then shipped or cancelled.",
  states: ["DRAFT", "PENDING", "PAID", "SHIPPED", "CANCELLED"],
  init: "DRAFT",
  data: { rank: Rank, price: Yen },                                   // typed(...) が要らない
  queries: {
    isMonthEnd: component(description("Whether today is the last day of the month."), output("boolean")),
    paymentModuleActive: "boolean",                                   // 裸の型
    paymentResult: ["succeeded", "failed"],
  },
  effects: {
    SendReceipt: input({ discountPercent: "integer", amount: "integer" }),
    Refund: description("What the customer paid is returned."),
  },
  decisions: { campaign: Campaign, shipping: Shipping },
  calculations: {
    amountCharged: component(description("price × (100 − discount percent) ÷ 100, rounded down to a whole yen"), output("integer")),
  },
  invariants: ["Every order past the draft state has a member rank and a price"],
  commands: {
    PlaceOrder: component(
      input({ customerRank: Rank, listPrice: Yen }),
      from("DRAFT"),
      goTo("PENDING"),
      does("The order remembers the customer's rank and the list price. An order confirmation is sent."),
    ),
    Checkout: component(
      from("PENDING"),
      onlyIf("The external payment module is active"),
      when("The payment succeeded", goTo("PAID"), does("A receipt is sent ... Then a coupon is issued if the campaign grants one.")),
      otherwise(does("The customer is notified of the payment failure.")),
    ),
    Cancel: description("A pending or paid order can be cancelled. If the order had been paid, a refund is issued."),
  },
});
```

解釈（糖衣構文）。人は、同じ語で、Layer 1 に先に書いておくこともできる。

```ts
export const Interpretation = interpretation(Order, {
  commands: {
    PlaceOrder: component(set({ rank: ref.input("customerRank"), price: ref.input("listPrice") }), emits("SendOrderConfirmation")),
    Checkout: component(
      when(
        "The payment succeeded",
        emits("SendReceipt", { discountPercent: ref.decision("campaign", "discountPercent"), amount: ref.calculation("amountCharged") }),
        emits("IssueCoupon", { type: ref.decision("campaign", "coupon") }, onlyWhen(ref.decision("campaign", "grantsCoupon"))),
      ),
      otherwise(emits("NotifyPaymentFailure")),
    ),
    Cancel: component(from("PENDING", "PAID"), goTo("CANCELLED"), emits("Refund", onlyWhen(ref.was("PAID")))),
  },
  meanings: {
    conditions: { "The payment succeeded": (state) => state.paymentResult === "succeeded" },
    calculations: { amountCharged: (state) => Math.floor(((state.price ?? 0) * (100 - decide(Order, "campaign", state).discountPercent)) / 100) },
  },
});
```

### 10.2. 貸出（結果を返す。断ったことが、検証に現れる）

```ts
export const Loan = component({
  description: "The loan of one book to a library member. ...",
  states: ["AVAILABLE", "ON_LOAN", "OVERDUE", "LOST"],
  init: "AVAILABLE",
  queries: description("How many books the member currently has on loan, and whether someone else has reserved the book."),
  effects: description("A late-fee charge, carrying the amount in yen; a notice to the next member waiting; and a replacement charge."),
  decisions: { policy: Policy },
  commands: {
    Borrow: component(
      from("AVAILABLE"),
      output(record({ result: ["lent", "refused"], dueInDays: optional("integer") })),
      when(
        "The member already holds at least the policy's maximum number of books, or someone else has reserved the book",
        responds({ result: "refused", dueInDays: null }),
      ),
      otherwise(goTo("ON_LOAN"), does("The book is due in the policy's loan days. The answer says in how many days.")),
    ),
  },
});
```

いまの例では、期日は「期日の通知」という副作用で伝えていた。結果を書けるようになると、呼び出し元に返す値として書ける。
断ったときは、いまは「何も起きない」としか検証されないが、`refused` という結果として検証される。

### 10.3. todo（一覧を、1つの部品が覚える形）

```ts
const Todo = record({ id: "string", title: "string", done: "boolean" });

export const Todos = component({
  description: "A to-do list behind an API. Items are added, completed, removed and listed.",
  // 状態を持たない: states / init を書かない
  data: { items: component(list(Todo), initially([])) },
  queries: { newId: component(description("A fresh identifier."), output("string"), fresh()) },
  commands: {
    Add: component(
      input({ title: "string" }),
      output(record({ result: ["created", "invalid"], todo: optional(Todo) })),
      when("The title is blank", responds({ result: "invalid", todo: null })),
      otherwise(does("A new open item with a fresh identifier and the given title is added at the end. The answer is created, with the item.")),
    ),
    Complete: component(
      input({ id: among("items") }),
      output(["completed", "not-found", "already-done"]),
      when("No item has the given identifier", responds("not-found")),
      when("The item is already done", responds("already-done")),
      otherwise(does("The item becomes done."), responds("completed")),
    ),
    List: component(
      input({ only: ["all", "open", "done"] }),
      output(list(Todo)),
      does("The answer is the items in the order they were added, filtered as asked."),
    ),
  },
});
```

並びを「どう変えるか」（足す、消す、書き換える）は、構造の語彙にしない。計算（文と関数）に任せる。
解釈は `set({ items: ref.calculation("itemsWithNew") })` のように書き、IR には「この計算の結果を覚える」とだけ出る。

### 10.4. todo（部品の中に、部品を入れる形）

```ts
// todo 1件。状態機械を持つ、ふつうの部品
const Todo = component({
  description: "One item of a to-do list.",
  data: { title: "string" },
  states: ["OPEN", "DONE"],
  init: "OPEN",
  commands: {
    Complete: component(
      output(["completed", "already-done"]),
      when("The item is already done", responds("already-done")),
      otherwise(goTo("DONE"), responds("completed")),
    ),
  },
});

export const Todos = component({
  description: "A to-do list behind an API.",
  parts: { items: many(Todo, { by: "id" }) },
  queries: { newId: component(output("string"), fresh()) },
  commands: {
    Add: component(
      input({ title: "string" }),
      output(record({ result: ["created", "invalid"], id: optional("string") })),
      when("The title is blank", responds({ result: "invalid", id: null })),
      otherwise(adds("items", ref.query("newId"), { title: ref.input("title") }), responds({ result: "created", id: ref.query("newId") })),
    ),
    Complete: forwards("items", "Complete", { missing: responds("not-found") }),
    Remove: component(
      input({ id: among("items") }),
      output(["removed", "not-found"]),
      when("No item has the given identifier", responds("not-found")),
      otherwise(removes("items", ref.input("id")), responds("removed")),
    ),
    List: component(input({ only: ["all", "open", "done"] }), output(list(Todo)), does("The answer is the items in the order they were added, filtered as asked.")),
  },
});
```

### 10.5. フレームワーク自身（`reference-check`）

結果を1つずつ副作用で出す形は、そのまま書ける。変わるのは語だけである。

```ts
GoTo: component(
  input({ state: "string" }),
  from("IN_CASE"),
  asks("declared", "stateDeclared", { name: ref.input("state") }),
  when("The named state is not declared", does("An unknown-state diagnostic is reported ... The walk remembers that something was reported.")),
  otherwise(),
),
```

## 11. はじめの 10 項目との対応

| # | 項目 | この設計での扱い |
| --- | --- | --- |
| 1 | 構造を持つ値 | 型の節 `record` / `list` |
| 2 | 無い値 | `optional(型)`、値は `null` |
| 3 | コマンドの結果 | `output(型)` を宣言し、`responds(値)` で返す |
| 4 | 結果の区別 | 列挙 + 無いことがある値（§4.7） |
| 5 | 覚えるデータの初期値 | `initially(値)` |
| 6 | 状態を持たない部品 | 状態の節が無い |
| 7 | 多数ある部品 | 部品の中の部品に、多重度とキー（§6）。実装の時期は、web の例を通してから決める |
| 8 | 入力の選び方 | 自動で集めた数を常に使う。`among`、`examples`（§5） |
| 9 | 依存の約束 | `fresh`、`increasing`。状態を持つ依存は、部品として扱う（§5） |
| 10 | 語と細部 | §4 |

## 12. 書けないもの、先に送ったもの

| もの | 扱い |
| --- | --- |
| 場合ごとに形が違う結果 | web の例を通して要ると分かったら足す（§4.7） |
| 状態を持つ依存（保存先）を、別の部品としてつなぐ | 1.0（部品をつなぐ） |
| 多数ある部品の実装 | web の例を通してから決める（§6） |
| 優先順位つきの条件（上から順に、最初に成り立ったもの） | 入れない。条件は、同時に1つだけ |
| 入れ子の状態（状態の中の状態） | 入れない |
| 並行するコマンド、遅れて起きる副作用、依存の失敗 | 1.0 |

## 13. 実装の状況

| もの | 状況 |
| --- | --- |
| 節、`component`（部品・名前つきの節・溶け込む束）、`{}` から節への変換 | 済み（`packages/core/index.ts`） |
| 文法の表と、木の検査（位置つきの診断） | 済み。`clp compile` が報告する。Layer 1 だけでも確かめる |
| 語: `emits` / `onlyWhen` / `set` / `asks(別名, 問い合わせ, {...})`、裸の型、`integer({...})` | 済み |
| 解釈を、Layer 1 と同じ語で書く（dict 形式と、`meanings` の並び） | 済み。`clp interpret` の雛形と依頼文も、この書き方 |
| 取っ手（§15）: まとまりの宣言、取っ手での参照、決定表の行を条件の取っ手で、`取っ手.means(関数)`、取っ手の型 | 済み。文字列の参照は、公開の語から消した（内部の作り手としてだけ残る）。既存の例は機械的に書き換え、IR は前後で一致。`clp interpret` の雛形は、Layer 1 が export する取っ手を import して書く。実際の LLM が、取っ手の書き方で解釈を導けることを確かめた |
| 入力のフィールドの組のフィールド（`PostInput.body.title`） | 済み。入力の取っ手だけ（データと答えのフィールドは、まだ） |
| 既存の例を移す | 済み。機械的に書き換えた（Layer 1 のハッシュと IR は、前後で一致） |
| 型の検査を軽くする | 済み。型レベルの検査の仕組みは消した。意味の関数の中の名前の誤りは、仕様を実行するときに確かめる |
| 解釈の正規形（関数を節に付ける `condition(名前, 関数)`） | 受け付けるが、`clp interpret` が書くのは dict 形式 |
| Layer 1 に書いた `set` / `emits` | まだ（解釈だけが書ける） |
| コマンドの結果（`output` / `responds`） | 済み。形は値1つか `record`（フィールドは `optional` にできる）。Layer 1 にも解釈にも書ける。IR には `model.outputs` と、場合ごとの `responds` が、返すコマンドがあるときだけ出る（無い仕様の IR と契約は、以前のまま） |
| 構造を持つ値（`record` / `list` / `optional`）を、型を書けるどこにでも | 済み。並びは順序も比べる。値が合うかは、IR を作るときと、仕様を実行するときに確かめる。セルフホストした `payload-check` の範囲の外なので、語彙に構造を持つ型があれば、その検査は Stage 0 が行う |
| `initially`、状態を持たない部品（内部では、状態 `READY` を1つ持つ） | 済み |
| 依存の約束 `fresh` / `increasing` | 済み（引数の無い問い合わせ）。`increasing` の増え幅は、仕様の中の数の前後から選ぶ |
| 入力の選び方 `among(データ, フィールド)` / `string({ examples })`、自動で集めた数を常に使う | 済み。`among(Data.items, "id")` は覚えている並びの要素から、含む部品が覚えているデータからも選ぶ。`among(Part.items)` は、多数ある部品のいまあるキーから |
| 名前を付けた条件 | 済み（`conditions({...})`。§15） |
| 部品の中の部品（§14）: `parts`、`Part.todos.Add({...})`、答え `.answer`、`route(...)` | 済み。期待値は、外側と中の仕様を一緒に実行して作る。観測は外側の答えと、外の世界への副作用すべて（中の部品のものは `todos.<副作用>`）。中の部品の依存は、外側の契約に `todos.<名前>` で並ぶ。部品を含む部品は、含む部品のあとに一致させ、そのエージェントは中の部品の IR を見ず、そのコードを変えられず、ミューテーションもそこには及ばない。既定の試行回数は 500 |
| 多数ある部品 `many(Todo, by("id"))`: `Part.items.at(キー).Complete()`、`Part.items.add(キー, {...})`、`Part.items.remove(キー)` | 済み。無いキーで呼ぶと、何も起きず、答えは `null`。関数からは `state.items`（作った順の、キー・状態・データの並び）と、その手で呼んだ答え `state.items.Complete`。`add` / `remove` は、解釈だけが書ける（`set` / `emits` と同じ） |
| `forwards`（子の口をそのまま出す） | まだ。いまは、外側のコマンドを書いて、呼んで、答えを返す |
| IR の語の統一（版 6） | 済み。計算は `{ description, output }`、場合は `emits: [{ effect, input, onlyWhen }]`。説明の表は変えない（§9） |
| グラフの検査（到達しない状態、実行されないコマンド、使われない語彙） | 済み（`packages/cli/src/graph.ts`）。仕様を実行せずに、書かれた構造だけから確かめる。関数が読むものを記録して辺に足すことは、まだ |

作ってみて分かったこと:

* `component("integer", ...)` は、`integer` という名前の部品と読まれる（§1 の 3）。
* 文（`description` / `does`）は、いくつ書いても、つながって1つになる（文法の表では、数を制限しない）。
* `otherwise` と `init` が無いことは、木の検査では報告しない。Layer 1 に無ければ解釈が足せるので、重ねたあとで確かめる。
* 解釈の構造の中の注釈は、機械的な書き換えでは残せなかった。
* `among` は、型を作る語にした（`among(Data.items, "id")` は、手がかりつきの文字列の型。整数なら第3引数に `"integer"`）。
  選ぶ値の型を、覚えているデータの型から導くことはしていない。
* 乱数の文字列でも、意味の関数の中の文字列を混ぜているので、短い識別子どうしは偶然に一致することがある。
  「`among` が無ければ、覚えている項目に当たらない」とは言い切れない。

## 14. 部品をつなぐ: 入口も部品（1.0、実装済み。§13）

入口までエージェントが書くことと、部品をつなぐことを、1つの仕組みとして扱う（`ROADMAP.md` の 1.0 の N3〜N5）。

### 14.1. 方針（決定）

* **入口も部品である。** HTTP の API は、リクエストをコマンドとし、ステータスコードと本文を結果とする部品。
* **入口は、ドメインの部品を中に含む。** つなぐのは、部品の中の部品（§6）と同じ `parts`。多重度が違うだけ。
* **検証は、同じ PBT。** 外側の部品を検証するとき、中の部品は本物のコードを使い、期待値は外側と中の仕様を一緒に実行して作る。
  別の「2段目の検証（決まった筋書き）」は作らない。
* これで、ステータスコードが仕様の中に入り（検証され、ミューテーションも効く）、保存先も部品として含められる。

### 14.2. たたき台（書き方は §15 の取っ手に合わせて読み替える: `calls("added", "todos", "Add", {...})` は `Part.todos.Add({...})`、`ref.call("added", "todo")` は `Part.todos.Add.answer.todo`）

```ts
export const TodoApi = component({
  description: "The HTTP API of the to-do list.",
  parts: { todos: Todos },                                  // 含む部品（1つ）
  commands: {
    PostTodos: component(
      route("POST /todos"),                                 // 経路（14.3 の 5）
      input({ body: record({ title: "string" }) }),
      output(record({ status: [201, 422], body: optional(Todo) })),
      calls("added", "todos", "Add", { title: ref.input("body", "title") }),   // 中の部品を呼び、答えに名前を付ける
      when("The list created the item", responds({ status: 201, body: ref.call("added", "todo") })),
      otherwise(responds({ status: 422, body: null })),
    ),
    GetTodos: component(
      route("GET /todos"),
      input({ query: record({ only: ["all", "open", "done"] }) }),
      output(record({ status: [200], body: list(Todo) })),
      calls("listed", "todos", "List", { only: ref.input("query", "only") }),
      responds({ status: 200, body: ref.call("listed") }),
    ),
  },
});
```

### 14.3. 決めたこと（決定。書き方は §15 の取っ手）

| # | 点 | 案 |
| --- | --- | --- |
| 1 | 親が子を呼ぶ書き方 | `const Part = parts({ todos: Todos })` を宣言し、`Part.todos.Add({ 入力 })` で呼ぶ。答えは `Part.todos.Add.answer`、フィールドは `Part.todos.Add.answer.todo`。条件と計算からは `state.todos.Add` で読める。呼ぶ順は書いた順で、場合を決める前に呼ぶ（`asks` と同じ）。同じコマンドを2回呼ぶときだけ `.as("名前")`。子の口をそのまま出すだけなら `forwards`（§6） |
| 2 | 何を観測するか | 外側の部品の答え（`responds`）と、**外の世界への副作用すべて**（外側の部品のものも、中の部品のものも）。中の部品の状態とデータは読まない |
| 3 | 期待値の作り方 | 外側の仕様を実行し、`calls` の所で中の部品の仕様を実行する。中の部品の状態は、外側の状態の一部として持ち回る |
| 4 | エージェントに見せるもの | 入口を書くエージェントは、外側の IR と、中の部品の**本番コード**（検証済み）を見る。中の部品の IR は見せない（入口に判断が入らないように）。書いてよいのは、入口のコードだけ。中の部品のコードを変えたら差し戻す。ミューテーションは、入口のコードだけを壊す |
| 5 | HTTP と経路 | 仕様は、HTTP の意味を持たない。`status` と `body` を持つ結果があるだけ。経路は `route("POST /todos")` で書く。意味ではなく、境界の約束（契約に出る）。本番コードと、それにリクエストを送るアダプターが、同じ経路を使うため。HTTP で当てるのは、外側の部品のアダプター（サーバーを起動し、リクエストを送る） |
| 6 | 外の依存 | 時計や採番など、外の世界への依存は、どの部品のものも、これまでどおり代役（`Ports`）。中の部品の依存は、外側の契約に名前を付けて並ぶ（`todos.newId`）。アダプターが、それを中の部品のコードに渡す |
| 7 | 検証の速さ | 外側の部品は HTTP を通すので遅い。外側の部品の既定の試行回数は少なくする（たとえば 500。`--runs` で変えられる）。中の部品の判断は、中の部品の検証で済んでいる |
| 8 | 多数ある部品 | 同じ仕組みで `many(Todo, by("id"))`、`calls(名前, 部品, キー, コマンド, {...})`。まず1つの場合を作り、多数は後で |
| 9 | 実装の順 | 取っ手（§15）→ 1つの部品を含む場合 → 入口の例（todo の API を部品として書き直す）→ 多数ある部品 |

## 15. 参照は、すべて取っ手（1.0、実装済み）

### 15.1. 方針

* **参照に、文字列を書かない。** 文字列が残るのは、文（`description`、`does`、条件の文）と、名前を決める宣言のキーだけ。
  名前は1か所にだけ書き、使う所はすべて、宣言から得た取っ手で指す。
* **語彙のまとまりは、先に値として宣言する。** 宣言したまとまりが、そのまま取っ手を持つ。部品は、それを組み合わせる。
* **取っ手は型を持つ。** 書き間違い（`State.PAYED`）や、型の合わない参照は、エディタで型エラーになる。
  合否は、これまでどおり木の検査と `clp compile` が決める（型は早い知らせ）。
* **仕様に関数を書かない、という決まりは、そのまま守る。** 自分の宣言を参照するための組み立ての関数（`self`）は使わない。
* **条件は、必ず名前を付けて宣言する。** `when` / `onlyIf` / `onlyWhen` に、その場で文を書かない。文を直しても名前は変わらないので、
  導き直しが要らない。
* 文字列の書き方（`goTo("PAID")`、`ref.data("price")`、`emits("SendReceipt", ...)`、`when("The payment succeeded", ...)`）は、なくす。

### 15.2. 書き方

```ts
export const State = states("DRAFT", "PENDING", "PAID", "CANCELLED");
export const Data = data({ rank: Rank, price: Yen });
export const Query = queries({ paymentResult: ["succeeded", "failed"] });
export const Effect = effects({ SendReceipt: input({ amount: "integer" }), Refund: description("...") });
export const If = conditions({ paid: "The payment succeeded", goldMonthEnd: "The customer is a Gold member and it is month-end" });
export const Campaign = decisionTable(
  when(If.goldMonthEnd, { discountPercent: 20, coupon: "Premium" }),      // 行も、条件の取っ手で書く
  otherwise({ discountPercent: 0, coupon: null }),
);
export const PlaceInput = input({ customerRank: Rank, listPrice: Yen });

export const Order = component({
  states: State,
  init: State.DRAFT,
  data: Data,
  queries: Query,
  effects: Effect,
  conditions: If,
  decisions: { campaign: Campaign },
  commands: {
    PlaceOrder: component(PlaceInput, from(State.DRAFT), goTo(State.PENDING)),
    Checkout: component(from(State.PENDING), when(If.paid, goTo(State.PAID), does("A receipt is sent ...")), otherwise()),
  },
});
```

```ts
// 解釈（LLM が書く）: Layer 1 の取っ手を import する。足した語彙も、同じく先に宣言する
import { Campaign, Data, Effect, If, PlaceInput, Order, State } from "./order.component.ts";

export const Calc = calculations({ amountCharged: component(description("..."), output("integer")) });

export const Interpretation = interpretation(Order, {
  calculations: Calc,
  commands: {
    PlaceOrder: component(Data.price.set(PlaceInput.listPrice), Data.rank.set(PlaceInput.customerRank)),
    Checkout: component(
      when(If.paid, Effect.SendReceipt({ amount: Calc.amountCharged }), Effect.IssueCoupon({ type: Campaign.coupon }, onlyWhen(Campaign.grantsCoupon))),
      otherwise(),
    ),
    Cancel: component(from(State.PENDING, State.PAID), goTo(State.CANCELLED), Effect.Refund(onlyWhen(was(State.PAID)))),
  },
  meanings: [
    If.paid.means((state) => state.paymentResult === "succeeded"),
    Calc.amountCharged.means((state) => Math.floor((state.price * (100 - Campaign.of(state).discountPercent)) / 100)),
  ],
});
```

| 参照 | 取っ手 |
| --- | --- |
| 状態 | `State.PAID`。`was(State.PAID)` |
| 覚えるデータ | `Data.price`（値）、`Data.price.set(値)`（覚える） |
| 問い合わせ | `Query.paymentResult`（引数の無いものの答え）。引数つきは `Query.stateDeclared({ name })` で尋ね、答えは `Query.stateDeclared.answer` |
| 副作用 | `Effect.SendReceipt({ ... })` |
| 計算 | `Calc.amountCharged` |
| 決定表の列 | `Campaign.discountPercent`。意味の関数の中では `Campaign.of(state)` で当たった行 |
| コマンドの入力 | `PlaceInput.listPrice`（入力を先に宣言する） |
| 条件 | `If.paid`。意味は `If.paid.means(関数)` |
| 含む部品 | `const Part = parts({ todos: Todos })`、`Part.todos.Add({ ... })`、答えは `Part.todos.Add.answer` |

* まとまりの変数名は自由。依頼文と例では `State`、`Data`、`Query`、`Effect`、`If`、`Calc`、`Part` にそろえる。
* 決定表の行は、条件の取っ手で書く（`when(If.x, { 列: 値 })`、`otherwise({ ... })`）。行の文を、表の中に書かない。
* 同じまとまりを、複数の部品で使える（型、副作用の並び）。todo の例で `Todo` を2回書いた問題も、ここで片付く。
* IR は名前で書かれるので、取っ手で書いても、変わらない。

## 16. 1.0 の書き方（N7。紙の上の設計、決定待ち）

`ROADMAP.md` の N7。0.1 の M3 と同じく、これから書く仕様を「こう書きたい」形で先に紙に書き、書きにくさを一覧にして、
1回の設計（IR の変更は1回、版 7）にまとめる。紙に書いたのは次の3つ。

1. self の4つの部品を、いまの書き方（取っ手、`record` / `list`、部品）で書き直したもの（§16.2）
2. これから Stage 1 に移す判定: `judge`、作業場所の監査、シミュレーター（§16.3）
3. 保存先と、依存の失敗のある web（todo）（§16.4）

### 16.0. 全体の形（決定）

書きにくさを1つずつ直す前に、DSL 全体の土台を見直した。目的は2つ。利用者が独自の語を足せること（拡張）と、
Composite をもっと単純にすること。§16.1 以降の記述例は、まだ前の書き方のままで、この形に書き直す。

#### 2つの概念と1つの操作

| 概念 | 中身 |
| --- | --- |
| **ノード** | 種類 + 名前つきの子（葉なら、それに値）。`service`、`command`、`state`、文、型、定数のすべてがノード |
| **種類** | 子についての決まり（スキーマ）。次の**どちらか一方だけ**を持つ。決まった名前の子（**席**。`command` なら `input`、`from`、`goTo`、`cases`）か、自由な名前の子とその種類（**項目**。`commands` なら、どの名前の子も `command`） |

| 操作 | 中身 |
| --- | --- |
| **単一化（unify）** | 同じ道筋のノードどうしを合わせる。Layer 1 と解釈を重ねるのも、並びの要素を名前で突き合わせるのも、この1つ。値がぶつかれば誤り（`problems`）。Layer 1 が勝つ、はこの帰結 |

ここから、次の決まりが導かれる。

1. **子は、すべて名前を持つ。** 名前の無い子を並べる書き方（`component(from(...), goTo(...))`）はやめる。
2. **名前が生まれるのは、項目を持つ種類（まとまり）の宣言のキーだけ**（`states({...})`、`commands({...})` など）。
   ほかの `{}` のキーは、すべて席。種類が席と項目の一方だけを持つので、1つの `{}` の中でキーの意味が混ざることはない。
   例外は、同じものを2つ置くときの付け直し `.as("名前")` だけ。
3. **`[]` は、名前を持つノードの並び**（`compose([...])` の略記）。並びの要素は、自分の名前で突き合わせる
   （取っ手から作ったノードは、名前を自分で持つ: `Effect.SendReceipt(...)` は `SendReceipt`、`If.paid.then(...)` は `paid`、
   `State.PAID` は `PAID`、生の値は、その値）。順序に意味があるか（`emits` はある、`from` と列挙と `cases` は無い）は、席が決める。
   名前が重なれば誤り。名前を持つノードを `{}` のキーの下に置くことはない（1つのノードが2つの名前を持たない）。
4. **`component` は基底の種類で、書くときは必ず別名**（`service`、`command`、`state`、`description` など）。
   いちばん外側の部品は `service`。

#### 略記: 書いた値を、その位置の種類に変換する

| 書いたもの | 変換の先 | 例 |
| --- | --- | --- |
| 生の文字列・数・真偽値 | その席が求める葉 | `description: "..."` は文、`data({ price: "integer" })` は型、`responds: 201` は定数、`states({ PAID: "Paid." })` は説明つきの状態 |
| 取っ手 | その席が求めるノード | `emits: [Effect.SendReceipt]` は入力のまだ無い副作用、`cases: [..., otherwise]` は何も起きない場合、`from: State.DRAFT` は状態への参照 |
| 1つの値 | 並びの席なら、要素1つの並び | `from: State.DRAFT` は `from: [State.DRAFT]` |
| 生の `{}` | その席が求める種類のノード | `commands({ PlaceOrder: { input: ..., from: ... } })` の中の `{}` は `command` |

* 1つの席が受け取る葉は1種類だけで、種類の定義に書く。だから略記が2通りに読めることはない。
* **型の席の `{}` だけは、いまのまま誤り。** `{ type: "integer", min: 1 }` が、範囲つきの整数とも、2つのフィールドを持つレコードとも読めるため。
  `record({...})`、`integer({...})` と書く。
* 副作用の入力と、`onlyWhen` のような修飾は、同じ `{}` に入れない。入力は呼び出しの引数、修飾は続けて呼ぶ形
  （`Effect.IssueCoupon({ type: Campaign.coupon }).onlyWhen(Campaign.grantsCoupon)`）。`.as(...)` と同じ形。

#### 種類の定義: 組み込みの語も、利用者の語も、同じ形

```ts
// 組み込みの種類（packages/core が持つ）
const Case     = kind("case",     { fields: { goTo: StateRef, does: Text, emits: listOf(Emit, { key: "effect" }), set: Sets, responds: Value } });
const Command  = kind("command",  { fields: { description: Text, input: Input, from: listOf(StateRef), goTo: StateRef, cases: listOf(Case, { key: "condition" }) } });
const Commands = kind("commands", { entries: Command });                 // 項目: 自由な名前の子。値はすべて command
const Service  = kind("service",  { fields: { description: Text, init: StateRef, uses: listOf(Group) } });

// 利用者の種類（L2: 展開する語）
const Resource = kind("resource", { fields: { item: Type, path: Text }, expand: ({ item, path }) => commands({ ... }) });
```

* いまの中央の文法の表（`GRAMMAR`）は、各種類の定義から組み立てる。木の検査は「種類の決まりに合っているか」の1つになり、
  席の誤り、名前の重なり、置き場所の誤りは、すべてここで見つかる。
* IR も「種類 + 名前つきの子」のまま書く（書いた語と IR の語が同じ、という方針は変わらない）。

#### 拡張の段階

| 段階 | 利用者ができること | 1.0 |
| --- | --- | --- |
| L1. 断片 | 既存の語を組み合わせた値を、変数や関数で作り回す（`const rejected = ...`、`const crud = (Item) => commands({...})`） | 開く（いまもできる） |
| L2. 展開する語 | 種類を定義し（席と項目の決まり）、中身をコアの語に展開させる。IR は展開した木から作るので、意味はコアのまま | 開く |
| L3. 注釈 | 意味を持たない情報を IR に載せて運ぶ。正解は無視し、契約や依頼文、利用者の道具が使う | 開く |
| L4. 新しい意味 | 正解のランタイム、生成器、契約、依頼文に、新しい振る舞いを足す | **1.0 の後**。正解のランタイムは信頼の基盤（`SELF_HOSTING.md` §10）で、利用者のプラグインが入ると、それが広がる。`durable`、`mayFail` のように新しい意味を持つ語は、コアに組み込む |

* 展開（`expand`）は関数だが、走るのは仕様を読み込むときだけ。IR と正解に入るのは展開した結果のデータだけなので、
  「仕様に関数を書かない」は、展開したあとの木について保たれる。展開は決定的でなければならない（読み込むたびに2回展開して比べる）。
* 組み込みの `forwards`（W10）と `route` も、L2 / L3 の仕組みで定義し直す。利用者に開く口を、まず自分で使って確かめる。
* 解釈（LLM）は、展開したあとのコマンドに対して書く。

#### 記述例（注文）

```ts
export const State = states({ DRAFT: "Before the order is placed.", PENDING: "Waiting for payment.", PAID: "Paid.", CANCELLED: "Cancelled." });
export const Query = queries({ paymentResult: ["succeeded", "failed"] });
export const Effect = effects({ SendReceipt: input({ amount: "integer" }), Refund: "What the customer paid is returned." });
export const If = conditions({ paid: "The payment succeeded" });
export const PlaceInput = input({ customerRank: Rank, listPrice: Yen });

export const Command = commands({                        // 名前が生まれるのは、ここ
  PlaceOrder: { input: PlaceInput, from: State.DRAFT, goTo: State.PENDING },              // 中の {} は席
  Checkout: {
    from: State.PENDING,
    cases: [If.paid.then({ goTo: State.PAID, does: "A receipt is sent.", emits: [Effect.SendReceipt] }), otherwise],
  },
  Cancel: { from: [State.PENDING, State.PAID], goTo: State.CANCELLED },
});

export const Order = service({                           // {} は席だけ
  description: "An order, from placing it to payment.",
  init: State.DRAFT,
  uses: [State, Query, Effect, If, Command],             // まとまりは、名前を持つノードとして並べる
});
```

解釈も、足すものを、名前を持つノードとして並べるだけになる（`{ commands, meanings }` のような席も要らない）。
重ねるときは、名前（`Command.Checkout`、`If.paid` ……）で Layer 1 のノードを探して、単一化する。

```ts
export const Interpretation = interpretation(Order, [
  Data,                                                   // 足すまとまり
  Calc,
  Command.Checkout.with({                                  // コマンドの取っ手に、足す席を書く
    cases: [If.paid.then({ emits: [Effect.SendReceipt({ amount: Calc.amountCharged })] })],
  }),
  If.paid.means((state) => state.paymentResult === "succeeded"),
  Calc.amountCharged.means((state) => Math.floor((state.price * (100 - Campaign.of(state).discountPercent)) / 100)),
]);
```

#### 先にある例

* JSON Schema の `properties`（決まった名前）と `additionalProperties`（自由な名前）が、種類の2つの形に当たる。
* Kubernetes の strategic merge patch は、並びを `patchMergeKey`（コンテナの `name` など）で突き合わせて重ねる。並びの要素を名前で突き合わせることに当たる。
* CUE は、設定を単一化で重ね、具体的な値がぶつかれば誤りにする。Layer 1 と解釈を重ねる操作に当たる。

#### 以前の書き方との関係

* 0.1 で消した `structure: {...}` の書き方（文字列で参照し、木の検査が無い）とは別物である。いまは取っ手で参照し、種類の決まりで木を検査する。
* §4.8（`{}` の意味は受け取る語が決める）は、「種類が、席か項目かを決める」に置き換わる。§15 の取っ手は、そのまま使う。
* 状態や条件の宣言、決定表、取っ手の意味は変わらない。変わるのは、ノードを束ねる書き方（名前の無い子の並び → 席と項目と並び）と、
  解釈の書き方（同じ木 → 名前を持つノードの並び）。既存の例は、N8 で機械的に移す（IR は、書き方の変更の分は変わらない）。

### 16.1. 書きにくさの一覧

| # | 書きにくさ | どこで | 案 | IR |
| --- | --- | --- | --- | --- |
| W1 | どの場合にも共通の結果を、場合ごとに書き写す | `pipeline` の `Start`（同じ5つの `set` を4回） | コマンドの直下に書いた動詞は、どの場合でも起きる（場合の動詞より先に）。同じデータへの `set` や `goTo` が場合の中にもあれば、エラー | 変わらない（場合ごとに展開する） |
| W2 | 遷移先を、決定表の値で決められない | `pipeline` の `Start`（計画の表の行と同じ `when` を、遷移先のためだけに並べる） | 決定表のセルに状態の取っ手を書け、`goTo(Plan.next)` と書ける。グラフの検査は、その列の状態すべてを辺にする | `goTo` が参照を持てる |
| W3 | 条件を組み合わせられない | `pipeline`（`checkPassed` と「通った、かつ既存のコード」）、`payload-check`（`fieldSValueStillBeing` 1〜3） | `when(all(If.passed, If.incremental), ...)`、`not(If.x)`。意味の関数は、組み合わせる前の条件にだけ書く | 場合が、名前の組み合わせを持つ |
| W4 | 「どれか1つの形」の値を書けない。使わないフィールドに何かを入れて運ぶ（埋め草） | `value-writer`、`payload-check` の `Constant`（`kind` と `text` / `number` / `flag`）。§12 の「場合ごとに形が違う結果」 | `oneOf({ constant: record({...}), reference: record({...}) })`。値は、キーが1つのレコード（`{ constant: {...} }`） | 型の節が1つ増える |
| W5 | 何でも入る値を書けない | シミュレーター、観測値の比較、IR の組み立て（フレームワークの部品は、仕様の値をそのまま運ぶ） | `value()`: null、真偽値、数、文字列、並び、レコードのどれか。生成器は任意の JSON | 型の節が1つ増える |
| W6 | 部品を再帰させられない（部品の中に、同じ部品） | シミュレーター（含む部品は、それ自体が仕様の実行） | **入れない。** `pipeline` と同じく、手続きを裏返す（`CallPart` を副作用として出し、答えをコマンドで受ける）。再帰は、つなぐ側（橋渡し）が持つ | — |
| W7 | 状態を持つ依存（保存先）と、再起動を越えて残ること | web | **決定。** 業務の部品に `durable(Store)` を付ける。状態の持ち主は業務の部品の仕様だけで、検証は試行の途中に「再起動」をはさみ、その状態が残ることを確かめる。保存のコードは、汎用の保存先の部品 `Store`（`durable()`、値は `value()`）として、自分の仕様で検証される（§16.4） | `durable` と、契約の口 |
| W8 | 依存の失敗を書けない | web（採番や外のサービスが落ちる） | **決定。** 問い合わせに `mayFail()`。失敗は、取っ手の条件 `Query.newId.failed`（尋ねたものは `.as(...)` の取っ手の `.failed`）。**ほかの条件と同じ扱い**で、例外は作らない（§16.4） | 問い合わせの性質と、場合の条件 |
| W9 | 数の列挙（`[201, 422]`） | todo の API（いまは `integer({ min: 200, max: 599 })` で逃げている） | 数の配列を列挙として受け付ける | 列挙が数を持てる |
| W10 | 子のコマンドを、そのまま親の口に出す | `todos`（`Complete` は呼んで、答えを返すだけ） | `forwards(Part.items.Complete, missing("not-found"))`（§6 の決定を取っ手で書く）。外側のコマンドの入力はキーと子の入力、答えは子の答えか `missing` の値 | 変わらない（呼んで返すコマンドに展開する） |
| W11 | Layer 1 に `set` / `emits` を書けない | 例のどれか（解釈だけが書ける） | 書けるようにする。解釈は上書きできない（`goTo` と同じ） | 変わらない |
| W12 | データと、問い合わせの答えのフィールドを、取っ手で指せない | シミュレーター、`judge`（記録のフィールド） | `Data.last.status`、`Query.fieldOf({...}).as("field").answer.kind`（入力の取っ手と同じ形） | 変わらない（参照の path が伸びる） |
| W13 | 親の `add` だけが設定するデータに、グラフの検査が「設定されない」と注意を出す | todo-item | `add` で渡すデータも、設定として数える | — |
| W14 | 隔離した作業場所に、Node の型定義が無い | todo の API（エージェントが `node:http` の型を自分で宣言した） | 許した組み込み（`BUILTINS`）の型定義だけを、作業場所に置く | — |

「条件の名前」（`ROADMAP.md` M4 の残り）は、N1 の `conditions({...})` で済んでいる。

書きにくさではなかったもの（書き方は変えない）:

* **要素ごとに歩く形**（`reference-check`、`payload-check`）。構造を持つ入力を1つの値で受け取り、診断の並びを計算で返すこともできるが、
  そうすると判断がすべて計算の関数の中に入り、構造（場合、決定表）として現れない。歩く糊は判断を持たないので、
  判断を構造に置くには、いまの形がよい。依頼文と `SELF_HOSTING.md` に、指針として書く。
* **集まりは、覚えずに尋ねる**（§5 の `stateDeclared`）。名前で引く対応（`dict`）を足す案は採らない。並びで足りる。
* **細かく分けた問い合わせ**（`payload-check` の6つ）は、いまでも `record` の答え1つにまとめられる（§16.2）。書き方の不足ではなかった。

### 16.2. self の4つの部品を書き直す

`pipeline`（W1、W2、W3）:

```ts
export const Plan = decisionTable(
  when(PlanIf.noCode,          { phase: "design", next: State.DESIGN,  incremental: false }),   // W2: 状態の取っ手をセルに
  when(PlanIf.boundaryChanged, { phase: "design", next: State.DESIGN,  incremental: true }),
  when(PlanIf.noAdapter,       { phase: "wiring", next: State.WIRING,  incremental: true }),
  otherwise(                   { phase: null,     next: State.GRADING, incremental: true }),
);

Start: component(
  StartInput, from(State.IDLE),
  goTo(Plan.next),                                                           // W2
  Data.maxAttempts.set(StartInput.attemptsPerPhase), Data.maxRounds.set(StartInput.rounds),   // W1, W11: 共通の結果を1回だけ
  Data.incremental.set(Plan.incremental), Data.round.set(1), Data.attempt.set(1),
  Effect.StartSession({ phase: Plan.phase, round: 1, attempt: 1 }, onlyWhen(not(PlanIf.gradeFirst))),
  Effect.GradeCurrentCode({ round: 1 }, onlyWhen(PlanIf.gradeFirst)),
),
WiringChecked: component(
  checked, from(State.WIRING),
  when(all(If.passed, If.incremental), goTo(State.GRADING), ...),            // W3
  when(all(If.passed, not(If.incremental)), goTo(State.IMPLEMENTATION), ...),
  rejected,
),
```

`Start` の4つの場合は1つになり、解釈の 40 行ほどが消える。条件は `passed`、`incremental`、`attemptsRemain`、`roundsRemain` の4つだけに意味を書けばよい。

`value-writer`（W4）:

```ts
export const Value = oneOf({
  constant: oneOf({ string: "string", number: "number", boolean: "boolean" }),
  reference: record({ target: ["input", "data", "query", "calculation", "decision"], name: "string", column: optional("string") }),
  was: list("string"),
});
export const WriteInput = input({ value: Value });
Write: component(WriteInput, output(IrValue), does("...")),       // 答えで返す。副作用で1要素ずつ出して、糊が組み立てる必要がない
```

`kind` と、使わないフィールド（`text` / `number` / `flag`）の埋め草が消える。答えで返せるので、`stage1Values` の組み立ての糊も小さくなる。

`payload-check`（W3、W4。問い合わせを1つに）:

```ts
fieldOf: component(input({ effect: "string", field: "string" }),
  output(optional(record({ kind: FieldKind, members: list("string"), min: optional("number"), max: optional("number") })))),

Value: component(input({ value: oneOf({ constant: Constant, typed: ConstantKind, unresolved: record({}) }) }),
  from(State.IN_FIELD, State.IN_SETTLED_FIELD, State.IN_UNKNOWN_EFFECT),
  Query.fieldOf(here).as("field"),
  when(all(If.checking, not(If.fits)), goTo(State.IN_SETTLED_FIELD), Effect.ReportDiagnostic({ code: "bad-value", ...here })),
  otherwise(),
),
```

`Constant` / `Typed` / `Unresolved` の3つのコマンドは、値の形が違うだけなので1つになる。6つの問い合わせは1つになる。
`reference-check` は、ほぼ変わらない（W3 で、条件の重複が少し減る）。

### 16.3. これから移す判定

`judge`（`SELF_HOSTING.md` §10.4 の形。いまの書き方で書ける）:

```ts
export const State = states("IDLE", "IN_VALUE", "BETWEEN_VALUES", "DONE");
export const Data = data({ sawSite: "boolean", sawKilled: "boolean", located: "boolean", anyKilled: "boolean", value: DecisionValue });
export const Query = queries({ inAdapter: component(input({ value: DecisionValue }), output("boolean")) });
export const Effect = effects({
  Survived: input({ value: DecisionValue }),
  DecisionInAdapter: input({ value: DecisionValue }),
  Ineffective: input({}),
});
commands: {
  BeginValue: component(input({ value: DecisionValue }), from(State.BETWEEN_VALUES, State.IDLE), goTo(State.IN_VALUE), ...),
  Site: component(input({ killed: "boolean" }), from(State.IN_VALUE), does("...")),
  EndValue: component(from(State.IN_VALUE), goTo(State.BETWEEN_VALUES), Query.inAdapter({ value: Data.value }).as("adapter"),
    when(all(If.sawSite, not(If.sawKilled)), Effect.Survived({ value: Data.value })),
    when(all(not(If.sawSite), If.numeric, If.adapter), Effect.DecisionInAdapter({ value: Data.value })),
    otherwise()),
  Mutant: component(input({ killed: "boolean" }), does("...")),
  Finish: component(input({ shared: "boolean" }), goTo(State.DONE),
    when(all(not(If.located), not(If.shared), not(If.anyKilled)), Effect.Ineffective({})), otherwise()),
}
```

書けた。W3 が無いと、`EndValue` と `Finish` の条件は、組み合わせごとに名前と意味の関数を持つことになる（`pipeline` と同じ重複）。
`DecisionValue` は「数か文字列」なので、W4 の `oneOf({ number: "number", string: "string" })` を使う（いまは `kind` + 埋め草）。

作業場所の監査: 変わったファイル1つごとに `ChangedFile { path, isNew, usedByThis, usedByOthersOnly, inert, partFile }` を渡し、
`OutOfScope` を出す。状態を持たない部品と、決定表1つで書ける。書きにくさは無かった。

シミュレーター（W4、W5、W6、W12）:

```ts
// 1手: コマンドを1つ実行する。値の保管と、意味の関数の評価と、含む部品の実行は、橋渡しに尋ねる
Execute: component(
  input({ command: "string", input: value() }),
  Query.enabled({ command: ExecuteInput.command }).as("enabled"),                // from / onlyIf を満たすか（意味の関数は橋渡しが呼ぶ）
  Query.holdingCases({ command: ExecuteInput.command }).as("holding"),           // 成り立つ場合の名前の並び
  when(If.notEnabled, responds({ refused: {} })),
  when(If.conflict, responds({ conflict: { cases: Query.holding.answer } })),   // 2つ以上: RuleConflictError
  otherwise(Effect.Apply({ command: ..., case: Calc.chosenCase }), responds({ applied: {} })),
),
```

書いてみると、シミュレーターが自分で持つ判断は、次の5つに分けられる。

1. 実行できるか（`from`、`onlyIf`、経路に載らない値）
2. 場合の選び方（同時に1つだけ、無ければ `otherwise`）
3. 起きることの順序（含む部品の呼び出し → 場合の動詞。副作用は書いた順。`onlyWhen`）
4. 多数ある部品（無いキーは何もせず `null`、`adds` / `removes`）
5. 依存の約束（`fresh`、`increasing`）

値そのもの（`value()`）は運ぶだけで、中身で判断しない。含む部品は、`CallPart` を副作用として出し、橋渡しが子のシミュレーターを動かして、
答えを `PartAnswered` で返す（W6）。これは N12 で、部品を分けて書く（実行できるか、場合の選び方、起きることの順序、多数ある部品）。
1つの部品にすると大きすぎる。

### 16.4. 保存先と失敗のある web（W7、W8 は決定）

**保存先（W7）**: 再起動を越えて残ることは、業務の部品の観測できる性質として書く。どこに保存するかは書かない。
保存のコードは、業務を知らない汎用の部品として、別に書いて検証する。

```ts
// 保存先の部品: 業務を知らない。再起動を越えて残ることが、この部品自身の性質（起点）
export const Store = component({
  description: "Keeps values by key.",
  durable: durable(),                                   // 引数なし: この部品が、自分で残す（本番コードは node:sqlite など）
  data: Data,                                           // entries: list(record({ key: "string", value: value() }))
  commands: {
    Put: component(PutInput, does("The value is kept under the key, replacing what was there.")),
    Get: component(GetInput, output(optional(value())), does("The value kept under the key, or nothing.")),
    Delete: component(DeleteInput, does("Nothing is kept under the key any more.")),
  },
});

// 業務の部品: 状態は、これまでどおり自分の仕様だけが持つ
export const Todos = component({
  description: "A to-do list ...",
  durable: durable(Store),                              // Store を通して、再起動を越えて残る
  parts: Part,                                          // items: many(TodoItem, by("id"))
  commands: { Add: ..., Complete: ..., Remove: ..., List: ... },   // Store のコマンドは呼ばない
});
```

検証:

```
Store:  Put { key: "a", value: { title: "milk" } } → （再起動）→ Get { key: "a" } → 期待値 { title: "milk" }
Todos:  Add { title: "milk" } → Complete { id: "a" } → （再起動）→ List { only: "all" } → 期待値 [{ id: "a", title: "milk", done: true }]
```

| 点 | 決めたこと |
| --- | --- |
| 状態の持ち主 | 業務の部品の仕様だけ。項目の状態は、2か所に現れない。業務の仕様には `Put` などの保存の手順を書かない |
| 再起動 | 検証は、試行の途中に「再起動」をはさむ（コマンドと同じく、乱数で選ぶ）。期待値は、`durable` の部品の状態を残し、ほかの部品の状態を始め（`init` と `initially`）に戻したもの。契約に `restartSystem()` を足し、アダプターは本番コードを止めて、同じ保存先で起動し直す（HTTP なら、同じデータベースのファイルでサーバーを起動し直す）。メモリにしか持たない実装は、ここで落ちる |
| `durable(Store)` の意味 | 「この保存先の部品を、使えるものとして渡す」。**強制しない**（本番コードには制約をかけない）。エージェントが `node:sqlite` を直接使っても、再起動の検証に通れば合格。扱いは N4 の含む部品と同じで、業務の部品を書くエージェントは `Store` の本番コードを見て使えるが、仕様（IR）は見ない。そのコードは変えられず（`out-of-scope`）、ミューテーションも及ばない。`Store` の仕様は、業務の部品の検証では実行しない（呼ばないので） |
| 引数なしの `durable()` | 自分で残す。`Store` のような起点の部品に付ける。業務の部品に付けてもよく、そのときは保存の方法をエージェントが選ぶ |
| `Store` の値の形 | 汎用（`value()`、W5）。業務ごとに型を付けた保存先（`TodoStore`）は、型が業務の仕様と二重になるので勧めない |
| 保存先の場所 | 本番コードは、保存先の場所（ファイルのパス）を受け取る。決めるのは、入口の起動と設定（人が書く composition root）と、検証ではアダプター（隔離した一時ディレクトリ）。`node:sqlite` を許す組み込みに足す。ファイルの読み書き（`node:fs`）は、いまの通り許さない |

**依存の失敗（W8）**: 失敗も、ふつうの条件の1つとして扱う。

```ts
export const Query = queries({ newId: component(output("string"), fresh(), mayFail()) });

Add: component(
  AddInput,
  output(record({ status: [201, 422, 503], body: optional(Todo) })),               // W9: 数の列挙
  when(If.invalidTitle, responds({ status: 422, body: null })),                       // タイトルが悪ければ、採番の成否によらず 422
  when(all(not(If.invalidTitle), Query.newId.failed), responds({ status: 503, body: null })),
  otherwise(Part.items.add(Query.newId, { title: AddInput.title }), responds({ status: 201, body: ... })),
),
```

| 点 | 決めたこと |
| --- | --- |
| 失敗の優先 | **持たない。** §4.2 の「条件は同時に1つだけ」のまま。失敗が観測されるのは、実装が実際に尋ねたときだけなので、「失敗を先に見る」と決めると、尋ねる前に断る正しい実装（タイトルを先に確かめる）を落とす |
| 書き忘れ | `all(not(If.invalidTitle), ...)` を書き忘れると、「タイトルが空で、採番も失敗」の手で2つの条件が同時に成り立つ。これは条件の衝突として、エージェントを呼ぶ前に見つかる。その衝突は「断るのは採番の前か後か」という、仕様が答えるべき問いそのもの |
| 失敗した答えを読む | 意味の関数が、失敗した問い合わせの答えを読んだら、仕様の誤りとして止める |
| 失敗させる依存 | 代役（`Ports`）の問い合わせだけ。代役は、`mayFail` の問い合わせで、ときどき失敗する（例外を投げる）。部品の本番コード（`node:sqlite`）の失敗は起こさない。副作用の失敗は、1.0 の後（「非同期と失敗」） |

### 16.5. IR の変更（版 7 にまとめる）

| 変更 | 書きにくさ |
| --- | --- |
| `goTo` が、決定表の列への参照を持てる | W2 |
| 場合の条件が、組み合わせ（`all` / `not`）を持てる | W3 |
| 型に `oneOf`、`value` | W4、W5 |
| 部品の `durable`、契約の `restartSystem` | W7 |
| 問い合わせの `mayFail`、場合の条件に失敗（`query:newId.failed`） | W8 |
| 列挙が数を持てる | W9 |

W1、W10、W11、W12 は、IR を変えない（いまの形に展開する）。W6 は入れない。W13、W14 は実装の直し。
