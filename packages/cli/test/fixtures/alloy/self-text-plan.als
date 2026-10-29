module spec

abstract sig Bool {}
one sig True, False extends Bool {}
sig Str {}
one sig str_0, str_1, str_2, str_3, str_4, str_5, str_6, str_7, str_8, str_9, str_10, str_11, str_12, str_13, str_14, str_15, str_16, str_17, str_18, str_19, str_20, str_21, str_22, str_23, str_24, str_25, str_26, str_27, str_28, str_29, str_30, str_31, str_32, str_33, str_34, str_35 extends Str {}
one sig c_text_plan {}
one sig Env {}
abstract sig Entry {}
one sig Step { var event: lone Entry }
pred same_text_plan { some Bool }
fact initial_values { some Bool }
fact transitions { always ((same_text_plan and no Step.event)) }
run c0 { eventually (some p_promise: Str, p_mayFail: Bool | p_promise in (str_26 + str_18 + str_19) and (p_promise = str_18) and (p_mayFail = True)) } for 3 but 4 Int, 1..8 steps
run c1 { eventually (some p_promise: Str, p_mayFail: Bool | p_promise in (str_26 + str_18 + str_19) and (p_promise = str_18) and (not (p_mayFail = True))) } for 3 but 4 Int, 1..8 steps
run c2 { eventually (some p_promise: Str, p_mayFail: Bool | p_promise in (str_26 + str_18 + str_19) and (not (p_promise = str_18)) and (p_promise = str_19) and (p_mayFail = True)) } for 3 but 4 Int, 1..8 steps
run c3 { eventually (some p_promise: Str, p_mayFail: Bool | p_promise in (str_26 + str_18 + str_19) and (not (p_promise = str_18)) and (p_promise = str_19) and (not (p_mayFail = True))) } for 3 but 4 Int, 1..8 steps
run c4 { eventually (some p_promise: Str, p_mayFail: Bool | p_promise in (str_26 + str_18 + str_19) and (not (p_promise = str_18)) and (not (p_promise = str_19)) and (p_mayFail = True)) } for 3 but 4 Int, 1..8 steps
run c5 { eventually (some p_promise: Str, p_mayFail: Bool | p_promise in (str_26 + str_18 + str_19) and (not (p_promise = str_18)) and (not (p_promise = str_19)) and (not (p_mayFail = True))) } for 3 but 4 Int, 1..8 steps
