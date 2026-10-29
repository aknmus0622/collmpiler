module spec

abstract sig Bool {}
one sig True, False extends Bool {}
sig Str {}
one sig str_0 extends Str {}
sig s_Leaf {}
one sig c_observation_compare { var f_observation_compare_answerAbsent: one Bool }
one sig Env {}
abstract sig Entry {}
one sig k_observation_compare_Actual, k_observation_compare_Begin, k_observation_compare_Expected extends Entry {}
one sig Step { var event: lone Entry, var x_observation_compare_Actual_leaf: lone s_Leaf, var x_observation_compare_Begin_answers: lone Bool, var x_observation_compare_Begin_answered: lone Bool, var x_observation_compare_Expected_leaf: lone s_Leaf }
pred same_observation_compare { c_observation_compare.f_observation_compare_answerAbsent' = c_observation_compare.f_observation_compare_answerAbsent }
pred ev_observation_compare_Begin_otherwise[p_answers: Bool, p_answered: Bool] {
  (some Bool)
  c_observation_compare.f_observation_compare_answerAbsent' = (((p_answers = True) and (not (p_answered = True))) => True else False)
}
pred cmd_observation_compare_Begin[p_answers: Bool, p_answered: Bool] {
  (ev_observation_compare_Begin_otherwise[p_answers, p_answered])
}
pred ev_observation_compare_Expected_otherwise[p_leaf: s_Leaf] {
  (some Bool)
  c_observation_compare.f_observation_compare_answerAbsent' = c_observation_compare.f_observation_compare_answerAbsent
}
pred cmd_observation_compare_Expected[p_leaf: s_Leaf] {
  (ev_observation_compare_Expected_otherwise[p_leaf])
}
pred ev_observation_compare_Actual_otherwise[p_leaf: s_Leaf] {
  (some Bool)
  c_observation_compare.f_observation_compare_answerAbsent' = c_observation_compare.f_observation_compare_answerAbsent
}
pred cmd_observation_compare_Actual[p_leaf: s_Leaf] {
  (ev_observation_compare_Actual_otherwise[p_leaf])
}
fact initial_values { c_observation_compare.f_observation_compare_answerAbsent = False }
fact transitions { always ((same_observation_compare and no Step.event and no Step.x_observation_compare_Actual_leaf and no Step.x_observation_compare_Begin_answers and no Step.x_observation_compare_Begin_answered and no Step.x_observation_compare_Expected_leaf)
  or (some p_leaf: s_Leaf | cmd_observation_compare_Actual[p_leaf] and Step.event = k_observation_compare_Actual and Step.x_observation_compare_Actual_leaf = p_leaf and no Step.x_observation_compare_Begin_answers and no Step.x_observation_compare_Begin_answered and no Step.x_observation_compare_Expected_leaf)
  or (some p_answers: Bool, p_answered: Bool | cmd_observation_compare_Begin[p_answers, p_answered] and Step.event = k_observation_compare_Begin and Step.x_observation_compare_Begin_answers = p_answers and Step.x_observation_compare_Begin_answered = p_answered and no Step.x_observation_compare_Actual_leaf and no Step.x_observation_compare_Expected_leaf)
  or (some p_leaf: s_Leaf | cmd_observation_compare_Expected[p_leaf] and Step.event = k_observation_compare_Expected and Step.x_observation_compare_Expected_leaf = p_leaf and no Step.x_observation_compare_Actual_leaf and no Step.x_observation_compare_Begin_answers and no Step.x_observation_compare_Begin_answered)) }
run c0 { eventually (some p_answers: Bool, p_answered: Bool | Step.event = k_observation_compare_Begin and Step.x_observation_compare_Begin_answers = p_answers and Step.x_observation_compare_Begin_answered = p_answered and (some Bool)) } for 3 but 4 Int, 1..8 steps
run c1 { eventually (some p_leaf: s_Leaf | Step.event = k_observation_compare_Expected and Step.x_observation_compare_Expected_leaf = p_leaf and (some Bool)) } for 3 but 4 Int, 1..8 steps
run c2 { eventually (some p_leaf: s_Leaf | Step.event = k_observation_compare_Actual and Step.x_observation_compare_Actual_leaf = p_leaf and (some Bool)) } for 3 but 4 Int, 1..8 steps
