module spec

abstract sig Bool {}
one sig True, False extends Bool {}
abstract sig Num {}
sig Str { len: one s_num0, trimmed: one Str }
sig Json {}
one sig str_0, str_1, str_2, str_3, str_4, str_5, str_6, str_7, str_8, str_9, str_10, str_11 extends Str {}
fact strings { all s: Str | s.len in s_num0_1.*next_num0 and s.trimmed.trimmed = s.trimmed and s.len in s.trimmed.len.*next_num0 and (s.len = s_num0_1 iff s = str_0) and str_0.len = s_num0_1 and str_0.trimmed = str_0 and str_1.len = s_num0_3 and str_1.trimmed = str_1 and str_2.len = s_num0_11 and str_2.trimmed = str_2 and str_3.len = s_num0_8 and str_3.trimmed = str_3 and str_4.len = s_num0_6 and str_4.trimmed = str_4 and str_5.len = s_num0_6 and str_5.trimmed = str_5 and str_6.len = s_num0_4 and str_6.trimmed = str_6 and str_7.len = s_num0_6 and str_7.trimmed = str_7 and str_8.len = s_num0_8 and str_8.trimmed = str_8 and str_9.len = s_num0_4 and str_9.trimmed = str_9 and str_10.len = s_num0_6 and str_10.trimmed = str_10 and str_11.len = s_num0_10 and str_11.trimmed = str_11 }
sig s_TodoId {}
abstract sig s_num0 extends Num {}
one sig s_num0_0, s_num0_1, s_num0_2, s_num0_3, s_num0_4, s_num0_5, s_num0_6, s_num0_7, s_num0_8, s_num0_9, s_num0_10, s_num0_11, s_num0_12, s_num0_13, s_num0_14 extends s_num0 {}
fun next_num0: s_num0 -> s_num0 { s_num0_0 -> s_num0_1 + s_num0_1 -> s_num0_2 + s_num0_2 -> s_num0_3 + s_num0_3 -> s_num0_4 + s_num0_4 -> s_num0_5 + s_num0_5 -> s_num0_6 + s_num0_6 -> s_num0_7 + s_num0_7 -> s_num0_8 + s_num0_8 -> s_num0_9 + s_num0_9 -> s_num0_10 + s_num0_10 -> s_num0_11 + s_num0_11 -> s_num0_12 + s_num0_12 -> s_num0_13 + s_num0_13 -> s_num0_14 }
abstract sig s_num1 extends Num {}
one sig s_num1_0, s_num1_1, s_num1_2 extends s_num1 {}
fun next_num1: s_num1 -> s_num1 { s_num1_0 -> s_num1_1 + s_num1_1 -> s_num1_2 }
one sig c_todos {}
sig Slot_store_entries { var e_store_entries_key: lone Str, var e_store_entries_value: lone (Json + Int + Str + Bool + Num) }
one sig c_store { var f_store_entries: set Slot_store_entries }
one sig Env { var env_ids_NewId: one s_TodoId, var env_ids_NewId_failed: lone Bool, var env_ids_NewId_used: set s_TodoId }
abstract sig Entry {}
one sig k_todos_Add, k_todos_Complete, k_todos_Remove extends Entry {}
one sig Step { var event: lone Entry, var x_todos_Add_title: lone Str, var x_todos_Add_title__len: lone s_num0, var x_todos_Add_title__trim: lone Str, var x_todos_Add_title__trimlen: lone s_num0, var x_todos_Complete_id: lone s_TodoId, var x_todos_Remove_id: lone s_TodoId }
pred same_todos { some Bool }
pred same_store { c_store.f_store_entries' = c_store.f_store_entries and (all s: Slot_store_entries | s.e_store_entries_key' = s.e_store_entries_key) and (all s: Slot_store_entries | s.e_store_entries_value' = s.e_store_entries_value) }
fun out_store_Delete[p_key: Str]: Str { ((not (some b_e: (c_store.f_store_entries) | ((b_e.e_store_entries_key) = p_key))) => str_8 else str_5) }
pred ev_todos_Add_case1[p_title: Str] {
  ((((p_title.trimmed).len) = s_num0_1) or ((p_title.len) in s_num0_13.^next_num0))
  same_store
}
pred ev_todos_Add_case2[p_title: Str] {
  ((not ((((p_title.trimmed).len) = s_num0_1) or ((p_title.len) in s_num0_13.^next_num0))) and (some Env.env_ids_NewId_failed))
  same_store
}
pred cmd_todos_Add[p_title: Str] {
  (ev_todos_Add_case1[p_title] or ev_todos_Add_case2[p_title])
}
pred cmd_todos_Complete[p_id: s_TodoId] {
  (no Bool)
}
pred cmd_todos_Remove[p_id: s_TodoId] {
  (no Bool)
}
pred ev_store_Put_otherwise[p_key: Str, p_data: lone (Json + Int + Str + Bool + Num)] {
  (some Bool)
  ((some b_e: (c_store.f_store_entries) | ((b_e.e_store_entries_key) = p_key)) implies (c_store.f_store_entries' = c_store.f_store_entries and (all b_e: (c_store.f_store_entries) | b_e.e_store_entries_key' = (((b_e.e_store_entries_key) = p_key) => (b_e.e_store_entries_key) else (b_e.e_store_entries_key)) and b_e.e_store_entries_value' = (((b_e.e_store_entries_key) = p_key) => p_data else (b_e.e_store_entries_value))) and (all s: Slot_store_entries - (c_store.f_store_entries) | s.e_store_entries_key' = s.e_store_entries_key) and (all s: Slot_store_entries - (c_store.f_store_entries) | s.e_store_entries_value' = s.e_store_entries_value)) else ((some n_0: Slot_store_entries - c_store.f_store_entries | c_store.f_store_entries' = c_store.f_store_entries + n_0 and n_0.e_store_entries_key' = p_key and n_0.e_store_entries_value' = p_data and (all s: Slot_store_entries - (n_0) | s.e_store_entries_key' = s.e_store_entries_key) and (all s: Slot_store_entries - (n_0) | s.e_store_entries_value' = s.e_store_entries_value))))
}
pred cmd_store_Put[p_key: Str, p_data: lone (Json + Int + Str + Bool + Num)] {
  (ev_store_Put_otherwise[p_key, p_data])
}
pred ev_store_Delete_otherwise[p_key: Str] {
  (not (some b_e: (c_store.f_store_entries) | ((b_e.e_store_entries_key) = p_key)))
  c_store.f_store_entries' = c_store.f_store_entries and (all s: Slot_store_entries | s.e_store_entries_key' = s.e_store_entries_key) and (all s: Slot_store_entries | s.e_store_entries_value' = s.e_store_entries_value)
}
pred ev_store_Delete_case1[p_key: Str] {
  (some b_e: (c_store.f_store_entries) | ((b_e.e_store_entries_key) = p_key))
  c_store.f_store_entries' = { b_e: (c_store.f_store_entries) | (not ((b_e.e_store_entries_key) = p_key)) } and (all s: Slot_store_entries | s.e_store_entries_key' = s.e_store_entries_key) and (all s: Slot_store_entries | s.e_store_entries_value' = s.e_store_entries_value)
}
pred cmd_store_Delete[p_key: Str] {
  (ev_store_Delete_otherwise[p_key] or ev_store_Delete_case1[p_key])
}
fact initial_values { no c_store.f_store_entries }
fact transitions { always ((same_todos and same_store and no Step.event and no Step.x_todos_Add_title and no Step.x_todos_Add_title__len and no Step.x_todos_Add_title__trim and no Step.x_todos_Add_title__trimlen and no Step.x_todos_Complete_id and no Step.x_todos_Remove_id)
  or (some p_title: Str | cmd_todos_Add[p_title] and Step.event = k_todos_Add and Step.x_todos_Add_title = p_title and Step.x_todos_Add_title__len = p_title.len and Step.x_todos_Add_title__trim = p_title.trimmed and Step.x_todos_Add_title__trimlen = p_title.trimmed.len and no Step.x_todos_Complete_id and no Step.x_todos_Remove_id)
  or (some p_id: s_TodoId | cmd_todos_Complete[p_id] and Step.event = k_todos_Complete and Step.x_todos_Complete_id = p_id and no Step.x_todos_Add_title and no Step.x_todos_Add_title__len and no Step.x_todos_Add_title__trim and no Step.x_todos_Add_title__trimlen and no Step.x_todos_Remove_id)
  or (some p_id: s_TodoId | cmd_todos_Remove[p_id] and Step.event = k_todos_Remove and Step.x_todos_Remove_id = p_id and no Step.x_todos_Add_title and no Step.x_todos_Add_title__len and no Step.x_todos_Add_title__trim and no Step.x_todos_Add_title__trimlen and no Step.x_todos_Complete_id)) }
fact { no Env.env_ids_NewId_used }
fact { always ((some Step.event and Step.event in (k_todos_Add)) implies (Env.env_ids_NewId not in Env.env_ids_NewId_used and Env.env_ids_NewId_used' = Env.env_ids_NewId_used + Env.env_ids_NewId) else Env.env_ids_NewId_used' = Env.env_ids_NewId_used) }
run c0 { eventually (some p_only: Str | p_only in (str_1 + str_9 + str_6) and (p_only = str_9)) } for 3 but 4 Int, 15 Str, 1..8 steps
run c1 { eventually (some p_only: Str | p_only in (str_1 + str_9 + str_6) and (not (p_only = str_9)) and (p_only = str_6)) } for 3 but 4 Int, 15 Str, 1..8 steps
run c2 { eventually (some p_only: Str | p_only in (str_1 + str_9 + str_6) and (not (p_only = str_9)) and (not (p_only = str_6))) } for 3 but 4 Int, 15 Str, 1..8 steps
run c3 { eventually (some p_title: Str | Step.event = k_todos_Add and Step.x_todos_Add_title = p_title and ((((p_title.trimmed).len) = s_num0_1) or ((p_title.len) in s_num0_13.^next_num0))) } for 3 but 4 Int, 15 Str, 1..8 steps
run c4 { eventually (some p_title: Str | Step.event = k_todos_Add and Step.x_todos_Add_title = p_title and ((not ((((p_title.trimmed).len) = s_num0_1) or ((p_title.len) in s_num0_13.^next_num0))) and (some Env.env_ids_NewId_failed))) } for 3 but 4 Int, 15 Str, 1..8 steps
check c5 { (always (all b_e: (c_store.f_store_entries) | (((some disj n0, n1: { b_f: (c_store.f_store_entries) | ((b_f.e_store_entries_key) = (b_e.e_store_entries_key)) } | some Bool) => s_num1_2 else ((some { b_f: (c_store.f_store_entries) | ((b_f.e_store_entries_key) = (b_e.e_store_entries_key)) }) => s_num1_1 else s_num1_0)) = s_num1_1))) } for 3 but 4 Int, 15 Str, 6 steps
run sane { some Bool } for 3 but 4 Int, 15 Str, 1..8 steps
