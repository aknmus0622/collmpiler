module spec

abstract sig Bool {}
one sig True, False extends Bool {}
sig Str {}
sig Json {}
one sig str_0, str_1, str_2, str_3, str_4, str_5, str_6, str_7 extends Str {}
one sig c_loan { var f_loan_status: one Str, var f_loan_daysUntilDue: one Int }
one sig Env { var env_loan_world_BooksOnLoan: one Int, var env_loan_world_ReservedBySomeoneElse: one Bool }
abstract sig Entry {}
one sig k_loan_Borrow, k_loan_DayPasses, k_loan_Extend, k_loan_Return extends Entry {}
one sig Step { var event: lone Entry, var x_loan_DayPasses_days: lone Int }
pred same_loan { c_loan.f_loan_status' = c_loan.f_loan_status and c_loan.f_loan_daysUntilDue' = c_loan.f_loan_daysUntilDue }
pred ev_loan_Borrow_atLimitOrReserved[] {
  ((Env.env_loan_world_BooksOnLoan >= 3) or (Env.env_loan_world_ReservedBySomeoneElse = True))
  c_loan.f_loan_status' = c_loan.f_loan_status
  c_loan.f_loan_daysUntilDue' = c_loan.f_loan_daysUntilDue
}
pred ev_loan_Borrow_otherwise[] {
  (not ((Env.env_loan_world_BooksOnLoan >= 3) or (Env.env_loan_world_ReservedBySomeoneElse = True)))
  c_loan.f_loan_status' = str_2
  c_loan.f_loan_daysUntilDue' = 14
}
pred cmd_loan_Borrow[] {
  ((c_loan.f_loan_status) = str_0) and (ev_loan_Borrow_atLimitOrReserved[] or ev_loan_Borrow_otherwise[])
}
pred ev_loan_Extend_reservedBySomeoneElse[] {
  (Env.env_loan_world_ReservedBySomeoneElse = True)
  c_loan.f_loan_status' = c_loan.f_loan_status
  c_loan.f_loan_daysUntilDue' = c_loan.f_loan_daysUntilDue
}
pred ev_loan_Extend_otherwise[] {
  (not (Env.env_loan_world_ReservedBySomeoneElse = True))
  c_loan.f_loan_status' = c_loan.f_loan_status
  c_loan.f_loan_daysUntilDue' = plus[(c_loan.f_loan_daysUntilDue), 7]
}
pred cmd_loan_Extend[] {
  ((c_loan.f_loan_status) = str_2) and (ev_loan_Extend_reservedBySomeoneElse[] or ev_loan_Extend_otherwise[])
}
pred ev_loan_DayPasses_otherwise[p_days: Int] {
  (some Bool)
  c_loan.f_loan_status' = ((minus[(c_loan.f_loan_daysUntilDue), p_days] < minus[0, 30]) => str_1 else ((minus[(c_loan.f_loan_daysUntilDue), p_days] < 0) => str_3 else (c_loan.f_loan_status)))
  c_loan.f_loan_daysUntilDue' = minus[(c_loan.f_loan_daysUntilDue), p_days]
}
pred cmd_loan_DayPasses[p_days: Int] {
  (((((c_loan.f_loan_status) = str_2) or ((c_loan.f_loan_status) = str_3)) and (p_days >= 1)) and (p_days <= 30)) and (ev_loan_DayPasses_otherwise[p_days])
}
pred ev_loan_Return_case1[] {
  ((c_loan.f_loan_status) = str_1)
  c_loan.f_loan_status' = c_loan.f_loan_status
  c_loan.f_loan_daysUntilDue' = c_loan.f_loan_daysUntilDue
}
pred ev_loan_Return_otherwise[] {
  (not ((c_loan.f_loan_status) = str_1))
  c_loan.f_loan_status' = str_0
  c_loan.f_loan_daysUntilDue' = c_loan.f_loan_daysUntilDue
}
pred cmd_loan_Return[] {
  (not ((c_loan.f_loan_status) = str_0)) and (ev_loan_Return_case1[] or ev_loan_Return_otherwise[])
}
fact initial_values { c_loan.f_loan_status = str_0 and c_loan.f_loan_daysUntilDue = 0 }
fact transitions { always ((same_loan and no Step.event and no Step.x_loan_DayPasses_days)
  or (cmd_loan_Borrow[] and Step.event = k_loan_Borrow and no Step.x_loan_DayPasses_days)
  or (some p_days: Int | cmd_loan_DayPasses[p_days] and Step.event = k_loan_DayPasses and Step.x_loan_DayPasses_days = p_days)
  or (cmd_loan_Extend[] and Step.event = k_loan_Extend and no Step.x_loan_DayPasses_days)
  or (cmd_loan_Return[] and Step.event = k_loan_Return and no Step.x_loan_DayPasses_days)) }
check c0 { (always ((((not ((c_loan.f_loan_status) = str_2)) or ((c_loan.f_loan_daysUntilDue) >= 0)) and ((not ((c_loan.f_loan_status) = str_3)) or (((c_loan.f_loan_daysUntilDue) < 0) and ((c_loan.f_loan_daysUntilDue) >= minus[0, 30])))) and ((not ((c_loan.f_loan_status) = str_1)) or ((c_loan.f_loan_daysUntilDue) < minus[0, 30])))) } for 3 but 6 Int, 11 Str, 6 steps
run c1 { eventually (Step.event = k_loan_Borrow and ((c_loan.f_loan_status) = str_0) and ((Env.env_loan_world_BooksOnLoan >= 3) or (Env.env_loan_world_ReservedBySomeoneElse = True))) } for 3 but 6 Int, 11 Str, 1..8 steps
run c2 { eventually (Step.event = k_loan_Borrow and ((c_loan.f_loan_status) = str_0) and ((Env.env_loan_world_BooksOnLoan >= 3) or (Env.env_loan_world_ReservedBySomeoneElse = True)) and (some Bool)) } for 3 but 6 Int, 11 Str, 1..8 steps
run c3 { eventually (Step.event = k_loan_Borrow and ((c_loan.f_loan_status) = str_0) and (not ((Env.env_loan_world_BooksOnLoan >= 3) or (Env.env_loan_world_ReservedBySomeoneElse = True)))) } for 3 but 6 Int, 11 Str, 1..8 steps
run c4 { eventually (Step.event = k_loan_Borrow and ((c_loan.f_loan_status) = str_0) and (not ((Env.env_loan_world_BooksOnLoan >= 3) or (Env.env_loan_world_ReservedBySomeoneElse = True))) and (some Bool)) } for 3 but 6 Int, 11 Str, 1..8 steps
run c5 { eventually (Step.event = k_loan_Extend and ((c_loan.f_loan_status) = str_2) and (Env.env_loan_world_ReservedBySomeoneElse = True)) } for 3 but 6 Int, 11 Str, 1..8 steps
run c6 { eventually (Step.event = k_loan_Extend and ((c_loan.f_loan_status) = str_2) and (not (Env.env_loan_world_ReservedBySomeoneElse = True))) } for 3 but 6 Int, 11 Str, 1..8 steps
run c7 { eventually (Step.event = k_loan_Extend and ((c_loan.f_loan_status) = str_2) and (not (Env.env_loan_world_ReservedBySomeoneElse = True)) and (some Bool)) } for 3 but 6 Int, 11 Str, 1..8 steps
run c8 { eventually (some p_days: Int | Step.event = k_loan_DayPasses and Step.x_loan_DayPasses_days = p_days and (((((c_loan.f_loan_status) = str_2) or ((c_loan.f_loan_status) = str_3)) and (p_days >= 1)) and (p_days <= 30)) and (some Bool)) } for 3 but 6 Int, 11 Str, 1..8 steps
run c9 { eventually (some p_days: Int | Step.event = k_loan_DayPasses and Step.x_loan_DayPasses_days = p_days and (((((c_loan.f_loan_status) = str_2) or ((c_loan.f_loan_status) = str_3)) and (p_days >= 1)) and (p_days <= 30)) and (some Bool) and (some Bool)) } for 3 but 6 Int, 11 Str, 1..8 steps
run c10 { eventually (some p_days: Int | Step.event = k_loan_DayPasses and Step.x_loan_DayPasses_days = p_days and (((((c_loan.f_loan_status) = str_2) or ((c_loan.f_loan_status) = str_3)) and (p_days >= 1)) and (p_days <= 30)) and (some Bool) and (minus[(c_loan.f_loan_daysUntilDue), p_days] < minus[0, 30])) } for 3 but 6 Int, 11 Str, 1..8 steps
run c11 { eventually (Step.event = k_loan_Return and (not ((c_loan.f_loan_status) = str_0)) and ((c_loan.f_loan_status) = str_1)) } for 3 but 6 Int, 11 Str, 1..8 steps
run c12 { eventually (Step.event = k_loan_Return and (not ((c_loan.f_loan_status) = str_0)) and (not ((c_loan.f_loan_status) = str_1))) } for 3 but 6 Int, 11 Str, 1..8 steps
run c13 { eventually (Step.event = k_loan_Return and (not ((c_loan.f_loan_status) = str_0)) and (not ((c_loan.f_loan_status) = str_1)) and (some Bool)) } for 3 but 6 Int, 11 Str, 1..8 steps
run c14 { eventually (Step.event = k_loan_Return and (not ((c_loan.f_loan_status) = str_0)) and (not ((c_loan.f_loan_status) = str_1)) and ((c_loan.f_loan_status) = str_3)) } for 3 but 6 Int, 11 Str, 1..8 steps
run c15 { eventually (Step.event = k_loan_Return and (not ((c_loan.f_loan_status) = str_0)) and (not ((c_loan.f_loan_status) = str_1)) and (Env.env_loan_world_ReservedBySomeoneElse = True)) } for 3 but 6 Int, 11 Str, 1..8 steps
run sane { some Bool } for 3 but 6 Int, 11 Str, 1..8 steps
run c16 { eventually ((Step.event = k_loan_Borrow and ((c_loan.f_loan_status) = str_0) and (not ((Env.env_loan_world_BooksOnLoan >= 3) or (Env.env_loan_world_ReservedBySomeoneElse = True))) and (some Bool)) and after eventually (some p_days: Int | Step.event = k_loan_DayPasses and Step.x_loan_DayPasses_days = p_days and (((((c_loan.f_loan_status) = str_2) or ((c_loan.f_loan_status) = str_3)) and (p_days >= 1)) and (p_days <= 30)) and (some Bool) and (minus[(c_loan.f_loan_daysUntilDue), p_days] < minus[0, 30]))) } for 3 but 6 Int, 11 Str, 1..8 steps
run c17 { eventually ((Step.event = k_loan_Borrow and ((c_loan.f_loan_status) = str_0) and (not ((Env.env_loan_world_BooksOnLoan >= 3) or (Env.env_loan_world_ReservedBySomeoneElse = True))) and (some Bool)) and after eventually (Step.event = k_loan_Return and (not ((c_loan.f_loan_status) = str_0)) and (not ((c_loan.f_loan_status) = str_1)) and ((c_loan.f_loan_status) = str_3))) } for 3 but 6 Int, 11 Str, 1..8 steps
run c18 { eventually ((Step.event = k_loan_Borrow and ((c_loan.f_loan_status) = str_0) and (not ((Env.env_loan_world_BooksOnLoan >= 3) or (Env.env_loan_world_ReservedBySomeoneElse = True))) and (some Bool)) and after eventually (Step.event = k_loan_Return and (not ((c_loan.f_loan_status) = str_0)) and (not ((c_loan.f_loan_status) = str_1)) and (Env.env_loan_world_ReservedBySomeoneElse = True))) } for 3 but 6 Int, 11 Str, 1..8 steps
run c19 { eventually ((Step.event = k_loan_Extend and ((c_loan.f_loan_status) = str_2) and (not (Env.env_loan_world_ReservedBySomeoneElse = True)) and (some Bool)) and after eventually (some p_days: Int | Step.event = k_loan_DayPasses and Step.x_loan_DayPasses_days = p_days and (((((c_loan.f_loan_status) = str_2) or ((c_loan.f_loan_status) = str_3)) and (p_days >= 1)) and (p_days <= 30)) and (some Bool) and (minus[(c_loan.f_loan_daysUntilDue), p_days] < minus[0, 30]))) } for 3 but 6 Int, 11 Str, 1..8 steps
run c20 { eventually ((Step.event = k_loan_Extend and ((c_loan.f_loan_status) = str_2) and (not (Env.env_loan_world_ReservedBySomeoneElse = True)) and (some Bool)) and after eventually (Step.event = k_loan_Return and (not ((c_loan.f_loan_status) = str_0)) and (not ((c_loan.f_loan_status) = str_1)) and ((c_loan.f_loan_status) = str_3))) } for 3 but 6 Int, 11 Str, 1..8 steps
run c21 { eventually ((Step.event = k_loan_Extend and ((c_loan.f_loan_status) = str_2) and (not (Env.env_loan_world_ReservedBySomeoneElse = True)) and (some Bool)) and after eventually (Step.event = k_loan_Return and (not ((c_loan.f_loan_status) = str_0)) and (not ((c_loan.f_loan_status) = str_1)) and (Env.env_loan_world_ReservedBySomeoneElse = True))) } for 3 but 6 Int, 11 Str, 1..8 steps
run c22 { eventually ((some p_days: Int | Step.event = k_loan_DayPasses and Step.x_loan_DayPasses_days = p_days and (((((c_loan.f_loan_status) = str_2) or ((c_loan.f_loan_status) = str_3)) and (p_days >= 1)) and (p_days <= 30)) and (some Bool) and (some Bool)) and after eventually (some p_days: Int | Step.event = k_loan_DayPasses and Step.x_loan_DayPasses_days = p_days and (((((c_loan.f_loan_status) = str_2) or ((c_loan.f_loan_status) = str_3)) and (p_days >= 1)) and (p_days <= 30)) and (some Bool) and (minus[(c_loan.f_loan_daysUntilDue), p_days] < minus[0, 30]))) } for 3 but 6 Int, 11 Str, 1..8 steps
run c23 { eventually ((some p_days: Int | Step.event = k_loan_DayPasses and Step.x_loan_DayPasses_days = p_days and (((((c_loan.f_loan_status) = str_2) or ((c_loan.f_loan_status) = str_3)) and (p_days >= 1)) and (p_days <= 30)) and (some Bool) and (some Bool)) and after eventually (Step.event = k_loan_Return and (not ((c_loan.f_loan_status) = str_0)) and (not ((c_loan.f_loan_status) = str_1)) and ((c_loan.f_loan_status) = str_3))) } for 3 but 6 Int, 11 Str, 1..8 steps
run c24 { eventually ((some p_days: Int | Step.event = k_loan_DayPasses and Step.x_loan_DayPasses_days = p_days and (((((c_loan.f_loan_status) = str_2) or ((c_loan.f_loan_status) = str_3)) and (p_days >= 1)) and (p_days <= 30)) and (some Bool) and (some Bool)) and after eventually (Step.event = k_loan_Return and (not ((c_loan.f_loan_status) = str_0)) and (not ((c_loan.f_loan_status) = str_1)) and (Env.env_loan_world_ReservedBySomeoneElse = True))) } for 3 but 6 Int, 11 Str, 1..8 steps
