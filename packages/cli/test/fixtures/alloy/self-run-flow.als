module spec

abstract sig Bool {}
one sig True, False extends Bool {}
abstract sig Num {}
sig Str {}
sig Json {}
one sig str_0, str_1, str_2, str_3, str_4, str_5, str_6, str_7, str_8, str_9, str_10, str_11, str_12, str_13, str_14, str_15, str_16, str_17, str_18, str_19, str_20, str_21, str_22, str_23, str_24, str_25, str_26, str_27, str_28, str_29, str_30, str_31, str_32, str_33, str_34, str_35, str_36, str_37, str_38 extends Str {}
abstract sig s_num0 extends Num {}
one sig s_num0_0, s_num0_1, s_num0_2, s_num0_3, s_num0_4, s_num0_5, s_num0_6, s_num0_7, s_num0_8, s_num0_9, s_num0_10, s_num0_11 extends s_num0 {}
fun next_num0: s_num0 -> s_num0 { s_num0_0 -> s_num0_1 + s_num0_1 -> s_num0_2 + s_num0_2 -> s_num0_3 + s_num0_3 -> s_num0_4 + s_num0_4 -> s_num0_5 + s_num0_5 -> s_num0_6 + s_num0_6 -> s_num0_7 + s_num0_7 -> s_num0_8 + s_num0_8 -> s_num0_9 + s_num0_9 -> s_num0_10 + s_num0_10 -> s_num0_11 }
fun op_num0_0: s_num0 -> s_num0 { s_num0_0 -> s_num0_1 + s_num0_1 -> s_num0_2 + s_num0_2 -> s_num0_3 + s_num0_3 -> s_num0_4 + s_num0_4 -> s_num0_5 + s_num0_5 -> s_num0_6 + s_num0_6 -> s_num0_7 + s_num0_7 -> s_num0_8 + s_num0_8 -> s_num0_9 + s_num0_9 -> s_num0_10 + s_num0_10 -> s_num0_11 + s_num0_11 -> s_num0_11 }
one sig c_run_flow { var f_run_flow_status: one Str, var f_run_flow_roundLimit: lone s_num0, var f_run_flow_round: one s_num0, var f_run_flow_writeUnasked: one Bool, var f_run_flow_splitAccepted: one Bool, var f_run_flow_supplemented: one Bool }
one sig Env {}
abstract sig Entry {}
one sig k_run_flow_Accepted, k_run_flow_Applied, k_run_flow_Candidate, k_run_flow_Interpreted, k_run_flow_Layer1Checked, k_run_flow_NoMoreCandidates, k_run_flow_NoMoreQuestions, k_run_flow_Proposed, k_run_flow_Question, k_run_flow_QuestionAnswered, k_run_flow_SplitAnswered, k_run_flow_Start, k_run_flow_SupplementsConfirmed, k_run_flow_SupplementsPlaced extends Entry {}
one sig Step { var event: lone Entry, var x_run_flow_Accepted_ok: lone Bool, var x_run_flow_Applied_outcome: lone Str, var x_run_flow_Interpreted_outcome: lone Str, var x_run_flow_Layer1Checked_ok: lone Bool, var x_run_flow_Proposed_outcome: lone Str, var x_run_flow_QuestionAnswered_answer: lone Str, var x_run_flow_SplitAnswered_answer: lone Str, var x_run_flow_Start_rounds: lone s_num0, var x_run_flow_Start_yes: lone Bool, var x_run_flow_SupplementsConfirmed_yes: lone Bool, var x_run_flow_SupplementsPlaced_placed: lone Bool }
pred same_run_flow { c_run_flow.f_run_flow_status' = c_run_flow.f_run_flow_status and c_run_flow.f_run_flow_roundLimit' = c_run_flow.f_run_flow_roundLimit and c_run_flow.f_run_flow_round' = c_run_flow.f_run_flow_round and c_run_flow.f_run_flow_writeUnasked' = c_run_flow.f_run_flow_writeUnasked and c_run_flow.f_run_flow_splitAccepted' = c_run_flow.f_run_flow_splitAccepted and c_run_flow.f_run_flow_supplemented' = c_run_flow.f_run_flow_supplemented }
pred ev_run_flow_Start_otherwise[p_rounds: s_num0, p_yes: Bool] {
  (some Bool)
  c_run_flow.f_run_flow_status' = str_3
  c_run_flow.f_run_flow_roundLimit' = p_rounds
  c_run_flow.f_run_flow_round' = ((c_run_flow.f_run_flow_round)).(op_num0_0)
  c_run_flow.f_run_flow_writeUnasked' = p_yes
  c_run_flow.f_run_flow_splitAccepted' = False
  c_run_flow.f_run_flow_supplemented' = False
}
pred cmd_run_flow_Start[p_rounds: s_num0, p_yes: Bool] {
  (((p_rounds in s_num0_1.*next_num0) and (s_num0_10 in p_rounds.*next_num0)) and ((c_run_flow.f_run_flow_status) = str_6)) and (ev_run_flow_Start_otherwise[p_rounds, p_yes])
}
pred ev_run_flow_Layer1Checked_otherwise[p_ok: Bool] {
  (some Bool)
  c_run_flow.f_run_flow_status' = ((p_ok = True) => str_2 else str_5)
  c_run_flow.f_run_flow_roundLimit' = c_run_flow.f_run_flow_roundLimit
  c_run_flow.f_run_flow_round' = c_run_flow.f_run_flow_round
  c_run_flow.f_run_flow_writeUnasked' = c_run_flow.f_run_flow_writeUnasked
  c_run_flow.f_run_flow_splitAccepted' = c_run_flow.f_run_flow_splitAccepted
  c_run_flow.f_run_flow_supplemented' = c_run_flow.f_run_flow_supplemented
}
pred cmd_run_flow_Layer1Checked[p_ok: Bool] {
  ((c_run_flow.f_run_flow_status) = str_3) and (ev_run_flow_Layer1Checked_otherwise[p_ok])
}
pred ev_run_flow_Candidate_otherwise[] {
  (some Bool)
  c_run_flow.f_run_flow_status' = str_9
  c_run_flow.f_run_flow_roundLimit' = c_run_flow.f_run_flow_roundLimit
  c_run_flow.f_run_flow_round' = c_run_flow.f_run_flow_round
  c_run_flow.f_run_flow_writeUnasked' = c_run_flow.f_run_flow_writeUnasked
  c_run_flow.f_run_flow_splitAccepted' = c_run_flow.f_run_flow_splitAccepted
  c_run_flow.f_run_flow_supplemented' = c_run_flow.f_run_flow_supplemented
}
pred cmd_run_flow_Candidate[] {
  ((c_run_flow.f_run_flow_status) = str_2) and (ev_run_flow_Candidate_otherwise[])
}
pred ev_run_flow_Proposed_otherwise[p_outcome: Str] {
  (some Bool)
  c_run_flow.f_run_flow_status' = ((p_outcome = str_23) => str_2 else ((p_outcome = str_30) => str_12 else str_5))
  c_run_flow.f_run_flow_roundLimit' = c_run_flow.f_run_flow_roundLimit
  c_run_flow.f_run_flow_round' = c_run_flow.f_run_flow_round
  c_run_flow.f_run_flow_writeUnasked' = c_run_flow.f_run_flow_writeUnasked
  c_run_flow.f_run_flow_splitAccepted' = c_run_flow.f_run_flow_splitAccepted
  c_run_flow.f_run_flow_supplemented' = c_run_flow.f_run_flow_supplemented
}
pred cmd_run_flow_Proposed[p_outcome: Str] {
  p_outcome in (str_23 + str_30 + str_14) and ((c_run_flow.f_run_flow_status) = str_9) and (ev_run_flow_Proposed_otherwise[p_outcome])
}
pred ev_run_flow_SplitAnswered_otherwise[p_answer: Str] {
  (some Bool)
  c_run_flow.f_run_flow_status' = ((p_answer = str_35) => str_5 else str_2)
  c_run_flow.f_run_flow_roundLimit' = c_run_flow.f_run_flow_roundLimit
  c_run_flow.f_run_flow_round' = c_run_flow.f_run_flow_round
  c_run_flow.f_run_flow_writeUnasked' = c_run_flow.f_run_flow_writeUnasked
  c_run_flow.f_run_flow_splitAccepted' = ((p_answer = str_35) => (c_run_flow.f_run_flow_splitAccepted) else ((p_answer = str_13) => True else (c_run_flow.f_run_flow_splitAccepted)))
  c_run_flow.f_run_flow_supplemented' = c_run_flow.f_run_flow_supplemented
}
pred cmd_run_flow_SplitAnswered[p_answer: Str] {
  p_answer in (str_13 + str_16 + str_35) and ((c_run_flow.f_run_flow_status) = str_12) and (ev_run_flow_SplitAnswered_otherwise[p_answer])
}
pred ev_run_flow_NoMoreCandidates_otherwise[] {
  (some Bool)
  c_run_flow.f_run_flow_status' = (((c_run_flow.f_run_flow_splitAccepted) = True) => (((c_run_flow.f_run_flow_roundLimit) in (c_run_flow.f_run_flow_round).^next_num0) => str_3 else str_5) else str_7)
  c_run_flow.f_run_flow_roundLimit' = c_run_flow.f_run_flow_roundLimit
  c_run_flow.f_run_flow_round' = (((c_run_flow.f_run_flow_splitAccepted) = True) => (((c_run_flow.f_run_flow_roundLimit) in (c_run_flow.f_run_flow_round).^next_num0) => ((c_run_flow.f_run_flow_round).next_num0) else (c_run_flow.f_run_flow_round)) else (c_run_flow.f_run_flow_round))
  c_run_flow.f_run_flow_writeUnasked' = c_run_flow.f_run_flow_writeUnasked
  c_run_flow.f_run_flow_splitAccepted' = (((c_run_flow.f_run_flow_splitAccepted) = True) => (((c_run_flow.f_run_flow_roundLimit) in (c_run_flow.f_run_flow_round).^next_num0) => False else (c_run_flow.f_run_flow_splitAccepted)) else (c_run_flow.f_run_flow_splitAccepted))
  c_run_flow.f_run_flow_supplemented' = (((c_run_flow.f_run_flow_splitAccepted) = True) => (((c_run_flow.f_run_flow_roundLimit) in (c_run_flow.f_run_flow_round).^next_num0) => False else (c_run_flow.f_run_flow_supplemented)) else (c_run_flow.f_run_flow_supplemented))
}
pred cmd_run_flow_NoMoreCandidates[] {
  ((c_run_flow.f_run_flow_status) = str_2) and (ev_run_flow_NoMoreCandidates_otherwise[])
}
pred ev_run_flow_Interpreted_otherwise[p_outcome: Str] {
  (some Bool)
  c_run_flow.f_run_flow_status' = ((p_outcome = str_21) => (c_run_flow.f_run_flow_status) else ((p_outcome = str_38) => str_10 else str_5))
  c_run_flow.f_run_flow_roundLimit' = c_run_flow.f_run_flow_roundLimit
  c_run_flow.f_run_flow_round' = c_run_flow.f_run_flow_round
  c_run_flow.f_run_flow_writeUnasked' = c_run_flow.f_run_flow_writeUnasked
  c_run_flow.f_run_flow_splitAccepted' = c_run_flow.f_run_flow_splitAccepted
  c_run_flow.f_run_flow_supplemented' = c_run_flow.f_run_flow_supplemented
}
pred cmd_run_flow_Interpreted[p_outcome: Str] {
  p_outcome in (str_38 + str_21 + str_18 + str_14) and ((c_run_flow.f_run_flow_status) = str_7) and (ev_run_flow_Interpreted_otherwise[p_outcome])
}
pred ev_run_flow_Question_otherwise[] {
  (some Bool)
  c_run_flow.f_run_flow_status' = str_11
  c_run_flow.f_run_flow_roundLimit' = c_run_flow.f_run_flow_roundLimit
  c_run_flow.f_run_flow_round' = c_run_flow.f_run_flow_round
  c_run_flow.f_run_flow_writeUnasked' = c_run_flow.f_run_flow_writeUnasked
  c_run_flow.f_run_flow_splitAccepted' = c_run_flow.f_run_flow_splitAccepted
  c_run_flow.f_run_flow_supplemented' = c_run_flow.f_run_flow_supplemented
}
pred cmd_run_flow_Question[] {
  ((c_run_flow.f_run_flow_status) = str_10) and (ev_run_flow_Question_otherwise[])
}
pred ev_run_flow_QuestionAnswered_otherwise[p_answer: Str] {
  (some Bool)
  c_run_flow.f_run_flow_status' = ((p_answer = str_35) => str_5 else str_10)
  c_run_flow.f_run_flow_roundLimit' = c_run_flow.f_run_flow_roundLimit
  c_run_flow.f_run_flow_round' = c_run_flow.f_run_flow_round
  c_run_flow.f_run_flow_writeUnasked' = c_run_flow.f_run_flow_writeUnasked
  c_run_flow.f_run_flow_splitAccepted' = c_run_flow.f_run_flow_splitAccepted
  c_run_flow.f_run_flow_supplemented' = ((p_answer = str_35) => (c_run_flow.f_run_flow_supplemented) else ((p_answer = str_13) => (c_run_flow.f_run_flow_supplemented) else True))
}
pred cmd_run_flow_QuestionAnswered[p_answer: Str] {
  p_answer in (str_13 + str_36 + str_35) and ((c_run_flow.f_run_flow_status) = str_11) and (ev_run_flow_QuestionAnswered_otherwise[p_answer])
}
pred ev_run_flow_NoMoreQuestions_otherwise[] {
  (some Bool)
  c_run_flow.f_run_flow_status' = (((c_run_flow.f_run_flow_supplemented) = True) => str_8 else str_0)
  c_run_flow.f_run_flow_roundLimit' = c_run_flow.f_run_flow_roundLimit
  c_run_flow.f_run_flow_round' = c_run_flow.f_run_flow_round
  c_run_flow.f_run_flow_writeUnasked' = c_run_flow.f_run_flow_writeUnasked
  c_run_flow.f_run_flow_splitAccepted' = c_run_flow.f_run_flow_splitAccepted
  c_run_flow.f_run_flow_supplemented' = c_run_flow.f_run_flow_supplemented
}
pred cmd_run_flow_NoMoreQuestions[] {
  ((c_run_flow.f_run_flow_status) = str_10) and (ev_run_flow_NoMoreQuestions_otherwise[])
}
pred ev_run_flow_SupplementsPlaced_otherwise[p_placed: Bool] {
  (some Bool)
  c_run_flow.f_run_flow_status' = ((not (p_placed = True)) => str_5 else (((c_run_flow.f_run_flow_writeUnasked) = True) => (((c_run_flow.f_run_flow_roundLimit) in (c_run_flow.f_run_flow_round).^next_num0) => str_3 else str_5) else str_4))
  c_run_flow.f_run_flow_roundLimit' = c_run_flow.f_run_flow_roundLimit
  c_run_flow.f_run_flow_round' = ((not (p_placed = True)) => (c_run_flow.f_run_flow_round) else (((c_run_flow.f_run_flow_writeUnasked) = True) => (((c_run_flow.f_run_flow_roundLimit) in (c_run_flow.f_run_flow_round).^next_num0) => ((c_run_flow.f_run_flow_round).next_num0) else (c_run_flow.f_run_flow_round)) else (c_run_flow.f_run_flow_round)))
  c_run_flow.f_run_flow_writeUnasked' = c_run_flow.f_run_flow_writeUnasked
  c_run_flow.f_run_flow_splitAccepted' = ((not (p_placed = True)) => (c_run_flow.f_run_flow_splitAccepted) else (((c_run_flow.f_run_flow_writeUnasked) = True) => (((c_run_flow.f_run_flow_roundLimit) in (c_run_flow.f_run_flow_round).^next_num0) => False else (c_run_flow.f_run_flow_splitAccepted)) else (c_run_flow.f_run_flow_splitAccepted)))
  c_run_flow.f_run_flow_supplemented' = ((not (p_placed = True)) => (c_run_flow.f_run_flow_supplemented) else (((c_run_flow.f_run_flow_writeUnasked) = True) => (((c_run_flow.f_run_flow_roundLimit) in (c_run_flow.f_run_flow_round).^next_num0) => False else (c_run_flow.f_run_flow_supplemented)) else (c_run_flow.f_run_flow_supplemented)))
}
pred cmd_run_flow_SupplementsPlaced[p_placed: Bool] {
  ((c_run_flow.f_run_flow_status) = str_8) and (ev_run_flow_SupplementsPlaced_otherwise[p_placed])
}
pred ev_run_flow_SupplementsConfirmed_otherwise[p_yes: Bool] {
  (some Bool)
  c_run_flow.f_run_flow_status' = ((not (p_yes = True)) => str_5 else (((c_run_flow.f_run_flow_roundLimit) in (c_run_flow.f_run_flow_round).^next_num0) => str_3 else str_5))
  c_run_flow.f_run_flow_roundLimit' = c_run_flow.f_run_flow_roundLimit
  c_run_flow.f_run_flow_round' = ((not (p_yes = True)) => (c_run_flow.f_run_flow_round) else (((c_run_flow.f_run_flow_roundLimit) in (c_run_flow.f_run_flow_round).^next_num0) => ((c_run_flow.f_run_flow_round).next_num0) else (c_run_flow.f_run_flow_round)))
  c_run_flow.f_run_flow_writeUnasked' = c_run_flow.f_run_flow_writeUnasked
  c_run_flow.f_run_flow_splitAccepted' = ((not (p_yes = True)) => (c_run_flow.f_run_flow_splitAccepted) else (((c_run_flow.f_run_flow_roundLimit) in (c_run_flow.f_run_flow_round).^next_num0) => False else (c_run_flow.f_run_flow_splitAccepted)))
  c_run_flow.f_run_flow_supplemented' = ((not (p_yes = True)) => (c_run_flow.f_run_flow_supplemented) else (((c_run_flow.f_run_flow_roundLimit) in (c_run_flow.f_run_flow_round).^next_num0) => False else (c_run_flow.f_run_flow_supplemented)))
}
pred cmd_run_flow_SupplementsConfirmed[p_yes: Bool] {
  ((c_run_flow.f_run_flow_status) = str_4) and (ev_run_flow_SupplementsConfirmed_otherwise[p_yes])
}
pred ev_run_flow_Accepted_otherwise[p_ok: Bool] {
  (some Bool)
  c_run_flow.f_run_flow_status' = ((p_ok = True) => str_1 else str_5)
  c_run_flow.f_run_flow_roundLimit' = c_run_flow.f_run_flow_roundLimit
  c_run_flow.f_run_flow_round' = c_run_flow.f_run_flow_round
  c_run_flow.f_run_flow_writeUnasked' = c_run_flow.f_run_flow_writeUnasked
  c_run_flow.f_run_flow_splitAccepted' = c_run_flow.f_run_flow_splitAccepted
  c_run_flow.f_run_flow_supplemented' = c_run_flow.f_run_flow_supplemented
}
pred cmd_run_flow_Accepted[p_ok: Bool] {
  ((c_run_flow.f_run_flow_status) = str_0) and (ev_run_flow_Accepted_otherwise[p_ok])
}
pred ev_run_flow_Applied_otherwise[p_outcome: Str] {
  (some Bool)
  c_run_flow.f_run_flow_status' = str_5
  c_run_flow.f_run_flow_roundLimit' = c_run_flow.f_run_flow_roundLimit
  c_run_flow.f_run_flow_round' = c_run_flow.f_run_flow_round
  c_run_flow.f_run_flow_writeUnasked' = c_run_flow.f_run_flow_writeUnasked
  c_run_flow.f_run_flow_splitAccepted' = c_run_flow.f_run_flow_splitAccepted
  c_run_flow.f_run_flow_supplemented' = c_run_flow.f_run_flow_supplemented
}
pred cmd_run_flow_Applied[p_outcome: Str] {
  p_outcome in (str_27 + str_17 + str_14 + str_33) and ((c_run_flow.f_run_flow_status) = str_1) and (ev_run_flow_Applied_otherwise[p_outcome])
}
fact initial_values { c_run_flow.f_run_flow_status = str_6 and c_run_flow.f_run_flow_roundLimit = none and c_run_flow.f_run_flow_round = s_num0_0 and c_run_flow.f_run_flow_writeUnasked = False and c_run_flow.f_run_flow_splitAccepted = False and c_run_flow.f_run_flow_supplemented = False }
fact transitions { always ((same_run_flow and no Step.event and no Step.x_run_flow_Accepted_ok and no Step.x_run_flow_Applied_outcome and no Step.x_run_flow_Interpreted_outcome and no Step.x_run_flow_Layer1Checked_ok and no Step.x_run_flow_Proposed_outcome and no Step.x_run_flow_QuestionAnswered_answer and no Step.x_run_flow_SplitAnswered_answer and no Step.x_run_flow_Start_rounds and no Step.x_run_flow_Start_yes and no Step.x_run_flow_SupplementsConfirmed_yes and no Step.x_run_flow_SupplementsPlaced_placed)
  or (some p_ok: Bool | cmd_run_flow_Accepted[p_ok] and Step.event = k_run_flow_Accepted and Step.x_run_flow_Accepted_ok = p_ok and no Step.x_run_flow_Applied_outcome and no Step.x_run_flow_Interpreted_outcome and no Step.x_run_flow_Layer1Checked_ok and no Step.x_run_flow_Proposed_outcome and no Step.x_run_flow_QuestionAnswered_answer and no Step.x_run_flow_SplitAnswered_answer and no Step.x_run_flow_Start_rounds and no Step.x_run_flow_Start_yes and no Step.x_run_flow_SupplementsConfirmed_yes and no Step.x_run_flow_SupplementsPlaced_placed)
  or (some p_outcome: Str | cmd_run_flow_Applied[p_outcome] and Step.event = k_run_flow_Applied and Step.x_run_flow_Applied_outcome = p_outcome and no Step.x_run_flow_Accepted_ok and no Step.x_run_flow_Interpreted_outcome and no Step.x_run_flow_Layer1Checked_ok and no Step.x_run_flow_Proposed_outcome and no Step.x_run_flow_QuestionAnswered_answer and no Step.x_run_flow_SplitAnswered_answer and no Step.x_run_flow_Start_rounds and no Step.x_run_flow_Start_yes and no Step.x_run_flow_SupplementsConfirmed_yes and no Step.x_run_flow_SupplementsPlaced_placed)
  or (cmd_run_flow_Candidate[] and Step.event = k_run_flow_Candidate and no Step.x_run_flow_Accepted_ok and no Step.x_run_flow_Applied_outcome and no Step.x_run_flow_Interpreted_outcome and no Step.x_run_flow_Layer1Checked_ok and no Step.x_run_flow_Proposed_outcome and no Step.x_run_flow_QuestionAnswered_answer and no Step.x_run_flow_SplitAnswered_answer and no Step.x_run_flow_Start_rounds and no Step.x_run_flow_Start_yes and no Step.x_run_flow_SupplementsConfirmed_yes and no Step.x_run_flow_SupplementsPlaced_placed)
  or (some p_outcome: Str | cmd_run_flow_Interpreted[p_outcome] and Step.event = k_run_flow_Interpreted and Step.x_run_flow_Interpreted_outcome = p_outcome and no Step.x_run_flow_Accepted_ok and no Step.x_run_flow_Applied_outcome and no Step.x_run_flow_Layer1Checked_ok and no Step.x_run_flow_Proposed_outcome and no Step.x_run_flow_QuestionAnswered_answer and no Step.x_run_flow_SplitAnswered_answer and no Step.x_run_flow_Start_rounds and no Step.x_run_flow_Start_yes and no Step.x_run_flow_SupplementsConfirmed_yes and no Step.x_run_flow_SupplementsPlaced_placed)
  or (some p_ok: Bool | cmd_run_flow_Layer1Checked[p_ok] and Step.event = k_run_flow_Layer1Checked and Step.x_run_flow_Layer1Checked_ok = p_ok and no Step.x_run_flow_Accepted_ok and no Step.x_run_flow_Applied_outcome and no Step.x_run_flow_Interpreted_outcome and no Step.x_run_flow_Proposed_outcome and no Step.x_run_flow_QuestionAnswered_answer and no Step.x_run_flow_SplitAnswered_answer and no Step.x_run_flow_Start_rounds and no Step.x_run_flow_Start_yes and no Step.x_run_flow_SupplementsConfirmed_yes and no Step.x_run_flow_SupplementsPlaced_placed)
  or (cmd_run_flow_NoMoreCandidates[] and Step.event = k_run_flow_NoMoreCandidates and no Step.x_run_flow_Accepted_ok and no Step.x_run_flow_Applied_outcome and no Step.x_run_flow_Interpreted_outcome and no Step.x_run_flow_Layer1Checked_ok and no Step.x_run_flow_Proposed_outcome and no Step.x_run_flow_QuestionAnswered_answer and no Step.x_run_flow_SplitAnswered_answer and no Step.x_run_flow_Start_rounds and no Step.x_run_flow_Start_yes and no Step.x_run_flow_SupplementsConfirmed_yes and no Step.x_run_flow_SupplementsPlaced_placed)
  or (cmd_run_flow_NoMoreQuestions[] and Step.event = k_run_flow_NoMoreQuestions and no Step.x_run_flow_Accepted_ok and no Step.x_run_flow_Applied_outcome and no Step.x_run_flow_Interpreted_outcome and no Step.x_run_flow_Layer1Checked_ok and no Step.x_run_flow_Proposed_outcome and no Step.x_run_flow_QuestionAnswered_answer and no Step.x_run_flow_SplitAnswered_answer and no Step.x_run_flow_Start_rounds and no Step.x_run_flow_Start_yes and no Step.x_run_flow_SupplementsConfirmed_yes and no Step.x_run_flow_SupplementsPlaced_placed)
  or (some p_outcome: Str | cmd_run_flow_Proposed[p_outcome] and Step.event = k_run_flow_Proposed and Step.x_run_flow_Proposed_outcome = p_outcome and no Step.x_run_flow_Accepted_ok and no Step.x_run_flow_Applied_outcome and no Step.x_run_flow_Interpreted_outcome and no Step.x_run_flow_Layer1Checked_ok and no Step.x_run_flow_QuestionAnswered_answer and no Step.x_run_flow_SplitAnswered_answer and no Step.x_run_flow_Start_rounds and no Step.x_run_flow_Start_yes and no Step.x_run_flow_SupplementsConfirmed_yes and no Step.x_run_flow_SupplementsPlaced_placed)
  or (cmd_run_flow_Question[] and Step.event = k_run_flow_Question and no Step.x_run_flow_Accepted_ok and no Step.x_run_flow_Applied_outcome and no Step.x_run_flow_Interpreted_outcome and no Step.x_run_flow_Layer1Checked_ok and no Step.x_run_flow_Proposed_outcome and no Step.x_run_flow_QuestionAnswered_answer and no Step.x_run_flow_SplitAnswered_answer and no Step.x_run_flow_Start_rounds and no Step.x_run_flow_Start_yes and no Step.x_run_flow_SupplementsConfirmed_yes and no Step.x_run_flow_SupplementsPlaced_placed)
  or (some p_answer: Str | cmd_run_flow_QuestionAnswered[p_answer] and Step.event = k_run_flow_QuestionAnswered and Step.x_run_flow_QuestionAnswered_answer = p_answer and no Step.x_run_flow_Accepted_ok and no Step.x_run_flow_Applied_outcome and no Step.x_run_flow_Interpreted_outcome and no Step.x_run_flow_Layer1Checked_ok and no Step.x_run_flow_Proposed_outcome and no Step.x_run_flow_SplitAnswered_answer and no Step.x_run_flow_Start_rounds and no Step.x_run_flow_Start_yes and no Step.x_run_flow_SupplementsConfirmed_yes and no Step.x_run_flow_SupplementsPlaced_placed)
  or (some p_answer: Str | cmd_run_flow_SplitAnswered[p_answer] and Step.event = k_run_flow_SplitAnswered and Step.x_run_flow_SplitAnswered_answer = p_answer and no Step.x_run_flow_Accepted_ok and no Step.x_run_flow_Applied_outcome and no Step.x_run_flow_Interpreted_outcome and no Step.x_run_flow_Layer1Checked_ok and no Step.x_run_flow_Proposed_outcome and no Step.x_run_flow_QuestionAnswered_answer and no Step.x_run_flow_Start_rounds and no Step.x_run_flow_Start_yes and no Step.x_run_flow_SupplementsConfirmed_yes and no Step.x_run_flow_SupplementsPlaced_placed)
  or (some p_rounds: s_num0, p_yes: Bool | cmd_run_flow_Start[p_rounds, p_yes] and Step.event = k_run_flow_Start and Step.x_run_flow_Start_rounds = p_rounds and Step.x_run_flow_Start_yes = p_yes and no Step.x_run_flow_Accepted_ok and no Step.x_run_flow_Applied_outcome and no Step.x_run_flow_Interpreted_outcome and no Step.x_run_flow_Layer1Checked_ok and no Step.x_run_flow_Proposed_outcome and no Step.x_run_flow_QuestionAnswered_answer and no Step.x_run_flow_SplitAnswered_answer and no Step.x_run_flow_SupplementsConfirmed_yes and no Step.x_run_flow_SupplementsPlaced_placed)
  or (some p_yes: Bool | cmd_run_flow_SupplementsConfirmed[p_yes] and Step.event = k_run_flow_SupplementsConfirmed and Step.x_run_flow_SupplementsConfirmed_yes = p_yes and no Step.x_run_flow_Accepted_ok and no Step.x_run_flow_Applied_outcome and no Step.x_run_flow_Interpreted_outcome and no Step.x_run_flow_Layer1Checked_ok and no Step.x_run_flow_Proposed_outcome and no Step.x_run_flow_QuestionAnswered_answer and no Step.x_run_flow_SplitAnswered_answer and no Step.x_run_flow_Start_rounds and no Step.x_run_flow_Start_yes and no Step.x_run_flow_SupplementsPlaced_placed)
  or (some p_placed: Bool | cmd_run_flow_SupplementsPlaced[p_placed] and Step.event = k_run_flow_SupplementsPlaced and Step.x_run_flow_SupplementsPlaced_placed = p_placed and no Step.x_run_flow_Accepted_ok and no Step.x_run_flow_Applied_outcome and no Step.x_run_flow_Interpreted_outcome and no Step.x_run_flow_Layer1Checked_ok and no Step.x_run_flow_Proposed_outcome and no Step.x_run_flow_QuestionAnswered_answer and no Step.x_run_flow_SplitAnswered_answer and no Step.x_run_flow_Start_rounds and no Step.x_run_flow_Start_yes and no Step.x_run_flow_SupplementsConfirmed_yes)) }
check c0 { (always (((c_run_flow.f_run_flow_roundLimit) = none) or ((c_run_flow.f_run_flow_roundLimit) in (c_run_flow.f_run_flow_round).*next_num0))) } for 3 but 4 Int, 42 Str, 6 steps
run c1 { eventually (some p_rounds: s_num0, p_yes: Bool | Step.event = k_run_flow_Start and Step.x_run_flow_Start_rounds = p_rounds and Step.x_run_flow_Start_yes = p_yes and (((p_rounds in s_num0_1.*next_num0) and (s_num0_10 in p_rounds.*next_num0)) and ((c_run_flow.f_run_flow_status) = str_6)) and (some Bool)) } for 3 but 4 Int, 42 Str, 1..8 steps
run c2 { eventually (some p_ok: Bool | Step.event = k_run_flow_Layer1Checked and Step.x_run_flow_Layer1Checked_ok = p_ok and ((c_run_flow.f_run_flow_status) = str_3) and (some Bool)) } for 3 but 4 Int, 42 Str, 1..8 steps
run c3 { eventually (some p_ok: Bool | Step.event = k_run_flow_Layer1Checked and Step.x_run_flow_Layer1Checked_ok = p_ok and ((c_run_flow.f_run_flow_status) = str_3) and (some Bool) and (p_ok = True)) } for 3 but 4 Int, 42 Str, 1..8 steps
run c4 { eventually (some p_ok: Bool | Step.event = k_run_flow_Layer1Checked and Step.x_run_flow_Layer1Checked_ok = p_ok and ((c_run_flow.f_run_flow_status) = str_3) and (some Bool) and (not (p_ok = True))) } for 3 but 4 Int, 42 Str, 1..8 steps
run c5 { eventually (Step.event = k_run_flow_Candidate and ((c_run_flow.f_run_flow_status) = str_2) and (some Bool)) } for 3 but 4 Int, 42 Str, 1..8 steps
run c6 { eventually (some p_outcome: Str | Step.event = k_run_flow_Proposed and Step.x_run_flow_Proposed_outcome = p_outcome and p_outcome in (str_23 + str_30 + str_14) and ((c_run_flow.f_run_flow_status) = str_9) and (some Bool)) } for 3 but 4 Int, 42 Str, 1..8 steps
run c7 { eventually (some p_outcome: Str | Step.event = k_run_flow_Proposed and Step.x_run_flow_Proposed_outcome = p_outcome and p_outcome in (str_23 + str_30 + str_14) and ((c_run_flow.f_run_flow_status) = str_9) and (some Bool) and (p_outcome = str_23)) } for 3 but 4 Int, 42 Str, 1..8 steps
run c8 { eventually (some p_outcome: Str | Step.event = k_run_flow_Proposed and Step.x_run_flow_Proposed_outcome = p_outcome and p_outcome in (str_23 + str_30 + str_14) and ((c_run_flow.f_run_flow_status) = str_9) and (some Bool) and ((not (p_outcome = str_23)) and (p_outcome = str_30))) } for 3 but 4 Int, 42 Str, 1..8 steps
run c9 { eventually (some p_outcome: Str | Step.event = k_run_flow_Proposed and Step.x_run_flow_Proposed_outcome = p_outcome and p_outcome in (str_23 + str_30 + str_14) and ((c_run_flow.f_run_flow_status) = str_9) and (some Bool) and ((not (p_outcome = str_23)) and (not (p_outcome = str_30)))) } for 3 but 4 Int, 42 Str, 1..8 steps
run c10 { eventually (some p_answer: Str | Step.event = k_run_flow_SplitAnswered and Step.x_run_flow_SplitAnswered_answer = p_answer and p_answer in (str_13 + str_16 + str_35) and ((c_run_flow.f_run_flow_status) = str_12) and (some Bool)) } for 3 but 4 Int, 42 Str, 1..8 steps
run c11 { eventually (some p_answer: Str | Step.event = k_run_flow_SplitAnswered and Step.x_run_flow_SplitAnswered_answer = p_answer and p_answer in (str_13 + str_16 + str_35) and ((c_run_flow.f_run_flow_status) = str_12) and (some Bool) and (p_answer = str_35)) } for 3 but 4 Int, 42 Str, 1..8 steps
run c12 { eventually (some p_answer: Str | Step.event = k_run_flow_SplitAnswered and Step.x_run_flow_SplitAnswered_answer = p_answer and p_answer in (str_13 + str_16 + str_35) and ((c_run_flow.f_run_flow_status) = str_12) and (some Bool) and ((not (p_answer = str_35)) and (p_answer = str_13))) } for 3 but 4 Int, 42 Str, 1..8 steps
run c13 { eventually (some p_answer: Str | Step.event = k_run_flow_SplitAnswered and Step.x_run_flow_SplitAnswered_answer = p_answer and p_answer in (str_13 + str_16 + str_35) and ((c_run_flow.f_run_flow_status) = str_12) and (some Bool) and ((not (p_answer = str_35)) and (not (p_answer = str_13)))) } for 3 but 4 Int, 42 Str, 1..8 steps
run c14 { eventually (some p_answer: Str | Step.event = k_run_flow_SplitAnswered and Step.x_run_flow_SplitAnswered_answer = p_answer and p_answer in (str_13 + str_16 + str_35) and ((c_run_flow.f_run_flow_status) = str_12) and (some Bool) and (not (p_answer = str_35))) } for 3 but 4 Int, 42 Str, 1..8 steps
run c15 { eventually (Step.event = k_run_flow_NoMoreCandidates and ((c_run_flow.f_run_flow_status) = str_2) and (some Bool)) } for 3 but 4 Int, 42 Str, 1..8 steps
run c16 { eventually (Step.event = k_run_flow_NoMoreCandidates and ((c_run_flow.f_run_flow_status) = str_2) and (some Bool) and (((c_run_flow.f_run_flow_splitAccepted) = True) and ((c_run_flow.f_run_flow_roundLimit) in (c_run_flow.f_run_flow_round).^next_num0))) } for 3 but 4 Int, 42 Str, 1..8 steps
run c17 { eventually (Step.event = k_run_flow_NoMoreCandidates and ((c_run_flow.f_run_flow_status) = str_2) and (some Bool) and (((c_run_flow.f_run_flow_splitAccepted) = True) and (not ((c_run_flow.f_run_flow_roundLimit) in (c_run_flow.f_run_flow_round).^next_num0)))) } for 3 but 4 Int, 42 Str, 1..8 steps
run c18 { eventually (Step.event = k_run_flow_NoMoreCandidates and ((c_run_flow.f_run_flow_status) = str_2) and (some Bool) and (not ((c_run_flow.f_run_flow_splitAccepted) = True))) } for 3 but 4 Int, 42 Str, 1..8 steps
run c19 { eventually (Step.event = k_run_flow_NoMoreCandidates and ((c_run_flow.f_run_flow_status) = str_2) and (some Bool) and (not ((c_run_flow.f_run_flow_splitAccepted) = True))) } for 3 but 4 Int, 42 Str, 1..8 steps
run c20 { eventually (some p_outcome: Str | Step.event = k_run_flow_Interpreted and Step.x_run_flow_Interpreted_outcome = p_outcome and p_outcome in (str_38 + str_21 + str_18 + str_14) and ((c_run_flow.f_run_flow_status) = str_7) and (some Bool)) } for 3 but 4 Int, 42 Str, 1..8 steps
run c21 { eventually (some p_outcome: Str | Step.event = k_run_flow_Interpreted and Step.x_run_flow_Interpreted_outcome = p_outcome and p_outcome in (str_38 + str_21 + str_18 + str_14) and ((c_run_flow.f_run_flow_status) = str_7) and (some Bool) and (p_outcome = str_21)) } for 3 but 4 Int, 42 Str, 1..8 steps
run c22 { eventually (some p_outcome: Str | Step.event = k_run_flow_Interpreted and Step.x_run_flow_Interpreted_outcome = p_outcome and p_outcome in (str_38 + str_21 + str_18 + str_14) and ((c_run_flow.f_run_flow_status) = str_7) and (some Bool) and ((not (p_outcome = str_21)) and (p_outcome = str_38))) } for 3 but 4 Int, 42 Str, 1..8 steps
run c23 { eventually (some p_outcome: Str | Step.event = k_run_flow_Interpreted and Step.x_run_flow_Interpreted_outcome = p_outcome and p_outcome in (str_38 + str_21 + str_18 + str_14) and ((c_run_flow.f_run_flow_status) = str_7) and (some Bool) and ((not (p_outcome = str_21)) and (p_outcome = str_38))) } for 3 but 4 Int, 42 Str, 1..8 steps
run c24 { eventually (some p_outcome: Str | Step.event = k_run_flow_Interpreted and Step.x_run_flow_Interpreted_outcome = p_outcome and p_outcome in (str_38 + str_21 + str_18 + str_14) and ((c_run_flow.f_run_flow_status) = str_7) and (some Bool) and ((not (p_outcome = str_21)) and (not (p_outcome = str_38)) and (p_outcome = str_18))) } for 3 but 4 Int, 42 Str, 1..8 steps
run c25 { eventually (some p_outcome: Str | Step.event = k_run_flow_Interpreted and Step.x_run_flow_Interpreted_outcome = p_outcome and p_outcome in (str_38 + str_21 + str_18 + str_14) and ((c_run_flow.f_run_flow_status) = str_7) and (some Bool) and ((not (p_outcome = str_21)) and (not (p_outcome = str_38)) and (not (p_outcome = str_18)))) } for 3 but 4 Int, 42 Str, 1..8 steps
run c26 { eventually (Step.event = k_run_flow_Question and ((c_run_flow.f_run_flow_status) = str_10) and (some Bool)) } for 3 but 4 Int, 42 Str, 1..8 steps
run c27 { eventually (some p_answer: Str | Step.event = k_run_flow_QuestionAnswered and Step.x_run_flow_QuestionAnswered_answer = p_answer and p_answer in (str_13 + str_36 + str_35) and ((c_run_flow.f_run_flow_status) = str_11) and (some Bool)) } for 3 but 4 Int, 42 Str, 1..8 steps
run c28 { eventually (some p_answer: Str | Step.event = k_run_flow_QuestionAnswered and Step.x_run_flow_QuestionAnswered_answer = p_answer and p_answer in (str_13 + str_36 + str_35) and ((c_run_flow.f_run_flow_status) = str_11) and (some Bool) and (p_answer = str_35)) } for 3 but 4 Int, 42 Str, 1..8 steps
run c29 { eventually (some p_answer: Str | Step.event = k_run_flow_QuestionAnswered and Step.x_run_flow_QuestionAnswered_answer = p_answer and p_answer in (str_13 + str_36 + str_35) and ((c_run_flow.f_run_flow_status) = str_11) and (some Bool) and ((not (p_answer = str_35)) and (p_answer = str_13))) } for 3 but 4 Int, 42 Str, 1..8 steps
run c30 { eventually (some p_answer: Str | Step.event = k_run_flow_QuestionAnswered and Step.x_run_flow_QuestionAnswered_answer = p_answer and p_answer in (str_13 + str_36 + str_35) and ((c_run_flow.f_run_flow_status) = str_11) and (some Bool) and (not (p_answer = str_35))) } for 3 but 4 Int, 42 Str, 1..8 steps
run c31 { eventually (Step.event = k_run_flow_NoMoreQuestions and ((c_run_flow.f_run_flow_status) = str_10) and (some Bool)) } for 3 but 4 Int, 42 Str, 1..8 steps
run c32 { eventually (Step.event = k_run_flow_NoMoreQuestions and ((c_run_flow.f_run_flow_status) = str_10) and (some Bool) and ((c_run_flow.f_run_flow_supplemented) = True)) } for 3 but 4 Int, 42 Str, 1..8 steps
run c33 { eventually (Step.event = k_run_flow_NoMoreQuestions and ((c_run_flow.f_run_flow_status) = str_10) and (some Bool) and (not ((c_run_flow.f_run_flow_supplemented) = True))) } for 3 but 4 Int, 42 Str, 1..8 steps
run c34 { eventually (Step.event = k_run_flow_NoMoreQuestions and ((c_run_flow.f_run_flow_status) = str_10) and (some Bool) and (not ((c_run_flow.f_run_flow_supplemented) = True))) } for 3 but 4 Int, 42 Str, 1..8 steps
run c35 { eventually (some p_placed: Bool | Step.event = k_run_flow_SupplementsPlaced and Step.x_run_flow_SupplementsPlaced_placed = p_placed and ((c_run_flow.f_run_flow_status) = str_8) and (some Bool)) } for 3 but 4 Int, 42 Str, 1..8 steps
run c36 { eventually (some p_placed: Bool | Step.event = k_run_flow_SupplementsPlaced and Step.x_run_flow_SupplementsPlaced_placed = p_placed and ((c_run_flow.f_run_flow_status) = str_8) and (some Bool) and (not (p_placed = True))) } for 3 but 4 Int, 42 Str, 1..8 steps
run c37 { eventually (some p_placed: Bool | Step.event = k_run_flow_SupplementsPlaced and Step.x_run_flow_SupplementsPlaced_placed = p_placed and ((c_run_flow.f_run_flow_status) = str_8) and (some Bool) and ((p_placed = True) and ((c_run_flow.f_run_flow_writeUnasked) = True))) } for 3 but 4 Int, 42 Str, 1..8 steps
run c38 { eventually (some p_placed: Bool | Step.event = k_run_flow_SupplementsPlaced and Step.x_run_flow_SupplementsPlaced_placed = p_placed and ((c_run_flow.f_run_flow_status) = str_8) and (some Bool) and ((p_placed = True) and ((c_run_flow.f_run_flow_writeUnasked) = True))) } for 3 but 4 Int, 42 Str, 1..8 steps
run c39 { eventually (some p_placed: Bool | Step.event = k_run_flow_SupplementsPlaced and Step.x_run_flow_SupplementsPlaced_placed = p_placed and ((c_run_flow.f_run_flow_status) = str_8) and (some Bool) and ((p_placed = True) and ((c_run_flow.f_run_flow_writeUnasked) = True) and ((c_run_flow.f_run_flow_roundLimit) in (c_run_flow.f_run_flow_round).^next_num0))) } for 3 but 4 Int, 42 Str, 1..8 steps
run c40 { eventually (some p_placed: Bool | Step.event = k_run_flow_SupplementsPlaced and Step.x_run_flow_SupplementsPlaced_placed = p_placed and ((c_run_flow.f_run_flow_status) = str_8) and (some Bool) and ((p_placed = True) and ((c_run_flow.f_run_flow_writeUnasked) = True) and (not ((c_run_flow.f_run_flow_roundLimit) in (c_run_flow.f_run_flow_round).^next_num0)))) } for 3 but 4 Int, 42 Str, 1..8 steps
run c41 { eventually (some p_placed: Bool | Step.event = k_run_flow_SupplementsPlaced and Step.x_run_flow_SupplementsPlaced_placed = p_placed and ((c_run_flow.f_run_flow_status) = str_8) and (some Bool) and ((p_placed = True) and (not ((c_run_flow.f_run_flow_writeUnasked) = True)))) } for 3 but 4 Int, 42 Str, 1..8 steps
run c42 { eventually (some p_yes: Bool | Step.event = k_run_flow_SupplementsConfirmed and Step.x_run_flow_SupplementsConfirmed_yes = p_yes and ((c_run_flow.f_run_flow_status) = str_4) and (some Bool)) } for 3 but 4 Int, 42 Str, 1..8 steps
run c43 { eventually (some p_yes: Bool | Step.event = k_run_flow_SupplementsConfirmed and Step.x_run_flow_SupplementsConfirmed_yes = p_yes and ((c_run_flow.f_run_flow_status) = str_4) and (some Bool) and (not (p_yes = True))) } for 3 but 4 Int, 42 Str, 1..8 steps
run c44 { eventually (some p_yes: Bool | Step.event = k_run_flow_SupplementsConfirmed and Step.x_run_flow_SupplementsConfirmed_yes = p_yes and ((c_run_flow.f_run_flow_status) = str_4) and (some Bool) and (p_yes = True)) } for 3 but 4 Int, 42 Str, 1..8 steps
run c45 { eventually (some p_yes: Bool | Step.event = k_run_flow_SupplementsConfirmed and Step.x_run_flow_SupplementsConfirmed_yes = p_yes and ((c_run_flow.f_run_flow_status) = str_4) and (some Bool) and (p_yes = True)) } for 3 but 4 Int, 42 Str, 1..8 steps
run c46 { eventually (some p_yes: Bool | Step.event = k_run_flow_SupplementsConfirmed and Step.x_run_flow_SupplementsConfirmed_yes = p_yes and ((c_run_flow.f_run_flow_status) = str_4) and (some Bool) and ((p_yes = True) and ((c_run_flow.f_run_flow_roundLimit) in (c_run_flow.f_run_flow_round).^next_num0))) } for 3 but 4 Int, 42 Str, 1..8 steps
run c47 { eventually (some p_yes: Bool | Step.event = k_run_flow_SupplementsConfirmed and Step.x_run_flow_SupplementsConfirmed_yes = p_yes and ((c_run_flow.f_run_flow_status) = str_4) and (some Bool) and ((p_yes = True) and (not ((c_run_flow.f_run_flow_roundLimit) in (c_run_flow.f_run_flow_round).^next_num0)))) } for 3 but 4 Int, 42 Str, 1..8 steps
run c48 { eventually (some p_ok: Bool | Step.event = k_run_flow_Accepted and Step.x_run_flow_Accepted_ok = p_ok and ((c_run_flow.f_run_flow_status) = str_0) and (some Bool)) } for 3 but 4 Int, 42 Str, 1..8 steps
run c49 { eventually (some p_ok: Bool | Step.event = k_run_flow_Accepted and Step.x_run_flow_Accepted_ok = p_ok and ((c_run_flow.f_run_flow_status) = str_0) and (some Bool) and (p_ok = True)) } for 3 but 4 Int, 42 Str, 1..8 steps
run c50 { eventually (some p_ok: Bool | Step.event = k_run_flow_Accepted and Step.x_run_flow_Accepted_ok = p_ok and ((c_run_flow.f_run_flow_status) = str_0) and (some Bool) and (not (p_ok = True))) } for 3 but 4 Int, 42 Str, 1..8 steps
run c51 { eventually (some p_outcome: Str | Step.event = k_run_flow_Applied and Step.x_run_flow_Applied_outcome = p_outcome and p_outcome in (str_27 + str_17 + str_14 + str_33) and ((c_run_flow.f_run_flow_status) = str_1) and (some Bool)) } for 3 but 4 Int, 42 Str, 1..8 steps
run c52 { eventually (some p_outcome: Str | Step.event = k_run_flow_Applied and Step.x_run_flow_Applied_outcome = p_outcome and p_outcome in (str_27 + str_17 + str_14 + str_33) and ((c_run_flow.f_run_flow_status) = str_1) and (some Bool) and (p_outcome = str_27)) } for 3 but 4 Int, 42 Str, 1..8 steps
run c53 { eventually (some p_outcome: Str | Step.event = k_run_flow_Applied and Step.x_run_flow_Applied_outcome = p_outcome and p_outcome in (str_27 + str_17 + str_14 + str_33) and ((c_run_flow.f_run_flow_status) = str_1) and (some Bool) and ((not (p_outcome = str_27)) and (p_outcome = str_17))) } for 3 but 4 Int, 42 Str, 1..8 steps
run c54 { eventually (some p_outcome: Str | Step.event = k_run_flow_Applied and Step.x_run_flow_Applied_outcome = p_outcome and p_outcome in (str_27 + str_17 + str_14 + str_33) and ((c_run_flow.f_run_flow_status) = str_1) and (some Bool) and ((not (p_outcome = str_27)) and (not (p_outcome = str_17)) and (p_outcome = str_14))) } for 3 but 4 Int, 42 Str, 1..8 steps
run c55 { eventually (some p_outcome: Str | Step.event = k_run_flow_Applied and Step.x_run_flow_Applied_outcome = p_outcome and p_outcome in (str_27 + str_17 + str_14 + str_33) and ((c_run_flow.f_run_flow_status) = str_1) and (some Bool) and ((not (p_outcome = str_27)) and (not (p_outcome = str_17)) and (not (p_outcome = str_14)))) } for 3 but 4 Int, 42 Str, 1..8 steps
run sane { some Bool } for 3 but 4 Int, 42 Str, 1..8 steps
