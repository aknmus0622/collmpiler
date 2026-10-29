module spec

abstract sig Bool {}
one sig True, False extends Bool {}
sig Str {}
sig s_MemberId {}
one sig c_fines { var f_fines_owed: s_MemberId -> lone Int }
one sig Env {}
abstract sig Entry {}
one sig k_fines_Charge, k_fines_Pay extends Entry {}
one sig Step { var event: lone Entry, var x_fines_Charge_member: lone s_MemberId, var x_fines_Charge_days: lone Int, var x_fines_Pay_member: lone s_MemberId }
pred same_fines { c_fines.f_fines_owed' = c_fines.f_fines_owed }
pred ev_fines_Charge_otherwise[p_member: s_MemberId, p_days: Int] {
  (some Bool)
  c_fines.f_fines_owed' = ((c_fines.f_fines_owed) ++ p_member -> plus[((p_member in ((c_fines.f_fines_owed).univ)) => (p_member.(c_fines.f_fines_owed)) else 0), mul[p_days, 10]])
}
pred cmd_fines_Charge[p_member: s_MemberId, p_days: Int] {
  (p_days > 0) and (ev_fines_Charge_otherwise[p_member, p_days])
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
  or (some p_member: s_MemberId, p_days: Int | cmd_fines_Charge[p_member, p_days] and Step.event = k_fines_Charge and Step.x_fines_Charge_member = p_member and Step.x_fines_Charge_days = p_days and no Step.x_fines_Pay_member)
  or (some p_member: s_MemberId | cmd_fines_Pay[p_member] and Step.event = k_fines_Pay and Step.x_fines_Pay_member = p_member and no Step.x_fines_Charge_member and no Step.x_fines_Charge_days)) }
check c0 { always (all p_member: s_MemberId | (p_member in ((c_fines.f_fines_owed).univ)) implies (p_member in (c_fines.f_fines_owed).univ)) } for 3 but 5 Int, 6 steps
run c1 { eventually (some p_member: s_MemberId | (p_member in ((c_fines.f_fines_owed).univ))) } for 3 but 5 Int, 1..8 steps
run c2 { eventually (some p_member: s_MemberId | (not (p_member in ((c_fines.f_fines_owed).univ)))) } for 3 but 5 Int, 1..8 steps
check c3 { always (all p_member: s_MemberId, p_days: Int | (p_days > 0) and (some Bool) and (p_member in ((c_fines.f_fines_owed).univ)) implies (p_member in (c_fines.f_fines_owed).univ)) } for 3 but 5 Int, 6 steps
run c4 { eventually (some p_member: s_MemberId, p_days: Int | Step.event = k_fines_Charge and Step.x_fines_Charge_member = p_member and Step.x_fines_Charge_days = p_days and (p_days > 0) and (some Bool)) } for 3 but 5 Int, 1..8 steps
run c5 { eventually (some p_member: s_MemberId | Step.event = k_fines_Pay and Step.x_fines_Pay_member = p_member and (some Bool)) } for 3 but 5 Int, 1..8 steps
