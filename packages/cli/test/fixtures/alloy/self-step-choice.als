module spec

abstract sig Bool {}
one sig True, False extends Bool {}
sig Str {}
sig s_CaseName {}
one sig c_step_choice {}
one sig Env { var env_oracle_Holds: s_CaseName -> one Bool }
abstract sig Entry {}
one sig k_step_choice_BeginCases, k_step_choice_Case extends Entry {}
one sig Step { var event: lone Entry, var x_step_choice_Case_name: lone s_CaseName }
pred same_step_choice { some Bool }
pred ev_step_choice_BeginCases_otherwise[] {
  (some Bool)
}
pred cmd_step_choice_BeginCases[] {
  (ev_step_choice_BeginCases_otherwise[])
}
pred ev_step_choice_Case_otherwise[p_name: s_CaseName] {
  (some Bool)
}
pred cmd_step_choice_Case[p_name: s_CaseName] {
  (ev_step_choice_Case_otherwise[p_name])
}
fact initial_values { some Bool }
fact transitions { always ((same_step_choice and no Step.event and no Step.x_step_choice_Case_name)
  or (cmd_step_choice_BeginCases[] and Step.event = k_step_choice_BeginCases and no Step.x_step_choice_Case_name)
  or (some p_name: s_CaseName | cmd_step_choice_Case[p_name] and Step.event = k_step_choice_Case and Step.x_step_choice_Case_name = p_name)) }
run c0 { eventually (Step.event = k_step_choice_BeginCases and (some Bool)) } for 3 but 4 Int, 1..8 steps
run c1 { eventually (some p_name: s_CaseName | Step.event = k_step_choice_Case and Step.x_step_choice_Case_name = p_name and (some Bool)) } for 3 but 4 Int, 1..8 steps
