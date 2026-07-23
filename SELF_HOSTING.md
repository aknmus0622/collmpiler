## 1. AaC基盤における「セルフホスト」の定義

通常のコンパイラは「ソースコード → 機械語」を変換します。
本基盤（SpecForge）は、「TypeScriptの仕様（Layer 1/2） → Universal IR（Layer 1.5） → PBTテストコード（Layer 3）」を変換するコンパイラです。

したがって、この基盤をセルフホストするとは、「プラットフォーム自身の仕様（コンパイラの挙動、変換ルール、DFD生成ロジックなど）を、プラットフォーム自身のDSL（Layer 1/2）で記述し、自身で検証する」という状態を指します。

### セルフホストの構造

* **仕様（Spec）:** 「入力されたTSファイルをパースし、正しいIR JSONを出力する」という仕様を DMN や `defineBehaviors` で記述する。
* **実装（Target System）:** TypeScriptコンパイラAPIを用いた実際の基盤コード（`packages/compiler` 等）。
* **検証（PBT Engine）:** 自身が生成したPBTエンジンを用いて、「ランダムなTSファイルを入力したとき、出力されるIRが常に仕様と一致するか」を検証する。

---

## 2. 3段階コンパイル（トリプルテスト）のアーキテクチャ

自作基盤が「バグなくIRを出力できているか」を数学的に証明するために、コンパイラ開発の伝統である **Stage 0 → Stage 1 → Stage 2** の3段階ブートストラップ検証を組み込みます。

### 🥚 Stage 0: 既存ツールで作られた初期コンパイラ

一番最初は「鶏と卵」の問題があるため、手書きのTypeScriptや外部のテストフレームワーク（Jestなど）で作られた「不格好だがとりあえず動くコンパイラ（Stage 0）」を用意します。

### 🐣 Stage 1: セルフホストされたコンパイラ (第1世代)

Stage 0 コンパイラを使って、**「基盤自身の仕様書（.spec.ts）」** をコンパイルし、PBTテストコードと新しいコンパイラのバイナリ（JS）を生成します。
この新しく生まれたコンパイラが **Stage 1 コンパイラ** です。

* *検証:* Stage 1 コンパイラを使って自身のテストを回し、バグがないことを確認する。

### 🐔 Stage 2: 完璧性の証明 (第2世代とフィックスポイント)

ここがトリプルテストの真骨頂です。
**Stage 1 コンパイラ** を使って、**「全く同じ基盤の仕様書」** を再度コンパイルし、**Stage 2 コンパイラ** を生成します。

**【数学的証明（フィックスポイント）】**
もしコンパイラにバグがなく、決定論的に動作しているならば、**「Stage 1 コンパイラが吐き出したIR / テストコード」と「Stage 2 コンパイラが吐き出したIR / テストコード」は、1バイトの狂いもなく完全一致（Bit-perfect match）しなければなりません。**

```bash
# セルフホスト・トリプルテストのCIスクリプト例

# 1. Stage 0 (既存ツール) で Stage 1 をビルド
ts-node ./stage0-compiler.ts ./platform-specs/ -o ./stage1.js

# 2. Stage 1 で自分自身をビルド (Stage 2 を生成)
node ./stage1.js ./platform-specs/ -o ./stage2.js

# 3. フィックスポイント（不動点）の検証
diff ./stage1.js ./stage2.js
if [ $? -eq 0 ]; then
  echo "✅ セルフホスト証明成功: Stage 1 と Stage 2 は完全に一致しました"
else
  echo "❌ 証明失敗: コンパイル結果に揺らぎ（非決定性やバグ）が存在します"
  exit 1
fi

```

---

## 3. PBTによる「コンパイラのファジング」

トリプルテスト（Stage 1 == Stage 2）は「コンパイラが安定していること」を証明しますが、「仕様通りに正しく変換しているか」の証明にはPBTの力が不可欠です。

基盤自身の Layer 1 仕様に沿って、PBTエンジンが「無数のランダムな（しかし文法的に正しい）TypeScript 仕様ファイル」を自動生成し、セルフホストされたコンパイラに入力し続けます。

```typescript
// --- platform-specs/compiler.spec.ts (基盤自身の仕様) ---

export const behaviors = defineBehaviors({
  CompileToIR: {
    where: ["有効な TypeScript AST が入力された場合"],
    cases: {
      "ContainsMultipleBehaviors": (astState) => {
        const ir = applyDecision(ASTtoIRRules, astState);
        return astState.COMPILED({
          // 副作用としてIR JSONの出力を要求
          effects: [{ action: "WriteIRToFile", payload: { json: ir } }] 
        });
      }
    }
  }
});

```

PBTエンジンは、極端な多重度の記述や、巨大なDMNの入力など、人間が思いつかないエッジケースのソースコードを生成し、コンパイラがクラッシュせずに正しいIRを吐き出すかを検証します。
もしエラーになれば、前回設計した「Trace Visualizer」**と**「1-Clickリプレイ」が発動し、コンパイラのどのパース処理で落ちたのかをエンジニアが即座に特定できます。
