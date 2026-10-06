// 依存ゼロの簡易トークナイザ。LLM が書いたコードの検査 (check.ts) と変異 (mutation.ts) に使う。
// 完全な JS パーサではない: 正規表現リテラルの開始は直前のトークンから推定する。

export type Token = {
  kind: "word" | "number" | "string" | "regex" | "punct";
  // string はエスケープを解いた値、それ以外はソース上の表記
  text: string;
  // ソース上の範囲 [start, end)
  start: number;
  end: number;
  // テンプレートリテラル由来の string（そのまま置換できない）
  template?: boolean;
};

const IDENTIFIER = /[\p{ID_Start}$_#][\p{ID_Continue}$\u200c\u200d]*/uy;
const NUMBER = /0[xXoObB][\da-fA-F_]+n?|(?:\d[\d_]*\.?[\d_]*|\.\d[\d_]*)(?:[eE][+-]?\d+)?n?/y;
const REGEX_AFTER_WORD = new Set(["return", "typeof", "case", "in", "of", "do", "else", "void", "delete", "throw", "new", "await", "yield"]);

function decode(inner: string): string {
  try {
    return JSON.parse(`"${inner.replace(/\\'/g, "'").replace(/(?<!\\)"/g, '\\"')}"`);
  } catch {
    return inner;
  }
}

export function scan(source: string, base = 0): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const push = (kind: Token["kind"], text: string, start: number, end: number, template?: boolean) =>
    tokens.push({ kind, text, start: base + start, end: base + end, ...(template ? { template } : {}) });

  const regexAllowed = () => {
    const prev = tokens.at(-1);
    if (!prev) return true;
    if (prev.kind === "punct") return !")]}".includes(prev.text);
    return prev.kind === "word" && REGEX_AFTER_WORD.has(prev.text);
  };

  while (i < source.length) {
    const ch = source[i];
    if (/\s/.test(ch)) {
      i++;
    } else if (source.startsWith("//", i)) {
      const end = source.indexOf("\n", i);
      i = end === -1 ? source.length : end;
    } else if (source.startsWith("/*", i)) {
      const end = source.indexOf("*/", i);
      i = end === -1 ? source.length : end + 2;
    } else if (ch === '"' || ch === "'") {
      let j = i + 1;
      while (j < source.length && source[j] !== ch) j += source[j] === "\\" ? 2 : 1;
      push("string", decode(source.slice(i + 1, j)), i, j + 1);
      i = j + 1;
    } else if (ch === "`") {
      // テンプレートリテラル: 文字列部分は string、${...} の中身は再帰的にトークン化する
      let j = i + 1;
      let text = "";
      while (j < source.length && source[j] !== "`") {
        if (source.startsWith("${", j)) {
          let depth = 1;
          let k = j + 2;
          while (k < source.length && depth > 0) {
            if (source[k] === "{") depth++;
            else if (source[k] === "}") depth--;
            k++;
          }
          tokens.push(...scan(source.slice(j + 2, k - 1), base + j + 2));
          j = k;
        } else {
          text += source[j] === "\\" ? source.slice(j, j + 2) : source[j];
          j += source[j] === "\\" ? 2 : 1;
        }
      }
      push("string", decode(text), i, j + 1, true);
      i = j + 1;
    } else if (ch === "/" && regexAllowed()) {
      let j = i + 1;
      let inClass = false;
      while (j < source.length && (inClass || source[j] !== "/") && source[j] !== "\n") {
        if (source[j] === "\\") j++;
        else if (source[j] === "[") inClass = true;
        else if (source[j] === "]") inClass = false;
        j++;
      }
      j++;
      while (/[a-z]/i.test(source[j] ?? "")) j++;
      push("regex", source.slice(i, j), i, j);
      i = j;
    } else {
      NUMBER.lastIndex = i;
      IDENTIFIER.lastIndex = i;
      const number = NUMBER.exec(source)?.[0];
      const word = number ? undefined : IDENTIFIER.exec(source)?.[0];
      const text = number ?? word ?? ch;
      push(number ? "number" : word ? "word" : "punct", text, i, i + text.length);
      i += text.length;
    }
  }
  return tokens;
}

export type Imports = { specifiers: string[]; dynamic: boolean };

const isSpecifier = (tokens: Token[], index: number) => {
  const prev = tokens[index - 1];
  const before = tokens[index - 2];
  return (
    prev?.kind === "word" &&
    (prev.text === "import" || prev.text === "from") &&
    !(before?.kind === "punct" && before.text === ".")
  );
};

// import / export ... from の指定子と、動的ロード (import() / require()) の有無
export function importsOf(tokens: Token[]): Imports {
  const specifiers: string[] = [];
  let dynamic = false;
  tokens.forEach((token, index) => {
    const prev = tokens[index - 1];
    const next = tokens[index + 1];
    if (token.kind === "string" && isSpecifier(tokens, index)) specifiers.push(token.text);
    if (token.kind !== "word" || (prev?.kind === "punct" && prev.text === ".")) return;
    if ((token.text === "import" || token.text === "require") && next?.kind === "punct" && next.text === "(") {
      dynamic = true;
    }
  });
  return { specifiers, dynamic };
}

// 実行時に意味を持つリテラル（import の指定子とテンプレートを除く）
export function literalsOf(tokens: Token[]): Token[] {
  return tokens.filter(
    (token, index) =>
      (token.kind === "number" ||
        (token.kind === "string" && !token.template && !isSpecifier(tokens, index)) ||
        (token.kind === "word" && (token.text === "true" || token.text === "false"))) &&
      !(token.kind === "word" && tokens[index - 1]?.kind === "punct" && tokens[index - 1].text === "."),
  );
}
