module spec

abstract sig Bool {}
one sig True, False extends Bool {}
abstract sig Num {}
sig Str {}
sig Json {}
sig s_MemberId {}
abstract sig s_num0 extends Num {}
one sig s_num0_0, s_num0_1, s_num0_2 extends s_num0 {}
fun next_num0: s_num0 -> s_num0 { s_num0_0 -> s_num0_1 + s_num0_1 -> s_num0_2 }
abstract sig s_num1 extends Num {}
one sig s_num1_0 extends s_num1 {}
fun next_num1: s_num1 -> s_num1 { none -> none }
abstract sig s_num2 extends Num {}
one sig s_num2_0 extends s_num2 {}
fun next_num2: s_num2 -> s_num2 { none -> none }
fun op_num1_0: s_num0 -> s_num1 { s_num0_2 -> s_num1_0 }
fun op_num2_1: s_num2 -> s_num1 -> s_num2 { s_num2_0 -> s_num1_0 -> s_num2_0 }
one sig c_fines { var f_fines_owed: s_MemberId -> lone s_num2 }
one sig Env {}
abstract sig Entry {}
one sig k_fines_Charge, k_fines_Pay extends Entry {}
one sig Step { var event: lone Entry, var x_fines_Charge_member: lone s_MemberId, var x_fines_Charge_days: lone s_num0, var x_fines_Pay_member: lone s_MemberId }
pred same_fines { c_fines.f_fines_owed' = c_fines.f_fines_owed }
pred ev_fines_Charge_otherwise[p_member: s_MemberId, p_days: s_num0] {
  (some Bool)
  c_fines.f_fines_owed' = ((c_fines.f_fines_owed) ++ p_member -> ((p_days).(op_num1_0)).((((p_member in ((c_fines.f_fines_owed).univ)) => (p_member.(c_fines.f_fines_owed)) else s_num2_0)).(op_num2_1)))
}
pred cmd_fines_Charge[p_member: s_MemberId, p_days: s_num0] {
  (p_days in s_num0_1.^next_num0) and (ev_fines_Charge_otherwise[p_member, p_days])
}
pred ev_fines_Pay_otherwise[p_member: s_MemberId] {
  (some Bool)
  c_fines.f_fines_owed' = ((c_fines.f_fines_owed) - p_member -> univ)
}
pred cmd_fines_Pay[p_member: s_MemberId] {
  (ev_fines_Pay_otherwise[p_member])
}
fact initial_values { no c_fines.f_fines_owed }
fact transitions { always ((same_fines and no Step.event and no Step.x_fines_Charge_member and no Step.x_fines_Charge_days and no Step.x_fines_Pay_member)
  or (some p_member: s_MemberId, p_days: s_num0 | cmd_fines_Charge[p_member, p_days] and Step.event = k_fines_Charge and Step.x_fines_Charge_member = p_member and Step.x_fines_Charge_days = p_days and no Step.x_fines_Pay_member)
  or (some p_member: s_MemberId | cmd_fines_Pay[p_member] and Step.event = k_fines_Pay and Step.x_fines_Pay_member = p_member and no Step.x_fines_Charge_member and no Step.x_fines_Charge_days)) }
check c0 { always (all p_member: s_MemberId | (p_member in ((c_fines.f_fines_owed).univ)) implies (p_member in (c_fines.f_fines_owed).univ)) } for 3 but 4 Int, 3 Str, 6 steps
run c1 { eventually (some p_member: s_MemberId | (p_member in ((c_fines.f_fines_owed).univ))) } for 3 but 4 Int, 3 Str, 1..8 steps
run c2 { eventually (some p_member: s_MemberId | (not (p_member in ((c_fines.f_fines_owed).univ)))) } for 3 but 4 Int, 3 Str, 1..8 steps
check c3 { always (all p_member: s_MemberId, p_days: s_num0 | (p_days in s_num0_1.^next_num0) and (some Bool) and (p_member in ((c_fines.f_fines_owed).univ)) implies (p_member in (c_fines.f_fines_owed).univ)) } for 3 but 4 Int, 3 Str, 6 steps
run c4 { eventually (some p_member: s_MemberId, p_days: s_num0 | Step.event = k_fines_Charge and Step.x_fines_Charge_member = p_member and Step.x_fines_Charge_days = p_days and (p_days in s_num0_1.^next_num0) and (some Bool)) } for 3 but 4 Int, 3 Str, 1..8 steps
run c5 { eventually (some p_member: s_MemberId | Step.event = k_fines_Pay and Step.x_fines_Pay_member = p_member and (some Bool)) } for 3 but 4 Int, 3 Str, 1..8 steps
run sane { some Bool } for 3 but 4 Int, 3 Str, 1..8 steps
