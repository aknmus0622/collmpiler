module spec

abstract sig Bool {}
one sig True, False extends Bool {}
sig Str {}
sig Json {}
one sig str_0, str_1, str_2, str_3, str_4, str_5, str_6, str_7, str_8, str_9, str_10, str_11, str_12, str_13, str_14, str_15, str_16, str_17, str_18, str_19, str_20 extends Str {}
one sig c_gate_rules {}
one sig Env {}
abstract sig Entry {}
one sig Step { var event: lone Entry }
pred same_gate_rules { some Bool }
fact initial_values { some Bool }
fact transitions { always ((same_gate_rules and no Step.event)) }
run c0 { eventually (some p_hidden: Bool, p_toolchain: Bool, p_toolchainIntact: Bool, p_regular: Bool, p_phase: Str, p_isAdapter: Bool, p_isSource: Bool, p_input: Bool, p_inputIntact: Bool | p_phase in (str_1 + str_20 + str_3) and (p_hidden = True)) } for 3 but 4 Int, 24 Str, 1..8 steps
run c1 { eventually (some p_hidden: Bool, p_toolchain: Bool, p_toolchainIntact: Bool, p_regular: Bool, p_phase: Str, p_isAdapter: Bool, p_isSource: Bool, p_input: Bool, p_inputIntact: Bool | p_phase in (str_1 + str_20 + str_3) and (not (p_hidden = True)) and (p_toolchain = True) and (p_toolchainIntact = True)) } for 3 but 4 Int, 24 Str, 1..8 steps
run c2 { eventually (some p_hidden: Bool, p_toolchain: Bool, p_toolchainIntact: Bool, p_regular: Bool, p_phase: Str, p_isAdapter: Bool, p_isSource: Bool, p_input: Bool, p_inputIntact: Bool | p_phase in (str_1 + str_20 + str_3) and (not (p_hidden = True)) and (p_toolchain = True) and (not (p_toolchainIntact = True))) } for 3 but 4 Int, 24 Str, 1..8 steps
run c3 { eventually (some p_hidden: Bool, p_toolchain: Bool, p_toolchainIntact: Bool, p_regular: Bool, p_phase: Str, p_isAdapter: Bool, p_isSource: Bool, p_input: Bool, p_inputIntact: Bool | p_phase in (str_1 + str_20 + str_3) and (not (p_hidden = True)) and (not (p_toolchain = True)) and (not (p_regular = True))) } for 3 but 4 Int, 24 Str, 1..8 steps
run c4 { eventually (some p_hidden: Bool, p_toolchain: Bool, p_toolchainIntact: Bool, p_regular: Bool, p_phase: Str, p_isAdapter: Bool, p_isSource: Bool, p_input: Bool, p_inputIntact: Bool | p_phase in (str_1 + str_20 + str_3) and (not (p_hidden = True)) and (not (p_toolchain = True)) and (not (not (p_regular = True))) and ((p_phase = str_20) implies (p_isAdapter = True) else (p_isSource = True))) } for 3 but 4 Int, 24 Str, 1..8 steps
run c5 { eventually (some p_hidden: Bool, p_toolchain: Bool, p_toolchainIntact: Bool, p_regular: Bool, p_phase: Str, p_isAdapter: Bool, p_isSource: Bool, p_input: Bool, p_inputIntact: Bool | p_phase in (str_1 + str_20 + str_3) and (not (p_hidden = True)) and (not (p_toolchain = True)) and (not (not (p_regular = True))) and (not ((p_phase = str_20) implies (p_isAdapter = True) else (p_isSource = True))) and (not (p_input = True))) } for 3 but 4 Int, 24 Str, 1..8 steps
run c6 { eventually (some p_hidden: Bool, p_toolchain: Bool, p_toolchainIntact: Bool, p_regular: Bool, p_phase: Str, p_isAdapter: Bool, p_isSource: Bool, p_input: Bool, p_inputIntact: Bool | p_phase in (str_1 + str_20 + str_3) and (not (p_hidden = True)) and (not (p_toolchain = True)) and (not (not (p_regular = True))) and (not ((p_phase = str_20) implies (p_isAdapter = True) else (p_isSource = True))) and (not (not (p_input = True))) and (p_inputIntact = True)) } for 3 but 4 Int, 24 Str, 1..8 steps
run c7 { eventually (some p_hidden: Bool, p_toolchain: Bool, p_toolchainIntact: Bool, p_regular: Bool, p_phase: Str, p_isAdapter: Bool, p_isSource: Bool, p_input: Bool, p_inputIntact: Bool | p_phase in (str_1 + str_20 + str_3) and (not (p_hidden = True)) and (not (p_toolchain = True)) and (not (not (p_regular = True))) and (not ((p_phase = str_20) implies (p_isAdapter = True) else (p_isSource = True))) and (not (not (p_input = True))) and (not (p_inputIntact = True))) } for 3 but 4 Int, 24 Str, 1..8 steps
run c8 { eventually (some p_phase: Str, p_isAdapter: Bool, p_isSource: Bool | p_phase in (str_1 + str_20 + str_3) and ((p_phase = str_20) implies (p_isAdapter = True) else (p_isSource = True))) } for 3 but 4 Int, 24 Str, 1..8 steps
run c9 { eventually (some p_phase: Str, p_isAdapter: Bool, p_isSource: Bool | p_phase in (str_1 + str_20 + str_3) and (not ((p_phase = str_20) implies (p_isAdapter = True) else (p_isSource = True)))) } for 3 but 4 Int, 24 Str, 1..8 steps
run c10 { eventually (some p_changed: Bool, p_existedBefore: Bool | ((p_existedBefore = True) and (p_changed = True))) } for 3 but 4 Int, 24 Str, 1..8 steps
run c11 { eventually (some p_changed: Bool, p_existedBefore: Bool | (not ((p_existedBefore = True) and (p_changed = True)))) } for 3 but 4 Int, 24 Str, 1..8 steps
run c12 { eventually (some p_passed: Bool, p_unimplemented: Bool, p_error: Str | p_error in (str_6 + str_7 + str_10) and (p_passed = True) and (p_unimplemented = True)) } for 3 but 4 Int, 24 Str, 1..8 steps
run c13 { eventually (some p_passed: Bool, p_unimplemented: Bool, p_error: Str | p_error in (str_6 + str_7 + str_10) and (p_passed = True) and (not (p_unimplemented = True))) } for 3 but 4 Int, 24 Str, 1..8 steps
run c14 { eventually (some p_passed: Bool, p_unimplemented: Bool, p_error: Str | p_error in (str_6 + str_7 + str_10) and (not (p_passed = True)) and (p_error = str_10)) } for 3 but 4 Int, 24 Str, 1..8 steps
run c15 { eventually (some p_passed: Bool, p_unimplemented: Bool, p_error: Str | p_error in (str_6 + str_7 + str_10) and (not (p_passed = True)) and (not (p_error = str_10))) } for 3 but 4 Int, 24 Str, 1..8 steps
run c16 { eventually (some p_passed: Bool, p_purpose: Str | p_purpose in (str_3 + str_13) and (p_passed = True)) } for 3 but 4 Int, 24 Str, 1..8 steps
run c17 { eventually (some p_passed: Bool, p_purpose: Str | p_purpose in (str_3 + str_13) and (not (p_passed = True)) and (p_purpose = str_13)) } for 3 but 4 Int, 24 Str, 1..8 steps
run c18 { eventually (some p_passed: Bool, p_purpose: Str | p_purpose in (str_3 + str_13) and (not (p_passed = True)) and (not (p_purpose = str_13))) } for 3 but 4 Int, 24 Str, 1..8 steps
run c19 { eventually (some p_changed: Bool, p_usedByThis: Bool, p_inert: Bool, p_usedByOthers: Bool | (not (p_changed = True))) } for 3 but 4 Int, 24 Str, 1..8 steps
run c20 { eventually (some p_changed: Bool, p_usedByThis: Bool, p_inert: Bool, p_usedByOthers: Bool | (not (not (p_changed = True))) and (((not (p_usedByThis = True)) and (not (p_inert = True))) and (p_usedByOthers = True))) } for 3 but 4 Int, 24 Str, 1..8 steps
run c21 { eventually (some p_changed: Bool, p_usedByThis: Bool, p_inert: Bool, p_usedByOthers: Bool | (not (not (p_changed = True))) and (not (((not (p_usedByThis = True)) and (not (p_inert = True))) and (p_usedByOthers = True)))) } for 3 but 4 Int, 24 Str, 1..8 steps
run sane { some Bool } for 3 but 4 Int, 24 Str, 1..8 steps
