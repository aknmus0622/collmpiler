# DSL の設計（次の書き方）

仕様の書き方（Layer 1 と解釈）を見直した、設計の記録です。`ROADMAP.md` の M3 に当たります。

**ここに書いた書き方は、まだ実装されていません。** いま動く書き方は `SPEC.md` §3 にあります。
書き方は一通り決まりました。実装（`ROADMAP.md` の M4）で分かったことは、ここに戻して直します。

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
  | 説明は、別の表（`descriptions: { "queries.isMonthEnd": ... }`） | それぞれの節の `description` |
  | （無い） | `parts`（含む部品。子の IR を、そのまま入れ子にする）、問い合わせの約束、データの `initially` |

* **変更は1回にまとめる。** IR の版を1つ上げ（5 → 6）、上の変更をまとめて入れる。

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

## 13. 実装で先に確かめること

* **木の検査の土台。** 文法の表をデータとして持ち、節に位置を記録して、診断を出す。これを最初に作る
  （型の検査を軽くするので、その代わりが先に要る）。
* **型をどこまで残すか。** 補完が効くこと、`{}` のキーと `ref.*` の名前の誤りが分かること、を目安にする。
* **語の最終確認。** `emits`、`responds`、`onlyWhen`、`adds`、`removes`、`forwards`、`initially`、`among` は、
  実際に例を書き直してみて、読みにくければ変える。
