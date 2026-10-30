module spec

abstract sig Bool {}
one sig True, False extends Bool {}
abstract sig Num {}
sig Str {}
sig Json {}
one sig str_0, str_1, str_2, str_3, str_4 extends Str {}
abstract sig s_num2 extends Num {}
one sig s_num2_0, s_num2_1, s_num2_2, s_num2_3, s_num2_4, s_num2_5, s_num2_6, s_num2_7, s_num2_8, s_num2_9, s_num2_10, s_num2_11, s_num2_12 extends s_num2 {}
fun next_num2: s_num2 -> s_num2 { s_num2_0 -> s_num2_1 + s_num2_1 -> s_num2_2 + s_num2_2 -> s_num2_3 + s_num2_3 -> s_num2_4 + s_num2_4 -> s_num2_5 + s_num2_5 -> s_num2_6 + s_num2_6 -> s_num2_7 + s_num2_7 -> s_num2_8 + s_num2_8 -> s_num2_9 + s_num2_9 -> s_num2_10 + s_num2_10 -> s_num2_11 + s_num2_11 -> s_num2_12 }
abstract sig s_num4 extends Num {}
one sig s_num4_0, s_num4_1, s_num4_2, s_num4_3 extends s_num4 {}
fun next_num4: s_num4 -> s_num4 { s_num4_0 -> s_num4_1 + s_num4_1 -> s_num4_2 + s_num4_2 -> s_num4_3 }
abstract sig s_num5 extends Num {}
one sig s_num5_0, s_num5_1, s_num5_2, s_num5_3, s_num5_4, s_num5_5, s_num5_6, s_num5_7, s_num5_8, s_num5_9, s_num5_10, s_num5_11, s_num5_12, s_num5_13 extends s_num5 {}
fun next_num5: s_num5 -> s_num5 { s_num5_0 -> s_num5_1 + s_num5_1 -> s_num5_2 + s_num5_2 -> s_num5_3 + s_num5_3 -> s_num5_4 + s_num5_4 -> s_num5_5 + s_num5_5 -> s_num5_6 + s_num5_6 -> s_num5_7 + s_num5_7 -> s_num5_8 + s_num5_8 -> s_num5_9 + s_num5_9 -> s_num5_10 + s_num5_10 -> s_num5_11 + s_num5_11 -> s_num5_12 + s_num5_12 -> s_num5_13 }
abstract sig s_num6 extends Num {}
one sig s_num6_0, s_num6_1, s_num6_2, s_num6_3, s_num6_4, s_num6_5, s_num6_6, s_num6_7 extends s_num6 {}
fun next_num6: s_num6 -> s_num6 { s_num6_0 -> s_num6_1 + s_num6_1 -> s_num6_2 + s_num6_2 -> s_num6_3 + s_num6_3 -> s_num6_4 + s_num6_4 -> s_num6_5 + s_num6_5 -> s_num6_6 + s_num6_6 -> s_num6_7 }
sig Slot_promise_keeper_used { var e_promise_keeper_used_v: lone (Json + Int + Str + Bool + Num) }
one sig c_promise_keeper { var f_promise_keeper_freshDrawn: lone (Json + Int + Str + Bool + Num), var f_promise_keeper_used: set Slot_promise_keeper_used }
one sig Env {}
abstract sig Entry {}
one sig k_promise_keeper_BeginFreshNumber, k_promise_keeper_BeginFreshText, k_promise_keeper_UsedNumber, k_promise_keeper_UsedText extends Entry {}
one sig Step { var event: lone Entry, var x_promise_keeper_BeginFreshNumber_drawn: lone s_num2, var x_promise_keeper_BeginFreshText_drawn: lone Str, var x_promise_keeper_UsedNumber_answered: lone s_num2, var x_promise_keeper_UsedText_answered: lone Str }
pred same_promise_keeper { c_promise_keeper.f_promise_keeper_freshDrawn' = c_promise_keeper.f_promise_keeper_freshDrawn and c_promise_keeper.f_promise_keeper_used' = c_promise_keeper.f_promise_keeper_used and (all s: Slot_promise_keeper_used | s.e_promise_keeper_used_v' = s.e_promise_keeper_used_v) }
pred ev_promise_keeper_BeginFreshNumber_otherwise[p_drawn: s_num2] {
  (some Bool)
  c_promise_keeper.f_promise_keeper_freshDrawn' = p_drawn
  no c_promise_keeper.f_promise_keeper_used' and (all s: Slot_promise_keeper_used | s.e_promise_keeper_used_v' = s.e_promise_keeper_used_v)
}
pred cmd_promise_keeper_BeginFreshNumber[p_drawn: s_num2] {
  ((p_drawn in s_num2_4.*next_num2) and (s_num2_8 in p_drawn.*next_num2)) and (ev_promise_keeper_BeginFreshNumber_otherwise[p_drawn])
}
pred ev_promise_keeper_BeginFreshText_otherwise[p_drawn: Str] {
  (some Bool)
  c_promise_keeper.f_promise_keeper_freshDrawn' = p_drawn
  no c_promise_keeper.f_promise_keeper_used' and (all s: Slot_promise_keeper_used | s.e_promise_keeper_used_v' = s.e_promise_keeper_used_v)
}
pred cmd_promise_keeper_BeginFreshText[p_drawn: Str] {
  (ev_promise_keeper_BeginFreshText_otherwise[p_drawn])
}
pred ev_promise_keeper_UsedNumber_otherwise[p_answered: s_num2] {
  (some Bool)
  c_promise_keeper.f_promise_keeper_freshDrawn' = c_promise_keeper.f_promise_keeper_freshDrawn
  (some n_0: Slot_promise_keeper_used - c_promise_keeper.f_promise_keeper_used | c_promise_keeper.f_promise_keeper_used' = c_promise_keeper.f_promise_keeper_used + n_0 and n_0.e_promise_keeper_used_v' = p_answered and (all s: Slot_promise_keeper_used - (n_0) | s.e_promise_keeper_used_v' = s.e_promise_keeper_used_v))
}
pred cmd_promise_keeper_UsedNumber[p_answered: s_num2] {
  (((not ((c_promise_keeper.f_promise_keeper_freshDrawn) = none)) and (p_answered in s_num2_4.*next_num2)) and (s_num2_8 in p_answered.*next_num2)) and (ev_promise_keeper_UsedNumber_otherwise[p_answered])
}
pred ev_promise_keeper_UsedText_otherwise[p_answered: Str] {
  (some Bool)
  c_promise_keeper.f_promise_keeper_freshDrawn' = c_promise_keeper.f_promise_keeper_freshDrawn
  (some n_0: Slot_promise_keeper_used - c_promise_keeper.f_promise_keeper_used | c_promise_keeper.f_promise_keeper_used' = c_promise_keeper.f_promise_keeper_used + n_0 and n_0.e_promise_keeper_used_v' = p_answered and (all s: Slot_promise_keeper_used - (n_0) | s.e_promise_keeper_used_v' = s.e_promise_keeper_used_v))
}
pred cmd_promise_keeper_UsedText[p_answered: Str] {
  (not ((c_promise_keeper.f_promise_keeper_freshDrawn) = none)) and (ev_promise_keeper_UsedText_otherwise[p_answered])
}
fact initial_values { c_promise_keeper.f_promise_keeper_freshDrawn = none and no c_promise_keeper.f_promise_keeper_used }
fact transitions { always ((same_promise_keeper and no Step.event and no Step.x_promise_keeper_BeginFreshNumber_drawn and no Step.x_promise_keeper_BeginFreshText_drawn and no Step.x_promise_keeper_UsedNumber_answered and no Step.x_promise_keeper_UsedText_answered)
  or (some p_drawn: s_num2 | cmd_promise_keeper_BeginFreshNumber[p_drawn] and Step.event = k_promise_keeper_BeginFreshNumber and Step.x_promise_keeper_BeginFreshNumber_drawn = p_drawn and no Step.x_promise_keeper_BeginFreshText_drawn and no Step.x_promise_keeper_UsedNumber_answered and no Step.x_promise_keeper_UsedText_answered)
  or (some p_drawn: Str | cmd_promise_keeper_BeginFreshText[p_drawn] and Step.event = k_promise_keeper_BeginFreshText and Step.x_promise_keeper_BeginFreshText_drawn = p_drawn and no Step.x_promise_keeper_BeginFreshNumber_drawn and no Step.x_promise_keeper_UsedNumber_answered and no Step.x_promise_keeper_UsedText_answered)
  or (some p_answered: s_num2 | cmd_promise_keeper_UsedNumber[p_answered] and Step.event = k_promise_keeper_UsedNumber and Step.x_promise_keeper_UsedNumber_answered = p_answered and no Step.x_promise_keeper_BeginFreshNumber_drawn and no Step.x_promise_keeper_BeginFreshText_drawn and no Step.x_promise_keeper_UsedText_answered)
  or (some p_answered: Str | cmd_promise_keeper_UsedText[p_answered] and Step.event = k_promise_keeper_UsedText and Step.x_promise_keeper_UsedText_answered = p_answered and no Step.x_promise_keeper_BeginFreshNumber_drawn and no Step.x_promise_keeper_BeginFreshText_drawn and no Step.x_promise_keeper_UsedNumber_answered)) }
run c0 { eventually (some p_drawn: s_num5, p_delta: s_num6 | ((some p_max: s_num5 | ((some p_previous: s_num4 | ((((p_drawn in s_num5_4.*next_num5) and (s_num5_9 in p_drawn.*next_num5)) and (p_delta in s_num6_2.*next_num6)) and (s_num6_5 in p_delta.*next_num6)) and (p_previous = none)) or (let p_previous = none | ((((p_drawn in s_num5_4.*next_num5) and (s_num5_9 in p_drawn.*next_num5)) and (p_delta in s_num6_2.*next_num6)) and (s_num6_5 in p_delta.*next_num6)) and (p_previous = none)))) or (let p_max = none | ((some p_previous: s_num4 | ((((p_drawn in s_num5_4.*next_num5) and (s_num5_9 in p_drawn.*next_num5)) and (p_delta in s_num6_2.*next_num6)) and (s_num6_5 in p_delta.*next_num6)) and (p_previous = none)) or (let p_previous = none | ((((p_drawn in s_num5_4.*next_num5) and (s_num5_9 in p_drawn.*next_num5)) and (p_delta in s_num6_2.*next_num6)) and (s_num6_5 in p_delta.*next_num6)) and (p_previous = none)))))) } for 3 but 4 Int, 8 Str, 1..8 steps
run c1 { eventually (some p_drawn: s_num5, p_delta: s_num6 | ((some p_max: s_num5 | ((some p_previous: s_num4 | ((((p_drawn in s_num5_4.*next_num5) and (s_num5_9 in p_drawn.*next_num5)) and (p_delta in s_num6_2.*next_num6)) and (s_num6_5 in p_delta.*next_num6)) and (not (p_previous = none)) and (p_max = none)) or (let p_previous = none | ((((p_drawn in s_num5_4.*next_num5) and (s_num5_9 in p_drawn.*next_num5)) and (p_delta in s_num6_2.*next_num6)) and (s_num6_5 in p_delta.*next_num6)) and (not (p_previous = none)) and (p_max = none)))) or (let p_max = none | ((some p_previous: s_num4 | ((((p_drawn in s_num5_4.*next_num5) and (s_num5_9 in p_drawn.*next_num5)) and (p_delta in s_num6_2.*next_num6)) and (s_num6_5 in p_delta.*next_num6)) and (not (p_previous = none)) and (p_max = none)) or (let p_previous = none | ((((p_drawn in s_num5_4.*next_num5) and (s_num5_9 in p_drawn.*next_num5)) and (p_delta in s_num6_2.*next_num6)) and (s_num6_5 in p_delta.*next_num6)) and (not (p_previous = none)) and (p_max = none)))))) } for 3 but 4 Int, 8 Str, 1..8 steps
run c2 { eventually (some p_drawn: s_num5, p_delta: s_num6 | ((some p_max: s_num5 | ((some p_previous: s_num4 | ((((p_drawn in s_num5_4.*next_num5) and (s_num5_9 in p_drawn.*next_num5)) and (p_delta in s_num6_2.*next_num6)) and (s_num6_5 in p_delta.*next_num6)) and (not (p_previous = none)) and (not (p_max = none))) or (let p_previous = none | ((((p_drawn in s_num5_4.*next_num5) and (s_num5_9 in p_drawn.*next_num5)) and (p_delta in s_num6_2.*next_num6)) and (s_num6_5 in p_delta.*next_num6)) and (not (p_previous = none)) and (not (p_max = none))))) or (let p_max = none | ((some p_previous: s_num4 | ((((p_drawn in s_num5_4.*next_num5) and (s_num5_9 in p_drawn.*next_num5)) and (p_delta in s_num6_2.*next_num6)) and (s_num6_5 in p_delta.*next_num6)) and (not (p_previous = none)) and (not (p_max = none))) or (let p_previous = none | ((((p_drawn in s_num5_4.*next_num5) and (s_num5_9 in p_drawn.*next_num5)) and (p_delta in s_num6_2.*next_num6)) and (s_num6_5 in p_delta.*next_num6)) and (not (p_previous = none)) and (not (p_max = none))))))) } for 3 but 4 Int, 8 Str, 1..8 steps
run c3 { eventually ((not ((c_promise_keeper.f_promise_keeper_freshDrawn) in (c_promise_keeper.f_promise_keeper_used)))) } for 3 but 4 Int, 8 Str, 1..8 steps
run c4 { eventually ((not (not ((c_promise_keeper.f_promise_keeper_freshDrawn) in (c_promise_keeper.f_promise_keeper_used))))) } for 3 but 4 Int, 8 Str, 1..8 steps
run c5 { eventually (some p_durable: Bool | (p_durable = True)) } for 3 but 4 Int, 8 Str, 1..8 steps
run c6 { eventually (some p_durable: Bool | (not (p_durable = True))) } for 3 but 4 Int, 8 Str, 1..8 steps
run c7 { eventually (some p_drawn: s_num2 | Step.event = k_promise_keeper_BeginFreshNumber and Step.x_promise_keeper_BeginFreshNumber_drawn = p_drawn and ((p_drawn in s_num2_4.*next_num2) and (s_num2_8 in p_drawn.*next_num2)) and (some Bool)) } for 3 but 4 Int, 8 Str, 1..8 steps
run c8 { eventually (some p_drawn: Str | Step.event = k_promise_keeper_BeginFreshText and Step.x_promise_keeper_BeginFreshText_drawn = p_drawn and (some Bool)) } for 3 but 4 Int, 8 Str, 1..8 steps
run c9 { eventually (some p_answered: s_num2 | Step.event = k_promise_keeper_UsedNumber and Step.x_promise_keeper_UsedNumber_answered = p_answered and (((not ((c_promise_keeper.f_promise_keeper_freshDrawn) = none)) and (p_answered in s_num2_4.*next_num2)) and (s_num2_8 in p_answered.*next_num2)) and (some Bool)) } for 3 but 4 Int, 8 Str, 1..8 steps
run c10 { eventually (some p_answered: Str | Step.event = k_promise_keeper_UsedText and Step.x_promise_keeper_UsedText_answered = p_answered and (not ((c_promise_keeper.f_promise_keeper_freshDrawn) = none)) and (some Bool)) } for 3 but 4 Int, 8 Str, 1..8 steps
run sane { some Bool } for 3 but 4 Int, 8 Str, 1..8 steps
