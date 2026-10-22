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
| 保存したものを、あとで読める | 約束としては書かない。**状態を持つ依存は、それ自体が部品である。** 0.1 では部品の内側（覚えるデータ、含む部品）に持つ。別の部品としてつなぐのは、0.3 の「部品をつなぐ」で扱う |
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
3. 困ると分かったら、0.1 の中で入れ子を実装する。そうでなければ 0.3 に送る。

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
| つなぐ | ある部品の副作用 → 別の部品のコマンド | 0.3 で扱う |

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
| 状態を持つ依存（保存先）を、別の部品としてつなぐ | 0.3（部品をつなぐ） |
| 多数ある部品の実装 | web の例を通してから決める（§6） |
| 優先順位つきの条件（上から順に、最初に成り立ったもの） | 入れない。条件は、同時に1つだけ |
| 入れ子の状態（状態の中の状態） | 入れない |
| 並行するコマンド、遅れて起きる副作用、依存の失敗 | 0.3 |

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

## 14. 部品をつなぐ: 入口も部品（0.3、実装済み。§13）

入口までエージェントが書くことと、部品をつなぐことを、1つの仕組みとして扱う（`ROADMAP.md` の 0.3 の N3〜N5）。

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

## 15. 参照は、すべて取っ手（0.3、実装済み）

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

## 16. 0.3 の書き方（N7。決定）

`ROADMAP.md` の N7。0.1 の M3 と同じく、これから書く仕様を「こう書きたい」形で先に紙に書き、書きにくさを一覧にして、
1回の設計（IR の変更は1回、版 7）にまとめる。紙に書いたのは次の3つ。

1. self の4つの部品を、いまの書き方（取っ手、`record` / `list`、部品）で書き直したもの（§16.2）
2. これから Stage 1 に移す判定: `judge`、作業場所の監査、シミュレーター（§16.3）
3. 保存先と、依存の失敗のある web（todo）（§16.4）

### 16.0. 全体の形（決定）

書きにくさを1つずつ直す前に、DSL 全体の土台を見直した。目的は2つ。利用者が独自の語を足せること（拡張）と、
Composite をもっと単純にすること。§16.1 以降の記述例は、この形で書いてある。

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

| 段階 | 利用者ができること | 0.3 |
| --- | --- | --- |
| L1. 断片 | 既存の語を組み合わせた値を、変数や関数で作り回す（`const rejected = ...`、`const crud = (Item) => commands({...})`） | 開く（いまもできる） |
| L2. 展開する語 | 種類を定義し（席と項目の決まり）、中身をコアの語に展開させる。IR は展開した木から作るので、意味はコアのまま | 開く |
| L3. 注釈 | 意味を持たない情報を IR に載せて運ぶ。正解は無視し、契約や依頼文、利用者の道具が使う | 開く |
| L4. 新しい意味 | 正解のランタイム、生成器、契約、依頼文に、新しい振る舞いを足す | **0.3 の後**。正解のランタイムは信頼の基盤（`SELF_HOSTING.md` §10）で、利用者のプラグインが入ると、それが広がる。`durable`、`mayFail` のように新しい意味を持つ語は、コアに組み込む |

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

### 16.1. 書きにくさの一覧（決定。§16.0 の形で見直したもの）

§16.0 の形で書き直すと、いくつかは形そのものが片付け、いくつかは書き方が変わった。

| # | 書きにくさ | どこで | 案（§16.0 の形） | IR |
| --- | --- | --- | --- | --- |
| W1 | どの場合にも共通の結果を、場合ごとに書き写す | `pipeline` の `Start`（同じ5つの `set` を4回） | コマンドは、場合と同じ席（`goTo`、`set`、`emits`、`responds`）を持てる。コマンドに書いた席は、どの場合でも起きる。同じデータへの `set` や `goTo` が場合の中にもあれば、単一化でぶつかって誤り | 変わらない（場合ごとに展開する） |
| W2 | 遷移先を、決定表の値で決められない | `pipeline` の `Start` | 決定表のセルに状態の取っ手を書け、`goTo: Decision.plan.next` と書ける。グラフの検査は、その列の状態すべてを辺にする | `goTo` が参照を持てる |
| W3 | 条件を組み合わせられない | `pipeline`、`payload-check` | **条件のまとまりの項目は、文か、ほかの条件の組み合わせ**（`conditions({ passedFresh: all(If.passed, not(If.incremental)) })`）。名前が生まれるのはまとまりの宣言だけ、という決まりのまま書ける。意味の関数は、文の条件にだけ書く | 条件が、組み合わせを持てる |
| W4 | 「どれか1つの形」の値を書けない（埋め草） | `value-writer`、`payload-check`、§12 | 型の種類 `oneOf({ constant: ..., reference: ... })`。キーは項目（形の名前）。値は、キーが1つのレコード | 型の種類が1つ増える |
| W5 | 何でも入る値を書けない | シミュレーター、比較、IR の組み立て | 型の葉 `value()`。生成器は任意の JSON | 型の葉が1つ増える |
| W6 | 部品を再帰させられない | シミュレーター | **入れない。** 手続きを裏返す（`CallPart` を副作用として出し、答えをコマンドで受ける） | — |
| W7 | 再起動を越えて残ること | web | **決定。** `service` の席 `durable`（`true` なら自分で残す、取っ手なら、その保存先の部品を渡す）。§16.4 | `durable` と、契約の口 |
| W8 | 依存の失敗 | web | **決定。** 問い合わせの席 `mayFail: true`。失敗は条件の取っ手 `Query.newId.failed`。ほかの条件と同じ扱い。§16.4 | 問い合わせの席と、条件 |
| W9 | 数の列挙 | todo の API | **形が片付けた。** 型の席の `[201, 422]` は、生の数の葉の並び（名前は値そのもの） | 列挙が数を持てる |
| W10 | 子のコマンドを、そのまま親の口に出す | `todos` | 利用者の語と同じ仕組み（L2）で定義する種類 `forwards`: `Complete: Part.items.Complete.forward({ missing: "not-found" })` | 変わらない（展開する） |
| W11 | Layer 1 に `set` / `emits` を書けない | 例のどれか | **形が片付けた。** Layer 1 も解釈も同じ種類のノードで、同じ席を持つ。重ねるのは単一化 | 変わらない |
| W12 | データと、問い合わせの答えのフィールドを、取っ手で指せない | シミュレーター、`judge` | `Data.last.status`、`Query.fieldOf({...}).as("field").answer.kind`（入力の取っ手と同じ形） | 変わらない |
| W13 | 親の `add` だけが設定するデータへの、誤った注意 | todo-item | `add` で渡すデータも、設定として数える | — |
| W14 | 作業場所に、Node の型定義が無い | todo の API | 許した組み込み（`BUILTINS`）の型定義だけを、作業場所に置く | — |

書き直して分かった、形が変わるもの（書きにくさではないが、§16.0 の決まりに合わせる）:

| もの | いま | §16.0 の形 |
| --- | --- | --- |
| 決定表 | `export const Campaign = decisionTable(when(If.x, {...}), otherwise({...}))` | `export const Decision = decisions({ campaign: [If.goldMonthEnd.then({ discountPercent: 20 }), otherwise({ discountPercent: 0 })] })`。列は `Decision.campaign.discountPercent`。名前（`campaign`）が生まれるのは、まとまりの宣言 |
| 尋ねる | コマンドの子として `Query.q({...}).as("a")` を並べる | 席 `asks: [Query.q({...}).as("a")]`（名前は `.as` が付ける） |
| 含む部品を呼ぶ | コマンドの子として `Part.todos.Add({...})` | 席 `calls: [Part.todos.Add({...})]`（名前は `todos.Add`） |
| 場合 | `when(If.x, ...)`、`otherwise(...)` | 席 `cases: [If.x.then({...}), otherwise]` |
| 副作用の修飾 | `Effect.E({...}, onlyWhen(If.x))` | `Effect.E({...}).onlyWhen(If.x)` |
| 解釈 | `interpretation(X, { data, commands, meanings })` | `interpretation(X, [Data, Command.Y.with({...}), If.z.means(...)])` |

書きにくさではなかったもの（書き方は変えない）:

* **要素ごとに歩く形**（`reference-check`、`payload-check`）。構造を持つ入力を1つの値で受け取り、診断の並びを計算で返すこともできるが、
  そうすると判断がすべて計算の関数の中に入り、構造（場合、決定表）として現れない。歩く糊は判断を持たないので、
  判断を構造に置くには、いまの形がよい。依頼文と `SELF_HOSTING.md` に、指針として書く。
* **集まりは、覚えずに尋ねる**（§5 の `stateDeclared`）。名前で引く対応（`dict`）を足す案は採らない。並びで足りる。
* **細かく分けた問い合わせ**（`payload-check` の6つ）は、いまでも `record` の答え1つにまとめられる（§16.2）。

### 16.2. self の4つの部品を書き直す

`pipeline`（W1、W2、W3）:

```ts
export const State = states({ IDLE: "...", DESIGN: "...", WIRING: "...", GRADING: "...", IMPLEMENTATION: "...", DONE: "...", FAILED: "..." });
export const If = conditions({
  noCode: "There is no production code yet",
  boundaryChanged: "The boundary differs from the previous run",
  noAdapter: "There is no adapter",
  passed: "The check passed",
  incremental: "Existing code is being changed",
  attemptsRemain: "Attempts remain in this phase",
  roundsRemain: "Rounds remain",
});
export const When = conditions({                                     // W3: 組み合わせも、名前はまとまりの宣言で生まれる
  redesign: all(not(If.noCode), If.boundaryChanged),
  rewire: all(not(If.noCode), not(If.boundaryChanged), If.noAdapter),
  passedExisting: all(If.passed, If.incremental),
  passedFresh: all(If.passed, not(If.incremental)),
  retry: all(not(If.passed), If.attemptsRemain),
  restart: all(not(If.passed), not(If.attemptsRemain), If.roundsRemain),
});
export const Decision = decisions({
  plan: [
    If.noCode.then({ phase: "design", next: State.DESIGN, incremental: false }),        // W2: 状態の取っ手をセルに
    When.redesign.then({ phase: "design", next: State.DESIGN, incremental: true }),
    When.rewire.then({ phase: "wiring", next: State.WIRING, incremental: true }),
    otherwise({ phase: null, next: State.GRADING, incremental: true }),
  ],
});

// 差し戻されたときに起きること。どの段階でも同じなので、1回だけ書いて使い回す（L1 の断片）
const rejected = [
  When.retry.then({ does: "The attempt number goes up by one. A session of the same phase is started." }),
  When.restart.then({ goTo: State.DESIGN, does: "The round number goes up by one ... a design session is started." }),
  otherwise({ goTo: State.FAILED }),
];

export const Command = commands({
  Start: {
    input: StartInput,
    from: State.IDLE,
    goTo: Decision.plan.next,                                          // W2
    does: "The pipeline remembers the two limits and the plan, and starts the plan's phase (or grades the code).",
  },
  DesignChecked: { input: Checked, from: State.DESIGN, cases: [If.passed.then({ goTo: State.WIRING, does: "..." }), ...rejected] },
  WiringChecked: {
    input: Checked,
    from: State.WIRING,
    cases: [When.passedExisting.then({ goTo: State.GRADING }), When.passedFresh.then({ goTo: State.IMPLEMENTATION }), ...rejected],
  },
  // ...
});
```

解釈の `Start` は、場合ごとに4回書いていた5つの `set` が、コマンドの席に1回になる（W1）:

```ts
Command.Start.with({
  set: { maxAttempts: StartInput.attemptsPerPhase, maxRounds: StartInput.rounds, incremental: Decision.plan.incremental, round: 1, attempt: 1 },
  emits: [
    Effect.StartSession({ phase: Decision.plan.phase, round: 1, attempt: 1 }).onlyWhen(not(IfAdded.gradeFirst)),
    Effect.GradeCurrentCode({ round: 1 }).onlyWhen(IfAdded.gradeFirst),
  ],
}),
```

意味の関数を書く条件は、組み合わせる前の7つだけになる（いまは、組み合わせごとに 11 の関数）。

`value-writer`（W4）:

```ts
export const Type = types({
  Value: oneOf({
    constant: oneOf({ string: "string", number: "number", boolean: "boolean" }),
    reference: record({ target: ["input", "data", "query", "calculation", "decision"], name: "string", column: optional("string") }),
    was: list("string"),
  }),
});
export const Command = commands({
  Write: { input: input({ value: Type.Value }), output: IrValue, does: "..." },   // 答えで返す。副作用で1要素ずつ出して、糊が組み立てる必要がない
});
```

`kind` と、使わないフィールド（`text` / `number` / `flag`）の埋め草が消える。答えで返せるので、`stage1Values` の組み立ての糊も小さくなる。
型のまとまり `types({...})` は、todo の例で `Todo` を2回書いた問題（M5）を、名前の生まれる場所の決まりで片付ける。

`payload-check`（W3、W4。問い合わせを1つに）:

```ts
export const Query = queries({
  fieldOf: { input: input({ effect: "string", field: "string" }),
             output: optional(record({ kind: FieldKind, members: list("string"), min: optional("number"), max: optional("number") })) },
});
export const Command = commands({
  Value: {
    input: input({ value: oneOf({ constant: Type.Constant, typed: ConstantKind, unresolved: record({}) }) }),
    from: [State.IN_FIELD, State.IN_SETTLED_FIELD, State.IN_UNKNOWN_EFFECT],
    asks: [Query.fieldOf(here).as("field")],
    cases: [When.misfit.then({ goTo: State.IN_SETTLED_FIELD, emits: [Effect.ReportDiagnostic({ code: "bad-value", ...here })] }), otherwise],
  },
});
```

`Constant` / `Typed` / `Unresolved` の3つのコマンドは、値の形が違うだけなので1つになる。6つの問い合わせは1つになる。
`reference-check` は、ほぼ変わらない（席の形に移るだけ）。

### 16.3. これから移す判定

`judge`（`SELF_HOSTING.md` §10.4 の形）:

```ts
export const State = states({ IDLE: "...", IN_VALUE: "...", BETWEEN_VALUES: "...", DONE: "..." });
export const Data = data({ value: Type.DecisionValue, sawSite: "boolean", sawKilled: "boolean", located: "boolean", anyKilled: "boolean" });
export const Query = queries({ inAdapter: { input: input({ value: Type.DecisionValue }), output: "boolean" } });
export const Effect = effects({ Survived: input({ value: Type.DecisionValue }), DecisionInAdapter: input({ value: Type.DecisionValue }), Ineffective: input({}) });
export const If = conditions({ sawSite: "...", sawKilled: "...", numeric: "...", inAdapter: "...", located: "...", shared: "...", anyKilled: "..." });
export const When = conditions({
  survived: all(If.sawSite, not(If.sawKilled)),
  onlyInAdapter: all(not(If.sawSite), If.numeric, If.inAdapter),
  ineffective: all(not(If.located), not(If.shared), not(If.anyKilled)),
});
export const Command = commands({
  BeginValue: { input: input({ value: Type.DecisionValue }), from: [State.IDLE, State.BETWEEN_VALUES], goTo: State.IN_VALUE, does: "..." },
  Site: { input: input({ killed: "boolean" }), from: State.IN_VALUE, does: "..." },
  EndValue: {
    from: State.IN_VALUE,
    goTo: State.BETWEEN_VALUES,
    asks: [Query.inAdapter({ value: Data.value }).as("inAdapter")],
    cases: [When.survived.then({ emits: [Effect.Survived({ value: Data.value })] }),
            When.onlyInAdapter.then({ emits: [Effect.DecisionInAdapter({ value: Data.value })] }),
            otherwise],
  },
  Mutant: { input: input({ killed: "boolean" }), does: "..." },
  Finish: { input: input({ shared: "boolean" }), goTo: State.DONE, cases: [When.ineffective.then({ emits: [Effect.Ineffective({})] }), otherwise] },
});
```

`DecisionValue` は「数か文字列」なので `oneOf({ number: "number", string: "string" })`（W4）。

作業場所の監査: 変わったファイル1つごとに `ChangedFile { path, isNew, usedByThis, usedByOthersOnly, inert, partFile }` を渡し、
`OutOfScope` を出す。状態を持たない部品と、決定表1つで書ける。書きにくさは無かった。

シミュレーター（W4、W5、W6、W12）:

```ts
export const Command = commands({
  Execute: {                                                           // 1手: コマンドを1つ実行する
    input: input({ command: "string", input: value() }),
    output: oneOf({ refused: record({}), conflict: record({ cases: list("string") }), applied: record({}) }),
    asks: [Query.enabled({ command: ExecuteInput.command }).as("enabled"),            // from / onlyIf（意味の関数は橋渡しが呼ぶ）
           Query.holdingCases({ command: ExecuteInput.command }).as("holding")],     // 成り立つ場合の名前の並び
    cases: [If.notEnabled.then({ responds: { refused: {} } }),
            If.conflict.then({ responds: { conflict: { cases: Query.holdingCases.answer } } }),
            otherwise({ emits: [Effect.Apply({ command: ExecuteInput.command, case: Calc.chosenCase })], responds: { applied: {} } })],
  },
});
```

書いてみると、シミュレーターが自分で持つ判断は、次の5つに分けられる。

1. 実行できるか（`from`、`onlyIf`、経路に載らない値）
2. 場合の選び方（同時に1つだけ、無ければ `otherwise`）
3. 起きることの順序（含む部品の呼び出し → 場合の席。副作用は並びの順。`onlyWhen`）
4. 多数ある部品（無いキーは何もせず `null`、`adds` / `removes`）
5. 依存の約束（`fresh`、`increasing`、`mayFail`）

値そのもの（`value()`）は運ぶだけで、中身で判断しない。含む部品は、`CallPart` を副作用として出し、橋渡しが子のシミュレーターを動かして、
答えを `PartAnswered` で返す（W6）。N12 で、部品を分けて書く。1つの部品にすると大きすぎる。

### 16.4. 保存先と失敗のある web（決定）

**保存先（W7）**: 再起動を越えて残ることは、業務の部品の観測できる性質として書く。どこに保存するかは書かない。
保存のコードは、業務を知らない汎用の部品として、別に書いて検証する。

```ts
// 保存先の部品: 業務を知らない。再起動を越えて残ることが、この部品自身の性質（起点）
export const Store = service({
  description: "Keeps values by key.",
  durable: true,                                         // 自分で残す（本番コードは node:sqlite など）
  uses: [StoreData, StoreCommand],                        // entries: list(record({ key: "string", value: value() }))。Put / Get / Delete
});

// 業務の部品: 状態は、これまでどおり自分の仕様だけが持つ
export const Todos = service({
  description: "A to-do list ...",
  durable: Store,                                        // Store を通して、再起動を越えて残る
  uses: [Part, Query, Command],                          // Part: items は many(TodoItem, by("id"))。Store のコマンドは呼ばない
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
| `durable: Store` の意味 | 「この保存先の部品を、使えるものとして渡す」。**強制しない**（本番コードには制約をかけない）。エージェントが `node:sqlite` を直接使っても、再起動の検証に通れば合格。扱いは N4 の含む部品と同じで、業務の部品を書くエージェントは `Store` の本番コードを見て使えるが、仕様（IR）は見ない。そのコードは変えられず（`out-of-scope`）、ミューテーションも及ばない。`Store` の仕様は、業務の部品の検証では実行しない（呼ばないので） |
| `durable: true` | 自分で残す。`Store` のような起点の部品に付ける。業務の部品に付けてもよく、そのときは保存の方法をエージェントが選ぶ |
| `Store` の値の形 | 汎用（`value()`、W5）。業務ごとに型を付けた保存先（`TodoStore`）は、型が業務の仕様と二重になるので勧めない |
| 保存先の場所 | 本番コードは、保存先の場所（ファイルのパス）を受け取る。決めるのは、入口の起動と設定（人が書く composition root）と、検証ではアダプター（隔離した一時ディレクトリ）。`node:sqlite` を許す組み込みに足す。ファイルの読み書き（`node:fs`）は、いまの通り許さない |

**依存の失敗（W8）**: 失敗も、ふつうの条件の1つとして扱う。

```ts
export const Query = queries({ newId: { output: "string", fresh: true, mayFail: true } });
export const When = conditions({ idFailed: all(not(If.invalidTitle), Query.newId.failed) });

export const Command = commands({
  Add: {
    input: AddInput,
    output: record({ status: [201, 422, 503], body: optional(Type.Todo) }),          // W9: 数の列挙
    cases: [
      If.invalidTitle.then({ responds: { status: 422, body: null } }),               // タイトルが悪ければ、採番の成否によらず 422
      When.idFailed.then({ responds: { status: 503, body: null } }),
      otherwise({ adds: [Part.items.add(Query.newId, { title: AddInput.title })], responds: { status: 201, body: ... } }),
    ],
  },
});
```

| 点 | 決めたこと |
| --- | --- |
| 失敗の優先 | **持たない。** §4.2 の「条件は同時に1つだけ」のまま。失敗が観測されるのは、実装が実際に尋ねたときだけなので、「失敗を先に見る」と決めると、尋ねる前に断る正しい実装（タイトルを先に確かめる）を落とす |
| 書き忘れ | `not(If.invalidTitle)` を書き忘れると、「タイトルが空で、採番も失敗」の手で2つの条件が同時に成り立つ。これは条件の衝突として、エージェントを呼ぶ前に見つかる。その衝突は「断るのは採番の前か後か」という、仕様が答えるべき問いそのもの |
| 失敗した答えを読む | 意味の関数が、失敗した問い合わせの答えを読んだら、仕様の誤りとして止める |
| 失敗させる依存 | 代役（`Ports`）の問い合わせだけ。代役は、`mayFail` の問い合わせで、ときどき失敗する（例外を投げる）。部品の本番コード（`node:sqlite`）の失敗は起こさない。副作用の失敗は、0.3 の後（「非同期と失敗」） |

**実装（N9）。**

* `mayFail: true` は問い合わせの席。`Query.newId.failed`（尋ねたものは `.as(...)` の節の `.failed`）は、`all` / `not` と同じ
  「組み合わせの条件」の1つ (`{ failed: "newId" }`) で、意味は自動で決まる。文は `query "newId" failed`。IR の `conditions` に中身が出る。
  失敗しない問い合わせの `.failed` は `bad-failure`。
* PBT の1手は、失敗することがある引数の無い問い合わせごとに「失敗するか」（4回に1回）を持つ。引数つきは、引数ごとに答えるか失敗するか。
  失敗した手では、代役が例外を投げ、意味の関数に渡す状態には失敗した名前の並びが入る。失敗した答えを読んだら仕様の誤り
  （`selfCheck` で、エージェントを呼ぶ前に止まる）。失敗することがある問い合わせが無い仕様では、乱数の引き方は以前のまま。
* 保存先の場所は、ハーネスが試行ごとに一時ファイルを作って `ports.storage` で渡す（アダプターは `node:fs` を使えないので、
  決めるのはハーネス）。契約に `restartSystem()` と `storage` が出るのは、再起動を越えて残るものを含む部品だけ。
* 再起動は、1手の前に6回に1回はさむ。期待値は、`durable` の部品の状態（中の部品と多数ある部品も）をそのまま、ほかを始めに戻したもの。
  依存の約束の記録（前の答え、返した値）は残る（依存は再起動しない）。再起動のすぐあとに状態を比べ、副作用が無いことも確かめる。
  手順の記録では `(restart)` という手になる。
* `durable: Store` の保存先の部品は、パイプラインでは含む部品と同じ扱い（先に一致させる、本番コードは使うだけ、ミューテーションの外）。
  `node:sqlite` を、本番コードが使える組み込みに足した。

**N10 で見つかった書きにくさ。**

* 入力の選び方 (`among(Data.reached)`) のためだけに、Layer 1 がデータを1つ宣言すると、データのまとまりが閉じ（N8f の
  `closed`）、解釈が足していたほかのデータを、すべて Layer 1 に移すことになった（`graph-check`）。どれを覚えるかは
  ふつう解釈の仕事なので、`among` が解釈のデータを指せるか、Layer 1 が「開いたまま」項目を宣言できる書き方を、
  0.3 の後で考える。**直した（N13）**: コマンドの席 `hints`（入力の生成の指示。`among`、`examples`、`around` だけ）を、
  解釈も書けるようにした。生成の指示は合否に関わらない助言なので、Layer 1 が書いた入力に、解釈が同じ型で重ねてよい
  （同じ設定を両方が書けば Layer 1 が勝つ）。Layer 1 はデータを文のままにして、解釈がデータと `hints: { name: among(Data.visited) }`
  を足す。重ねた結果は入力の型に入るので、IR の形は変わらない。

**N13 で見つかった書きにくさ。**

* データの名前とコマンドの入力の名前は、条件と計算から同じ階層で見えるので、重なると誤り（`name-collision`）。それが報告されるのは
  解釈を導いたあとだけで、解釈する側は Layer 1 の名前を変えられないため、`clp interpret` の実行が1回まるごと無駄になった（self の
  部品を書くとき4回）。**直した**: 解釈が無くても、Layer 1 だけを重ねて名前の衝突を確かめ、`clp compile` で報告する。
* まれな報告に届くかは、事実の列の形で決まる（`leaf-check`: 5手の決まった並びでしか起きない報告が、5000 回でもほぼ起きなかった）。
  書きにくさというより書き方の注意として、`SELF_HOSTING.md` §7 に記録した: まれな組み合わせは、1つの事実の入力にまとめて短い手順で
  届くようにする。事実の順番を約束しない（約束すると、解釈が `onlyIf` にし、初めの値が観測できなくなる）。

### 16.5. IR の変更（版 7 にまとめる）

| 変更 | もと |
| --- | --- |
| ノードを「種類 + 名前つきの子」で書く（席と項目と並び。書いた語と IR の語は同じ） | §16.0 |
| `goTo` が、決定表の列への参照を持てる | W2 |
| 条件が、組み合わせ（`all` / `not`）を持てる | W3 |
| 型に `oneOf`、`value` | W4、W5 |
| 部品の `durable`、契約の `restartSystem` | W7 |
| 問い合わせの `mayFail`、条件に失敗（`Query.newId.failed`） | W8 |
| 列挙が数を持てる | W9 |

W1、W10、W11、W12 は、IR を変えない（いまの形に展開する）。W6 は入れない。W13、W14 は実装の直し。


### 16.6. 実装の状況（N8）

| もの | 状況 |
| --- | --- |
| 種類（席か項目）、`service`、まとまりの宣言 (`commands` / `decisions` / `types`)、`[]` と略記、解釈は名前を持つノードの並び | 済み (N8a)。新しい木は、これまでの節の木に変換する。`KINDS` が種類の定義で、文法の表 (`GRAMMAR`) の書き手の種類の行は、そこから組み立てる。種類に無い席は `unknown-field` |
| 利用者の語 (L2) `kind(name, { fields, expand })` | 済み。読み込むときに2回展開し、決定的でなければ報告する。組み込みの `forwards` も、この仕組みで定義した |
| L3（注釈） | まだ。意味を持たない情報を IR に載せる口は、0.3 の残り |
| 既存の例を移す | 済み (N8b)。注文、貸出、todo、self の4つ、テストの中の仕様。IR はバイト単位で一致し、Layer 1 のハッシュも一致した |
| 古い書き方を消す | 済み (N8c)。`component(...)` を直接書くこと、名前の無い子の並び、dict 形式の解釈、`states` の可変長の引数 |
| 解釈の雛形と依頼文、`REFERENCE.md` | 済み (N8d)。実際の LLM が、貸出の例を新しい書き方で1回目に導けた |
| W1 共通の結果 | 済み。コマンドに書いた「起きること」は、どの場合にも足す（otherwise が無ければ足す）。解釈の `.with` も、Layer 1 の場合のそれぞれに足す |
| W2 遷移先を決定表の列で | 済み。セルに書いた状態の取っ手は、状態の名前になる。検査、グラフ、シミュレーター、Stage 1 の名前の検査（列の状態を1つずつ渡す）が扱う。IR の `goTo` は `{ $ref: "decision:plan.next" }` |
| W3 条件の組み合わせ | 済み。`all(...)` / `not(...)`。名前は組み合わせを表す文（`("A" and not "B")`）。意味は自動で決まり、組み合わせる前の条件の意味が無ければ、その条件について報告する。IR の `conditions` に中身が出る |
| W4 `oneOf`、W5 `value()` | 済み。値は、キーが1つのフィールドの組。検査、生成器、契約の型、入力の取っ手（`WriteInput.value.constant`）、`responds` が扱う。セルフホストした `payload-check` の範囲の外なので、Stage 0 が検査する |
| W9 数の列挙 | 済み（`[201, 422]`） |
| W10 `forwards` | 済み。`Part.items.Complete.forward({ missing: "not-found" })`。無いキーの条件は、意味が自動で決まる |
| W11 Layer 1 の `set` / `emits` | 済み。解釈の分は、Layer 1 の分のあとに足す。同じデータを両方が覚えるなら、解釈の側を報告する |
| W12 データと答えのフィールドの取っ手 | 済み（`Data.last.status`、`.answer.code`） |
| W13 親が作るときに渡すデータ | 済み。`clp compile` と `clp apply` は、ほかのコンポーネントの `adds` から、渡されるデータを集める |
| W14 作業場所の型定義 | 済み。`@types/node` を作業場所の `node_modules` に置く（読むだけ。書き換えたら差し戻す） |
| IR の版 7 | 済み |
| self の書き直し | 済み。`value-writer` は `oneOf` で値を受け、答えで返す形になった（解釈を2回導き直し、設計・配線・実装とも1回目で通過、ミューテーション 5/5）。`pipeline` は W1〜W3 で書き直した（`Start` の4つの場合が、決定表の列の `goTo` 1つになった。解釈を直し、本番コードはそのままで通った） |

### 16.7. 単一化と葉の検査（N8f。決定）

N8 のあとで、Layer 1 と解釈の関係と、LLM が書いた解釈の検査を見直して決めた。

**Layer 1 と解釈の書き分けは残す（案 B）。** Layer 1 は宣言（`service({...})`、`commands({...})`）、解釈は差分
（`interpretation(X, [...])`、`Command.X.with({...})`）。どこで名前が生まれ、どこで足しているかが、見た目で分かるため。
中身を書く語（席、場合、型、取っ手）は、どちらも同じ。

**重ね合わせは、単一化1つにする。** いまの実装は、両方を以前の節の木に変換し、`resolveComponent` で重ねている。
そのため、まとまりごとの特例（Layer 1 が項目を並べたまとまりには足せない、ただし計算と不変条件は足せる、`otherwise` だけは足せる）が
残っている。これを「同じ道筋のノードどうしを合わせ、値がぶつかれば誤り」の1つの規則にし、閉じる・開くは種類の定義の性質として書く。

**葉の検査: 重ねたあとの木の、すべての道筋が葉で終わる。** 葉は、型、定数、解決できる取っ手、意味の関数を持つ文、明示した
「何も無い」（`nothing: true`）。葉で終わらない道筋は、書き残し（文だけのまま中身が来なかったまとまり、必須の席が空の項目、
起きることの書かれていない場合、どこも指していない取っ手）。

```ts
const Case    = kind("case",    { fields: { goTo, set, emits, responds, adds, removes, does, nothing }, oneOfRequired: ["goTo", "set", "emits", "responds", "adds", "removes", "nothing"] });
const Datum   = kind("datum",   { fields: { type: required(Type), initially, description } });
const Query   = kind("query",   { fields: { output: required(Type), input, description, fresh, increasing } });
const Queries = kind("queries", { entries: Query, nonEmpty: true });
```

* 調べる処理は、種類の定義を読んで木をたどる汎用の1つ。利用者の語（`kind(...)`）も、必須の席を宣言すれば同じ検査を受ける。
* 診断は道筋で出す（`incomplete: Order.commands.Ship.cases.otherwise: 起きることがありません（何も起きないなら nothing: true）`）。
* いまの個別の検査（型が無い、`unbound-*`、知らない名前、`otherwise` が無い）は、これに置き換わる。

**起きることの末端。** Layer 1 が文（`does`、文だけのコマンド）で「起きること」を言った場所で、重ねたあとに構造が何も無ければ誤り。
本当に何も起きないなら、解釈が `nothing: true` で明示する。以前は、解釈が書き落とすと、その振る舞いが仕様から黙って消えていた。

**到達点（グラフの性質。グラフの検査に残す）。**

| 検査 | 重さ | どこで |
| --- | --- | --- |
| 解釈が足した語彙（副作用、データ、問い合わせ）が使われていない | 誤り | `clp interpret` の検査だけ（Layer 1 の語彙は、人が先に宣言することがあるので注意のまま） |
| 終わりの状態でないのに、どのコマンドでも出られない | 誤り | 終わりの状態を宣言したとき（`states({ DONE: { final: true } })` の形。宣言が無ければ見ない） |
| 一度も当たらない場合 (`unreached-case`) | 注意のまま | シードで変わるため、誤りにすると正しい解釈を差し戻す |

葉の検査が見ないもの: 意味が正しいか（2つの解釈の比較と、人のレビュー）、値が型に合うか（いまの型の検査）。

**実装（N8f。完了）。**

* 重ね合わせは `resolveComponent(layer1, written, rules)` のまま、まとまりごとの特例を `MergeRules` に移した。`rules` は
  `mergeRules()` が `KINDS` の `closed`（項目を足せないまとまり。計算と不変条件は開いている）から作る。Layer 1 が
  構造として書いた席を解釈が書けば、道筋で誤りになる（`commands.Checkout.cases.The payment succeeded.goTo: Layer 1 に書かれているので、解釈では書けません`）。
  触れなかったコマンドと場合は、何も足さない（解釈が「すべてのコマンドと場合に触れる」決まりは、葉の検査に置き換えた）。
* 重ねた結果の見取り図（`MergedView`: 文だけのまとまり、項目の席、状態と `init`、コマンドと場合ごとの「文で言われたか」と
  「埋まった席」）を、`leafCheck` が `KINDS` の `required` / `oneOfRequired` / `nonEmpty` / `requiredCases` で調べる。
  結果は `incomplete` として `extract.ts` が出し、1件でもあればモデルを作らない。
* 置き換わったもの: 型・出力・説明が無い項目、`otherwise` が無い、状態・`init`・コマンドが無い、`unbound-condition` /
  `unbound-calculation` / `unbound-invariant`（すべて `incomplete` に）。知らない名前と、参照の型が合わないもの
  （`unknown-*`、`bad-reference`）は、self の `reference-check` / `payload-check` が判断しているので、そのまま残した。
* 診断の道筋は部品の中から書く（`commands.Ship.cases.otherwise`）。部品の名前は、診断の `where` が持つ。
* 終わりの状態は `states({ DONE: { final: true } })`。1つでも宣言すると、`graph.ts` が出口の無い状態を `dead-end-state` で誤りにする。
* 解釈が足した副作用・データ・問い合わせが使われていなければ、`clp compile --strict-added`（`clp interpret` の検査が使う）で誤り。
  それ以外では、これまでどおり注意。


## 17. 1.0 の書き方（紙の上の設計。2026-10-22 に決めたもの）

`ROADMAP.md` §4 の 1.0 の完了条件のための設計。人と相談しながら、図書館の例を通して決めた。実装したら、0.3 の書き方（§16）を
置き換える。それまでの節（§1〜§16）は、経緯の記録として残す。

### 17.1. 決めたこと

| 項目 | 決定 |
| --- | --- |
| 部品 | **すべては部品**。部品は「説明・約束・中身」を持つ。約束は、受け取るもの・答えるもの・覚えるもの。中身は部品の木 |
| 置き場所 | 欄は、種類ではなく約束を求める。約束が合う部品なら何を置いてもよい。組み込みの語は、あらかじめ用意された部品 |
| 文 | **中身をまだ書いていない部品の略記**。解釈がすべて展開し、IR には残らない |
| 説明 | 注釈として IR の外（`notes`）に持つ。人とエージェントの資料にだけ使い、意味には使わない |
| 意味 | **式だけ**。TypeScript の関数による逃げ道は認めない |
| 書き方 | **プログラマ向けの TypeScript の部分集合**（PlusCal の考え方）。データの欄と、関数の本体。読み取りが式に変換する |
| 中と外 | **部品は、使う所でそのまま呼ぶ**（`Fines.Owed({ member })`）。中か外かは言葉でも欄でもなく、**部品の木の位置**で決まる: 自分の子孫は自分のもの（状態は自分）、それ以外は外のもの（状態は相手。検証では相手の仕様が代役）。どこにも置かれていない部品を呼べば、呼んだ部品の子になる。仕様の無い外の世界は `external(…)` の部品 |
| CQRS | `commands`（状態を変える）と `queries`（状態を変えない）を分ける。0.3 の「外の世界への問い合わせ」は、`external(…)` の部品を呼ぶ形になる |
| 性質 | **不変条件も時相の性質も `rules` 1つ**（IR では `properties`）。`always(状態の述語)` の形は、読み取りが不変条件として見分け、イベントごとの証明責務を作る |
| 場合 | **上から順に、最初に成り立ったもの**。0.3 の「同時に1つだけ、優先順位なし」をやめる。IR では、前の場合を打ち消した独立のガードにそろえる |
| 決定表 | 場合分けと同じ「選ぶ部品」（結果が定数）。関数のように呼ぶ（`Policy({ member }).maxBooks`） |
| データ | **関係と集合が基本**（`Map` / `Set`）。並び（`List`）は順番が意味を持つときだけ |
| 値オブジェクト | **原子**（`id("会員番号")`）。Alloy の `sig`、Z の基本型。PBT は小さな有限の集合から選ぶ |
| 記法 | 説明の文は、作り方の最初の引数（`service("文", { … })`）。`{ description: … }` は無い。部品の中は種類の見出し（`state` / `commands` / `queries` / `rules` / `examples` / `conditions` / `calcs` / `decisions` / `components`）で区切り、見出しの中では文字列だけで書ける。名前空間は部品の中で1つ。コマンドと問い合わせは型付きの引数を持つメソッドで、状態は `this.` で読み書きする。呼ぶときは位置で引数を渡す |
| 名前 | key と `is.名前(…)` / `does.名前(…)` が名前。式を書いた断片は、名前を省けば解釈が付ける |
| 読み違いの見つけ方 | 2 つの解釈の比べ合い（式どうしを決定的に）、式の機械的な読み下しによる人の確認、書き手が書く具体例 |
| IR | **言語に寄らない核**（多ソートの一階述語論理 + 有限の集合論 + 遷移系 + 線形時相論理）。振る舞いは Event-B の規律（イベント = 引数・ガード・代入・出力）、性質は Alloy 6 の時相論理。式は s 式 |
| 言語ごとの差 | IR の外に置く: 演算の表、言語ごとのプロファイル、分析の設定 |
| 検査器 | 入れ替え口 (`Checker`) にする。1.0 で作るのは **Alloy 6 だけ**（必須。Java が要る）。反例とトレースは共通の形 |
| 正解を見せるか | 0.3 の「正解（意味の関数）を実装するエージェントに見せない」をやめる。実装するエージェントは、式（とその読み下し、説明）を読んでコードに写す |

### 17.2. 全体の流れ

```
Layer 1（人。文と構造が混ざってよい）
   │ 解釈（LLM。文の部品をすべて、同じ書き方で展開する）
   ▼
読み取り（実行せずに構文として読む） → 部品の木 → 重ね合わせ（Layer 1 が勝つ）
   │ 検査: 文が残っていないか、文の追跡、葉、IR の形
   │ 人の確認: 元の文と、式の読み下しを並べる。2 つの解釈の食い違い。具体例
   ▼
IR（文の無い、言語に寄らない核）
   ├─→ Alloy 6: 仕様の妥当性（証明責務と性質の有界の検査）、狙った手順の生成、反例の短縮
   ├─→ PBT の正解（IR の式を評価）: ランダムな手順 + Alloy が作った手順
   └─→ 実装（エージェント）: spec view（読み下し）と notes を読んで、TypeScript に写す
```

### 17.3. 記法と、部品と約束

**記法の決まり。**

1. **説明の文は、作り方の最初の引数。** `service("文")`（文だけ）、`service("文", { … })`（文と中身）、`service({ … })`（中身だけ）。
   `{ description: … }` は無い。
2. **部品の中は、種類の見出しで区切る。** 見出しは種類を示すための区切りで、中身はどれも部品（すべては部品）。名前は部品の中で
   1つの名前空間で、見出しが違っても同じ名前は誤り。

   | 見出し | 中に置くもの | 種類 |
   | --- | --- | --- |
   | `state` | 名前 → 型、または文 | 覚えるもの |
   | `commands` | 名前 → メソッド、または文 | 状態を変える口 |
   | `queries` | 名前 → メソッド、または文 | 状態を変えない口（書き込みは誤り） |
   | `rules` | 名前 → 性質を返すメソッド、または文 | いつも成り立つこと（`always(状態の述語)` は不変条件）と、時相の性質 |
   | `examples` | 名前 → `example(文, 手順)` | 書き手の期待 |
   | `conditions` / `calcs` / `decisions` | 名前 → メソッド、決定表、または文 | 名前を付けた条件 / 計算 / 決定表（部品の中だけで使うもの） |
   | `components` | 名前 → 部品 | 子の部品（別々に動くものを並べるとき。§17.3 の下） |

3. **見出しの中では、文字列だけで書ける。** 種類は見出しが決めるので、`command("…")` のような包みは要らない。
4. **コマンドと問い合わせは、型付きの引数を持つメソッド。** 仕様は実行せずに構文として読むので、型注釈も読める。IR では、
   引数の名前がそのまま入力の名前になる。呼ぶときは位置で渡す（`Members.IsMember(member)`、`Policy(member)`）。
5. **状態は `this.` で読み書きする。** `service` の型が `this` の型を決めるので、補完も誤りも出る。

| よそで定義する部品の作り方 | 種類 |
| --- | --- |
| `id("文")` | 原子（値オブジェクト）。小さな有限の集合 |
| `decisions("文", (引数) => [[条件, 定数の組], …, [otherwise, 定数の組]])` | 決定表（選ぶ部品。結果が定数）。関数のように呼ぶ |
| `condition("文", (引数) => 式)` / `calc("文", (引数) => 式)` | 名前を付けた条件 / 計算（どこからでも呼べる） |
| `service("文", { … })` | 部品 |
| `external("文", { queries: { 口: 型 } })` | 仕様の無い外の世界（約束だけ） |

どの部品も、次の3通りで書ける。読み取ったあとの木は同じ:

1. **文だけ**: `Return: "本を返してもらう。…"`、本体の中の `is.onLoan("その本は貸出中")`。中身は解釈が書く。
2. **その場で書く**: 本体の中の `is.unpaid("未払いがある", Fines.Owed(member) > 0)`。
3. **よそで定義した部品を置く（呼ぶ）**: `if (Unpaid(member)) …`。

切り出しは、その場の部品を export した定数にして、呼ぶ形に置き換えるだけ（木は変わらない）。本体の中で文だけの断片を書くときは、
名前を付ける（`is.onLoan("…")`、`does.rememberDue("…")`）。解釈は、その名前で中身を埋める。式も一緒に書くときは、名前を省いて
よい（解釈が付ける）。

**中と外は、部品の木の位置で決まる。** 自分の子孫は自分のもの、それ以外は外のもの。

- 部品は、使う所でそのまま呼ぶ（`Members.IsMember(member)`、`Fines.Owed(member)`、`Clock.Today()`）。
- 呼んだ部品が、木のどこにも置かれていなければ、呼んだ部品の子になる（中に持つ。状態は自分。検証では、相手の仕様も一緒に
  動かして期待値を作る）。
- 別々に動くもの（デプロイの単位）があるときは、それを `components` に並べた部品を1つ書く。これも、ただの部品。そこで兄弟に
  なった部品は、互いに外のもの（状態は相手。検証では、相手の仕様が代役）。同じ部品が、あるシステムでは中、別のシステムでは
  独立したサービス、ということを、仕様を変えずに木の置き方だけで書ける。
- 仕様の無い外の世界は、中身が無く約束だけを持つ部品 `external(…)`（代役は、約束を守る乱数）。
- 1つの部品の中で、同じ部品を何か所から呼んでも1つを共有する。2つ持ちたいまれな場合だけ、別名を付ける（`Fines.as("deposit")`）。

```ts
export const Clock = external("今日の日付（1970-01-01 からの日数）", { queries: { Today: Integer.increasing() } });

// 別々に動くものを並べた部品（無ければ、呼んだ部品はすべて呼んだ側の子）
export const Town = service("町の図書館と、町の会員管理。", {
  components: {
    library: Library,      // Library と Members は兄弟。Library から見て Members は外
    members: Members,      // Fines はどこにも置かれていないので、呼んでいる Library の子
  },
});
```

### 17.4. Layer 1 の書き方

一番粗い形は `service("文")`。詰めたい所だけ、見出しの中に足していく。

```ts
import { does, example, expect, external, id, Integer, is, Map, otherwise, decisions, service } from "@clp/core";

export const MemberId = id("会員番号");
export const BookId = id("本の番号");

export const Policy = decisions("貸出の方針", (member: MemberId) => [
  [is.extended("延長会員"), { maxBooks: 10, loanDays: 28 }],
  [otherwise,                { maxBooks: 5,  loanDays: 14 }],
]);

export const Fines = service("延滞料。期限を過ぎて返した日数 × 10 円を、会員ごとに足していく。払えば 0 になる。");
export const Members = service("会員を登録し、会員か、延長会員かを答える。");
export const Clock = external("今日の日付（1970-01-01 からの日数）", { queries: { Today: Integer.increasing() } });

export const Library = service("図書館。本を貸し、返してもらい、延滞料を取る。", {
  state: {
    lentTo: Map(BookId, MemberId),
    dueOf: "貸している本ごとの、返す期限",
  },

  commands: {
    Borrow(member: MemberId, book: BookId) {
      if (is.notMember("会員でない", !Members.IsMember(member))) return "not-member";
      if (is.unpaid("未払いの延滞料がある", Fines.Owed(member) > 0)) return "unpaid";
      if (is.onLoan("その本は貸出中")) return "on-loan";
      if (is.atLimit("上限まで借りている", this.lentTo.count((_, m) => m === member) >= Policy(member).maxBooks)) return "limit";
      this.lentTo.set(book, member);
      does.rememberDue("返す期限を覚える");
      return "lent";
    },
    Return: "本を返してもらう。期限を過ぎていれば、過ぎた日数を延滞料に付ける。",
  },

  queries: {
    LoansOf: "その会員が借りている本",
  },

  rules: {
    dueForEveryLoan: "貸出中の本には、必ず期限がある",
    returnedNotLent: "返された本は、次の時点で貸出中でない",
  },

  examples: {
    unpaidRefused: example("未払いのある会員は借りられない", () => {
      Members.Register("M001");
      Fines.Charge("M001", 3);
      expect(Library.Borrow("M001", "B1")).toBe("unpaid");
    }),
  },
});

// Library は、呼んでいる Fines と Members を中に持つ（どこにも置かれていないため）。Clock は外の世界。
// 会員管理を別に動かすなら、§17.3 の Town のように兄弟に並べる（Library の仕様は変わらない）
```

### 17.5. 本体に書ける範囲

本体（メソッド）は TypeScript として型検査され、読み取りが、次の範囲だけを式に変換する。外れた所は、場所つきの誤り。

- 書ける:
  - `if` / `return`（上から順の場合と、答え）、`const`（一度だけ）
  - 比べる、四則、`&&` / `||` / `!`、`??`
  - `this.` の状態の読み取り（`Map` / `Set` / `List` の `has`、`get`、`keys`、`values`、`size`、`count`、`some`、`every`、`filter`、`map`、`sum`）
  - `this.` の状態への書き込み（`set` / `delete` / `add`、`this.x = …`）
  - 部品（import したもの、同じファイルのもの、`external`）のコマンド・問い合わせの呼び出し、`is.名前(文, 式?)`、`does.名前(文)`
  - メソッドの先頭の `requires(条件)`（仕様の外。§17.16）
  - 時相（`rules` の中だけ）: `always`、`eventually`、`after`、`until`、`once`、`historically`、`always.on.コマンド(…)`
- 書けない:
  - ループ（`for` / `while`。代わりに `some` / `every` / `count`）、再帰
  - 外の変数（引数、`this`、import した部品・定数だけ）
  - 書き込んだものを、同じ本体の中で読み直すこと（前と次の状態が混ざる）
  - 例外、非同期、問い合わせの中の書き込み

### 17.6. 解釈の書き方

Layer 1 と同じ書き方。Layer 1 が文のまま残した名前だけを、同じ見出しの中で、中身で埋める（Layer 1 が書いた構造は書き換え
られない。見出し（種類）が違えば誤り）。本体の中の文だけの断片は、付けた名前で、`conditions` / `does` の見出しの中で埋める。
同じファイルに定義した部品の解釈は、同じ解釈ファイルに並べる。文だけの部品が別の部品を使うとき（Library の文が「延滞料を取る」
としか言わないとき）は、解釈が仕様のディレクトリにある部品を見つけて呼ぶ。どの部品を使うことになったか（「Library は Fines を
中に持つ」）は、確認のときに人に見せる。

```ts
export const LibraryInterpretation = interpretation(Library, {
  state: { dueOf: Map(BookId, Integer) },
  conditions: {
    onLoan(member: MemberId, book: BookId) { return this.lentTo.has(book); },
  },
  does: {
    rememberDue(member: MemberId, book: BookId) { this.dueOf.set(book, Clock.Today() + Policy(member).loanDays); },
  },
  commands: {
    Return(book: BookId) {
      if (is.notLent("その本は貸していない", !this.lentTo.has(book))) return "not-lent";
      if (is.late("期限を過ぎている", Clock.Today() > this.dueOf.get(book))) {
        Fines.Charge(this.lentTo.get(book), Clock.Today() - this.dueOf.get(book));
      }
      this.lentTo.delete(book);
      this.dueOf.delete(book);
      return "returned";
    },
  },
  queries: {
    LoansOf(member: MemberId) { return this.lentTo.keys().filter((b) => this.lentTo.get(b) === member); },
  },
  rules: {
    dueForEveryLoan() { return always(() => this.lentTo.keys().every((b) => this.dueOf.has(b))); },
    returnedNotLent() { return always.on.Return((book) => after(() => !this.lentTo.has(book))); },
  },
});

export const FinesInterpretation = interpretation(Fines, {
  state: { owed: Map(MemberId, Integer) },
  commands: {
    Charge(member: MemberId, days: Integer.min(1)) { this.owed.set(member, (this.owed.get(member) ?? 0) + days * 10); },
    Pay(member: MemberId) { this.owed.delete(member); },
  },
  queries: {
    Owed(member: MemberId) { return this.owed.get(member) ?? 0; },
  },
});
```

`conditions` / `does` で埋めるメソッドの引数は、その断片を書いたコマンドの引数と同じ（`onLoan` は Borrow の中にあるので
`(member, book)`）。

### 17.7. 読み方

フレームワークは、解釈のファイルを実行せずに読む（0.3 の「IR は、何も実行せずに作る」を保つ）。

1. TypeScript の構文として読む（型の検査も同時に）。
2. 本体を、§17.5 の範囲で部品の木に変換する（引数の型注釈は、入力の型として読む）。
3. Layer 1 の木と重ねる（Layer 1 が勝つ。書き換えようとした所と、見出しの違う中身は誤り）。
4. 検査する（§17.8）。
5. 読み下しを作る（演算の表から機械的に。人の確認と、実装するエージェントの spec view に使う）。

```
state.dueOf          「貸している本ごとの、返す期限」   → 本 → 整数（本ごとに高々1つ）
Borrow onLoan        「その本は貸出中」                 → lentTo のキーに、引数の book がある
Borrow rememberDue   「返す期限を覚える」               → dueOf の book を、Clock の Today + 貸出の方針(member).loanDays にする
Return late          「期限を過ぎている」               → Clock の Today が dueOf の book より大きい
                     （その場合）                       → Fines の Charge を、lentTo の book、Today − dueOf の book で呼ぶ
LoansOf              「その会員が借りている本」         → lentTo のうち、値が引数の member であるキーの集合
rules.dueForEveryLoan「貸出中の本には、必ず期限がある」 → いつでも、lentTo のキーは、すべて dueOf のキー（不変条件）
rules.returnedNotLent「返された本は、次の時点で貸出中でない」→ いつでも、Return(book) が起きたら、次の時点で book は lentTo のキーにない
使う部品             Library は Fines と Members を中に持つ（どこにも置かれていないため）。Clock は外の世界
文の追跡             description[1]「本を貸し」→ Borrow  [2]「返してもらい」→ Return  [3]「延滞料を取る」→ Fines, Return.late
具体例               unpaidRefused「未払いのある会員は借りられない」: 合う
```

### 17.8. 検査（文字列が無くなることを、機械的に確かめる）

1. **読み取りの検査**: 文字列のリテラルを、置かれた場所で分ける。値の欄（型が文字列か列挙）は定数、注釈の欄（`is.名前` の
   第1引数、作り方の最初の引数の文）は `notes` へ、それ以外は誤り。どこが値の欄かは型が決める。
2. **葉の検査**: 重ねた木の葉まで、中身が文のままの部品が無いことを確かめる（0.3 の N8f の規則を「文は葉ではない」に変える）。
   `error[prose-left] commands.Borrow.choose[2].condition: 「その本は貸出中」の中身（式）がありません`。
3. **IR の形の検査**: IR の意味の部分に自然言語の欄が無く、残る文字列がすべて「型が文字列の定数」か名前であること。
4. **文の追跡**: Layer 1 の文を節（「。」や「.」の単位）に分けて番号を振り、どの部品からも指されない節を誤りにする
   （`error[sentence-unused] Library.description[3]: 「延滞料を取る」から作られた部品がありません`）。文をそのまま書いた所は
   読み取りが自動で結び、そうでない所は解釈が `from` で示す。

文の意味と式が合っているかは、機械では決められない。それは、2 つの解釈の比べ合い、読み下しによる人の確認、具体例が受け持つ。

### 17.9. IR（版 8）

文は無い。説明は `notes`、文の追跡は `trace`（どちらも意味の部分の外。検査は意味の部分だけにかける）。中と外は、読み取りが
木の位置から決めて、`contains`（子孫）と `relies`（外のもの）に書き出す。性質は、読み取りが `kind`（`invariant` / `temporal`）
を付ける。式は s 式
（`["演算", 引数…]`）。場合は、前の場合を打ち消した独立のガードを持つイベントにそろえる（元の順番は `trace`）。

```json
{
  "irVersion": 8,
  "sorts": { "MemberId": ["atom"], "BookId": ["atom"] },
  "components": {
    "library": {
      "contains": { "fines": "fines", "members": "members" },
      "relies":   { "clock": "clock" },
      "state": { "lentTo": ["pfun", "BookId", "MemberId"], "dueOf": ["pfun", "BookId", "int"] },
      "init": ["and", ["=", "lentTo", ["empty"]], ["=", "dueOf", ["empty"]]],
      "decisions": {
        "policy": { "params": { "member": "MemberId" }, "rows": [
          { "when": ["ask", "members", "IsExtended", { "member": "member" }], "then": { "maxBooks": 10, "loanDays": 28 } },
          { "when": "true", "then": { "maxBooks": 5, "loanDays": 14 } } ] }
      },
      "conditions": {
        "notMember": ["not", ["ask", "members", "IsMember", { "member": "member" }]],
        "unpaid":    [">", ["call", "fines", "Owed", { "member": "member" }], 0],
        "onLoan":    ["in", "book", ["dom", "lentTo"]],
        "atLimit":   [">=", ["card", ["rres", "lentTo", ["set", "member"]]], ["field", ["decide", "policy", { "member": "member" }], "maxBooks"]]
      },
      "events": {
        "Borrow.notMember": { "params": { "member": "MemberId", "book": "BookId" }, "guard": ["cond", "notMember"], "assign": {}, "output": "not-member" },
        "Borrow.unpaid":    { "params": { "member": "MemberId", "book": "BookId" }, "guard": ["and", ["not", ["cond", "notMember"]], ["cond", "unpaid"]], "assign": {}, "output": "unpaid" },
        "Borrow.lent": {
          "params": { "member": "MemberId", "book": "BookId" },
          "guard": ["and", ["not", ["cond", "notMember"]], ["not", ["cond", "unpaid"]], ["not", ["cond", "onLoan"]], ["not", ["cond", "atLimit"]]],
          "assign": {
            "lentTo": ["override", "lentTo", ["maplet", "book", "member"]],
            "dueOf":  ["override", "dueOf", ["maplet", "book", ["+", ["ask", "clock", "Today", {}], ["field", ["decide", "policy", { "member": "member" }], "loanDays"]]]]
          },
          "output": "lent"
        },
        "Return.late": {
          "params": { "book": "BookId" },
          "guard": ["and", ["in", "book", ["dom", "lentTo"]], [">", ["ask", "clock", "Today", {}], ["apply", "dueOf", "book"]]],
          "assign": { "lentTo": ["dsub", ["set", "book"], "lentTo"], "dueOf": ["dsub", ["set", "book"], "dueOf"] },
          "sync": [["call", "fines", "Charge", { "member": ["apply", "lentTo", "book"], "days": ["-", ["ask", "clock", "Today", {}], ["apply", "dueOf", "book"]] }]],
          "output": "returned"
        }
      },
      "queries": {
        "LoansOf": { "params": { "member": "MemberId" }, "result": ["setof", "BookId"], "is": ["image", ["inverse", "lentTo"], ["set", "member"]] }
      },
      "properties": {
        "dueForEveryLoan": { "kind": "invariant", "is": ["always", ["subset", ["dom", "lentTo"], ["dom", "dueOf"]]] },
        "returnedNotLent": { "kind": "temporal", "is": ["always", ["forall", [["book", "BookId"]],
          ["implies", ["occurs", "Return.*", { "book": "book" }], ["after", ["not", ["in", "book", ["dom", "lentTo"]]]]]]] }
      }
    },
    "clock": { "external": { "Today": ["int", { "promise": "increasing" }] } }
  },
  "examples": {
    "unpaidMemberRefused": { "steps": [
      { "event": "members.Register", "params": { "member": "M0" } },
      { "event": "fines.Charge", "params": { "member": "M0", "days": 3 } },
      { "event": "library.Borrow", "params": { "member": "M0", "book": "B0" }, "output": "unpaid" } ] }
  },
  "notes": { "library.conditions.notMember": "会員でない", "library": "図書館。本を貸し、返してもらい、延滞料を取る。" },
  "trace": { "library.description[3]": ["library.contains.fines", "library.events.Return.late"] }
}
```

### 17.10. 演算の表（最初の版）

IR の外に置く、1つの表。名前・型・意味と、TypeScript の書き方、読み下し、各言語への書き方を持つ。読み取り、読み下し、
正解の評価、検査器への書き出しは、すべてこの表から作る。1.0 で列を埋めるのは Alloy 6 だけ。

| 演算 | 型 | TypeScript の書き方 | 読み下し | Alloy 6 |
| --- | --- | --- | --- | --- |
| `and` / `or` / `not` / `implies` | `bool… → bool` | `&&` / `\|\|` / `!` | かつ / または / でない / ならば | `and` / `or` / `not` / `implies` |
| `=` / `<` / `<=` / `>` / `>=` | `T × T → bool` | `===` / `<` … | 等しい / より小さい … | `=` / `<` … |
| `+` / `-` / `*` | `int × int → int` | `+` / `-` / `*` | 足す / 引く / 掛ける | `plus` / `minus` / `mul` |
| `in` | `T × set(T) → bool` | `s.has(x)` | x が s にある | `x in s` |
| `dom` / `ran` | `rel(A,B) → set` | `m.keys()` / `m.values()` | のキー / の値 | `r.B` / `A.r` |
| `apply` | `pfun(A,B) × A → B` | `m.get(x)` | の x の値 | `x.r` |
| `override` | `rel × rel → rel` | `m.set(k, v)`（書き込み） | の k を v にする | `r ++ k -> v` |
| `dsub` | `set(A) × rel(A,B) → rel` | `m.delete(k)`（書き込み） | から k を除く | `r - k -> B` |
| `rres` | `rel(A,B) × set(B) → rel` | `m.filter((_, v) => …)` | のうち値が … のもの | `r :> s` |
| `image` / `inverse` | | `m.keys().filter(…)` | の像 / 逆 | `s.~r` |
| `card` | `set → int` | `.size` / `.count(…)` | の数 | `#s` |
| `forall` / `exists` | 束縛 → bool | `.every(…)` / `.some(…)` | すべての … / ある … | `all` / `some` |
| `ask` / `call` | 相手の問い合わせ・コマンド | `members.IsMember({…})` | members の IsMember（…） | 相手の述語・関数 |
| `decide` | 決定表 | `Policy({ member })` | 貸出の方針（member） | `fun` |
| `always` / `eventually` / `after` / `until` | 時相（未来） | `always(…)` … | いつでも / いつか / 次の時点で / まで | `always` / `eventually` / `after` / `until` |
| `once` / `historically` | 時相（過去） | `once(…)` … | 以前に一度 / これまでずっと | `once` / `historically` |
| `occurs` | イベントが起きた | `always.on.Return(…)` | Return が起きたら | そのステップでイベントの述語が成り立つ |

### 17.11. 言語ごとのプロファイル（Alloy 6）

書き出す前に、IR が使っている機能とプロファイルを照らし合わせ、書き直せるものは書き直し、書き直せないものは伝える。

| 機能 | Alloy 6 |
| --- | --- |
| 原子、関係、多重度 | そのまま |
| 整数 | 幅が限られる。既定は、仕様の定数から読み取りが決める（上限 7 ビット）。外の世界の大きな数は小さな数に置き換える。あふれは禁止の設定で検査し、範囲の外として報告する（§17.16） |
| イベント | 決まった形の述語と、何もしないステップ（stutter）、書かなかった状態は変わらないこと（枠の条件）を機械的に足す |
| 不変条件、時相の性質（未来と過去） | そのまま（`always`、`once` …） |
| 部品の同期（`sync`） | 同じステップの中で、相手の状態の次の値を決める |
| 外の世界（`external`）の約束 | `increasing` は `always (x' >= x)`、`fresh` は「以前に答えた値ではない」 |
| 性質の `kind` | `invariant` はイベントごとの保存の検査（証明責務）も作る。`temporal` は `check` だけ |
| 範囲を区切らない検査 | 1.0 では扱わない（Electrod と NuSMV / nuXmv。整数の扱いを確かめてから） |

### 17.12. 検査器の入れ替え口と、共通のトレース

```ts
interface Checker {
  name: string;                                         // 1.0 は "alloy6" だけ
  profile: Profile;                                     // できることの一覧
  emit(ir: Ir, analysis: Analysis): GeneratedFiles;     // IR → その言語のファイル（決定的）
  run(files: GeneratedFiles): Promise<RawResult>;       // 外部のコマンド（java -jar …）
  read(raw: RawResult): CheckResult;                    // 「確かめた / 反例（共通のトレース） / 範囲の外」
}
```

実装の検証の `Target`（`generate` / `runTests`）と同じ形の入れ替え口。分析の設定（原子の数、整数の幅、ステップ数）は IR の外に
置き、検査ごとに渡す。反例とトレースは、どの検査器のものも次の形に戻す。シミュレーターで再現でき、実装の検証の固定の手順になる
（原子 `M0`、`B0` には、テストのときに具体的な値を割り当てる）。

```json
{ "checker": "alloy6", "command": "run reachAtLimit", "steps": [
  { "event": "members.Register", "params": { "member": "M0" } },
  { "event": "library.Borrow", "params": { "member": "M0", "book": "B0" }, "output": "lent" },
  { "event": "library.Borrow", "params": { "member": "M0", "book": "B5" }, "output": "limit" } ] }
```

### 17.13. 検証の戦略

| 段階 | 使うもの | すること |
| --- | --- | --- |
| ① 仕様の妥当性（実装の前） | Alloy 6 の有界検査 | 証明責務（不変条件を保つ、式が定義される、行き詰まらない、ガードが重ならない）と性質を確かめる。構造が成り立つか（インスタンスがあるか） |
| ② 狙った手順の生成 | Alloy 6 のトレース探索 | イベントのガードの行ごと、不変条件のぎりぎり、具体例の状況に至る最短の手順を探し、固定の手順にする（0.3 の「まれな場合に届かない」への答え） |
| ③ ランダムな手順 | fast-check | 広く当てる。②の手順を混ぜる |
| ④ 反例の短縮 | Alloy 6 | 失敗した手順を最短のトレースにする |
| ⑤ 網羅の報告 | IR のイベントと証明責務 | どのイベントのどのガードに、どの証明責務に何回当たったかを記録し、当たらなかった所を出す |

状態は実装に注入しない（0.3 のまま）。Alloy が見つけるのは、状態そのものではなく、そこに至る手順。実装の検証でも、時相の性質を
有限のトレースの意味で確かめる（安全性の性質はそのまま、「いつか」は決まった手順数の中で）。

### 17.14. Alloy 6 への写し方（例）

```alloy
module library
sig MemberId, BookId {}

one sig Fines   { var owed: MemberId -> lone Int }
one sig Library { var lentTo: BookId -> lone MemberId, var dueOf: BookId -> lone Int }
one sig Clock   { var today: Int }                                 -- 外の世界（約束: 減らない）

pred notMember[m: MemberId] { not Members_IsMember[m] }
pred unpaid[m: MemberId]    { Fines_Owed[m] > 0 }
pred onLoan[b: BookId]      { b in Library.lentTo.MemberId }
pred atLimit[m: MemberId]   { #Library.lentTo.m >= policy_maxBooks[m] }

pred Borrow_lent[m: MemberId, b: BookId] {
  not notMember[m] and not unpaid[m] and not onLoan[b] and not atLimit[m]
  Library.lentTo' = Library.lentTo ++ b -> m
  Library.dueOf'  = Library.dueOf  ++ b -> plus[Clock.today, policy_loanDays[m]]
  Fines.owed' = Fines.owed
}

fact traces {
  no Library.lentTo and no Library.dueOf and no Fines.owed
  always (Clock.today' >= Clock.today)
  always (stutter or (some m: MemberId, b: BookId | Borrow_lent[m, b] or Borrow_unpaid[m, b] or …) or …)
}

assert dueForEveryLoan { always Library.lentTo.MemberId in Library.dueOf.Int }
check dueForEveryLoan for 3 but 5 Int, 10 steps
run reachAtLimit { eventually some m: MemberId | atLimit[m] } for 3 but 5 Int, 12 steps
```

### 17.15. 0.3 から変わる決まり

- 文は略記になり、IR に残らない（0.3 では、条件の文がそのまま名前で、`does` や説明も IR にあった）。
- 意味は TypeScript の関数ではなく式。正解は IR の式を評価して作るので、正解は TypeScript に縛られない。
- 実装するエージェントは正解（式）を見る（0.3 では見せなかった）。読み違いは、解釈の段階（2 つの解釈、読み下し、具体例）で見つける。
- 場合は上から順（0.3 では同時に1つだけ）。
- `description:` の key は無くなり、説明は作り方の最初の引数になる。見出しの名前は `state`（0.3 の `data`）、`rules`（0.3 の
  `invariants`。時相の性質も含む）など。コマンドは型付きの引数を持つメソッドになり、状態は `this.` で読み書きする。
- `uses`、`parts`、まとまりの宣言（`commands({…})` など）、取っ手の変数は無くなる。名前は key と `is.名前` / `does.名前`。部品は使う所で
  そのまま呼び、中か外かは木の位置で決まる（0.3 の `parts` の宣言と `durable: Store` の「名前で渡す」も、これに置き換える）。
- `invariants` は無くなり、`rules` の `always(状態の述語)` になる。
- `queries` の意味が変わる（0.3: 外の世界への問い合わせ → 1.0: 自分の Query 側）。外の世界は `external(…)` の部品。
- 部品の中は見出しで区切り、見出しの中の key はすべて名前になる（0.3 の「種類は、席か項目のどちらか」は、部品は席（見出し）、
  見出しは項目、という形で保たれる）。
- 決定表は `Decision.x.of(state)` ではなく、関数のように呼ぶ。
- 形式言語の検査器のために Java が要る（`DISTRIBUTION.md` 決定 3'）。

### 17.16. 細部の決定（2026-10-22）

**型の重さ（試作で確かめた）。** 図書館の例を、見出し・型付きの引数のメソッド・`this` の型で書いた試作で、状態の名前の書き間違い
（`this.lentTto`。候補つき）と、`Map` のキーと値の取り違え（原子の型が違う）が型の誤りになり、コマンドの答えの型は `return` の
文字列の合併として推論された。型の検査は 0.009 秒、型は約 1,000 個で、重さは問題にならない。文だけの部品（`Members`）のコマンドは
型が中身を知らないので、どの名前でも通る。そこは読み込みの検査が守る。

**Alloy の整数とステップ数の既定。**

- 整数の幅: 仕様に書かれた定数と、そこから足し引きでできる値が収まる幅を、読み取りが決める（上限は 7 ビット、-64〜63）。
- 外の世界の大きな数（1970 年からの日数など）は、絶対値ではなく差だけが意味を持つので、Alloy の中では小さな数に置き換える。
  PBT は本物の大きさの数を使う。
- あふれは、Alloy の「あふれを禁止する」設定で検査し、あふれに当たる場合は「範囲の外」として報告する（仕様の誤りにはしない）。
- 原子は種類ごとに 3 個。性質の検査は 10 ステップ。狙った手順の生成は 1 から 12 ステップまで増やして最短を探す。
- どれも分析の設定（IR の外）で、`clp` の引数で変えられる。

**部品の同期（コマンドの中で、別の部品のコマンドを呼ぶ）。**

- 断ることは誤りではない。1.0 のコマンドは、どの場合でも「起きる」もので、断るのも答えの1つ。呼んだ側は答えを受け取って
  場合分けできる（`const r = Fines.Charge(…); if (r === "…") …`）。
- 呼ばれた側の変化と呼んだ側の変化は、1つの不可分なステップ（Alloy では同じステップの中、PBT では1つのコマンドの中）。
- 仕様の外は、メソッドの先頭の `requires(…)` で書く（0.3 の `from` / `onlyIf`）。外から呼ばれるときは、成り立たない入力を
  生成しない。部品から呼ばれたときに成り立っていなければ、仕様の誤り（呼ぶ側が確かめずに呼んだ）。Alloy の妥当性の検査と、
  シミュレーターが見つける。

```ts
Pay(member: MemberId) {
  requires(is.open("開館中", Clock.Today() % 7 !== 0));
  …
}
```

**具体例。**

- 手順は部品を呼ぶ形（`Members.Register("M001")`）。原子の値は文字列で書き、違う文字列は違う原子。
- 結果は、コマンドの答え（`expect(Library.Borrow("M001", "B1")).toBe("unpaid")`）か、問い合わせ（`expect(Library.LoansOf("M001")).toEqual(["B1"])`）
  で確かめる。状態は直接覗かない（Query 側を使う）。
- 外の世界の値は、手順の中で決める（`Clock.Today.returns(100)`）。

**文だけの部品が使う部品を、文の中で指す。** テンプレート文字列に部品を埋め込む。

```ts
export const Library = service(`図書館。本を貸し、返してもらう。延滞料は ${Fines} が計算し、会員かどうかは ${Members} に尋ねる。`);
```

import した値なので、無い部品は型の誤り。解釈は、埋め込まれた部品を使わなければならない（使わなければ、文の追跡の誤り）。
埋め込まれていない部品を解釈が使うこともでき、それは確認のときに人に見せる。

**0.3 の書き方からの移し方。**

- Layer 1 は、大部分を機械的に移す（まとまり → 見出し、取っ手 → 名前、`Decision.x.of(state)` → 呼び出し、`parts` → 呼び出しと
  木の位置、`from` / `onlyIf` → `requires`）。移す道具を作る。
- 解釈は移せない（0.3 の意味の関数は自由な TypeScript なので、式に変えるには読み直しが要る）。`clp interpret` で導き直す。
- 例（checkout、library、todo、todo-db）と self の 19 部品を、0.3 の N13 と同じく、1つずつ「移す → 導き直す → 作り直す」で
  進め、移し終えたら 0.3 の書き方を消す。

**`clp run` と、分け方の提案。** DSL の実装のあとに設計する。方向は決めてある（`ROADMAP.md` §4）: 1回の実行で進み、stdio で応答し、
補足の文は Layer 1 に書き足す。分け方の提案も疑問点と同じく人に見せ、受け入れれば Layer 1 に `components` か `${部品}` を書き足す。

### 17.17. 実装で確かめること

- 本体の読み取り（§17.5 の範囲）を、TypeScript の構文木から式に変換する規則の網羅。特に、`??`、`count` の述語、時相の書き方。
- 演算の表の Alloy 6 の列（§17.10）で、実際に Alloy 6.2 の CLI が受け付ける形になっているか。
- 外の世界の大きな数を小さな数に置き換える規則（差だけが意味を持つ、をどう見分けるか）。
- self の 19 部品の意味の関数が、すべて式で書けるか（「逃げ道を認めない」が成り立つか）。移すときに洗い出す。

### 17.18. 実装で決めたこと（2026-10-22）

実装 (`packages/core/v1.ts`、`packages/cli/src/v1/`) で、設計の段階では決めていなかったことを決めた。

**読み取り。**

- TypeScript 7 の構文の API は「unstable」で、別のプロセスとの通信越しにしか使えない。そこで、仕様が使う部分集合だけを読む構文解析器を
  自前で持つ (`v1/syntax.ts`)。部分集合の外（ループ、`let`、例外、`switch`、正規表現、`/`、`?.` …）は、その位置で誤りにする。型の検査
  （補完と軽い誤り）は、いままでどおり `tsc` が行う。
- 型は TypeScript の型で書く。原子は `type MemberId = Id<"会員番号">`（型の名前が原子の種類になる）。数はすべて整数 (`Int` は `number`
  の別名)。割り算は `Math.floor(a / b)`。文字列の長さは文字（コードポイント）の数。
- 状態の宣言は、型を先に書く形にした: `Map<K, V>()`、`Set<T>()`、`List<T>(…)`、`init<T>(初めの値)`。§17.4 の `Map(BookId, MemberId)` の
  形は、原子を値としても宣言することになるのでやめた。
- 外の世界の問い合わせは、戻り値の型を書いたアロー関数: `Today: (): Int => answer({ increasing: true })`。約束は `fresh` / `increasing` /
  `mayFail`。外の世界のコマンド（副作用）は、中身の無いメソッド: `Notify(member: MemberId) {}`。失敗は `failed(Ids.NewId())`。
- 本体の中の文だけの断片は 3 種類: `is.名前("文")`（条件。解釈は `conditions` で埋める）、`does.名前("文")`（起きること。`does` で埋める。
  `return does.名前("文")` なら、埋めた中身が答えも返す）、`value.名前("文")`（値。`calcs` で埋める）。名前だけの `is.名前()` /
  `value.名前()` は、見出しに名前を付けて置いた条件・計算を指す。
- 決定表・名前を付けた条件・計算を部品の本体から呼ぶと、その中身は呼んだ部品の場所で評価する（`this` は呼んだ部品の状態）。
- 設定（見出しではないキー）は `durable: true`（覚えていることが再起動を越えて残る）、`routes`（コマンドが HTTP でどう届くか）、`assets`
  の3つ。
- 1つの部品の中で、1つの場合に、同じ中の部品のコマンドを呼ぶのは1回まで（1つのステップで1つの部品に起きることは1つ）。中の部品の
  コマンドを呼んだあとで、その部品に問い合わせるのは、読み直しと同じ誤り。

**IR（版 8）の形。**

- 式の中の裸の文字列は、値ではない。文字列の定数は `["lit", "lent"]`、引数や `const` の名前は `["var", "member"]`、自分の状態は
  `["state", "lentTo"]`。数・真偽値・`null` は、そのまま。
- 場合（イベント）は、`return` を含む `if` で分かれる。`return` を含まない `if` は、場合を分けず、中身だけを条件つきにする（代入は
  `["ite", 条件, 新しい値, 前の値]`、呼び出しは `when`）。イベントの名前は、そこに至る `is.名前` の名前（`Borrow.unpaid`）、すべて
  打ち消しなら `otherwise`。
- 外から動かす口 (`entries`) は、根の部品のコマンドと、中の部品のコマンドのうち中のだれも呼ばないもの、そして、すべての部品の問い合わせ
  （問い合わせは状態を変えず、中の部品の状態を見る唯一の口なので、すべて観測できるようにする）。
- 観測するのは、コマンドと問い合わせの答えと、外の世界へのコマンド（順に）だけ。状態そのもの（0.3 の `getCurrentState`）は観測しない。
  契約は `executeCommand` / `executeQuery`、外の世界は `ports.<部品>.<口>`。
- 多数ある部品（0.3 の `many`）は、1.0 では部品にしない。`Map<Id, 組>` の状態で書く。

**解釈。**

- 解釈のファイルは、Layer 1 のファイルごとに1つ (`library.component.ts` → `library.interpretation.ts`)。そのファイルの、文を持つ部品の
  解釈を並べる。Layer 1 のハッシュは、部品ごとにファイルの先頭に書く (`// layer1 Library: sha256:…`)。ハッシュは、部品の宣言と、そこから
  名前でたどれる Layer 1 の宣言から作り、位置とコメントと決定表のセルの値を含まない。
- 文の追跡: 解釈が、Layer 1 の名前の無いコマンドや問い合わせを足したときは、その部品の説明の文（「。」などで区切ったもの）のすべてが、
  解釈の `trace` のどれかのキー（文の一部）を含まなければならない (`sentence-unused`)。値は、その文から作った名前。
- 解釈は、Layer 1 が見出しを書かなかった所に、新しい外の世界 (`external`) を宣言してよい（文で書かれた副作用の相手など）。
- 人の確認に使う読み下しは、`clp interpret` が出力する（Layer 1 の文と、その中身の式の読み下しを並べる）。実装するエージェントには、
  英語の読み下し (`<名前>.spec.md`) を IR と一緒に渡す。

**Alloy。**

- Alloy 6.2 の jar は、`CLP_ALLOY_JAR` で指定するか、初めて使うときに `~/.cache/clp/` へ取得する。結果は IR と分析の設定のハッシュで
  キャッシュする（同じ仕様なら、2回目からは Java を起動しない）。`CLP_ALLOY=off` で使わない（テスト用）。Java が無ければ誤り。
- 解く道具は、使えれば glucose（ネイティブ）、無ければ SAT4J。
- 分析の既定: 原子は種類ごとに 3 個、性質の検査は 6 ステップ、狙った手順の探索は 8 ステップまで。届かなかった場合だけ、原子 6 個・12 ステップ
  まで広げて探し直す（上限 5 冊は、本が 6 冊ないと届かない）。§17.16 の「10 ステップ」は、測ってみると1つの検査に数分かかったので縮めた。
- 整数の幅は、仕様の中のいちばん大きな定数と符号が入る幅（4〜7 ビット）。7 ビットに収まらない仕様、Alloy で書けないもの（並び、組、JSON、
  文字列の等しさ以外の操作、引数が2つ以上ある外の世界の問い合わせ）を含む部品は、Alloy では確かめず、「範囲の外」として知らせて PBT に任せる。
  外の世界の大きな数を小さな数に置き換えることは、1.0 ではしない。
- 確かめること: 性質（不変条件と時相の性質）、読む値が定義されていること（Map のキーがあること。`and` などの左から順の評価を考える）、
  中の部品を `requires` に合う引数で呼ぶこと、外から動かす口のすべての場合に届く手順があること。届く手順は、ランダムな手順の前に
  PBT で流す（具体例も同じ）。PBT が失敗した場合、同じ場合に届く、より短い手順が失敗すれば、それを反例にする。

**仕様のミューテーション（1.0 版）。** 決定表のセル、答えと外の世界へのコマンドに書かれた定数を1つずつ変え、狙った手順とランダムな手順
で仕様だけを動かして、観測が変わるかを見る。変わらなければ誤り（ほかのシードでだけ変われば注意）。図書館の例の「延長会員は 10 冊」は、
ここで止まった（11 冊借りる手順には、どちらの探索も届かない）。

**読み取りの細部（実装しながら決めた）。**

- `null` になりうる値は、TypeScript と同じく `if (x !== null) …`・`x !== null && …` で絞るか、`x!` で「ここでは null でない」と書く
  （IR は `nonNull`。そこで null なら仕様の誤り）。使われることの無い代わりの値 (`x ?? "…"`) は、変えても何も変わらない定数なので書かない。
- `as` は、JSON の値を型として読む (`entry.value as Todo`) ときと、文字列と識別子の間 (`key as TodoId`) だけに使える。
- 数の定数は、それを含む数の列挙に合う（答えの型 `{ status: 201 | 422 }` に `status: 422`）。文字列の定数と同じ扱い。
- `failed(…)` は、`mayFail: true` を約束した問い合わせの答えにだけ使える (`bad-failure`)。
- `requires` と場合の条件で状態の値が決まるとき (`this.status === "DESIGN"`)、同じ値を問う条件は、その場で畳み込む。いくつかのコマンドが
  共有する断片 (`does.rejected`) が状態で分かれても、それぞれのコマンドで通らない枝の値は IR に残らない（残ると、変えても何も変わらない
  値として、仕様のミューテーションに止められる）。
- 解釈の印（Layer 1 のハッシュ）は、部品の宣言だけでなく、同じファイルのほかの宣言（外の世界、型）も含む。解釈だけが使う外の世界の
  コマンドを Layer 1 から消したときにも、解釈は古くなる。

**検証（PBT）の細部。**

- 1手で選んだコマンドが範囲の外 (`requires`) なら、その手では、実行できるほかのコマンドに回す（0.3 の「実行できるコマンドから選ぶ」と
  同じ）。回さないと、深い状態（設計 → 配線 → 実装と進んだあと）に8手では届かず、そこにだけ現れる値が「確かめられない」と誤って報告された。
- 整数の引数は、`requires` の単純な不等式 (`amount >= 1 && amount <= 100`) から範囲を読み、その範囲で生成する（範囲の端も候補）。
- 経路の path に入る引数 (`/things/:id`) には、`"."` と `".."` を生成しない（URL の正規化で消え、HTTP では送れない）。
- 外の世界への問い合わせで、その手で仕様が同じ問い合わせを別の引数で尋ねたのに、実装が仕様の尋ねていない引数で尋ねたら、答えが合って
  いても落とす（本番コードが例外を握りつぶしても）。0.3 の `asks` の検査と同じ考え方で、尋ねないこと、順番、回数は見ない。
- 2つの解釈の比べ合いは、範囲外の手がほかのコマンドに回されたとき、実際に動いたコマンドの名前で比べる。
- 配線の段階の赤の検査は、反例が「未実装」でも、未実装に当たった試行をそこで打ち切る PBT をもう一度流し、ほかの失敗があれば
  アダプターの誤りとして差し戻す（反例は1つだけなので、アダプターの誤りが未実装の陰に隠れることがある）。
- 本番コードで壊してよい文字列は、決定表のセル、答え（コマンド・問い合わせ・それが答える計算）、外の世界へのコマンドの引数に書かれた定数。

**フレームワーク自身の部品（1.0 版、`packages/cli/self1/specs` → 切り替えで `self/`）。** 0.3 の 19 部品を 1.0 で書き直した。0.3 の部品が
判断していたことのうち、1.0 の読み取りと検査で判断することは、新しい部品にした（重ね合わせ・断片の埋め方・部分集合・型の当てはめ・
文の追跡・検査器の判定・使われ方）。0.3 にしかない判断の部品（木の検査、葉の検査、グラフの検査、名前の参照、値の置き場所、値の書き方）は、
1.0 の読み取りがその判断を持たないので、無くなった。

- `clp __agreement --specs <dir> --component <name>`: 自身の部品の**仕様**が、対になる Stage 0 と同じ判断をするかを、生成した多くの問いで
  確かめる（仕様を、そのまま実行するアダプターで動かす）。コードを作る前に、解釈の読み違いが Stage 0 との食い違いとして見つかる。
  確定した解釈は、どれもこれで一致を確かめた。REVIEW の問いと、2つの解釈の食い違いは、Stage 0 と一致する側を正しいとして確かめた。
- 採点の部品 (R1) の事例 (R3) は、1.0 の形 (`self/cases/<部品>.json`: `{ irVersion: 8, cases: [{ variant?, input }] }`)。問いの種類と入力
  だけを持ち、期待は Stage 0 が決める。`clp __cases` が両方の形を流す。
- `clp interpret` の進め方と `--accept` は、interpret-flow (Stage 1) で決め、使えなければ手書き (Stage 0)。確定は周回する（ほかの部品を
  使う部品は、その部品が確定してから合うことがある）。
