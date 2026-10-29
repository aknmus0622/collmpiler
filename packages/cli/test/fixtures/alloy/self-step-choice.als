module spec

abstract sig Bool {}
one sig True, False extends Bool {}
sig Str {}
sig Json {}
sig s_CaseName {}
sig Slot_step_choice_hits { var e_step_choice_hits_v: lone s_CaseName }
one sig c_step_choice { var f_step_choice_hits: set Slot_step_choice_hits }
one sig Env { var env_oracle_Holds: s_CaseName -> one Bool }
abstract sig Entry {}
one sig k_step_choice_BeginCases, k_step_choice_Case extends Entry {}
one sig Step { var event: lone Entry, var x_step_choice_Case_name: lone s_CaseName }
pred same_step_choice { c_step_choice.f_step_choice_hits' = c_step_choice.f_step_choice_hits and (all s: Slot_step_choice_hits | s.e_step_choice_hits_v' = s.e_step_choice_hits_v) }
pred ev_step_choice_BeginCases_otherwise[] {
  (some Bool)
  no c_step_choice.f_step_choice_hits' and (all s: Slot_step_choice_hits | s.e_step_choice_hits_v' = s.e_step_choice_hits_v)
}
pred cmd_step_choice_BeginCases[] {
  (ev_step_choice_BeginCases_otherwise[])
}
pred ev_step_choice_Case_otherwise[p_name: s_CaseName] {
  (some Bool)
  (((p_name.(Env.env_oracle_Holds)) = True) implies ((some n_0: Slot_step_choice_hits - c_step_choice.f_step_choice_hits | c_step_choice.f_step_choice_hits' = c_step_choice.f_step_choice_hits + n_0 and n_0.e_step_choice_hits_v' = p_name and (all s: Slot_step_choice_hits - (n_0) | s.e_step_choice_hits_v' = s.e_step_choice_hits_v))) else (c_step_choice.f_step_choice_hits' = c_step_choice.f_step_choice_hits and (all s: Slot_step_choice_hits | s.e_step_choice_hits_v' = s.e_step_choice_hits_v)))
}
pred cmd_step_choice_Case[p_name: s_CaseName] {
  (ev_step_choice_Case_otherwise[p_name])
}
fact initial_values { no c_step_choice.f_step_choice_hits }
fact transitions { always ((same_step_choice and no Step.event and no Step.x_step_choice_Case_name)
  or (cmd_step_choice_BeginCases[] and Step.event = k_step_choice_BeginCases and no Step.x_step_choice_Case_name)
  or (some p_name: s_CaseName | cmd_step_choice_Case[p_name] and Step.event = k_step_choice_Case and Step.x_step_choice_Case_name = p_name)) }
run c0 { eventually ((#(c_step_choice.f_step_choice_hits) = 0)) } for 3 but 4 Int, 3 Str, 1..8 steps
run c1 { eventually ((not (#(c_step_choice.f_step_choice_hits) = 0)) and (#(c_step_choice.f_step_choice_hits) = 1)) } for 3 but 4 Int, 3 Str, 1..8 steps
run c2 { eventually ((not (#(c_step_choice.f_step_choice_hits) = 0)) and (not (#(c_step_choice.f_step_choice_hits) = 1))) } for 3 but 4 Int, 3 Str, 1..8 steps
run c3 { eventually (Step.event = k_step_choice_BeginCases and (some Bool)) } for 3 but 4 Int, 3 Str, 1..8 steps
run c4 { eventually (some p_name: s_CaseName | Step.event = k_step_choice_Case and Step.x_step_choice_Case_name = p_name and (some Bool)) } for 3 but 4 Int, 3 Str, 1..8 steps
run sane { some Bool } for 3 but 4 Int, 3 Str, 1..8 steps
