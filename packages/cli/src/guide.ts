// 設計方針: 依頼文に組み込む、実装者への指示。フレームワークが機械的に確かめる規則とは別物で、
// 従わなくても不合格にはならない。プロジェクトが独自の方針ファイルを渡せば、そちらが使われる。
// 仕様の中身（業務ルール）に触れる内容を書いてはいけない。仕様は IR が全て。エージェント向けなので英語。

export const DEFAULT_GUIDE = `- Design the production code as you would for a real system. Do not add anything that exists only for
  testing: no state injection, no reset methods, no test hooks.
- Describe each dependency in the production code's own terms (for example a clock, a payment gateway, a
  notifier), define its interface in production code, and receive it from outside (constructor or function
  parameters) rather than reaching for globals. This keeps every component testable in isolation.
- The names and shapes in the specification are not an API to copy. A query can become a method on a
  dependency that returns a richer value (a date rather than a "is it month-end" flag); a command can become
  a method call with plain arguments. Whoever connects the code to a test harness translates between the two.
- Keep business decisions in small pure functions, separate from the code that talks to dependencies.
`;
