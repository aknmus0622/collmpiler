module spec

abstract sig Bool {}
one sig True, False extends Bool {}
sig Str {}
one sig str_0, str_1, str_2, str_3, str_4 extends Str {}
one sig c_promise_keeper {}
one sig Env {}
abstract sig Entry {}
one sig k_promise_keeper_BeginFreshNumber, k_promise_keeper_BeginFreshText, k_promise_keeper_UsedNumber, k_promise_keeper_UsedText extends Entry {}
one sig Step { var event: lone Entry, var x_promise_keeper_BeginFreshNumber_drawn: lone Int, var x_promise_keeper_BeginFreshText_drawn: lone Str, var x_promise_keeper_UsedNumber_answered: lone Int, var x_promise_keeper_UsedText_answered: lone Str }
pred same_promise_keeper { some Bool }
pred ev_promise_keeper_BeginFreshNumber_otherwise[p_drawn: Int] {
  (some Bool)
}
pred cmd_promise_keeper_BeginFreshNumber[p_drawn: Int] {
  ((p_drawn >= minus[0, 2]) and (p_drawn <= 0)) and (ev_promise_keeper_BeginFreshNumber_otherwise[p_drawn])
}
pred ev_promise_keeper_BeginFreshText_otherwise[p_drawn: Str] {
  (some Bool)
}
pred cmd_promise_keeper_BeginFreshText[p_drawn: Str] {
  (ev_promise_keeper_BeginFreshText_otherwise[p_drawn])
}
pred ev_promise_keeper_UsedNumber_otherwise[p_answered: Int] {
  (some Bool)
}
pred cmd_promise_keeper_UsedNumber[p_answered: Int] {
  (no Bool)
}
pred ev_promise_keeper_UsedText_otherwise[p_answered: Str] {
  (some Bool)
}
pred cmd_promise_keeper_UsedText[p_answered: Str] {
  (no Bool)
}
fact initial_values { some Bool }
fact transitions { always ((same_promise_keeper and no Step.event and no Step.x_promise_keeper_BeginFreshNumber_drawn and no Step.x_promise_keeper_BeginFreshText_drawn and no Step.x_promise_keeper_UsedNumber_answered and no Step.x_promise_keeper_UsedText_answered)
  or (some p_drawn: Int | cmd_promise_keeper_BeginFreshNumber[p_drawn] and Step.event = k_promise_keeper_BeginFreshNumber and Step.x_promise_keeper_BeginFreshNumber_drawn = p_drawn and no Step.x_promise_keeper_BeginFreshText_drawn and no Step.x_promise_keeper_UsedNumber_answered and no Step.x_promise_keeper_UsedText_answered)
  or (some p_drawn: Str | cmd_promise_keeper_BeginFreshText[p_drawn] and Step.event = k_promise_keeper_BeginFreshText and Step.x_promise_keeper_BeginFreshText_drawn = p_drawn and no Step.x_promise_keeper_BeginFreshNumber_drawn and no Step.x_promise_keeper_UsedNumber_answered and no Step.x_promise_keeper_UsedText_answered)
  or (some p_answered: Int | cmd_promise_keeper_UsedNumber[p_answered] and Step.event = k_promise_keeper_UsedNumber and Step.x_promise_keeper_UsedNumber_answered = p_answered and no Step.x_promise_keeper_BeginFreshNumber_drawn and no Step.x_promise_keeper_BeginFreshText_drawn and no Step.x_promise_keeper_UsedText_answered)
  or (some p_answered: Str | cmd_promise_keeper_UsedText[p_answered] and Step.event = k_promise_keeper_UsedText and Step.x_promise_keeper_UsedText_answered = p_answered and no Step.x_promise_keeper_BeginFreshNumber_drawn and no Step.x_promise_keeper_BeginFreshText_drawn and no Step.x_promise_keeper_UsedNumber_answered)) }
run c0 { eventually (some p_drawn: Int, p_previous: lone Int, p_delta: Int, p_max: lone Int | ((((p_drawn >= minus[0, 4]) and (p_drawn <= 4)) and (p_delta >= minus[0, 2])) and (p_delta <= 2)) and (p_previous = none)) } for 3 but 4 Int, 1..8 steps
run c1 { eventually (some p_drawn: Int, p_previous: lone Int, p_delta: Int, p_max: lone Int | ((((p_drawn >= minus[0, 4]) and (p_drawn <= 4)) and (p_delta >= minus[0, 2])) and (p_delta <= 2)) and (not (p_previous = none)) and (p_max = none)) } for 3 but 4 Int, 1..8 steps
run c2 { eventually (some p_drawn: Int, p_previous: lone Int, p_delta: Int, p_max: lone Int | ((((p_drawn >= minus[0, 4]) and (p_drawn <= 4)) and (p_delta >= minus[0, 2])) and (p_delta <= 2)) and (not (p_previous = none)) and (not (p_max = none))) } for 3 but 4 Int, 1..8 steps
run c3 { eventually (some p_durable: Bool | (p_durable = True)) } for 3 but 4 Int, 1..8 steps
run c4 { eventually (some p_durable: Bool | (not (p_durable = True))) } for 3 but 4 Int, 1..8 steps
run c5 { eventually (some p_drawn: Int | Step.event = k_promise_keeper_BeginFreshNumber and Step.x_promise_keeper_BeginFreshNumber_drawn = p_drawn and ((p_drawn >= minus[0, 2]) and (p_drawn <= 0)) and (some Bool)) } for 3 but 4 Int, 1..8 steps
run c6 { eventually (some p_drawn: Str | Step.event = k_promise_keeper_BeginFreshText and Step.x_promise_keeper_BeginFreshText_drawn = p_drawn and (some Bool)) } for 3 but 4 Int, 1..8 steps
