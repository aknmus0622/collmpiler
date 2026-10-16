// 取っ手の型: 書き間違いは、エディタで型エラーになる（pnpm typecheck が確かめる。実行はしない）
import { by, commands, conditions, data, decisions, effects, input, many, otherwise, parts, queries, service, states } from "../index.ts";

const State = states(["DRAFT", "PAID"]);
const If = conditions({ paid: "The payment succeeded" });
const Data = data({ price: "integer" });
const Query = queries({ isMonthEnd: "boolean" });
const Effect = effects({ SendReceipt: input({ amount: "integer" }) });
const Place = input({ listPrice: "integer" });
const Decision = decisions({ campaign: [If.paid.then({ discount: 1 }), otherwise({ discount: 0 })] });

Data.price.set(Place.listPrice);
Effect.SendReceipt({ amount: Decision.campaign.discount });
If.paid.then({ goTo: State.PAID });
void Query.isMonthEnd;

// @ts-expect-error 状態の名前の書き間違い
void State.PAYED;
// @ts-expect-error 条件の名前の書き間違い
If.payd.then({});
// @ts-expect-error データの名前の書き間違い
Data.prise.set(1);
// @ts-expect-error 副作用の名前の書き間違い
Effect.SendReciept({ amount: 1 });
// @ts-expect-error 入力の名前の書き間違い
void Place.listPrise;
// @ts-expect-error 問い合わせの名前の書き間違い
void Query.isMonthEnds;
// @ts-expect-error 決定表の名前の書き間違い
void Decision.campain;

// 含む部品: コマンドの名前は、その部品の commands のまとまりから決まる
const AccountCommand = commands({ Deposit: { input: input({ amount: "integer" }) }, Balance: { output: "integer" } });
const Account = service({ uses: [AccountCommand] });
const Part = parts({ account: Account });
Part.account.Deposit({ amount: Place.listPrice });
void Part.account.Balance.answer;
// @ts-expect-error 含む部品のコマンドの名前の書き間違い
Part.account.Deposite({ amount: 1 });
// @ts-expect-error 含む部品の名前の書き間違い
void Part.acount;
// @ts-expect-error コマンドの取っ手の名前の書き間違い
AccountCommand.Deposite.with({});

// 多数ある部品: キーで選んでから呼ぶ
const Items = parts({ items: many(Account, by("id")) });
Items.items.at(Place.listPrice).Balance();
Items.items.add(Place.listPrice, {});
Items.items.remove(Place.listPrice);
// @ts-expect-error キーを選ばずには呼べない
Items.items.Balance();
// @ts-expect-error キーで選んだ先のコマンドの名前の書き間違い
Items.items.at(Place.listPrice).Balanse();
