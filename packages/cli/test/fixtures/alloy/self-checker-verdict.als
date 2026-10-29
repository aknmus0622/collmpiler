module spec

abstract sig Bool {}
one sig True, False extends Bool {}
sig Str {}
sig Json {}
one sig str_0, str_1, str_2, str_3, str_4, str_5, str_6, str_7, str_8, str_9, str_10, str_11, str_12, str_13, str_14, str_15 extends Str {}
one sig c_checker_verdict {}
one sig Env {}
abstract sig Entry {}
one sig Step { var event: lone Entry }
pred same_checker_verdict { some Bool }
fact initial_values { some Bool }
fact transitions { always ((same_checker_verdict and no Step.event)) }
run c0 { eventually (some p_kind: Str, p_status: Str | p_kind in (str_6 + str_1 + str_9 + str_7 + str_11) and p_status in (str_3 + str_0 + str_8 + str_13 + str_5 + str_11) and (((p_kind = str_11) or (p_status = str_11)) or (p_status = str_5))) } for 3 but 4 Int, 19 Str, 1..8 steps
run c1 { eventually (some p_kind: Str, p_status: Str | p_kind in (str_6 + str_1 + str_9 + str_7 + str_11) and p_status in (str_3 + str_0 + str_8 + str_13 + str_5 + str_11) and (not (((p_kind = str_11) or (p_status = str_11)) or (p_status = str_5))) and ((p_kind = str_7) and (p_status = str_13))) } for 3 but 4 Int, 19 Str, 1..8 steps
run c2 { eventually (some p_kind: Str, p_status: Str | p_kind in (str_6 + str_1 + str_9 + str_7 + str_11) and p_status in (str_3 + str_0 + str_8 + str_13 + str_5 + str_11) and (not (((p_kind = str_11) or (p_status = str_11)) or (p_status = str_5))) and (not ((p_kind = str_7) and (p_status = str_13))) and ((p_kind = str_6) and (p_status = str_0))) } for 3 but 4 Int, 19 Str, 1..8 steps
run c3 { eventually (some p_kind: Str, p_status: Str | p_kind in (str_6 + str_1 + str_9 + str_7 + str_11) and p_status in (str_3 + str_0 + str_8 + str_13 + str_5 + str_11) and (not (((p_kind = str_11) or (p_status = str_11)) or (p_status = str_5))) and (not ((p_kind = str_7) and (p_status = str_13))) and (not ((p_kind = str_6) and (p_status = str_0))) and ((p_kind = str_1) and (p_status = str_0))) } for 3 but 4 Int, 19 Str, 1..8 steps
run c4 { eventually (some p_kind: Str, p_status: Str | p_kind in (str_6 + str_1 + str_9 + str_7 + str_11) and p_status in (str_3 + str_0 + str_8 + str_13 + str_5 + str_11) and (not (((p_kind = str_11) or (p_status = str_11)) or (p_status = str_5))) and (not ((p_kind = str_7) and (p_status = str_13))) and (not ((p_kind = str_6) and (p_status = str_0))) and (not ((p_kind = str_1) and (p_status = str_0))) and ((p_kind = str_9) and (p_status = str_0))) } for 3 but 4 Int, 19 Str, 1..8 steps
run c5 { eventually (some p_kind: Str, p_status: Str | p_kind in (str_6 + str_1 + str_9 + str_7 + str_11) and p_status in (str_3 + str_0 + str_8 + str_13 + str_5 + str_11) and (not (((p_kind = str_11) or (p_status = str_11)) or (p_status = str_5))) and (not ((p_kind = str_7) and (p_status = str_13))) and (not ((p_kind = str_6) and (p_status = str_0))) and (not ((p_kind = str_1) and (p_status = str_0))) and (not ((p_kind = str_9) and (p_status = str_0)))) } for 3 but 4 Int, 19 Str, 1..8 steps
run sane { some Bool } for 3 but 4 Int, 19 Str, 1..8 steps
