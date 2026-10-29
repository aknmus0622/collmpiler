module spec

abstract sig Bool {}
one sig True, False extends Bool {}
sig Str {}
sig Json {}
one sig str_0, str_1, str_2, str_3, str_4, str_5, str_6, str_7, str_8, str_9, str_10, str_11, str_12, str_13, str_14, str_15, str_16, str_17, str_18, str_19, str_20, str_21, str_22, str_23, str_24, str_25, str_26, str_27, str_28, str_29, str_30, str_31, str_32, str_33, str_34, str_35 extends Str {}
abstract sig s_num0 {}
one sig s_num0_0, s_num0_1, s_num0_2, s_num0_3, s_num0_4, s_num0_5 extends s_num0 {}
fun next_num0: s_num0 -> s_num0 { s_num0_0 -> s_num0_1 + s_num0_1 -> s_num0_2 + s_num0_2 -> s_num0_3 + s_num0_3 -> s_num0_4 + s_num0_4 -> s_num0_5 }
abstract sig s_num1 {}
one sig s_num1_0, s_num1_1, s_num1_2, s_num1_3, s_num1_4, s_num1_5 extends s_num1 {}
fun next_num1: s_num1 -> s_num1 { s_num1_0 -> s_num1_1 + s_num1_1 -> s_num1_2 + s_num1_2 -> s_num1_3 + s_num1_3 -> s_num1_4 + s_num1_4 -> s_num1_5 }
abstract sig s_num2 {}
one sig s_num2_0, s_num2_1, s_num2_2, s_num2_3, s_num2_4, s_num2_5 extends s_num2 {}
fun next_num2: s_num2 -> s_num2 { s_num2_0 -> s_num2_1 + s_num2_1 -> s_num2_2 + s_num2_2 -> s_num2_3 + s_num2_3 -> s_num2_4 + s_num2_4 -> s_num2_5 }
abstract sig s_num3 {}
one sig s_num3_0, s_num3_1, s_num3_2, s_num3_3, s_num3_4, s_num3_5 extends s_num3 {}
fun next_num3: s_num3 -> s_num3 { s_num3_0 -> s_num3_1 + s_num3_1 -> s_num3_2 + s_num3_2 -> s_num3_3 + s_num3_3 -> s_num3_4 + s_num3_4 -> s_num3_5 }
one sig c_text_plan {}
one sig Env {}
abstract sig Entry {}
one sig Step { var event: lone Entry }
pred same_text_plan { some Bool }
fact initial_values { some Bool }
fact transitions { always ((same_text_plan and no Step.event)) }
run c0 { eventually (some p_promise: Str, p_mayFail: Bool | p_promise in (str_26 + str_18 + str_19) and (p_promise = str_18) and (p_mayFail = True)) } for 3 but 4 Int, 39 Str, 1..8 steps
run c1 { eventually (some p_promise: Str, p_mayFail: Bool | p_promise in (str_26 + str_18 + str_19) and (p_promise = str_18) and (not (p_mayFail = True))) } for 3 but 4 Int, 39 Str, 1..8 steps
run c2 { eventually (some p_promise: Str, p_mayFail: Bool | p_promise in (str_26 + str_18 + str_19) and (not (p_promise = str_18)) and (p_promise = str_19) and (p_mayFail = True)) } for 3 but 4 Int, 39 Str, 1..8 steps
run c3 { eventually (some p_promise: Str, p_mayFail: Bool | p_promise in (str_26 + str_18 + str_19) and (not (p_promise = str_18)) and (p_promise = str_19) and (not (p_mayFail = True))) } for 3 but 4 Int, 39 Str, 1..8 steps
run c4 { eventually (some p_promise: Str, p_mayFail: Bool | p_promise in (str_26 + str_18 + str_19) and (not (p_promise = str_18)) and (not (p_promise = str_19)) and (p_mayFail = True)) } for 3 but 4 Int, 39 Str, 1..8 steps
run c5 { eventually (some p_promise: Str, p_mayFail: Bool | p_promise in (str_26 + str_18 + str_19) and (not (p_promise = str_18)) and (not (p_promise = str_19)) and (not (p_mayFail = True))) } for 3 but 4 Int, 39 Str, 1..8 steps
run sane { some Bool } for 3 but 4 Int, 39 Str, 1..8 steps
