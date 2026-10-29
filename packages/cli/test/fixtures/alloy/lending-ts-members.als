module spec

abstract sig Bool {}
one sig True, False extends Bool {}
sig Str {}
sig Json {}
one sig str_0, str_1 extends Str {}
sig s_MemberId {}
one sig c_members { var f_members_members: set s_MemberId }
one sig Env {}
abstract sig Entry {}
one sig k_members_Extend, k_members_Register extends Entry {}
one sig Step { var event: lone Entry, var x_members_Extend_member: lone s_MemberId, var x_members_Register_member: lone s_MemberId }
pred same_members { c_members.f_members_members' = c_members.f_members_members }
pred ev_members_Register_otherwise[p_member: s_MemberId] {
  (some Bool)
  c_members.f_members_members' = ((c_members.f_members_members) + p_member)
}
pred cmd_members_Register[p_member: s_MemberId] {
  (ev_members_Register_otherwise[p_member])
}
pred ev_members_Extend_otherwise[p_member: s_MemberId] {
  (not (p_member in (c_members.f_members_members)))
  c_members.f_members_members' = c_members.f_members_members
}
pred ev_members_Extend_case1[p_member: s_MemberId] {
  (p_member in (c_members.f_members_members))
  c_members.f_members_members' = c_members.f_members_members
}
pred cmd_members_Extend[p_member: s_MemberId] {
  (ev_members_Extend_otherwise[p_member] or ev_members_Extend_case1[p_member])
}
fact initial_values { no c_members.f_members_members }
fact transitions { always ((same_members and no Step.event and no Step.x_members_Extend_member and no Step.x_members_Register_member)
  or (some p_member: s_MemberId | cmd_members_Extend[p_member] and Step.event = k_members_Extend and Step.x_members_Extend_member = p_member and no Step.x_members_Register_member)
  or (some p_member: s_MemberId | cmd_members_Register[p_member] and Step.event = k_members_Register and Step.x_members_Register_member = p_member and no Step.x_members_Extend_member)) }
run c0 { eventually (some p_member: s_MemberId | Step.event = k_members_Register and Step.x_members_Register_member = p_member and (some Bool)) } for 3 but 4 Int, 5 Str, 1..8 steps
run c1 { eventually (some p_member: s_MemberId | Step.event = k_members_Extend and Step.x_members_Extend_member = p_member and (not (p_member in (c_members.f_members_members)))) } for 3 but 4 Int, 5 Str, 1..8 steps
run c2 { eventually (some p_member: s_MemberId | Step.event = k_members_Extend and Step.x_members_Extend_member = p_member and (p_member in (c_members.f_members_members))) } for 3 but 4 Int, 5 Str, 1..8 steps
run sane { some Bool } for 3 but 4 Int, 5 Str, 1..8 steps
