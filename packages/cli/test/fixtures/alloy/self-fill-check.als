module spec

abstract sig Bool {}
one sig True, False extends Bool {}
sig Str {}
one sig str_0, str_1, str_2, str_3, str_4, str_5, str_6, str_7, str_8, str_9, str_10, str_11, str_12, str_13 extends Str {}
one sig c_fill_check {}
one sig Env {}
abstract sig Entry {}
one sig Step { var event: lone Entry }
pred same_fill_check { some Bool }
fact initial_values { some Bool }
fact transitions { always ((same_fill_check and no Step.event)) }
run c0 { eventually (some p_kind: Str, p_inline: Bool, p_entry: Str, p_byInterpretation: Bool | p_kind in (str_6 + str_1 + str_13) and p_entry in (str_8 + str_2 + str_11 + str_7 + str_3) and (p_entry = str_2)) } for 3 but 4 Int, 1..8 steps
run c1 { eventually (some p_kind: Str, p_inline: Bool, p_entry: Str, p_byInterpretation: Bool | p_kind in (str_6 + str_1 + str_13) and p_entry in (str_8 + str_2 + str_11 + str_7 + str_3) and (not (p_entry = str_2)) and (p_inline = True) and ((p_byInterpretation = True) and (not (p_entry = str_8)))) } for 3 but 4 Int, 1..8 steps
run c2 { eventually (some p_kind: Str, p_inline: Bool, p_entry: Str, p_byInterpretation: Bool | p_kind in (str_6 + str_1 + str_13) and p_entry in (str_8 + str_2 + str_11 + str_7 + str_3) and (not (p_entry = str_2)) and (p_inline = True) and (not ((p_byInterpretation = True) and (not (p_entry = str_8))))) } for 3 but 4 Int, 1..8 steps
run c3 { eventually (some p_kind: Str, p_inline: Bool, p_entry: Str, p_byInterpretation: Bool | p_kind in (str_6 + str_1 + str_13) and p_entry in (str_8 + str_2 + str_11 + str_7 + str_3) and (not (p_entry = str_2)) and (not (p_inline = True)) and ((p_entry = str_8) or (p_entry = str_11))) } for 3 but 4 Int, 1..8 steps
run c4 { eventually (some p_kind: Str, p_inline: Bool, p_entry: Str, p_byInterpretation: Bool | p_kind in (str_6 + str_1 + str_13) and p_entry in (str_8 + str_2 + str_11 + str_7 + str_3) and (not (p_entry = str_2)) and (not (p_inline = True)) and (not ((p_entry = str_8) or (p_entry = str_11))) and (p_entry = str_7)) } for 3 but 4 Int, 1..8 steps
run c5 { eventually (some p_kind: Str, p_inline: Bool, p_entry: Str, p_byInterpretation: Bool | p_kind in (str_6 + str_1 + str_13) and p_entry in (str_8 + str_2 + str_11 + str_7 + str_3) and (not (p_entry = str_2)) and (not (p_inline = True)) and (not ((p_entry = str_8) or (p_entry = str_11))) and (not (p_entry = str_7)) and (p_kind = str_6)) } for 3 but 4 Int, 1..8 steps
run c6 { eventually (some p_kind: Str, p_inline: Bool, p_entry: Str, p_byInterpretation: Bool | p_kind in (str_6 + str_1 + str_13) and p_entry in (str_8 + str_2 + str_11 + str_7 + str_3) and (not (p_entry = str_2)) and (not (p_inline = True)) and (not ((p_entry = str_8) or (p_entry = str_11))) and (not (p_entry = str_7)) and (not (p_kind = str_6))) } for 3 but 4 Int, 1..8 steps
