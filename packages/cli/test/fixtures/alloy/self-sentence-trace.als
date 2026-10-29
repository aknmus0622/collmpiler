module spec

abstract sig Bool {}
one sig True, False extends Bool {}
sig Str {}
sig Json {}
one sig str_0, str_1, str_2, str_3, str_4 extends Str {}
one sig c_sentence_trace {}
one sig Env {}
abstract sig Entry {}
one sig Step { var event: lone Entry }
pred same_sentence_trace { some Bool }
fact initial_values { some Bool }
fact transitions { always ((same_sentence_trace and no Step.event)) }
run c0 { eventually (some p_covered: Bool, p_added: Bool | ((p_added = True) and (not (p_covered = True)))) } for 3 but 4 Int, 8 Str, 1..8 steps
run c1 { eventually (some p_covered: Bool, p_added: Bool | (not ((p_added = True) and (not (p_covered = True))))) } for 3 but 4 Int, 8 Str, 1..8 steps
run c2 { eventually (some p_inDescription: Bool | (not (p_inDescription = True))) } for 3 but 4 Int, 8 Str, 1..8 steps
run c3 { eventually (some p_inDescription: Bool | (not (not (p_inDescription = True)))) } for 3 but 4 Int, 8 Str, 1..8 steps
run c4 { eventually (some p_exists: Bool | (not (p_exists = True))) } for 3 but 4 Int, 8 Str, 1..8 steps
run c5 { eventually (some p_exists: Bool | (not (not (p_exists = True)))) } for 3 but 4 Int, 8 Str, 1..8 steps
run c6 { eventually (some p_isComponent: Bool, p_used: Bool | (not (p_isComponent = True))) } for 3 but 4 Int, 8 Str, 1..8 steps
run c7 { eventually (some p_isComponent: Bool, p_used: Bool | (not (not (p_isComponent = True))) and (not (p_used = True))) } for 3 but 4 Int, 8 Str, 1..8 steps
run c8 { eventually (some p_isComponent: Bool, p_used: Bool | (not (not (p_isComponent = True))) and (not (not (p_used = True)))) } for 3 but 4 Int, 8 Str, 1..8 steps
run sane { some Bool } for 3 but 4 Int, 8 Str, 1..8 steps
