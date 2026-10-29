module spec

abstract sig Bool {}
one sig True, False extends Bool {}
sig Str {}
sig Json {}
one sig str_0, str_1, str_2, str_3 extends Str {}
one sig c_mutation_judge { var f_mutation_judge_phase: one Str, var f_mutation_judge_sawSite: one Bool, var f_mutation_judge_siteKilled: one Bool, var f_mutation_judge_valueInAdapter: one Bool, var f_mutation_judge_located: one Bool, var f_mutation_judge_anyKilled: one Bool }
one sig Env {}
abstract sig Entry {}
one sig k_mutation_judge_BeginValue, k_mutation_judge_EndValue, k_mutation_judge_Finish, k_mutation_judge_Mutant, k_mutation_judge_Site extends Entry {}
one sig Step { var event: lone Entry, var x_mutation_judge_BeginValue_numeric: lone Bool, var x_mutation_judge_BeginValue_inAdapter: lone Bool, var x_mutation_judge_Finish_shared: lone Bool, var x_mutation_judge_Mutant_killed: lone Bool, var x_mutation_judge_Site_killed: lone Bool }
pred same_mutation_judge { c_mutation_judge.f_mutation_judge_phase' = c_mutation_judge.f_mutation_judge_phase and c_mutation_judge.f_mutation_judge_sawSite' = c_mutation_judge.f_mutation_judge_sawSite and c_mutation_judge.f_mutation_judge_siteKilled' = c_mutation_judge.f_mutation_judge_siteKilled and c_mutation_judge.f_mutation_judge_valueInAdapter' = c_mutation_judge.f_mutation_judge_valueInAdapter and c_mutation_judge.f_mutation_judge_located' = c_mutation_judge.f_mutation_judge_located and c_mutation_judge.f_mutation_judge_anyKilled' = c_mutation_judge.f_mutation_judge_anyKilled }
pred ev_mutation_judge_BeginValue_otherwise[p_numeric: Bool, p_inAdapter: Bool] {
  (some Bool)
  c_mutation_judge.f_mutation_judge_phase' = str_1
  c_mutation_judge.f_mutation_judge_sawSite' = False
  c_mutation_judge.f_mutation_judge_siteKilled' = False
  c_mutation_judge.f_mutation_judge_valueInAdapter' = (((p_numeric = True) and (p_inAdapter = True)) => True else False)
  c_mutation_judge.f_mutation_judge_located' = c_mutation_judge.f_mutation_judge_located
  c_mutation_judge.f_mutation_judge_anyKilled' = c_mutation_judge.f_mutation_judge_anyKilled
}
pred cmd_mutation_judge_BeginValue[p_numeric: Bool, p_inAdapter: Bool] {
  ((c_mutation_judge.f_mutation_judge_phase) = str_3) and (ev_mutation_judge_BeginValue_otherwise[p_numeric, p_inAdapter])
}
pred ev_mutation_judge_Site_otherwise[p_killed: Bool] {
  (some Bool)
  c_mutation_judge.f_mutation_judge_phase' = c_mutation_judge.f_mutation_judge_phase
  c_mutation_judge.f_mutation_judge_sawSite' = True
  c_mutation_judge.f_mutation_judge_siteKilled' = ((((c_mutation_judge.f_mutation_judge_siteKilled) = True) or (p_killed = True)) => True else False)
  c_mutation_judge.f_mutation_judge_valueInAdapter' = c_mutation_judge.f_mutation_judge_valueInAdapter
  c_mutation_judge.f_mutation_judge_located' = c_mutation_judge.f_mutation_judge_located
  c_mutation_judge.f_mutation_judge_anyKilled' = c_mutation_judge.f_mutation_judge_anyKilled
}
pred cmd_mutation_judge_Site[p_killed: Bool] {
  ((c_mutation_judge.f_mutation_judge_phase) = str_1) and (ev_mutation_judge_Site_otherwise[p_killed])
}
pred ev_mutation_judge_EndValue_otherwise[] {
  (some Bool)
  c_mutation_judge.f_mutation_judge_phase' = str_3
  c_mutation_judge.f_mutation_judge_sawSite' = c_mutation_judge.f_mutation_judge_sawSite
  c_mutation_judge.f_mutation_judge_siteKilled' = c_mutation_judge.f_mutation_judge_siteKilled
  c_mutation_judge.f_mutation_judge_valueInAdapter' = c_mutation_judge.f_mutation_judge_valueInAdapter
  c_mutation_judge.f_mutation_judge_located' = (((c_mutation_judge.f_mutation_judge_sawSite) = True) => True else (c_mutation_judge.f_mutation_judge_located))
  c_mutation_judge.f_mutation_judge_anyKilled' = c_mutation_judge.f_mutation_judge_anyKilled
}
pred cmd_mutation_judge_EndValue[] {
  ((c_mutation_judge.f_mutation_judge_phase) = str_1) and (ev_mutation_judge_EndValue_otherwise[])
}
pred ev_mutation_judge_Mutant_otherwise[p_killed: Bool] {
  (some Bool)
  c_mutation_judge.f_mutation_judge_phase' = str_2
  c_mutation_judge.f_mutation_judge_sawSite' = c_mutation_judge.f_mutation_judge_sawSite
  c_mutation_judge.f_mutation_judge_siteKilled' = c_mutation_judge.f_mutation_judge_siteKilled
  c_mutation_judge.f_mutation_judge_valueInAdapter' = c_mutation_judge.f_mutation_judge_valueInAdapter
  c_mutation_judge.f_mutation_judge_located' = c_mutation_judge.f_mutation_judge_located
  c_mutation_judge.f_mutation_judge_anyKilled' = ((((c_mutation_judge.f_mutation_judge_anyKilled) = True) or (p_killed = True)) => True else False)
}
pred cmd_mutation_judge_Mutant[p_killed: Bool] {
  (((c_mutation_judge.f_mutation_judge_phase) = str_3) or ((c_mutation_judge.f_mutation_judge_phase) = str_2)) and (ev_mutation_judge_Mutant_otherwise[p_killed])
}
pred ev_mutation_judge_Finish_otherwise[p_shared: Bool] {
  (some Bool)
  c_mutation_judge.f_mutation_judge_phase' = str_0
  c_mutation_judge.f_mutation_judge_sawSite' = c_mutation_judge.f_mutation_judge_sawSite
  c_mutation_judge.f_mutation_judge_siteKilled' = c_mutation_judge.f_mutation_judge_siteKilled
  c_mutation_judge.f_mutation_judge_valueInAdapter' = c_mutation_judge.f_mutation_judge_valueInAdapter
  c_mutation_judge.f_mutation_judge_located' = c_mutation_judge.f_mutation_judge_located
  c_mutation_judge.f_mutation_judge_anyKilled' = c_mutation_judge.f_mutation_judge_anyKilled
}
pred cmd_mutation_judge_Finish[p_shared: Bool] {
  (((c_mutation_judge.f_mutation_judge_phase) = str_3) or ((c_mutation_judge.f_mutation_judge_phase) = str_2)) and (ev_mutation_judge_Finish_otherwise[p_shared])
}
fact initial_values { c_mutation_judge.f_mutation_judge_phase = str_3 and c_mutation_judge.f_mutation_judge_sawSite = False and c_mutation_judge.f_mutation_judge_siteKilled = False and c_mutation_judge.f_mutation_judge_valueInAdapter = False and c_mutation_judge.f_mutation_judge_located = False and c_mutation_judge.f_mutation_judge_anyKilled = False }
fact transitions { always ((same_mutation_judge and no Step.event and no Step.x_mutation_judge_BeginValue_numeric and no Step.x_mutation_judge_BeginValue_inAdapter and no Step.x_mutation_judge_Finish_shared and no Step.x_mutation_judge_Mutant_killed and no Step.x_mutation_judge_Site_killed)
  or (some p_numeric: Bool, p_inAdapter: Bool | cmd_mutation_judge_BeginValue[p_numeric, p_inAdapter] and Step.event = k_mutation_judge_BeginValue and Step.x_mutation_judge_BeginValue_numeric = p_numeric and Step.x_mutation_judge_BeginValue_inAdapter = p_inAdapter and no Step.x_mutation_judge_Finish_shared and no Step.x_mutation_judge_Mutant_killed and no Step.x_mutation_judge_Site_killed)
  or (cmd_mutation_judge_EndValue[] and Step.event = k_mutation_judge_EndValue and no Step.x_mutation_judge_BeginValue_numeric and no Step.x_mutation_judge_BeginValue_inAdapter and no Step.x_mutation_judge_Finish_shared and no Step.x_mutation_judge_Mutant_killed and no Step.x_mutation_judge_Site_killed)
  or (some p_shared: Bool | cmd_mutation_judge_Finish[p_shared] and Step.event = k_mutation_judge_Finish and Step.x_mutation_judge_Finish_shared = p_shared and no Step.x_mutation_judge_BeginValue_numeric and no Step.x_mutation_judge_BeginValue_inAdapter and no Step.x_mutation_judge_Mutant_killed and no Step.x_mutation_judge_Site_killed)
  or (some p_killed: Bool | cmd_mutation_judge_Mutant[p_killed] and Step.event = k_mutation_judge_Mutant and Step.x_mutation_judge_Mutant_killed = p_killed and no Step.x_mutation_judge_BeginValue_numeric and no Step.x_mutation_judge_BeginValue_inAdapter and no Step.x_mutation_judge_Finish_shared and no Step.x_mutation_judge_Site_killed)
  or (some p_killed: Bool | cmd_mutation_judge_Site[p_killed] and Step.event = k_mutation_judge_Site and Step.x_mutation_judge_Site_killed = p_killed and no Step.x_mutation_judge_BeginValue_numeric and no Step.x_mutation_judge_BeginValue_inAdapter and no Step.x_mutation_judge_Finish_shared and no Step.x_mutation_judge_Mutant_killed)) }
run c0 { eventually (some p_numeric: Bool, p_inAdapter: Bool | Step.event = k_mutation_judge_BeginValue and Step.x_mutation_judge_BeginValue_numeric = p_numeric and Step.x_mutation_judge_BeginValue_inAdapter = p_inAdapter and ((c_mutation_judge.f_mutation_judge_phase) = str_3) and (some Bool)) } for 3 but 4 Int, 7 Str, 1..8 steps
run c1 { eventually (some p_killed: Bool | Step.event = k_mutation_judge_Site and Step.x_mutation_judge_Site_killed = p_killed and ((c_mutation_judge.f_mutation_judge_phase) = str_1) and (some Bool)) } for 3 but 4 Int, 7 Str, 1..8 steps
run c2 { eventually (Step.event = k_mutation_judge_EndValue and ((c_mutation_judge.f_mutation_judge_phase) = str_1) and (some Bool)) } for 3 but 4 Int, 7 Str, 1..8 steps
run c3 { eventually (Step.event = k_mutation_judge_EndValue and ((c_mutation_judge.f_mutation_judge_phase) = str_1) and (some Bool) and (((c_mutation_judge.f_mutation_judge_sawSite) = True) and (not ((c_mutation_judge.f_mutation_judge_siteKilled) = True)))) } for 3 but 4 Int, 7 Str, 1..8 steps
run c4 { eventually (Step.event = k_mutation_judge_EndValue and ((c_mutation_judge.f_mutation_judge_phase) = str_1) and (some Bool) and ((not ((c_mutation_judge.f_mutation_judge_sawSite) = True)) and ((c_mutation_judge.f_mutation_judge_valueInAdapter) = True))) } for 3 but 4 Int, 7 Str, 1..8 steps
run c5 { eventually (some p_killed: Bool | Step.event = k_mutation_judge_Mutant and Step.x_mutation_judge_Mutant_killed = p_killed and (((c_mutation_judge.f_mutation_judge_phase) = str_3) or ((c_mutation_judge.f_mutation_judge_phase) = str_2)) and (some Bool)) } for 3 but 4 Int, 7 Str, 1..8 steps
run c6 { eventually (some p_shared: Bool | Step.event = k_mutation_judge_Finish and Step.x_mutation_judge_Finish_shared = p_shared and (((c_mutation_judge.f_mutation_judge_phase) = str_3) or ((c_mutation_judge.f_mutation_judge_phase) = str_2)) and (some Bool)) } for 3 but 4 Int, 7 Str, 1..8 steps
run c7 { eventually (some p_shared: Bool | Step.event = k_mutation_judge_Finish and Step.x_mutation_judge_Finish_shared = p_shared and (((c_mutation_judge.f_mutation_judge_phase) = str_3) or ((c_mutation_judge.f_mutation_judge_phase) = str_2)) and (some Bool) and (((not ((c_mutation_judge.f_mutation_judge_located) = True)) and (not ((c_mutation_judge.f_mutation_judge_anyKilled) = True))) and (not (p_shared = True)))) } for 3 but 4 Int, 7 Str, 1..8 steps
run sane { some Bool } for 3 but 4 Int, 7 Str, 1..8 steps
