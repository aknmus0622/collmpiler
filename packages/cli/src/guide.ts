// 設計方針: 依頼文に組み込む、実装者への指示。フレームワークが機械的に確かめる規則とは別物で、
// 従わなくても不合格にはならない。プロジェクトが独自の方針ファイルを渡せば、そちらが使われる。
// 仕様の中身（業務ルール）に触れる内容を書いてはいけない。仕様は IR が全て。エージェント向けなので英語。

export const DEFAULT_GUIDE = `- Design the production code as you would for a real system. The test harness must not shape it: do not copy
  the structure or the names of \`Ports\` into production code, and do not add anything that exists only for
  testing (no state injection, no reset methods, no test hooks).
- Describe each dependency in the production code's own terms (for example a clock, a payment gateway, a
  notifier), define its interface in production code, and receive it from outside (constructor or function
  parameters) rather than reaching for globals. This keeps every component testable in isolation.
- Keep business decisions in small pure functions, separate from the code that talks to dependencies.
- The adapter is where the two vocabularies meet. Translate there between \`Ports\` and the interfaces your
  production code defines; if production code needs a value in a different form (a date instead of a flag,
  an event instead of a call), derive it in the adapter.
`;
