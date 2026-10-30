module spec

abstract sig Bool {}
one sig True, False extends Bool {}
abstract sig Num {}
sig Str {}
sig Json {}
abstract sig s_num0 extends Num {}
one sig s_num0_0, s_num0_1, s_num0_2, s_num0_3, s_num0_4, s_num0_5, s_num0_6, s_num0_7, s_num0_8, s_num0_9, s_num0_10, s_num0_11, s_num0_12, s_num0_13 extends s_num0 {}
fun next_num0: s_num0 -> s_num0 { s_num0_0 -> s_num0_1 + s_num0_1 -> s_num0_2 + s_num0_2 -> s_num0_3 + s_num0_3 -> s_num0_4 + s_num0_4 -> s_num0_5 + s_num0_5 -> s_num0_6 + s_num0_6 -> s_num0_7 + s_num0_7 -> s_num0_8 + s_num0_8 -> s_num0_9 + s_num0_9 -> s_num0_10 + s_num0_10 -> s_num0_11 + s_num0_11 -> s_num0_12 + s_num0_12 -> s_num0_13 }
abstract sig s_num6 extends Num {}
one sig s_num6_0, s_num6_1, s_num6_2, s_num6_3, s_num6_4, s_num6_5, s_num6_6, s_num6_7, s_num6_8, s_num6_9, s_num6_10, s_num6_11, s_num6_12, s_num6_13 extends s_num6 {}
fun next_num6: s_num6 -> s_num6 { s_num6_0 -> s_num6_1 + s_num6_1 -> s_num6_2 + s_num6_2 -> s_num6_3 + s_num6_3 -> s_num6_4 + s_num6_4 -> s_num6_5 + s_num6_5 -> s_num6_6 + s_num6_6 -> s_num6_7 + s_num6_7 -> s_num6_8 + s_num6_8 -> s_num6_9 + s_num6_9 -> s_num6_10 + s_num6_10 -> s_num6_11 + s_num6_11 -> s_num6_12 + s_num6_12 -> s_num6_13 }
abstract sig s_num7 extends Num {}
one sig s_num7_0, s_num7_1, s_num7_2, s_num7_3, s_num7_4, s_num7_5, s_num7_6, s_num7_7 extends s_num7 {}
fun next_num7: s_num7 -> s_num7 { s_num7_0 -> s_num7_1 + s_num7_1 -> s_num7_2 + s_num7_2 -> s_num7_3 + s_num7_3 -> s_num7_4 + s_num7_4 -> s_num7_5 + s_num7_5 -> s_num7_6 + s_num7_6 -> s_num7_7 }
abstract sig s_num8 extends Num {}
one sig s_num8_0, s_num8_1, s_num8_2, s_num8_3, s_num8_4, s_num8_5, s_num8_6, s_num8_7, s_num8_8, s_num8_9, s_num8_10, s_num8_11, s_num8_12, s_num8_13 extends s_num8 {}
fun next_num8: s_num8 -> s_num8 { s_num8_0 -> s_num8_1 + s_num8_1 -> s_num8_2 + s_num8_2 -> s_num8_3 + s_num8_3 -> s_num8_4 + s_num8_4 -> s_num8_5 + s_num8_5 -> s_num8_6 + s_num8_6 -> s_num8_7 + s_num8_7 -> s_num8_8 + s_num8_8 -> s_num8_9 + s_num8_9 -> s_num8_10 + s_num8_10 -> s_num8_11 + s_num8_11 -> s_num8_12 + s_num8_12 -> s_num8_13 }
abstract sig s_num9 extends Num {}
one sig s_num9_0, s_num9_1, s_num9_2, s_num9_3 extends s_num9 {}
fun next_num9: s_num9 -> s_num9 { s_num9_0 -> s_num9_1 + s_num9_1 -> s_num9_2 + s_num9_2 -> s_num9_3 }
abstract sig s_num11 extends Num {}
one sig s_num11_0, s_num11_1, s_num11_2, s_num11_3 extends s_num11 {}
fun next_num11: s_num11 -> s_num11 { s_num11_0 -> s_num11_1 + s_num11_1 -> s_num11_2 + s_num11_2 -> s_num11_3 }
abstract sig s_num12 extends Num {}
one sig s_num12_0, s_num12_1 extends s_num12 {}
fun next_num12: s_num12 -> s_num12 { s_num12_0 -> s_num12_1 }
abstract sig s_num19 extends Num {}
one sig s_num19_0, s_num19_1 extends s_num19 {}
fun next_num19: s_num19 -> s_num19 { s_num19_0 -> s_num19_1 }
abstract sig s_num22 extends Num {}
one sig s_num22_0, s_num22_1 extends s_num22 {}
fun next_num22: s_num22 -> s_num22 { s_num22_0 -> s_num22_1 }
sig Slot_input_candidates_usablePositions { var e_input_candidates_usablePositions_v: lone s_num0 }
one sig c_input_candidates { var f_input_candidates_usablePositions: set Slot_input_candidates_usablePositions, var f_input_candidates_itemsGiven: one s_num0, var f_input_candidates_pickGiven: lone s_num9 }
one sig Env {}
abstract sig Entry {}
one sig k_input_candidates_Around, k_input_candidates_BeginAmong, k_input_candidates_BeginNumbers, k_input_candidates_BeginStrings, k_input_candidates_Item, k_input_candidates_LengthNumber, k_input_candidates_Text extends Entry {}
one sig Step { var event: lone Entry, var x_input_candidates_Around_around: lone s_num8, var x_input_candidates_BeginAmong_pick: lone s_num9, var x_input_candidates_BeginNumbers_integer: lone Bool, var x_input_candidates_BeginNumbers_min: lone s_num7, var x_input_candidates_BeginNumbers_max: lone s_num7, var x_input_candidates_Item_usable: lone Bool, var x_input_candidates_LengthNumber_number: lone s_num6, var x_input_candidates_Text_text: lone Str }
pred same_input_candidates { c_input_candidates.f_input_candidates_usablePositions' = c_input_candidates.f_input_candidates_usablePositions and (all s: Slot_input_candidates_usablePositions | s.e_input_candidates_usablePositions_v' = s.e_input_candidates_usablePositions_v) and c_input_candidates.f_input_candidates_itemsGiven' = c_input_candidates.f_input_candidates_itemsGiven and c_input_candidates.f_input_candidates_pickGiven' = c_input_candidates.f_input_candidates_pickGiven }
pred ev_input_candidates_BeginStrings_otherwise[] {
  (some Bool)
  c_input_candidates.f_input_candidates_usablePositions' = c_input_candidates.f_input_candidates_usablePositions and (all s: Slot_input_candidates_usablePositions | s.e_input_candidates_usablePositions_v' = s.e_input_candidates_usablePositions_v)
  c_input_candidates.f_input_candidates_itemsGiven' = c_input_candidates.f_input_candidates_itemsGiven
  c_input_candidates.f_input_candidates_pickGiven' = c_input_candidates.f_input_candidates_pickGiven
}
pred cmd_input_candidates_BeginStrings[] {
  (ev_input_candidates_BeginStrings_otherwise[])
}
pred ev_input_candidates_Text_otherwise[p_text: Str] {
  (some Bool)
  c_input_candidates.f_input_candidates_usablePositions' = c_input_candidates.f_input_candidates_usablePositions and (all s: Slot_input_candidates_usablePositions | s.e_input_candidates_usablePositions_v' = s.e_input_candidates_usablePositions_v)
  c_input_candidates.f_input_candidates_itemsGiven' = c_input_candidates.f_input_candidates_itemsGiven
  c_input_candidates.f_input_candidates_pickGiven' = c_input_candidates.f_input_candidates_pickGiven
}
pred cmd_input_candidates_Text[p_text: Str] {
  (ev_input_candidates_Text_otherwise[p_text])
}
pred ev_input_candidates_LengthNumber_otherwise[p_number: s_num6] {
  (some Bool)
  c_input_candidates.f_input_candidates_usablePositions' = c_input_candidates.f_input_candidates_usablePositions and (all s: Slot_input_candidates_usablePositions | s.e_input_candidates_usablePositions_v' = s.e_input_candidates_usablePositions_v)
  c_input_candidates.f_input_candidates_itemsGiven' = c_input_candidates.f_input_candidates_itemsGiven
  c_input_candidates.f_input_candidates_pickGiven' = c_input_candidates.f_input_candidates_pickGiven
}
pred cmd_input_candidates_LengthNumber[p_number: s_num6] {
  ((p_number in s_num6_4.*next_num6) and (s_num6_9 in p_number.*next_num6)) and (ev_input_candidates_LengthNumber_otherwise[p_number])
}
pred ev_input_candidates_BeginNumbers_otherwise[p_integer: Bool, p_min: lone s_num7, p_max: lone s_num7] {
  (some Bool)
  c_input_candidates.f_input_candidates_usablePositions' = c_input_candidates.f_input_candidates_usablePositions and (all s: Slot_input_candidates_usablePositions | s.e_input_candidates_usablePositions_v' = s.e_input_candidates_usablePositions_v)
  c_input_candidates.f_input_candidates_itemsGiven' = c_input_candidates.f_input_candidates_itemsGiven
  c_input_candidates.f_input_candidates_pickGiven' = c_input_candidates.f_input_candidates_pickGiven
}
pred cmd_input_candidates_BeginNumbers[p_integer: Bool, p_min: lone s_num7, p_max: lone s_num7] {
  (ev_input_candidates_BeginNumbers_otherwise[p_integer, p_min, p_max])
}
pred ev_input_candidates_Around_otherwise[p_around: s_num8] {
  (some Bool)
  c_input_candidates.f_input_candidates_usablePositions' = c_input_candidates.f_input_candidates_usablePositions and (all s: Slot_input_candidates_usablePositions | s.e_input_candidates_usablePositions_v' = s.e_input_candidates_usablePositions_v)
  c_input_candidates.f_input_candidates_itemsGiven' = c_input_candidates.f_input_candidates_itemsGiven
  c_input_candidates.f_input_candidates_pickGiven' = c_input_candidates.f_input_candidates_pickGiven
}
pred cmd_input_candidates_Around[p_around: s_num8] {
  ((p_around in s_num8_4.*next_num8) and (s_num8_9 in p_around.*next_num8)) and (ev_input_candidates_Around_otherwise[p_around])
}
pred ev_input_candidates_BeginAmong_otherwise[p_pick: lone s_num9] {
  (some Bool)
  no c_input_candidates.f_input_candidates_usablePositions' and (all s: Slot_input_candidates_usablePositions | s.e_input_candidates_usablePositions_v' = s.e_input_candidates_usablePositions_v)
  c_input_candidates.f_input_candidates_itemsGiven' = s_num0_0
  c_input_candidates.f_input_candidates_pickGiven' = p_pick
}
pred cmd_input_candidates_BeginAmong[p_pick: lone s_num9] {
  (ev_input_candidates_BeginAmong_otherwise[p_pick])
}
pred ev_input_candidates_Item_otherwise[p_usable: Bool] {
  (some Bool)
  ((p_usable = True) implies ((some n_0: Slot_input_candidates_usablePositions - c_input_candidates.f_input_candidates_usablePositions | c_input_candidates.f_input_candidates_usablePositions' = c_input_candidates.f_input_candidates_usablePositions + n_0 and n_0.e_input_candidates_usablePositions_v' = (c_input_candidates.f_input_candidates_itemsGiven) and (all s: Slot_input_candidates_usablePositions - (n_0) | s.e_input_candidates_usablePositions_v' = s.e_input_candidates_usablePositions_v))) else (c_input_candidates.f_input_candidates_usablePositions' = c_input_candidates.f_input_candidates_usablePositions and (all s: Slot_input_candidates_usablePositions | s.e_input_candidates_usablePositions_v' = s.e_input_candidates_usablePositions_v)))
  c_input_candidates.f_input_candidates_itemsGiven' = ((c_input_candidates.f_input_candidates_itemsGiven).next_num0)
  c_input_candidates.f_input_candidates_pickGiven' = c_input_candidates.f_input_candidates_pickGiven
}
pred cmd_input_candidates_Item[p_usable: Bool] {
  (ev_input_candidates_Item_otherwise[p_usable])
}
fact initial_values { no c_input_candidates.f_input_candidates_usablePositions and c_input_candidates.f_input_candidates_itemsGiven = s_num0_0 and c_input_candidates.f_input_candidates_pickGiven = none }
fact transitions { always ((same_input_candidates and no Step.event and no Step.x_input_candidates_Around_around and no Step.x_input_candidates_BeginAmong_pick and no Step.x_input_candidates_BeginNumbers_integer and no Step.x_input_candidates_BeginNumbers_min and no Step.x_input_candidates_BeginNumbers_max and no Step.x_input_candidates_Item_usable and no Step.x_input_candidates_LengthNumber_number and no Step.x_input_candidates_Text_text)
  or (some p_around: s_num8 | cmd_input_candidates_Around[p_around] and Step.event = k_input_candidates_Around and Step.x_input_candidates_Around_around = p_around and no Step.x_input_candidates_BeginAmong_pick and no Step.x_input_candidates_BeginNumbers_integer and no Step.x_input_candidates_BeginNumbers_min and no Step.x_input_candidates_BeginNumbers_max and no Step.x_input_candidates_Item_usable and no Step.x_input_candidates_LengthNumber_number and no Step.x_input_candidates_Text_text)
  or (((some p_pick: s_num9 | cmd_input_candidates_BeginAmong[p_pick] and Step.event = k_input_candidates_BeginAmong and Step.x_input_candidates_BeginAmong_pick = p_pick and no Step.x_input_candidates_Around_around and no Step.x_input_candidates_BeginNumbers_integer and no Step.x_input_candidates_BeginNumbers_min and no Step.x_input_candidates_BeginNumbers_max and no Step.x_input_candidates_Item_usable and no Step.x_input_candidates_LengthNumber_number and no Step.x_input_candidates_Text_text) or (let p_pick = none | cmd_input_candidates_BeginAmong[p_pick] and Step.event = k_input_candidates_BeginAmong and Step.x_input_candidates_BeginAmong_pick = p_pick and no Step.x_input_candidates_Around_around and no Step.x_input_candidates_BeginNumbers_integer and no Step.x_input_candidates_BeginNumbers_min and no Step.x_input_candidates_BeginNumbers_max and no Step.x_input_candidates_Item_usable and no Step.x_input_candidates_LengthNumber_number and no Step.x_input_candidates_Text_text)))
  or (some p_integer: Bool | ((some p_max: s_num7 | ((some p_min: s_num7 | cmd_input_candidates_BeginNumbers[p_integer, p_min, p_max] and Step.event = k_input_candidates_BeginNumbers and Step.x_input_candidates_BeginNumbers_integer = p_integer and Step.x_input_candidates_BeginNumbers_min = p_min and Step.x_input_candidates_BeginNumbers_max = p_max and no Step.x_input_candidates_Around_around and no Step.x_input_candidates_BeginAmong_pick and no Step.x_input_candidates_Item_usable and no Step.x_input_candidates_LengthNumber_number and no Step.x_input_candidates_Text_text) or (let p_min = none | cmd_input_candidates_BeginNumbers[p_integer, p_min, p_max] and Step.event = k_input_candidates_BeginNumbers and Step.x_input_candidates_BeginNumbers_integer = p_integer and Step.x_input_candidates_BeginNumbers_min = p_min and Step.x_input_candidates_BeginNumbers_max = p_max and no Step.x_input_candidates_Around_around and no Step.x_input_candidates_BeginAmong_pick and no Step.x_input_candidates_Item_usable and no Step.x_input_candidates_LengthNumber_number and no Step.x_input_candidates_Text_text))) or (let p_max = none | ((some p_min: s_num7 | cmd_input_candidates_BeginNumbers[p_integer, p_min, p_max] and Step.event = k_input_candidates_BeginNumbers and Step.x_input_candidates_BeginNumbers_integer = p_integer and Step.x_input_candidates_BeginNumbers_min = p_min and Step.x_input_candidates_BeginNumbers_max = p_max and no Step.x_input_candidates_Around_around and no Step.x_input_candidates_BeginAmong_pick and no Step.x_input_candidates_Item_usable and no Step.x_input_candidates_LengthNumber_number and no Step.x_input_candidates_Text_text) or (let p_min = none | cmd_input_candidates_BeginNumbers[p_integer, p_min, p_max] and Step.event = k_input_candidates_BeginNumbers and Step.x_input_candidates_BeginNumbers_integer = p_integer and Step.x_input_candidates_BeginNumbers_min = p_min and Step.x_input_candidates_BeginNumbers_max = p_max and no Step.x_input_candidates_Around_around and no Step.x_input_candidates_BeginAmong_pick and no Step.x_input_candidates_Item_usable and no Step.x_input_candidates_LengthNumber_number and no Step.x_input_candidates_Text_text)))))
  or (cmd_input_candidates_BeginStrings[] and Step.event = k_input_candidates_BeginStrings and no Step.x_input_candidates_Around_around and no Step.x_input_candidates_BeginAmong_pick and no Step.x_input_candidates_BeginNumbers_integer and no Step.x_input_candidates_BeginNumbers_min and no Step.x_input_candidates_BeginNumbers_max and no Step.x_input_candidates_Item_usable and no Step.x_input_candidates_LengthNumber_number and no Step.x_input_candidates_Text_text)
  or (some p_usable: Bool | cmd_input_candidates_Item[p_usable] and Step.event = k_input_candidates_Item and Step.x_input_candidates_Item_usable = p_usable and no Step.x_input_candidates_Around_around and no Step.x_input_candidates_BeginAmong_pick and no Step.x_input_candidates_BeginNumbers_integer and no Step.x_input_candidates_BeginNumbers_min and no Step.x_input_candidates_BeginNumbers_max and no Step.x_input_candidates_LengthNumber_number and no Step.x_input_candidates_Text_text)
  or (some p_number: s_num6 | cmd_input_candidates_LengthNumber[p_number] and Step.event = k_input_candidates_LengthNumber and Step.x_input_candidates_LengthNumber_number = p_number and no Step.x_input_candidates_Around_around and no Step.x_input_candidates_BeginAmong_pick and no Step.x_input_candidates_BeginNumbers_integer and no Step.x_input_candidates_BeginNumbers_min and no Step.x_input_candidates_BeginNumbers_max and no Step.x_input_candidates_Item_usable and no Step.x_input_candidates_Text_text)
  or (some p_text: Str | cmd_input_candidates_Text[p_text] and Step.event = k_input_candidates_Text and Step.x_input_candidates_Text_text = p_text and no Step.x_input_candidates_Around_around and no Step.x_input_candidates_BeginAmong_pick and no Step.x_input_candidates_BeginNumbers_integer and no Step.x_input_candidates_BeginNumbers_min and no Step.x_input_candidates_BeginNumbers_max and no Step.x_input_candidates_Item_usable and no Step.x_input_candidates_LengthNumber_number)) }
run c0 { eventually ((((c_input_candidates.f_input_candidates_pickGiven) = none) or (#(c_input_candidates.f_input_candidates_usablePositions) = s_num19_0))) } for 3 but 4 Int, 3 Str, 1..8 steps
run c1 { eventually ((not (((c_input_candidates.f_input_candidates_pickGiven) = none) or (#(c_input_candidates.f_input_candidates_usablePositions) = s_num19_0)))) } for 3 but 4 Int, 3 Str, 1..8 steps
run c2 { eventually (Step.event = k_input_candidates_BeginStrings and (some Bool)) } for 3 but 4 Int, 3 Str, 1..8 steps
run c3 { eventually (some p_text: Str | Step.event = k_input_candidates_Text and Step.x_input_candidates_Text_text = p_text and (some Bool)) } for 3 but 4 Int, 3 Str, 1..8 steps
run c4 { eventually (some p_number: s_num6 | Step.event = k_input_candidates_LengthNumber and Step.x_input_candidates_LengthNumber_number = p_number and ((p_number in s_num6_4.*next_num6) and (s_num6_9 in p_number.*next_num6)) and (some Bool)) } for 3 but 4 Int, 3 Str, 1..8 steps
run c5 { eventually (some p_integer: Bool | ((some p_max: s_num7 | ((some p_min: s_num7 | Step.event = k_input_candidates_BeginNumbers and Step.x_input_candidates_BeginNumbers_integer = p_integer and Step.x_input_candidates_BeginNumbers_min = p_min and Step.x_input_candidates_BeginNumbers_max = p_max and (some Bool)) or (let p_min = none | Step.event = k_input_candidates_BeginNumbers and Step.x_input_candidates_BeginNumbers_integer = p_integer and Step.x_input_candidates_BeginNumbers_min = p_min and Step.x_input_candidates_BeginNumbers_max = p_max and (some Bool)))) or (let p_max = none | ((some p_min: s_num7 | Step.event = k_input_candidates_BeginNumbers and Step.x_input_candidates_BeginNumbers_integer = p_integer and Step.x_input_candidates_BeginNumbers_min = p_min and Step.x_input_candidates_BeginNumbers_max = p_max and (some Bool)) or (let p_min = none | Step.event = k_input_candidates_BeginNumbers and Step.x_input_candidates_BeginNumbers_integer = p_integer and Step.x_input_candidates_BeginNumbers_min = p_min and Step.x_input_candidates_BeginNumbers_max = p_max and (some Bool)))))) } for 3 but 4 Int, 3 Str, 1..8 steps
run c6 { eventually (some p_around: s_num8 | Step.event = k_input_candidates_Around and Step.x_input_candidates_Around_around = p_around and ((p_around in s_num8_4.*next_num8) and (s_num8_9 in p_around.*next_num8)) and (some Bool)) } for 3 but 4 Int, 3 Str, 1..8 steps
run c7 { eventually (((some p_pick: s_num9 | Step.event = k_input_candidates_BeginAmong and Step.x_input_candidates_BeginAmong_pick = p_pick and (some Bool)) or (let p_pick = none | Step.event = k_input_candidates_BeginAmong and Step.x_input_candidates_BeginAmong_pick = p_pick and (some Bool)))) } for 3 but 4 Int, 3 Str, 1..8 steps
run c8 { eventually (some p_usable: Bool | Step.event = k_input_candidates_Item and Step.x_input_candidates_Item_usable = p_usable and (some Bool)) } for 3 but 4 Int, 3 Str, 1..8 steps
run sane { some Bool } for 3 but 4 Int, 3 Str, 1..8 steps
