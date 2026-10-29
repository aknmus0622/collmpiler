module spec

abstract sig Bool {}
one sig True, False extends Bool {}
sig Str {}
sig Json {}
one sig str_0, str_1 extends Str {}
sig Slot_store_entries { var e_store_entries_key: lone Str, var e_store_entries_value: lone (Json + Int + Str + Bool) }
one sig c_store { var f_store_entries: set Slot_store_entries }
one sig Env {}
abstract sig Entry {}
one sig k_store_Delete, k_store_Put extends Entry {}
one sig Step { var event: lone Entry, var x_store_Delete_key: lone Str, var x_store_Put_key: lone Str, var x_store_Put_data: lone (Json + Int + Str + Bool) }
pred same_store { c_store.f_store_entries' = c_store.f_store_entries and (all s: Slot_store_entries | s.e_store_entries_key' = s.e_store_entries_key) and (all s: Slot_store_entries | s.e_store_entries_value' = s.e_store_entries_value) }
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
fact transitions { always ((same_store and no Step.event and no Step.x_store_Delete_key and no Step.x_store_Put_key and no Step.x_store_Put_data)
  or (some p_key: Str | cmd_store_Delete[p_key] and Step.event = k_store_Delete and Step.x_store_Delete_key = p_key and no Step.x_store_Put_key and no Step.x_store_Put_data)
  or (some p_key: Str, p_data: lone (Json + Int + Str + Bool) | cmd_store_Put[p_key, p_data] and Step.event = k_store_Put and Step.x_store_Put_key = p_key and Step.x_store_Put_data = p_data and no Step.x_store_Delete_key)) }
check c0 { (always (all b_e: (c_store.f_store_entries) | (#{ b_f: (c_store.f_store_entries) | ((b_f.e_store_entries_key) = (b_e.e_store_entries_key)) } = 1))) } for 3 but 4 Int, 5 Str, 6 steps
run c1 { eventually (some p_key: Str, p_data: lone (Json + Int + Str + Bool) | Step.event = k_store_Put and Step.x_store_Put_key = p_key and Step.x_store_Put_data = p_data and (some Bool)) } for 3 but 4 Int, 5 Str, 1..8 steps
run c2 { eventually (some p_key: Str | Step.event = k_store_Delete and Step.x_store_Delete_key = p_key and (not (some b_e: (c_store.f_store_entries) | ((b_e.e_store_entries_key) = p_key)))) } for 3 but 4 Int, 5 Str, 1..8 steps
run c3 { eventually (some p_key: Str | Step.event = k_store_Delete and Step.x_store_Delete_key = p_key and (some b_e: (c_store.f_store_entries) | ((b_e.e_store_entries_key) = p_key))) } for 3 but 4 Int, 5 Str, 1..8 steps
run sane { some Bool } for 3 but 4 Int, 5 Str, 1..8 steps
