module spec

abstract sig Bool {}
one sig True, False extends Bool {}
sig Str {}
sig Json {}
one sig str_0, str_1, str_2, str_3, str_4, str_5, str_6 extends Str {}
one sig c_outcome_apply {}
one sig Env {}
abstract sig Entry {}
one sig Step { var event: lone Entry }
pred same_outcome_apply { some Bool }
fact initial_values { some Bool }
fact transitions { always ((same_outcome_apply and no Step.event)) }
run c0 { eventually (some p_external: Bool, p_guard: Str, p_touched: Bool | p_guard in (str_3 + str_2 + str_4) and (p_guard = str_4)) } for 3 but 4 Int, 10 Str, 1..8 steps
run c1 { eventually (some p_external: Bool, p_guard: Str, p_touched: Bool | p_guard in (str_3 + str_2 + str_4) and (not (p_guard = str_4)) and (p_external = True)) } for 3 but 4 Int, 10 Str, 1..8 steps
run c2 { eventually (some p_external: Bool, p_guard: Str, p_touched: Bool | p_guard in (str_3 + str_2 + str_4) and (not (p_guard = str_4)) and (not (p_external = True)) and (p_touched = True)) } for 3 but 4 Int, 10 Str, 1..8 steps
run c3 { eventually (some p_external: Bool, p_guard: Str, p_touched: Bool | p_guard in (str_3 + str_2 + str_4) and (not (p_guard = str_4)) and (not (p_external = True)) and (not (p_touched = True))) } for 3 but 4 Int, 10 Str, 1..8 steps
run sane { some Bool } for 3 but 4 Int, 10 Str, 1..8 steps
