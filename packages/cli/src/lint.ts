// case 本体の構文制限（ホワイトリスト方式）。
// 記録用 Proxy は `===`・真偽判定・`??` などを捕捉できず、誤った IR を無警告で出してしまう。
// そこで case に書ける構文を「表の適用結果を遷移にマッピングする」のに必要な最小限に絞り、
// 分岐と演算は DMN (DecisionTable) 側に寄せさせる。
//
// 入力は Function.prototype.toString() の結果（型は Node が空白に置換済みの素の JS）。
// 許可するトークン以外を全て弾くので、完全な JS パーサは要らない。

const ALLOWED_KEYWORDS = new Set(["const", "return", "true", "false", "null"]);

const RESERVED = new Set([
  "async", "await", "break", "case", "catch", "class", "continue", "debugger", "default", "delete",
  "do", "else", "enum", "export", "extends", "finally", "for", "function", "if", "import", "in",
  "instanceof", "let", "new", "of", "super", "switch", "this", "throw", "try", "typeof", "var",
  "void", "while", "with", "yield",
]);

const OPEN = "({[";
const CLOSE = ")}]";
const IDENTIFIER = /[\p{ID_Start}$_][\p{ID_Continue}$‌‍]*/uy;
const NUMBER = /\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
const OPERATOR = /[!%&*+\-/<=>?^|~]+/y;

export type LintViolation = { token: string; line: number; reason: string };

export function lintCase(source: string): LintViolation | undefined {
  const stack: string[] = [];
  let i = 0;
  let first = true;

  const violation = (token: string, reason: string): LintViolation => ({
    token,
    line: source.slice(0, i).split("\n").length,
    reason,
  });
  const matchAt = (pattern: RegExp): string | undefined => {
    pattern.lastIndex = i;
    return pattern.exec(source)?.[0];
  };

  while (i < source.length) {
    const ch = source[i];

    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (source.startsWith("//", i)) {
      const end = source.indexOf("\n", i);
      i = end === -1 ? source.length : end;
      continue;
    }
    if (source.startsWith("/*", i)) {
      const end = source.indexOf("*/", i);
      i = end === -1 ? source.length : end + 2;
      continue;
    }

    if (ch === '"' || ch === "'" || ch === "`") {
      let j = i + 1;
      while (j < source.length && source[j] !== ch) {
        if (ch === "`" && source.startsWith("${", j)) {
          return violation("${", "テンプレートリテラルへの埋め込みは文字列連結にあたる");
        }
        j += source[j] === "\\" ? 2 : 1;
      }
      i = j + 1;
      first = false;
      continue;
    }

    const number = matchAt(NUMBER);
    if (number) {
      i += number.length;
      continue;
    }

    const word = matchAt(IDENTIFIER);
    if (word) {
      // `function (state) { ... }` 形式の先頭だけは許す
      if (RESERVED.has(word) && !(first && word === "function")) {
        return violation(word, "case 本体では使えないキーワード");
      }
      i += word.length;
      first = false;
      continue;
    }
    first = false;

    if (source.startsWith("...", i)) {
      i += 3;
      continue;
    }
    if (source.startsWith("=>", i)) {
      i += 2;
      continue;
    }
    if (OPEN.includes(ch)) {
      stack.push(ch);
      i++;
      continue;
    }
    if (CLOSE.includes(ch)) {
      stack.pop();
      i++;
      continue;
    }
    if (".,:;".includes(ch)) {
      i++;
      continue;
    }
    if (ch === "=" && source[i + 1] !== "=") {
      // 許すのは本体ブロック直下の `const x = ...` だけ。
      // 引数や分割代入の既定値 (`{ a = 1 }`) は `??` と同じく無警告でフォールバックを失う
      if (stack.length === 1 && stack[0] === "{") {
        i++;
        continue;
      }
      return violation("=", "既定値・再代入は使えない (本体直下の const 宣言のみ可)");
    }

    return violation(matchAt(OPERATOR) ?? ch, "case 本体では演算子を使えない");
  }
  return undefined;
}
