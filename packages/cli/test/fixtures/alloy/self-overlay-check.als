module spec

abstract sig Bool {}
one sig True, False extends Bool {}
sig Str {}
one sig str_0, str_1, str_2, str_3, str_4, str_5, str_6, str_7, str_8, str_9, str_10 extends Str {}
one sig c_overlay_check {}
one sig Env {}
abstract sig Entry {}
one sig Step { var event: lone Entry }
pred same_overlay_check { some Bool }
fact initial_values { some Bool }
fact transitions { always ((same_overlay_check and no Step.event)) }
run c0 { eventually (some p_existing: Str, p_sameHeading: Bool, p_closedHeading: Bool, p_layer1Only: Bool | p_existing in (str_6 + str_8 + str_2 + str_4) and (not (p_existing = str_6)) and (not (p_sameHeading = True))) } for 3 but 4 Int, 1..8 steps
run c1 { eventually (some p_existing: Str, p_sameHeading: Bool, p_closedHeading: Bool, p_layer1Only: Bool | p_existing in (str_6 + str_8 + str_2 + str_4) and (not (p_existing = str_6)) and (not (not (p_sameHeading = True))) and (p_existing = str_4)) } for 3 but 4 Int, 1..8 steps
run c2 { eventually (some p_existing: Str, p_sameHeading: Bool, p_closedHeading: Bool, p_layer1Only: Bool | p_existing in (str_6 + str_8 + str_2 + str_4) and (not (p_existing = str_6)) and (not (not (p_sameHeading = True))) and (not (p_existing = str_4)) and (p_existing = str_2)) } for 3 but 4 Int, 1..8 steps
run c3 { eventually (some p_existing: Str, p_sameHeading: Bool, p_closedHeading: Bool, p_layer1Only: Bool | p_existing in (str_6 + str_8 + str_2 + str_4) and (not (p_existing = str_6)) and (not (not (p_sameHeading = True))) and (not (p_existing = str_4)) and (not (p_existing = str_2))) } for 3 but 4 Int, 1..8 steps
run c4 { eventually (some p_existing: Str, p_sameHeading: Bool, p_closedHeading: Bool, p_layer1Only: Bool | p_existing in (str_6 + str_8 + str_2 + str_4) and (not (not (p_existing = str_6))) and (p_closedHeading = True)) } for 3 but 4 Int, 1..8 steps
run c5 { eventually (some p_existing: Str, p_sameHeading: Bool, p_closedHeading: Bool, p_layer1Only: Bool | p_existing in (str_6 + str_8 + str_2 + str_4) and (not (not (p_existing = str_6))) and (not (p_closedHeading = True)) and (p_layer1Only = True)) } for 3 but 4 Int, 1..8 steps
run c6 { eventually (some p_existing: Str, p_sameHeading: Bool, p_closedHeading: Bool, p_layer1Only: Bool | p_existing in (str_6 + str_8 + str_2 + str_4) and (not (not (p_existing = str_6))) and (not (p_closedHeading = True)) and (not (p_layer1Only = True))) } for 3 but 4 Int, 1..8 steps
