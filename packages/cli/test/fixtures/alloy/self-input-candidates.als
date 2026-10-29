module spec

abstract sig Bool {}
one sig True, False extends Bool {}
sig Str {}
sig Json {}
abstract sig s_num0 {}
one sig s_num0_0, s_num0_1, s_num0_2, s_num0_3, s_num0_4, s_num0_5, s_num0_6 extends s_num0 {}
fun next_num0: s_num0 -> s_num0 { s_num0_0 -> s_num0_1 + s_num0_1 -> s_num0_2 + s_num0_2 -> s_num0_3 + s_num0_3 -> s_num0_4 + s_num0_4 -> s_num0_5 + s_num0_5 -> s_num0_6 }
abstract sig s_num1 {}
one sig s_num1_0, s_num1_1, s_num1_2, s_num1_3, s_num1_4, s_num1_5, s_num1_6 extends s_num1 {}
fun next_num1: s_num1 -> s_num1 { s_num1_0 -> s_num1_1 + s_num1_1 -> s_num1_2 + s_num1_2 -> s_num1_3 + s_num1_3 -> s_num1_4 + s_num1_4 -> s_num1_5 + s_num1_5 -> s_num1_6 }
sig Slot_input_candidates_usablePositions { var e_input_candidates_usablePositions_v: lone Int }
one sig c_input_candidates { var f_input_candidates_usablePositions: set Slot_input_candidates_usablePositions, var f_input_candidates_itemsGiven: one Int, var f_input_candidates_pickGiven: lone Int }
one sig Env {}
abstract sig Entry {}
one sig k_input_candidates_Around, k_input_candidates_BeginAmong, k_input_candidates_BeginNumbers, k_input_candidates_BeginStrings, k_input_candidates_Item, k_input_candidates_LengthNumber, k_input_candidates_Text extends Entry {}
one sig Step { var event: lone Entry, var x_input_candidates_Around_around: lone s_num1, var x_input_candidates_BeginAmong_pick: lone Int, var x_input_candidates_BeginNumbers_integer: lone Bool, var x_input_candidates_BeginNumbers_min: lone s_num1, var x_input_candidates_BeginNumbers_max: lone s_num1, var x_input_candidates_Item_usable: lone Bool, var x_input_candidates_LengthNumber_number: lone s_num0, var x_input_candidates_Text_text: lone Str }
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
pred ev_input_candidates_LengthNumber_otherwise[p_number: s_num0] {
  (some Bool)
  c_input_candidates.f_input_candidates_usablePositions' = c_input_candidates.f_input_candidates_usablePositions and (all s: Slot_input_candidates_usablePositions | s.e_input_candidates_usablePositions_v' = s.e_input_candidates_usablePositions_v)
  c_input_candidates.f_input_candidates_itemsGiven' = c_input_candidates.f_input_candidates_itemsGiven
  c_input_candidates.f_input_candidates_pickGiven' = c_input_candidates.f_input_candidates_pickGiven
}
pred cmd_input_candidates_LengthNumber[p_number: s_num0] {
  ((p_number in s_num0_2.*next_num0) and (s_num0_4 in p_number.*next_num0)) and (ev_input_candidates_LengthNumber_otherwise[p_number])
}
pred ev_input_candidates_BeginNumbers_otherwise[p_integer: Bool, p_min: lone s_num1, p_max: lone s_num1] {
  (some Bool)
  c_input_candidates.f_input_candidates_usablePositions' = c_input_candidates.f_input_candidates_usablePositions and (all s: Slot_input_candidates_usablePositions | s.e_input_candidates_usablePositions_v' = s.e_input_candidates_usablePositions_v)
  c_input_candidates.f_input_candidates_itemsGiven' = c_input_candidates.f_input_candidates_itemsGiven
  c_input_candidates.f_input_candidates_pickGiven' = c_input_candidates.f_input_candidates_pickGiven
}
pred cmd_input_candidates_BeginNumbers[p_integer: Bool, p_min: lone s_num1, p_max: lone s_num1] {
  (ev_input_candidates_BeginNumbers_otherwise[p_integer, p_min, p_max])
}
pred ev_input_candidates_Around_otherwise[p_around: s_num1] {
  (some Bool)
  c_input_candidates.f_input_candidates_usablePositions' = c_input_candidates.f_input_candidates_usablePositions and (all s: Slot_input_candidates_usablePositions | s.e_input_candidates_usablePositions_v' = s.e_input_candidates_usablePositions_v)
  c_input_candidates.f_input_candidates_itemsGiven' = c_input_candidates.f_input_candidates_itemsGiven
  c_input_candidates.f_input_candidates_pickGiven' = c_input_candidates.f_input_candidates_pickGiven
}
pred cmd_input_candidates_Around[p_around: s_num1] {
  ((p_around in s_num1_2.*next_num1) and (s_num1_4 in p_around.*next_num1)) and (ev_input_candidates_Around_otherwise[p_around])
}
pred ev_input_candidates_BeginAmong_otherwise[p_pick: lone Int] {
  (some Bool)
  no c_input_candidates.f_input_candidates_usablePositions' and (all s: Slot_input_candidates_usablePositions | s.e_input_candidates_usablePositions_v' = s.e_input_candidates_usablePositions_v)
  c_input_candidates.f_input_candidates_itemsGiven' = 0
  c_input_candidates.f_input_candidates_pickGiven' = p_pick
}
pred cmd_input_candidates_BeginAmong[p_pick: lone Int] {
  (ev_input_candidates_BeginAmong_otherwise[p_pick])
}
pred ev_input_candidates_Item_otherwise[p_usable: Bool] {
  (some Bool)
  ((p_usable = True) implies ((some n_0: Slot_input_candidates_usablePositions - c_input_candidates.f_input_candidates_usablePositions | c_input_candidates.f_input_candidates_usablePositions' = c_input_candidates.f_input_candidates_usablePositions + n_0 and n_0.e_input_candidates_usablePositions_v' = (c_input_candidates.f_input_candidates_itemsGiven) and (all s: Slot_input_candidates_usablePositions - (n_0) | s.e_input_candidates_usablePositions_v' = s.e_input_candidates_usablePositions_v))) else (c_input_candidates.f_input_candidates_usablePositions' = c_input_candidates.f_input_candidates_usablePositions and (all s: Slot_input_candidates_usablePositions | s.e_input_candidates_usablePositions_v' = s.e_input_candidates_usablePositions_v)))
  c_input_candidates.f_input_candidates_itemsGiven' = plus[(c_input_candidates.f_input_candidates_itemsGiven), 1]
  c_input_candidates.f_input_candidates_pickGiven' = c_input_candidates.f_input_candidates_pickGiven
}
pred cmd_input_candidates_Item[p_usable: Bool] {
  (ev_input_candidates_Item_otherwise[p_usable])
}
fact initial_values { no c_input_candidates.f_input_candidates_usablePositions and c_input_candidates.f_input_candidates_itemsGiven = 0 and c_input_candidates.f_input_candidates_pickGiven = none }
fact transitions { always ((same_input_candidates and no Step.event and no Step.x_input_candidates_Around_around and no Step.x_input_candidates_BeginAmong_pick and no Step.x_input_candidates_BeginNumbers_integer and no Step.x_input_candidates_BeginNumbers_min and no Step.x_input_candidates_BeginNumbers_max and no Step.x_input_candidates_Item_usable and no Step.x_input_candidates_LengthNumber_number and no Step.x_input_candidates_Text_text)
  or (some p_around: s_num1 | cmd_input_candidates_Around[p_around] and Step.event = k_input_candidates_Around and Step.x_input_candidates_Around_around = p_around and no Step.x_input_candidates_BeginAmong_pick and no Step.x_input_candidates_BeginNumbers_integer and no Step.x_input_candidates_BeginNumbers_min and no Step.x_input_candidates_BeginNumbers_max and no Step.x_input_candidates_Item_usable and no Step.x_input_candidates_LengthNumber_number and no Step.x_input_candidates_Text_text)
  or (((some p_pick: Int | cmd_input_candidates_BeginAmong[p_pick] and Step.event = k_input_candidates_BeginAmong and Step.x_input_candidates_BeginAmong_pick = p_pick and no Step.x_input_candidates_Around_around and no Step.x_input_candidates_BeginNumbers_integer and no Step.x_input_candidates_BeginNumbers_min and no Step.x_input_candidates_BeginNumbers_max and no Step.x_input_candidates_Item_usable and no Step.x_input_candidates_LengthNumber_number and no Step.x_input_candidates_Text_text) or (let p_pick = none | cmd_input_candidates_BeginAmong[p_pick] and Step.event = k_input_candidates_BeginAmong and Step.x_input_candidates_BeginAmong_pick = p_pick and no Step.x_input_candidates_Around_around and no Step.x_input_candidates_BeginNumbers_integer and no Step.x_input_candidates_BeginNumbers_min and no Step.x_input_candidates_BeginNumbers_max and no Step.x_input_candidates_Item_usable and no Step.x_input_candidates_LengthNumber_number and no Step.x_input_candidates_Text_text)))
  or (some p_integer: Bool | ((some p_max: s_num1 | ((some p_min: s_num1 | cmd_input_candidates_BeginNumbers[p_integer, p_min, p_max] and Step.event = k_input_candidates_BeginNumbers and Step.x_input_candidates_BeginNumbers_integer = p_integer and Step.x_input_candidates_BeginNumbers_min = p_min and Step.x_input_candidates_BeginNumbers_max = p_max and no Step.x_input_candidates_Around_around and no Step.x_input_candidates_BeginAmong_pick and no Step.x_input_candidates_Item_usable and no Step.x_input_candidates_LengthNumber_number and no Step.x_input_candidates_Text_text) or (let p_min = none | cmd_input_candidates_BeginNumbers[p_integer, p_min, p_max] and Step.event = k_input_candidates_BeginNumbers and Step.x_input_candidates_BeginNumbers_integer = p_integer and Step.x_input_candidates_BeginNumbers_min = p_min and Step.x_input_candidates_BeginNumbers_max = p_max and no Step.x_input_candidates_Around_around and no Step.x_input_candidates_BeginAmong_pick and no Step.x_input_candidates_Item_usable and no Step.x_input_candidates_LengthNumber_number and no Step.x_input_candidates_Text_text))) or (let p_max = none | ((some p_min: s_num1 | cmd_input_candidates_BeginNumbers[p_integer, p_min, p_max] and Step.event = k_input_candidates_BeginNumbers and Step.x_input_candidates_BeginNumbers_integer = p_integer and Step.x_input_candidates_BeginNumbers_min = p_min and Step.x_input_candidates_BeginNumbers_max = p_max and no Step.x_input_candidates_Around_around and no Step.x_input_candidates_BeginAmong_pick and no Step.x_input_candidates_Item_usable and no Step.x_input_candidates_LengthNumber_number and no Step.x_input_candidates_Text_text) or (let p_min = none | cmd_input_candidates_BeginNumbers[p_integer, p_min, p_max] and Step.event = k_input_candidates_BeginNumbers and Step.x_input_candidates_BeginNumbers_integer = p_integer and Step.x_input_candidates_BeginNumbers_min = p_min and Step.x_input_candidates_BeginNumbers_max = p_max and no Step.x_input_candidates_Around_around and no Step.x_input_candidates_BeginAmong_pick and no Step.x_input_candidates_Item_usable and no Step.x_input_candidates_LengthNumber_number and no Step.x_input_candidates_Text_text)))))
  or (cmd_input_candidates_BeginStrings[] and Step.event = k_input_candidates_BeginStrings and no Step.x_input_candidates_Around_around and no Step.x_input_candidates_BeginAmong_pick and no Step.x_input_candidates_BeginNumbers_integer and no Step.x_input_candidates_BeginNumbers_min and no Step.x_input_candidates_BeginNumbers_max and no Step.x_input_candidates_Item_usable and no Step.x_input_candidates_LengthNumber_number and no Step.x_input_candidates_Text_text)
  or (some p_usable: Bool | cmd_input_candidates_Item[p_usable] and Step.event = k_input_candidates_Item and Step.x_input_candidates_Item_usable = p_usable and no Step.x_input_candidates_Around_around and no Step.x_input_candidates_BeginAmong_pick and no Step.x_input_candidates_BeginNumbers_integer and no Step.x_input_candidates_BeginNumbers_min and no Step.x_input_candidates_BeginNumbers_max and no Step.x_input_candidates_LengthNumber_number and no Step.x_input_candidates_Text_text)
  or (some p_number: s_num0 | cmd_input_candidates_LengthNumber[p_number] and Step.event = k_input_candidates_LengthNumber and Step.x_input_candidates_LengthNumber_number = p_number and no Step.x_input_candidates_Around_around and no Step.x_input_candidates_BeginAmong_pick and no Step.x_input_candidates_BeginNumbers_integer and no Step.x_input_candidates_BeginNumbers_min and no Step.x_input_candidates_BeginNumbers_max and no Step.x_input_candidates_Item_usable and no Step.x_input_candidates_Text_text)
  or (some p_text: Str | cmd_input_candidates_Text[p_text] and Step.event = k_input_candidates_Text and Step.x_input_candidates_Text_text = p_text and no Step.x_input_candidates_Around_around and no Step.x_input_candidates_BeginAmong_pick and no Step.x_input_candidates_BeginNumbers_integer and no Step.x_input_candidates_BeginNumbers_min and no Step.x_input_candidates_BeginNumbers_max and no Step.x_input_candidates_Item_usable and no Step.x_input_candidates_LengthNumber_number)) }
run c0 { eventually ((((c_input_candidates.f_input_candidates_pickGiven) = none) or (#(c_input_candidates.f_input_candidates_usablePositions) = 0))) } for 3 but 4 Int, 3 Str, 1..8 steps
run c1 { eventually ((not (((c_input_candidates.f_input_candidates_pickGiven) = none) or (#(c_input_candidates.f_input_candidates_usablePositions) = 0)))) } for 3 but 4 Int, 3 Str, 1..8 steps
run c2 { eventually (Step.event = k_input_candidates_BeginStrings and (some Bool)) } for 3 but 4 Int, 3 Str, 1..8 steps
run c3 { eventually (some p_text: Str | Step.event = k_input_candidates_Text and Step.x_input_candidates_Text_text = p_text and (some Bool)) } for 3 but 4 Int, 3 Str, 1..8 steps
run c4 { eventually (some p_number: s_num0 | Step.event = k_input_candidates_LengthNumber and Step.x_input_candidates_LengthNumber_number = p_number and ((p_number in s_num0_2.*next_num0) and (s_num0_4 in p_number.*next_num0)) and (some Bool)) } for 3 but 4 Int, 3 Str, 1..8 steps
run c5 { eventually (some p_integer: Bool | ((some p_max: s_num1 | ((some p_min: s_num1 | Step.event = k_input_candidates_BeginNumbers and Step.x_input_candidates_BeginNumbers_integer = p_integer and Step.x_input_candidates_BeginNumbers_min = p_min and Step.x_input_candidates_BeginNumbers_max = p_max and (some Bool)) or (let p_min = none | Step.event = k_input_candidates_BeginNumbers and Step.x_input_candidates_BeginNumbers_integer = p_integer and Step.x_input_candidates_BeginNumbers_min = p_min and Step.x_input_candidates_BeginNumbers_max = p_max and (some Bool)))) or (let p_max = none | ((some p_min: s_num1 | Step.event = k_input_candidates_BeginNumbers and Step.x_input_candidates_BeginNumbers_integer = p_integer and Step.x_input_candidates_BeginNumbers_min = p_min and Step.x_input_candidates_BeginNumbers_max = p_max and (some Bool)) or (let p_min = none | Step.event = k_input_candidates_BeginNumbers and Step.x_input_candidates_BeginNumbers_integer = p_integer and Step.x_input_candidates_BeginNumbers_min = p_min and Step.x_input_candidates_BeginNumbers_max = p_max and (some Bool)))))) } for 3 but 4 Int, 3 Str, 1..8 steps
run c6 { eventually (some p_around: s_num1 | Step.event = k_input_candidates_Around and Step.x_input_candidates_Around_around = p_around and ((p_around in s_num1_2.*next_num1) and (s_num1_4 in p_around.*next_num1)) and (some Bool)) } for 3 but 4 Int, 3 Str, 1..8 steps
run c7 { eventually (((some p_pick: Int | Step.event = k_input_candidates_BeginAmong and Step.x_input_candidates_BeginAmong_pick = p_pick and (some Bool)) or (let p_pick = none | Step.event = k_input_candidates_BeginAmong and Step.x_input_candidates_BeginAmong_pick = p_pick and (some Bool)))) } for 3 but 4 Int, 3 Str, 1..8 steps
run c8 { eventually (some p_usable: Bool | Step.event = k_input_candidates_Item and Step.x_input_candidates_Item_usable = p_usable and (some Bool)) } for 3 but 4 Int, 3 Str, 1..8 steps
run sane { some Bool } for 3 but 4 Int, 3 Str, 1..8 steps
