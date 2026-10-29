module spec

abstract sig Bool {}
one sig True, False extends Bool {}
sig Str {}
one sig str_0, str_1, str_2, str_3, str_4, str_5, str_6, str_7, str_8, str_9, str_10 extends Str {}
one sig c_mutation_verdict { var f_mutation_verdict_status: one Str, var f_mutation_verdict_extra: one Int }
one sig Env {}
abstract sig Entry {}
one sig k_mutation_verdict_Begin, k_mutation_verdict_Tried extends Entry {}
one sig Step { var event: lone Entry, var x_mutation_verdict_Begin_kind: lone Str, var x_mutation_verdict_Tried_changed: lone Bool, var x_mutation_verdict_Tried_enablementDiffers: lone Bool }
pred same_mutation_verdict { c_mutation_verdict.f_mutation_verdict_status' = c_mutation_verdict.f_mutation_verdict_status and c_mutation_verdict.f_mutation_verdict_extra' = c_mutation_verdict.f_mutation_verdict_extra }
pred ev_mutation_verdict_Begin_otherwise[p_kind: Str] {
  (some Bool)
  c_mutation_verdict.f_mutation_verdict_status' = ((not (p_kind = str_4)) => str_1 else (c_mutation_verdict.f_mutation_verdict_status))
  c_mutation_verdict.f_mutation_verdict_extra' = ((not (p_kind = str_4)) => 0 else (c_mutation_verdict.f_mutation_verdict_extra))
}
pred cmd_mutation_verdict_Begin[p_kind: Str] {
  p_kind in (str_5 + str_8 + str_2 + str_4) and ((c_mutation_verdict.f_mutation_verdict_status) = str_0) and (ev_mutation_verdict_Begin_otherwise[p_kind])
}
pred ev_mutation_verdict_Tried_otherwise[p_changed: Bool, p_enablementDiffers: Bool] {
  (some Bool)
  c_mutation_verdict.f_mutation_verdict_status' = ((p_changed = True) => str_0 else (((c_mutation_verdict.f_mutation_verdict_extra) < 2) => (c_mutation_verdict.f_mutation_verdict_status) else str_0))
  c_mutation_verdict.f_mutation_verdict_extra' = ((p_changed = True) => (c_mutation_verdict.f_mutation_verdict_extra) else (((c_mutation_verdict.f_mutation_verdict_extra) < 2) => plus[(c_mutation_verdict.f_mutation_verdict_extra), 1] else (c_mutation_verdict.f_mutation_verdict_extra)))
}
pred cmd_mutation_verdict_Tried[p_changed: Bool, p_enablementDiffers: Bool] {
  ((c_mutation_verdict.f_mutation_verdict_status) = str_1) and (ev_mutation_verdict_Tried_otherwise[p_changed, p_enablementDiffers])
}
fact initial_values { c_mutation_verdict.f_mutation_verdict_status = str_0 and c_mutation_verdict.f_mutation_verdict_extra = 0 }
fact transitions { always ((same_mutation_verdict and no Step.event and no Step.x_mutation_verdict_Begin_kind and no Step.x_mutation_verdict_Tried_changed and no Step.x_mutation_verdict_Tried_enablementDiffers)
  or (some p_kind: Str | cmd_mutation_verdict_Begin[p_kind] and Step.event = k_mutation_verdict_Begin and Step.x_mutation_verdict_Begin_kind = p_kind and no Step.x_mutation_verdict_Tried_changed and no Step.x_mutation_verdict_Tried_enablementDiffers)
  or (some p_changed: Bool, p_enablementDiffers: Bool | cmd_mutation_verdict_Tried[p_changed, p_enablementDiffers] and Step.event = k_mutation_verdict_Tried and Step.x_mutation_verdict_Tried_changed = p_changed and Step.x_mutation_verdict_Tried_enablementDiffers = p_enablementDiffers and no Step.x_mutation_verdict_Begin_kind)) }
check c0 { (always (((c_mutation_verdict.f_mutation_verdict_extra) >= 0) and ((c_mutation_verdict.f_mutation_verdict_extra) <= 2))) } for 3 but 4 Int, 6 steps
run c1 { eventually (some p_kind: Str | Step.event = k_mutation_verdict_Begin and Step.x_mutation_verdict_Begin_kind = p_kind and p_kind in (str_5 + str_8 + str_2 + str_4) and ((c_mutation_verdict.f_mutation_verdict_status) = str_0) and (some Bool)) } for 3 but 4 Int, 1..8 steps
run c2 { eventually (some p_kind: Str | Step.event = k_mutation_verdict_Begin and Step.x_mutation_verdict_Begin_kind = p_kind and p_kind in (str_5 + str_8 + str_2 + str_4) and ((c_mutation_verdict.f_mutation_verdict_status) = str_0) and (some Bool) and (not (p_kind = str_4))) } for 3 but 4 Int, 1..8 steps
run c3 { eventually (some p_changed: Bool, p_enablementDiffers: Bool | Step.event = k_mutation_verdict_Tried and Step.x_mutation_verdict_Tried_changed = p_changed and Step.x_mutation_verdict_Tried_enablementDiffers = p_enablementDiffers and ((c_mutation_verdict.f_mutation_verdict_status) = str_1) and (some Bool)) } for 3 but 4 Int, 1..8 steps
run c4 { eventually (some p_changed: Bool, p_enablementDiffers: Bool | Step.event = k_mutation_verdict_Tried and Step.x_mutation_verdict_Tried_changed = p_changed and Step.x_mutation_verdict_Tried_enablementDiffers = p_enablementDiffers and ((c_mutation_verdict.f_mutation_verdict_status) = str_1) and (some Bool) and (some Bool)) } for 3 but 4 Int, 1..8 steps
run c5 { eventually (some p_changed: Bool, p_enablementDiffers: Bool | Step.event = k_mutation_verdict_Tried and Step.x_mutation_verdict_Tried_changed = p_changed and Step.x_mutation_verdict_Tried_enablementDiffers = p_enablementDiffers and ((c_mutation_verdict.f_mutation_verdict_status) = str_1) and (some Bool) and ((p_changed = True) and ((c_mutation_verdict.f_mutation_verdict_extra) > 0))) } for 3 but 4 Int, 1..8 steps
run c6 { eventually (some p_changed: Bool, p_enablementDiffers: Bool | Step.event = k_mutation_verdict_Tried and Step.x_mutation_verdict_Tried_changed = p_changed and Step.x_mutation_verdict_Tried_enablementDiffers = p_enablementDiffers and ((c_mutation_verdict.f_mutation_verdict_status) = str_1) and (some Bool) and ((not (p_changed = True)) and ((c_mutation_verdict.f_mutation_verdict_extra) < 2))) } for 3 but 4 Int, 1..8 steps
run c7 { eventually (some p_changed: Bool, p_enablementDiffers: Bool | Step.event = k_mutation_verdict_Tried and Step.x_mutation_verdict_Tried_changed = p_changed and Step.x_mutation_verdict_Tried_enablementDiffers = p_enablementDiffers and ((c_mutation_verdict.f_mutation_verdict_status) = str_1) and (some Bool) and ((not (p_changed = True)) and (not ((c_mutation_verdict.f_mutation_verdict_extra) < 2)))) } for 3 but 4 Int, 1..8 steps
run c8 { eventually ((some p_changed: Bool, p_enablementDiffers: Bool | Step.event = k_mutation_verdict_Tried and Step.x_mutation_verdict_Tried_changed = p_changed and Step.x_mutation_verdict_Tried_enablementDiffers = p_enablementDiffers and ((c_mutation_verdict.f_mutation_verdict_status) = str_1) and (some Bool) and (some Bool)) and after eventually (some p_kind: Str | Step.event = k_mutation_verdict_Begin and Step.x_mutation_verdict_Begin_kind = p_kind and p_kind in (str_5 + str_8 + str_2 + str_4) and ((c_mutation_verdict.f_mutation_verdict_status) = str_0) and (some Bool) and (not (p_kind = str_4)))) } for 3 but 4 Int, 1..8 steps
run c9 { eventually ((some p_changed: Bool, p_enablementDiffers: Bool | Step.event = k_mutation_verdict_Tried and Step.x_mutation_verdict_Tried_changed = p_changed and Step.x_mutation_verdict_Tried_enablementDiffers = p_enablementDiffers and ((c_mutation_verdict.f_mutation_verdict_status) = str_1) and (some Bool) and (some Bool)) and after eventually (some p_changed: Bool, p_enablementDiffers: Bool | Step.event = k_mutation_verdict_Tried and Step.x_mutation_verdict_Tried_changed = p_changed and Step.x_mutation_verdict_Tried_enablementDiffers = p_enablementDiffers and ((c_mutation_verdict.f_mutation_verdict_status) = str_1) and (some Bool) and ((p_changed = True) and ((c_mutation_verdict.f_mutation_verdict_extra) > 0)))) } for 3 but 4 Int, 1..8 steps
run c10 { eventually ((some p_changed: Bool, p_enablementDiffers: Bool | Step.event = k_mutation_verdict_Tried and Step.x_mutation_verdict_Tried_changed = p_changed and Step.x_mutation_verdict_Tried_enablementDiffers = p_enablementDiffers and ((c_mutation_verdict.f_mutation_verdict_status) = str_1) and (some Bool) and (some Bool)) and after eventually (some p_changed: Bool, p_enablementDiffers: Bool | Step.event = k_mutation_verdict_Tried and Step.x_mutation_verdict_Tried_changed = p_changed and Step.x_mutation_verdict_Tried_enablementDiffers = p_enablementDiffers and ((c_mutation_verdict.f_mutation_verdict_status) = str_1) and (some Bool) and ((not (p_changed = True)) and ((c_mutation_verdict.f_mutation_verdict_extra) < 2)))) } for 3 but 4 Int, 1..8 steps
run c11 { eventually ((some p_changed: Bool, p_enablementDiffers: Bool | Step.event = k_mutation_verdict_Tried and Step.x_mutation_verdict_Tried_changed = p_changed and Step.x_mutation_verdict_Tried_enablementDiffers = p_enablementDiffers and ((c_mutation_verdict.f_mutation_verdict_status) = str_1) and (some Bool) and (some Bool)) and after eventually (some p_changed: Bool, p_enablementDiffers: Bool | Step.event = k_mutation_verdict_Tried and Step.x_mutation_verdict_Tried_changed = p_changed and Step.x_mutation_verdict_Tried_enablementDiffers = p_enablementDiffers and ((c_mutation_verdict.f_mutation_verdict_status) = str_1) and (some Bool) and ((not (p_changed = True)) and (not ((c_mutation_verdict.f_mutation_verdict_extra) < 2))))) } for 3 but 4 Int, 1..8 steps
