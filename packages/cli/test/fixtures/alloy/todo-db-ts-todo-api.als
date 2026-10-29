module spec

abstract sig Bool {}
one sig True, False extends Bool {}
sig Str { len: one Int, trimmed: one Str }
sig Json {}
one sig str_0, str_1, str_2, str_3, str_4, str_5, str_6, str_7, str_8, str_9, str_10, str_11 extends Str {}
fact strings { all s: Str | s.len >= 0 and s.trimmed.trimmed = s.trimmed and s.trimmed.len <= s.len and (s.len = 0 iff s = str_0) and str_0.len = 0 and str_0.trimmed = str_0 and str_1.len = 3 and str_1.trimmed = str_1 and str_2.len = 12 and str_2.trimmed = str_2 and str_3.len = 9 and str_3.trimmed = str_3 and str_4.len = 7 and str_4.trimmed = str_4 and str_5.len = 7 and str_5.trimmed = str_5 and str_6.len = 4 and str_6.trimmed = str_6 and str_7.len = 7 and str_7.trimmed = str_7 and str_8.len = 9 and str_8.trimmed = str_8 and str_9.len = 4 and str_9.trimmed = str_9 and str_10.len = 7 and str_10.trimmed = str_10 and str_11.len = 11 and str_11.trimmed = str_11 }
sig s_TodoId {}
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
one sig c_todo_api {}
one sig c_todos {}
sig Slot_store_entries { var e_store_entries_key: lone Str, var e_store_entries_value: lone (Json + Int + Str + Bool) }
one sig c_store { var f_store_entries: set Slot_store_entries }
one sig Env { var env_ids_NewId: one s_TodoId, var env_ids_NewId_failed: lone Bool, var env_ids_NewId_used: set s_TodoId }
abstract sig Entry {}
one sig k_todo_api_CompleteTodo, k_todo_api_DeleteTodo, k_todo_api_PostTodos extends Entry {}
one sig Step { var event: lone Entry, var x_todo_api_CompleteTodo_id: lone s_TodoId, var x_todo_api_DeleteTodo_id: lone s_TodoId, var x_todo_api_PostTodos_body_title: lone Str, var x_todo_api_PostTodos_body_title__len: lone Int, var x_todo_api_PostTodos_body_title__trim: lone Str, var x_todo_api_PostTodos_body_title__trimlen: lone Int }
pred same_todo_api { some Bool }
pred same_todos { some Bool }
pred same_store { c_store.f_store_entries' = c_store.f_store_entries and (all s: Slot_store_entries | s.e_store_entries_key' = s.e_store_entries_key) and (all s: Slot_store_entries | s.e_store_entries_value' = s.e_store_entries_value) }
fun out_todos_Add_result[p_title: Str]: Str { (((((p_title.trimmed).len) = 0) or ((p_title.len) > 14)) => str_7 else (((not ((((p_title.trimmed).len) = 0) or ((p_title.len) > 14))) and (some Env.env_ids_NewId_failed)) => str_11 else str_4)) }
fun out_store_Delete[p_key: Str]: Str { ((not (some b_e: (c_store.f_store_entries) | ((b_e.e_store_entries_key) = p_key))) => str_8 else str_5) }
pred ev_todo_api_PostTodos_case1[p_body_title: Str] {
  (out_todos_Add_result[p_body_title] = str_4)
  cmd_todos_Add[p_body_title]
}
pred ev_todo_api_PostTodos_case2[p_body_title: Str] {
  ((not (out_todos_Add_result[p_body_title] = str_4)) and (out_todos_Add_result[p_body_title] = str_7))
  cmd_todos_Add[p_body_title]
}
pred ev_todo_api_PostTodos_otherwise[p_body_title: Str] {
  ((not (out_todos_Add_result[p_body_title] = str_4)) and (not (out_todos_Add_result[p_body_title] = str_7)))
  cmd_todos_Add[p_body_title]
}
pred cmd_todo_api_PostTodos[p_body_title: Str] {
  (ev_todo_api_PostTodos_case1[p_body_title] or ev_todo_api_PostTodos_case2[p_body_title] or ev_todo_api_PostTodos_otherwise[p_body_title])
}
pred cmd_todo_api_CompleteTodo[p_id: s_TodoId] {
  (no Bool)
}
pred cmd_todo_api_DeleteTodo[p_id: s_TodoId] {
  (no Bool)
}
pred ev_todos_Add_case1[p_title: Str] {
  ((((p_title.trimmed).len) = 0) or ((p_title.len) > 14))
  same_store
}
pred ev_todos_Add_case2[p_title: Str] {
  ((not ((((p_title.trimmed).len) = 0) or ((p_title.len) > 14))) and (some Env.env_ids_NewId_failed))
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
pred ev_store_Put_otherwise[p_key: Str, p_data: lone (Json + Int + Str + Bool)] {
  (some Bool)
  ((some b_e: (c_store.f_store_entries) | ((b_e.e_store_entries_key) = p_key)) implies (c_store.f_store_entries' = c_store.f_store_entries and (all b_e: (c_store.f_store_entries) | b_e.e_store_entries_key' = (((b_e.e_store_entries_key) = p_key) => (b_e.e_store_entries_key) else (b_e.e_store_entries_key)) and b_e.e_store_entries_value' = (((b_e.e_store_entries_key) = p_key) => p_data else (b_e.e_store_entries_value))) and (all s: Slot_store_entries - (c_store.f_store_entries) | s.e_store_entries_key' = s.e_store_entries_key) and (all s: Slot_store_entries - (c_store.f_store_entries) | s.e_store_entries_value' = s.e_store_entries_value)) else ((some n_0: Slot_store_entries - c_store.f_store_entries | c_store.f_store_entries' = c_store.f_store_entries + n_0 and n_0.e_store_entries_key' = p_key and n_0.e_store_entries_value' = p_data and (all s: Slot_store_entries - (n_0) | s.e_store_entries_key' = s.e_store_entries_key) and (all s: Slot_store_entries - (n_0) | s.e_store_entries_value' = s.e_store_entries_value))))
}
pred cmd_store_Put[p_key: Str, p_data: lone (Json + Int + Str + Bool)] {
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
fact transitions { always ((same_todo_api and same_todos and same_store and no Step.event and no Step.x_todo_api_CompleteTodo_id and no Step.x_todo_api_DeleteTodo_id and no Step.x_todo_api_PostTodos_body_title and no Step.x_todo_api_PostTodos_body_title__len and no Step.x_todo_api_PostTodos_body_title__trim and no Step.x_todo_api_PostTodos_body_title__trimlen)
  or (some p_id: s_TodoId | cmd_todo_api_CompleteTodo[p_id] and Step.event = k_todo_api_CompleteTodo and Step.x_todo_api_CompleteTodo_id = p_id and no Step.x_todo_api_DeleteTodo_id and no Step.x_todo_api_PostTodos_body_title and no Step.x_todo_api_PostTodos_body_title__len and no Step.x_todo_api_PostTodos_body_title__trim and no Step.x_todo_api_PostTodos_body_title__trimlen)
  or (some p_id: s_TodoId | cmd_todo_api_DeleteTodo[p_id] and Step.event = k_todo_api_DeleteTodo and Step.x_todo_api_DeleteTodo_id = p_id and no Step.x_todo_api_CompleteTodo_id and no Step.x_todo_api_PostTodos_body_title and no Step.x_todo_api_PostTodos_body_title__len and no Step.x_todo_api_PostTodos_body_title__trim and no Step.x_todo_api_PostTodos_body_title__trimlen)
  or (some p_body_title: Str | cmd_todo_api_PostTodos[p_body_title] and Step.event = k_todo_api_PostTodos and Step.x_todo_api_PostTodos_body_title = p_body_title and Step.x_todo_api_PostTodos_body_title__len = p_body_title.len and Step.x_todo_api_PostTodos_body_title__trim = p_body_title.trimmed and Step.x_todo_api_PostTodos_body_title__trimlen = p_body_title.trimmed.len and no Step.x_todo_api_CompleteTodo_id and no Step.x_todo_api_DeleteTodo_id)) }
fact { no Env.env_ids_NewId_used }
fact { always ((some Step.event and Step.event in (k_todo_api_PostTodos)) implies (Env.env_ids_NewId not in Env.env_ids_NewId_used and Env.env_ids_NewId_used' = Env.env_ids_NewId_used + Env.env_ids_NewId) else Env.env_ids_NewId_used' = Env.env_ids_NewId_used) }
run c0 { eventually (some p_body_title: Str | Step.event = k_todo_api_PostTodos and Step.x_todo_api_PostTodos_body_title = p_body_title and (out_todos_Add_result[p_body_title] = str_4)) } for 3 but 6 Int, 15 Str, 1..8 steps
run c1 { eventually (some p_body_title: Str | Step.event = k_todo_api_PostTodos and Step.x_todo_api_PostTodos_body_title = p_body_title and ((not (out_todos_Add_result[p_body_title] = str_4)) and (out_todos_Add_result[p_body_title] = str_7))) } for 3 but 6 Int, 15 Str, 1..8 steps
run c2 { eventually (some p_body_title: Str | Step.event = k_todo_api_PostTodos and Step.x_todo_api_PostTodos_body_title = p_body_title and ((not (out_todos_Add_result[p_body_title] = str_4)) and (not (out_todos_Add_result[p_body_title] = str_7)))) } for 3 but 6 Int, 15 Str, 1..8 steps
run c3 { eventually (some p_only: Str | p_only in (str_1 + str_9 + str_6) and (p_only = str_9)) } for 3 but 6 Int, 15 Str, 1..8 steps
run c4 { eventually (some p_only: Str | p_only in (str_1 + str_9 + str_6) and (not (p_only = str_9)) and (p_only = str_6)) } for 3 but 6 Int, 15 Str, 1..8 steps
run c5 { eventually (some p_only: Str | p_only in (str_1 + str_9 + str_6) and (not (p_only = str_9)) and (not (p_only = str_6))) } for 3 but 6 Int, 15 Str, 1..8 steps
check c6 { (always (all b_e: (c_store.f_store_entries) | (#{ b_f: (c_store.f_store_entries) | ((b_f.e_store_entries_key) = (b_e.e_store_entries_key)) } = 1))) } for 3 but 6 Int, 15 Str, 6 steps
run sane { some Bool } for 3 but 6 Int, 15 Str, 1..8 steps
