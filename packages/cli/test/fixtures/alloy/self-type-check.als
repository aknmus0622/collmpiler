module spec

abstract sig Bool {}
one sig True, False extends Bool {}
sig Str {}
one sig str_0, str_1, str_2, str_3, str_4, str_5, str_6 extends Str {}
one sig c_type_check {}
one sig Env {}
abstract sig Entry {}
one sig Step { var event: lone Entry }
pred same_type_check { some Bool }
fact initial_values { some Bool }
fact transitions { always ((same_type_check and no Step.event)) }
run c0 { eventually (some p_fresh: Bool, p_increasing: Bool, p_integer: Bool, p_hasParams: Bool | ((p_hasParams = True) and ((p_fresh = True) or (p_increasing = True)))) } for 3 but 4 Int, 1..8 steps
run c1 { eventually (some p_fresh: Bool, p_increasing: Bool, p_integer: Bool, p_hasParams: Bool | (not ((p_hasParams = True) and ((p_fresh = True) or (p_increasing = True)))) and ((p_increasing = True) and (not (p_integer = True)))) } for 3 but 4 Int, 1..8 steps
run c2 { eventually (some p_fresh: Bool, p_increasing: Bool, p_integer: Bool, p_hasParams: Bool | (not ((p_hasParams = True) and ((p_fresh = True) or (p_increasing = True)))) and (not ((p_increasing = True) and (not (p_integer = True)))) and ((p_fresh = True) and (p_increasing = True))) } for 3 but 4 Int, 1..8 steps
run c3 { eventually (some p_fresh: Bool, p_increasing: Bool, p_integer: Bool, p_hasParams: Bool | (not ((p_hasParams = True) and ((p_fresh = True) or (p_increasing = True)))) and (not ((p_increasing = True) and (not (p_integer = True)))) and (not ((p_fresh = True) and (p_increasing = True)))) } for 3 but 4 Int, 1..8 steps
run c4 { eventually (some p_last: Bool, p_otherwise: Bool, p_constantCells: Bool, p_sameColumns: Bool | (p_sameColumns = True) and (p_constantCells = True) and ((p_last = True) and (not (p_otherwise = True)))) } for 3 but 4 Int, 1..8 steps
run c5 { eventually (some p_last: Bool, p_otherwise: Bool, p_constantCells: Bool, p_sameColumns: Bool | (p_sameColumns = True) and (p_constantCells = True) and (not ((p_last = True) and (not (p_otherwise = True)))) and ((p_otherwise = True) and (not (p_last = True)))) } for 3 but 4 Int, 1..8 steps
run c6 { eventually (some p_last: Bool, p_otherwise: Bool, p_constantCells: Bool, p_sameColumns: Bool | (p_sameColumns = True) and (p_constantCells = True) and (not ((p_last = True) and (not (p_otherwise = True)))) and (not ((p_otherwise = True) and (not (p_last = True))))) } for 3 but 4 Int, 1..8 steps
run c7 { eventually (some p_last: Bool, p_otherwise: Bool, p_constantCells: Bool, p_sameColumns: Bool | (p_sameColumns = True) and (not (p_constantCells = True))) } for 3 but 4 Int, 1..8 steps
run c8 { eventually (some p_last: Bool, p_otherwise: Bool, p_constantCells: Bool, p_sameColumns: Bool | (not (p_sameColumns = True))) } for 3 but 4 Int, 1..8 steps
