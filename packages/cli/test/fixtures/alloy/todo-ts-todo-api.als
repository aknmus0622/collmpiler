module spec

abstract sig Bool {}
one sig True, False extends Bool {}
sig Str { len: one Int, trimmed: one Str }
sig Json {}
one sig str_0, str_1, str_2, str_3, str_4, str_5, str_6, str_7, str_8, str_9 extends Str {}
fact strings { all s: Str | s.len >= 0 and s.trimmed.trimmed = s.trimmed and s.trimmed.len <= s.len and (s.len = 0 iff s = str_0) and str_0.len = 0 and str_0.trimmed = str_0 and str_1.len = 3 and str_1.trimmed = str_1 and str_2.len = 11 and str_2.trimmed = str_2 and str_3.len = 9 and str_3.trimmed = str_3 and str_4.len = 7 and str_4.trimmed = str_4 and str_5.len = 4 and str_5.trimmed = str_5 and str_6.len = 7 and str_6.trimmed = str_6 and str_7.len = 9 and str_7.trimmed = str_7 and str_8.len = 4 and str_8.trimmed = str_8 and str_9.len = 7 and str_9.trimmed = str_9 }
sig s_TodoId {}
one sig c_todo_api {}
sig Slot_todos_items { var e_todos_items_id: lone s_TodoId, var e_todos_items_title: lone Str, var e_todos_items_done: lone Bool }
one sig c_todos { var f_todos_items: set Slot_todos_items }
one sig Env { var env_ids_NewId: one s_TodoId, var env_ids_NewId_used: set s_TodoId }
abstract sig Entry {}
one sig k_todo_api_CompleteTodo, k_todo_api_DeleteTodo, k_todo_api_PostTodos extends Entry {}
one sig Step { var event: lone Entry, var x_todo_api_CompleteTodo_id: lone s_TodoId, var x_todo_api_DeleteTodo_id: lone s_TodoId, var x_todo_api_PostTodos_body_title: lone Str, var x_todo_api_PostTodos_body_title__len: lone Int, var x_todo_api_PostTodos_body_title__trim: lone Str, var x_todo_api_PostTodos_body_title__trimlen: lone Int }
pred same_todo_api { some Bool }
pred same_todos { c_todos.f_todos_items' = c_todos.f_todos_items and (all s: Slot_todos_items | s.e_todos_items_id' = s.e_todos_items_id) and (all s: Slot_todos_items | s.e_todos_items_title' = s.e_todos_items_title) and (all s: Slot_todos_items | s.e_todos_items_done' = s.e_todos_items_done) }
fun out_todos_Add_result[p_title: Str]: Str { ((((p_title.trimmed).len) = 0) => str_6 else (((not (((p_title.trimmed).len) = 0)) and ((p_title.len) > 13)) => str_6 else str_4)) }
fun out_todos_Complete[p_id: s_TodoId]: Str { ((not (some b_t: (c_todos.f_todos_items) | ((b_t.e_todos_items_id) = p_id))) => str_7 else (((some b_t: (c_todos.f_todos_items) | ((b_t.e_todos_items_id) = p_id)) and (some b_t: (c_todos.f_todos_items) | (((b_t.e_todos_items_id) = p_id) and ((b_t.e_todos_items_done) = True)))) => str_2 else str_3)) }
fun out_todos_Remove[p_id: s_TodoId]: Str { ((not (some b_t: (c_todos.f_todos_items) | ((b_t.e_todos_items_id) = p_id))) => str_7 else str_9) }
pred ev_todo_api_PostTodos_case1[p_body_title: Str] {
  (out_todos_Add_result[p_body_title] = str_4)
  cmd_todos_Add[p_body_title]
}
pred ev_todo_api_PostTodos_case2[p_body_title: Str] {
  ((not (out_todos_Add_result[p_body_title] = str_4)) and (out_todos_Add_result[p_body_title] = str_6))
  cmd_todos_Add[p_body_title]
}
pred cmd_todo_api_PostTodos[p_body_title: Str] {
  (ev_todo_api_PostTodos_case1[p_body_title] or ev_todo_api_PostTodos_case2[p_body_title])
}
pred ev_todo_api_CompleteTodo_case1[p_id: s_TodoId] {
  (out_todos_Complete[p_id] = str_3)
  cmd_todos_Complete[p_id]
}
pred ev_todo_api_CompleteTodo_case2[p_id: s_TodoId] {
  ((not (out_todos_Complete[p_id] = str_3)) and (out_todos_Complete[p_id] = str_7))
  cmd_todos_Complete[p_id]
}
pred ev_todo_api_CompleteTodo_case3[p_id: s_TodoId] {
  ((not (out_todos_Complete[p_id] = str_3)) and (not (out_todos_Complete[p_id] = str_7)) and (out_todos_Complete[p_id] = str_2))
  cmd_todos_Complete[p_id]
}
pred cmd_todo_api_CompleteTodo[p_id: s_TodoId] {
  (ev_todo_api_CompleteTodo_case1[p_id] or ev_todo_api_CompleteTodo_case2[p_id] or ev_todo_api_CompleteTodo_case3[p_id])
}
pred ev_todo_api_DeleteTodo_case1[p_id: s_TodoId] {
  (out_todos_Remove[p_id] = str_9)
  cmd_todos_Remove[p_id]
}
pred ev_todo_api_DeleteTodo_case2[p_id: s_TodoId] {
  ((not (out_todos_Remove[p_id] = str_9)) and (out_todos_Remove[p_id] = str_7))
  cmd_todos_Remove[p_id]
}
pred cmd_todo_api_DeleteTodo[p_id: s_TodoId] {
  (ev_todo_api_DeleteTodo_case1[p_id] or ev_todo_api_DeleteTodo_case2[p_id])
}
pred ev_todos_Add_case1[p_title: Str] {
  (((p_title.trimmed).len) = 0)
  c_todos.f_todos_items' = c_todos.f_todos_items and (all s: Slot_todos_items | s.e_todos_items_id' = s.e_todos_items_id) and (all s: Slot_todos_items | s.e_todos_items_title' = s.e_todos_items_title) and (all s: Slot_todos_items | s.e_todos_items_done' = s.e_todos_items_done)
}
pred ev_todos_Add_case2[p_title: Str] {
  ((not (((p_title.trimmed).len) = 0)) and ((p_title.len) > 13))
  c_todos.f_todos_items' = c_todos.f_todos_items and (all s: Slot_todos_items | s.e_todos_items_id' = s.e_todos_items_id) and (all s: Slot_todos_items | s.e_todos_items_title' = s.e_todos_items_title) and (all s: Slot_todos_items | s.e_todos_items_done' = s.e_todos_items_done)
}
pred ev_todos_Add_otherwise[p_title: Str] {
  ((not (((p_title.trimmed).len) = 0)) and (not ((p_title.len) > 13)))
  (some n_0: Slot_todos_items - c_todos.f_todos_items | c_todos.f_todos_items' = c_todos.f_todos_items + n_0 and n_0.e_todos_items_id' = Env.env_ids_NewId and n_0.e_todos_items_title' = p_title and n_0.e_todos_items_done' = False and (all s: Slot_todos_items - (n_0) | s.e_todos_items_id' = s.e_todos_items_id) and (all s: Slot_todos_items - (n_0) | s.e_todos_items_title' = s.e_todos_items_title) and (all s: Slot_todos_items - (n_0) | s.e_todos_items_done' = s.e_todos_items_done))
}
pred cmd_todos_Add[p_title: Str] {
  (ev_todos_Add_case1[p_title] or ev_todos_Add_case2[p_title] or ev_todos_Add_otherwise[p_title])
}
pred ev_todos_Complete_otherwise[p_id: s_TodoId] {
  (not (some b_t: (c_todos.f_todos_items) | ((b_t.e_todos_items_id) = p_id)))
  c_todos.f_todos_items' = c_todos.f_todos_items and (all s: Slot_todos_items | s.e_todos_items_id' = s.e_todos_items_id) and (all s: Slot_todos_items | s.e_todos_items_title' = s.e_todos_items_title) and (all s: Slot_todos_items | s.e_todos_items_done' = s.e_todos_items_done)
}
pred ev_todos_Complete_case1[p_id: s_TodoId] {
  ((some b_t: (c_todos.f_todos_items) | ((b_t.e_todos_items_id) = p_id)) and (some b_t: (c_todos.f_todos_items) | (((b_t.e_todos_items_id) = p_id) and ((b_t.e_todos_items_done) = True))))
  c_todos.f_todos_items' = c_todos.f_todos_items and (all s: Slot_todos_items | s.e_todos_items_id' = s.e_todos_items_id) and (all s: Slot_todos_items | s.e_todos_items_title' = s.e_todos_items_title) and (all s: Slot_todos_items | s.e_todos_items_done' = s.e_todos_items_done)
}
pred ev_todos_Complete_case2[p_id: s_TodoId] {
  ((some b_t: (c_todos.f_todos_items) | ((b_t.e_todos_items_id) = p_id)) and (not (some b_t: (c_todos.f_todos_items) | (((b_t.e_todos_items_id) = p_id) and ((b_t.e_todos_items_done) = True)))))
  c_todos.f_todos_items' = c_todos.f_todos_items and (all b_t: (c_todos.f_todos_items) | b_t.e_todos_items_id' = (((b_t.e_todos_items_id) = p_id) => (b_t.e_todos_items_id) else (b_t.e_todos_items_id)) and b_t.e_todos_items_title' = (((b_t.e_todos_items_id) = p_id) => (b_t.e_todos_items_title) else (b_t.e_todos_items_title)) and b_t.e_todos_items_done' = (((b_t.e_todos_items_id) = p_id) => True else (b_t.e_todos_items_done))) and (all s: Slot_todos_items - (c_todos.f_todos_items) | s.e_todos_items_id' = s.e_todos_items_id) and (all s: Slot_todos_items - (c_todos.f_todos_items) | s.e_todos_items_title' = s.e_todos_items_title) and (all s: Slot_todos_items - (c_todos.f_todos_items) | s.e_todos_items_done' = s.e_todos_items_done)
}
pred cmd_todos_Complete[p_id: s_TodoId] {
  (ev_todos_Complete_otherwise[p_id] or ev_todos_Complete_case1[p_id] or ev_todos_Complete_case2[p_id])
}
pred ev_todos_Remove_otherwise[p_id: s_TodoId] {
  (not (some b_t: (c_todos.f_todos_items) | ((b_t.e_todos_items_id) = p_id)))
  c_todos.f_todos_items' = c_todos.f_todos_items and (all s: Slot_todos_items | s.e_todos_items_id' = s.e_todos_items_id) and (all s: Slot_todos_items | s.e_todos_items_title' = s.e_todos_items_title) and (all s: Slot_todos_items | s.e_todos_items_done' = s.e_todos_items_done)
}
pred ev_todos_Remove_case1[p_id: s_TodoId] {
  (some b_t: (c_todos.f_todos_items) | ((b_t.e_todos_items_id) = p_id))
  c_todos.f_todos_items' = { b_t: (c_todos.f_todos_items) | (not ((b_t.e_todos_items_id) = p_id)) } and (all s: Slot_todos_items | s.e_todos_items_id' = s.e_todos_items_id) and (all s: Slot_todos_items | s.e_todos_items_title' = s.e_todos_items_title) and (all s: Slot_todos_items | s.e_todos_items_done' = s.e_todos_items_done)
}
pred cmd_todos_Remove[p_id: s_TodoId] {
  (ev_todos_Remove_otherwise[p_id] or ev_todos_Remove_case1[p_id])
}
fact initial_values { no c_todos.f_todos_items }
fact transitions { always ((same_todo_api and same_todos and no Step.event and no Step.x_todo_api_CompleteTodo_id and no Step.x_todo_api_DeleteTodo_id and no Step.x_todo_api_PostTodos_body_title and no Step.x_todo_api_PostTodos_body_title__len and no Step.x_todo_api_PostTodos_body_title__trim and no Step.x_todo_api_PostTodos_body_title__trimlen)
  or (some p_id: s_TodoId | cmd_todo_api_CompleteTodo[p_id] and Step.event = k_todo_api_CompleteTodo and Step.x_todo_api_CompleteTodo_id = p_id and no Step.x_todo_api_DeleteTodo_id and no Step.x_todo_api_PostTodos_body_title and no Step.x_todo_api_PostTodos_body_title__len and no Step.x_todo_api_PostTodos_body_title__trim and no Step.x_todo_api_PostTodos_body_title__trimlen)
  or (some p_id: s_TodoId | cmd_todo_api_DeleteTodo[p_id] and Step.event = k_todo_api_DeleteTodo and Step.x_todo_api_DeleteTodo_id = p_id and no Step.x_todo_api_CompleteTodo_id and no Step.x_todo_api_PostTodos_body_title and no Step.x_todo_api_PostTodos_body_title__len and no Step.x_todo_api_PostTodos_body_title__trim and no Step.x_todo_api_PostTodos_body_title__trimlen)
  or (some p_body_title: Str | cmd_todo_api_PostTodos[p_body_title] and Step.event = k_todo_api_PostTodos and Step.x_todo_api_PostTodos_body_title = p_body_title and Step.x_todo_api_PostTodos_body_title__len = p_body_title.len and Step.x_todo_api_PostTodos_body_title__trim = p_body_title.trimmed and Step.x_todo_api_PostTodos_body_title__trimlen = p_body_title.trimmed.len and no Step.x_todo_api_CompleteTodo_id and no Step.x_todo_api_DeleteTodo_id)) }
fact { no Env.env_ids_NewId_used }
fact { always ((some Step.event and Step.event in (k_todo_api_PostTodos)) implies (Env.env_ids_NewId not in Env.env_ids_NewId_used and Env.env_ids_NewId_used' = Env.env_ids_NewId_used + Env.env_ids_NewId) else Env.env_ids_NewId_used' = Env.env_ids_NewId_used) }
run c0 { eventually (some p_body_title: Str | Step.event = k_todo_api_PostTodos and Step.x_todo_api_PostTodos_body_title = p_body_title and (out_todos_Add_result[p_body_title] = str_4)) } for 3 but 5 Int, 13 Str, 1..8 steps
run c1 { eventually (some p_body_title: Str | Step.event = k_todo_api_PostTodos and Step.x_todo_api_PostTodos_body_title = p_body_title and ((not (out_todos_Add_result[p_body_title] = str_4)) and (out_todos_Add_result[p_body_title] = str_6))) } for 3 but 5 Int, 13 Str, 1..8 steps
run c2 { eventually (some p_id: s_TodoId | Step.event = k_todo_api_CompleteTodo and Step.x_todo_api_CompleteTodo_id = p_id and (out_todos_Complete[p_id] = str_3)) } for 3 but 5 Int, 13 Str, 1..8 steps
run c3 { eventually (some p_id: s_TodoId | Step.event = k_todo_api_CompleteTodo and Step.x_todo_api_CompleteTodo_id = p_id and ((not (out_todos_Complete[p_id] = str_3)) and (out_todos_Complete[p_id] = str_7))) } for 3 but 5 Int, 13 Str, 1..8 steps
run c4 { eventually (some p_id: s_TodoId | Step.event = k_todo_api_CompleteTodo and Step.x_todo_api_CompleteTodo_id = p_id and ((not (out_todos_Complete[p_id] = str_3)) and (not (out_todos_Complete[p_id] = str_7)) and (out_todos_Complete[p_id] = str_2))) } for 3 but 5 Int, 13 Str, 1..8 steps
run c5 { eventually (some p_id: s_TodoId | Step.event = k_todo_api_DeleteTodo and Step.x_todo_api_DeleteTodo_id = p_id and (out_todos_Remove[p_id] = str_9)) } for 3 but 5 Int, 13 Str, 1..8 steps
run c6 { eventually (some p_id: s_TodoId | Step.event = k_todo_api_DeleteTodo and Step.x_todo_api_DeleteTodo_id = p_id and ((not (out_todos_Remove[p_id] = str_9)) and (out_todos_Remove[p_id] = str_7))) } for 3 but 5 Int, 13 Str, 1..8 steps
check c7 { (always (all b_a: (c_todos.f_todos_items) | (#{ b_b: (c_todos.f_todos_items) | ((b_b.e_todos_items_id) = (b_a.e_todos_items_id)) } = 1))) } for 3 but 5 Int, 13 Str, 6 steps
run c8 { eventually (some p_only: Str | p_only in (str_1 + str_8 + str_5) and (p_only = str_8)) } for 3 but 5 Int, 13 Str, 1..8 steps
run c9 { eventually (some p_only: Str | p_only in (str_1 + str_8 + str_5) and (not (p_only = str_8)) and (p_only = str_5)) } for 3 but 5 Int, 13 Str, 1..8 steps
run c10 { eventually (some p_only: Str | p_only in (str_1 + str_8 + str_5) and (not (p_only = str_8)) and (not (p_only = str_5))) } for 3 but 5 Int, 13 Str, 1..8 steps
run sane { some Bool } for 3 but 5 Int, 13 Str, 1..8 steps
