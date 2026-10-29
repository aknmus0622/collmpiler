module spec

abstract sig Bool {}
one sig True, False extends Bool {}
sig Str {}
one sig str_0, str_1, str_2, str_3, str_4, str_5, str_6 extends Str {}
one sig c_usage_check {}
one sig Env {}
abstract sig Entry {}
one sig Step { var event: lone Entry }
pred same_usage_check { some Bool }
fact initial_values { some Bool }
fact transitions { always ((same_usage_check and no Step.event)) }
run c0 { eventually (some p_kind: Str, p_read: Bool, p_written: Bool | p_kind in (str_6 + str_5 + str_0) and ((p_kind = str_6) and (not (p_read = True)))) } for 3 but 4 Int, 1..8 steps
run c1 { eventually (some p_kind: Str, p_read: Bool, p_written: Bool | p_kind in (str_6 + str_5 + str_0) and (not ((p_kind = str_6) and (not (p_read = True)))) and ((p_kind = str_5) and (not (p_read = True)))) } for 3 but 4 Int, 1..8 steps
run c2 { eventually (some p_kind: Str, p_read: Bool, p_written: Bool | p_kind in (str_6 + str_5 + str_0) and (not ((p_kind = str_6) and (not (p_read = True)))) and (not ((p_kind = str_5) and (not (p_read = True)))) and ((p_kind = str_0) and (not (p_written = True)))) } for 3 but 4 Int, 1..8 steps
run c3 { eventually (some p_kind: Str, p_read: Bool, p_written: Bool | p_kind in (str_6 + str_5 + str_0) and (not ((p_kind = str_6) and (not (p_read = True)))) and (not ((p_kind = str_5) and (not (p_read = True)))) and (not ((p_kind = str_0) and (not (p_written = True))))) } for 3 but 4 Int, 1..8 steps
