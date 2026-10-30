module spec

abstract sig Bool {}
one sig True, False extends Bool {}
abstract sig Num {}
sig Str {}
sig Json {}
one sig str_0, str_1, str_2, str_3, str_4, str_5, str_6, str_7 extends Str {}
abstract sig s_num0 extends Num {}
one sig s_num0_0 extends s_num0 {}
fun next_num0: s_num0 -> s_num0 { none -> none }
abstract sig s_num1 extends Num {}
one sig s_num1_0 extends s_num1 {}
fun next_num1: s_num1 -> s_num1 { none -> none }
abstract sig s_num2 extends Num {}
one sig s_num2_0, s_num2_1, s_num2_2, s_num2_3, s_num2_4 extends s_num2 {}
fun next_num2: s_num2 -> s_num2 { s_num2_0 -> s_num2_1 + s_num2_1 -> s_num2_2 + s_num2_2 -> s_num2_3 + s_num2_3 -> s_num2_4 }
abstract sig s_num3 extends Num {}
one sig s_num3_0, s_num3_1, s_num3_2, s_num3_3, s_num3_4 extends s_num3 {}
fun next_num3: s_num3 -> s_num3 { s_num3_0 -> s_num3_1 + s_num3_1 -> s_num3_2 + s_num3_2 -> s_num3_3 + s_num3_3 -> s_num3_4 }
abstract sig s_num4 extends Num {}
one sig s_num4_0, s_num4_1, s_num4_2, s_num4_3, s_num4_4 extends s_num4 {}
fun next_num4: s_num4 -> s_num4 { s_num4_0 -> s_num4_1 + s_num4_1 -> s_num4_2 + s_num4_2 -> s_num4_3 + s_num4_3 -> s_num4_4 }
abstract sig s_num7 extends Num {}
one sig s_num7_0, s_num7_1, s_num7_2, s_num7_3 extends s_num7 {}
fun next_num7: s_num7 -> s_num7 { s_num7_0 -> s_num7_1 + s_num7_1 -> s_num7_2 + s_num7_2 -> s_num7_3 }
fun op_num3_0: s_num0 -> s_num3 { s_num0_0 -> s_num3_1 }
fun op_num3_1: s_num3 -> s_num1 -> s_num3 { s_num3_0 -> s_num1_0 -> s_num3_0 + s_num3_0 -> s_num1_0 -> s_num3_1 + s_num3_0 -> s_num1_0 -> s_num3_2 + s_num3_1 -> s_num1_0 -> s_num3_2 + s_num3_2 -> s_num1_0 -> s_num3_2 + s_num3_2 -> s_num1_0 -> s_num3_3 + s_num3_2 -> s_num1_0 -> s_num3_4 + s_num3_3 -> s_num1_0 -> s_num3_4 + s_num3_4 -> s_num1_0 -> s_num3_4 }
fun op_num3_2: s_num3 -> s_num2 -> s_num3 { (s_num3_0 -> s_num2_0 -> s_num3_0 + s_num3_0 -> s_num2_0 -> s_num3_1 + s_num3_0 -> s_num2_0 -> s_num3_2 + s_num3_0 -> s_num2_0 -> s_num3_3 + s_num3_0 -> s_num2_0 -> s_num3_4 + s_num3_0 -> s_num2_1 -> s_num3_0 + s_num3_0 -> s_num2_2 -> s_num3_0 + s_num3_0 -> s_num2_3 -> s_num3_0 + s_num3_0 -> s_num2_4 -> s_num3_0 + s_num3_1 -> s_num2_0 -> s_num3_1 + s_num3_1 -> s_num2_0 -> s_num3_2 + s_num3_1 -> s_num2_0 -> s_num3_3 + s_num3_1 -> s_num2_0 -> s_num3_4 + s_num3_1 -> s_num2_1 -> s_num3_0 + s_num3_1 -> s_num2_2 -> s_num3_0 + s_num3_1 -> s_num2_3 -> s_num3_0 + s_num3_1 -> s_num2_4 -> s_num3_0 + s_num3_2 -> s_num2_0 -> s_num3_2 + s_num3_2 -> s_num2_0 -> s_num3_3 + s_num3_2 -> s_num2_0 -> s_num3_4 + s_num3_2 -> s_num2_1 -> s_num3_1 + s_num3_2 -> s_num2_1 -> s_num3_2 + s_num3_2 -> s_num2_2 -> s_num3_0) + (s_num3_2 -> s_num2_2 -> s_num3_1 + s_num3_2 -> s_num2_2 -> s_num3_2 + s_num3_2 -> s_num2_3 -> s_num3_0 + s_num3_2 -> s_num2_4 -> s_num3_0 + s_num3_3 -> s_num2_0 -> s_num3_3 + s_num3_3 -> s_num2_0 -> s_num3_4 + s_num3_3 -> s_num2_1 -> s_num3_2 + s_num3_3 -> s_num2_2 -> s_num3_2 + s_num3_3 -> s_num2_3 -> s_num3_1 + s_num3_3 -> s_num2_4 -> s_num3_0 + s_num3_4 -> s_num2_0 -> s_num3_4 + s_num3_4 -> s_num2_1 -> s_num3_3 + s_num3_4 -> s_num2_1 -> s_num3_4 + s_num3_4 -> s_num2_2 -> s_num3_2 + s_num3_4 -> s_num2_2 -> s_num3_3 + s_num3_4 -> s_num2_2 -> s_num3_4 + s_num3_4 -> s_num2_3 -> s_num3_2 + s_num3_4 -> s_num2_3 -> s_num3_3 + s_num3_4 -> s_num2_3 -> s_num3_4 + s_num3_4 -> s_num2_4 -> s_num3_0 + s_num3_4 -> s_num2_4 -> s_num3_1 + s_num3_4 -> s_num2_4 -> s_num3_2 + s_num3_4 -> s_num2_4 -> s_num3_3 + s_num3_4 -> s_num2_4 -> s_num3_4) }
one sig Choice { var ch_op_num3_1: s_num3 -> s_num1 -> lone s_num3, var ch_op_num3_2: s_num3 -> s_num2 -> lone s_num3 }
fact { always (Choice.ch_op_num3_1 in op_num3_1 and (all a0: s_num3, a1: s_num1 | some a1.(a0.(op_num3_1)) implies one a1.(a0.(Choice.ch_op_num3_1)))) }
fact { always (Choice.ch_op_num3_2 in op_num3_2 and (all a0: s_num3, a1: s_num2 | some a1.(a0.(op_num3_2)) implies one a1.(a0.(Choice.ch_op_num3_2)))) }
one sig c_loan { var f_loan_status: one Str, var f_loan_daysUntilDue: one s_num3 }
one sig Env { var env_loan_world_BooksOnLoan: one s_num4, var env_loan_world_ReservedBySomeoneElse: one Bool }
abstract sig Entry {}
one sig k_loan_Borrow, k_loan_DayPasses, k_loan_Extend, k_loan_Return extends Entry {}
one sig Step { var event: lone Entry, var x_loan_DayPasses_days: lone s_num2 }
pred same_loan { c_loan.f_loan_status' = c_loan.f_loan_status and c_loan.f_loan_daysUntilDue' = c_loan.f_loan_daysUntilDue }
pred ev_loan_Borrow_atLimitOrReserved[] {
  ((Env.env_loan_world_BooksOnLoan in s_num4_2.*next_num4) or (Env.env_loan_world_ReservedBySomeoneElse = True))
  c_loan.f_loan_status' = c_loan.f_loan_status
  c_loan.f_loan_daysUntilDue' = c_loan.f_loan_daysUntilDue
}
pred ev_loan_Borrow_otherwise[] {
  (not ((Env.env_loan_world_BooksOnLoan in s_num4_2.*next_num4) or (Env.env_loan_world_ReservedBySomeoneElse = True)))
  c_loan.f_loan_status' = str_2
  c_loan.f_loan_daysUntilDue' = s_num3_4
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
  c_loan.f_loan_daysUntilDue' = (s_num1_0).(((c_loan.f_loan_daysUntilDue)).(Choice.ch_op_num3_1))
}
pred cmd_loan_Extend[] {
  ((c_loan.f_loan_status) = str_2) and (ev_loan_Extend_reservedBySomeoneElse[] or ev_loan_Extend_otherwise[])
}
pred ev_loan_DayPasses_otherwise[p_days: s_num2] {
  (some Bool)
  c_loan.f_loan_status' = (((s_num0_0).(op_num3_0) in (p_days).(((c_loan.f_loan_daysUntilDue)).(Choice.ch_op_num3_2)).^next_num3) => str_1 else ((s_num3_3 in (p_days).(((c_loan.f_loan_daysUntilDue)).(Choice.ch_op_num3_2)).^next_num3) => str_3 else (c_loan.f_loan_status)))
  c_loan.f_loan_daysUntilDue' = (p_days).(((c_loan.f_loan_daysUntilDue)).(Choice.ch_op_num3_2))
}
pred cmd_loan_DayPasses[p_days: s_num2] {
  (((((c_loan.f_loan_status) = str_2) or ((c_loan.f_loan_status) = str_3)) and (p_days in s_num2_1.*next_num2)) and (s_num2_3 in p_days.*next_num2)) and (ev_loan_DayPasses_otherwise[p_days])
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
fact initial_values { c_loan.f_loan_status = str_0 and c_loan.f_loan_daysUntilDue = s_num3_3 }
fact transitions { always ((same_loan and no Step.event and no Step.x_loan_DayPasses_days)
  or (cmd_loan_Borrow[] and Step.event = k_loan_Borrow and no Step.x_loan_DayPasses_days)
  or (some p_days: s_num2 | cmd_loan_DayPasses[p_days] and Step.event = k_loan_DayPasses and Step.x_loan_DayPasses_days = p_days)
  or (cmd_loan_Extend[] and Step.event = k_loan_Extend and no Step.x_loan_DayPasses_days)
  or (cmd_loan_Return[] and Step.event = k_loan_Return and no Step.x_loan_DayPasses_days)) }
check c0 { (always ((((not ((c_loan.f_loan_status) = str_2)) or ((c_loan.f_loan_daysUntilDue) in s_num3_3.*next_num3)) and ((not ((c_loan.f_loan_status) = str_3)) or ((s_num3_3 in (c_loan.f_loan_daysUntilDue).^next_num3) and ((c_loan.f_loan_daysUntilDue) in (s_num0_0).(op_num3_0).*next_num3)))) and ((not ((c_loan.f_loan_status) = str_1)) or ((s_num0_0).(op_num3_0) in (c_loan.f_loan_daysUntilDue).^next_num3)))) } for 3 but 4 Int, 11 Str, 6 steps
run c1 { eventually (Step.event = k_loan_Borrow and ((c_loan.f_loan_status) = str_0) and ((Env.env_loan_world_BooksOnLoan in s_num4_2.*next_num4) or (Env.env_loan_world_ReservedBySomeoneElse = True))) } for 3 but 4 Int, 11 Str, 1..8 steps
run c2 { eventually (Step.event = k_loan_Borrow and ((c_loan.f_loan_status) = str_0) and ((Env.env_loan_world_BooksOnLoan in s_num4_2.*next_num4) or (Env.env_loan_world_ReservedBySomeoneElse = True)) and (some Bool)) } for 3 but 4 Int, 11 Str, 1..8 steps
run c3 { eventually (Step.event = k_loan_Borrow and ((c_loan.f_loan_status) = str_0) and (not ((Env.env_loan_world_BooksOnLoan in s_num4_2.*next_num4) or (Env.env_loan_world_ReservedBySomeoneElse = True)))) } for 3 but 4 Int, 11 Str, 1..8 steps
run c4 { eventually (Step.event = k_loan_Borrow and ((c_loan.f_loan_status) = str_0) and (not ((Env.env_loan_world_BooksOnLoan in s_num4_2.*next_num4) or (Env.env_loan_world_ReservedBySomeoneElse = True))) and (some Bool)) } for 3 but 4 Int, 11 Str, 1..8 steps
run c5 { eventually (Step.event = k_loan_Extend and ((c_loan.f_loan_status) = str_2) and (Env.env_loan_world_ReservedBySomeoneElse = True)) } for 3 but 4 Int, 11 Str, 1..8 steps
run c6 { eventually (Step.event = k_loan_Extend and ((c_loan.f_loan_status) = str_2) and (not (Env.env_loan_world_ReservedBySomeoneElse = True))) } for 3 but 4 Int, 11 Str, 1..8 steps
run c7 { eventually (Step.event = k_loan_Extend and ((c_loan.f_loan_status) = str_2) and (not (Env.env_loan_world_ReservedBySomeoneElse = True)) and (some Bool)) } for 3 but 4 Int, 11 Str, 1..8 steps
run c8 { eventually (some p_days: s_num2 | Step.event = k_loan_DayPasses and Step.x_loan_DayPasses_days = p_days and (((((c_loan.f_loan_status) = str_2) or ((c_loan.f_loan_status) = str_3)) and (p_days in s_num2_1.*next_num2)) and (s_num2_3 in p_days.*next_num2)) and (some Bool)) } for 3 but 4 Int, 11 Str, 1..8 steps
run c9 { eventually (some p_days: s_num2 | Step.event = k_loan_DayPasses and Step.x_loan_DayPasses_days = p_days and (((((c_loan.f_loan_status) = str_2) or ((c_loan.f_loan_status) = str_3)) and (p_days in s_num2_1.*next_num2)) and (s_num2_3 in p_days.*next_num2)) and (some Bool) and (some Bool)) } for 3 but 4 Int, 11 Str, 1..8 steps
run c10 { eventually (some p_days: s_num2 | Step.event = k_loan_DayPasses and Step.x_loan_DayPasses_days = p_days and (((((c_loan.f_loan_status) = str_2) or ((c_loan.f_loan_status) = str_3)) and (p_days in s_num2_1.*next_num2)) and (s_num2_3 in p_days.*next_num2)) and (some Bool) and ((s_num0_0).(op_num3_0) in (p_days).(((c_loan.f_loan_daysUntilDue)).(Choice.ch_op_num3_2)).^next_num3)) } for 3 but 4 Int, 11 Str, 1..8 steps
run c11 { eventually (Step.event = k_loan_Return and (not ((c_loan.f_loan_status) = str_0)) and ((c_loan.f_loan_status) = str_1)) } for 3 but 4 Int, 11 Str, 1..8 steps
run c12 { eventually (Step.event = k_loan_Return and (not ((c_loan.f_loan_status) = str_0)) and (not ((c_loan.f_loan_status) = str_1))) } for 3 but 4 Int, 11 Str, 1..8 steps
run c13 { eventually (Step.event = k_loan_Return and (not ((c_loan.f_loan_status) = str_0)) and (not ((c_loan.f_loan_status) = str_1)) and (some Bool)) } for 3 but 4 Int, 11 Str, 1..8 steps
run c14 { eventually (Step.event = k_loan_Return and (not ((c_loan.f_loan_status) = str_0)) and (not ((c_loan.f_loan_status) = str_1)) and ((c_loan.f_loan_status) = str_3)) } for 3 but 4 Int, 11 Str, 1..8 steps
run c15 { eventually (Step.event = k_loan_Return and (not ((c_loan.f_loan_status) = str_0)) and (not ((c_loan.f_loan_status) = str_1)) and (Env.env_loan_world_ReservedBySomeoneElse = True)) } for 3 but 4 Int, 11 Str, 1..8 steps
run sane { some Bool } for 3 but 4 Int, 11 Str, 1..8 steps
run c16 { eventually ((Step.event = k_loan_Borrow and ((c_loan.f_loan_status) = str_0) and (not ((Env.env_loan_world_BooksOnLoan in s_num4_2.*next_num4) or (Env.env_loan_world_ReservedBySomeoneElse = True))) and (some Bool)) and after eventually (some p_days: s_num2 | Step.event = k_loan_DayPasses and Step.x_loan_DayPasses_days = p_days and (((((c_loan.f_loan_status) = str_2) or ((c_loan.f_loan_status) = str_3)) and (p_days in s_num2_1.*next_num2)) and (s_num2_3 in p_days.*next_num2)) and (some Bool) and ((s_num0_0).(op_num3_0) in (p_days).(((c_loan.f_loan_daysUntilDue)).(Choice.ch_op_num3_2)).^next_num3))) } for 3 but 4 Int, 11 Str, 1..8 steps
run c17 { eventually ((Step.event = k_loan_Borrow and ((c_loan.f_loan_status) = str_0) and (not ((Env.env_loan_world_BooksOnLoan in s_num4_2.*next_num4) or (Env.env_loan_world_ReservedBySomeoneElse = True))) and (some Bool)) and after eventually (Step.event = k_loan_Return and (not ((c_loan.f_loan_status) = str_0)) and (not ((c_loan.f_loan_status) = str_1)) and ((c_loan.f_loan_status) = str_3))) } for 3 but 4 Int, 11 Str, 1..8 steps
run c18 { eventually ((Step.event = k_loan_Borrow and ((c_loan.f_loan_status) = str_0) and (not ((Env.env_loan_world_BooksOnLoan in s_num4_2.*next_num4) or (Env.env_loan_world_ReservedBySomeoneElse = True))) and (some Bool)) and after eventually (Step.event = k_loan_Return and (not ((c_loan.f_loan_status) = str_0)) and (not ((c_loan.f_loan_status) = str_1)) and (Env.env_loan_world_ReservedBySomeoneElse = True))) } for 3 but 4 Int, 11 Str, 1..8 steps
run c19 { eventually ((Step.event = k_loan_Extend and ((c_loan.f_loan_status) = str_2) and (not (Env.env_loan_world_ReservedBySomeoneElse = True)) and (some Bool)) and after eventually (some p_days: s_num2 | Step.event = k_loan_DayPasses and Step.x_loan_DayPasses_days = p_days and (((((c_loan.f_loan_status) = str_2) or ((c_loan.f_loan_status) = str_3)) and (p_days in s_num2_1.*next_num2)) and (s_num2_3 in p_days.*next_num2)) and (some Bool) and ((s_num0_0).(op_num3_0) in (p_days).(((c_loan.f_loan_daysUntilDue)).(Choice.ch_op_num3_2)).^next_num3))) } for 3 but 4 Int, 11 Str, 1..8 steps
run c20 { eventually ((Step.event = k_loan_Extend and ((c_loan.f_loan_status) = str_2) and (not (Env.env_loan_world_ReservedBySomeoneElse = True)) and (some Bool)) and after eventually (Step.event = k_loan_Return and (not ((c_loan.f_loan_status) = str_0)) and (not ((c_loan.f_loan_status) = str_1)) and ((c_loan.f_loan_status) = str_3))) } for 3 but 4 Int, 11 Str, 1..8 steps
run c21 { eventually ((Step.event = k_loan_Extend and ((c_loan.f_loan_status) = str_2) and (not (Env.env_loan_world_ReservedBySomeoneElse = True)) and (some Bool)) and after eventually (Step.event = k_loan_Return and (not ((c_loan.f_loan_status) = str_0)) and (not ((c_loan.f_loan_status) = str_1)) and (Env.env_loan_world_ReservedBySomeoneElse = True))) } for 3 but 4 Int, 11 Str, 1..8 steps
run c22 { eventually ((some p_days: s_num2 | Step.event = k_loan_DayPasses and Step.x_loan_DayPasses_days = p_days and (((((c_loan.f_loan_status) = str_2) or ((c_loan.f_loan_status) = str_3)) and (p_days in s_num2_1.*next_num2)) and (s_num2_3 in p_days.*next_num2)) and (some Bool) and (some Bool)) and after eventually (some p_days: s_num2 | Step.event = k_loan_DayPasses and Step.x_loan_DayPasses_days = p_days and (((((c_loan.f_loan_status) = str_2) or ((c_loan.f_loan_status) = str_3)) and (p_days in s_num2_1.*next_num2)) and (s_num2_3 in p_days.*next_num2)) and (some Bool) and ((s_num0_0).(op_num3_0) in (p_days).(((c_loan.f_loan_daysUntilDue)).(Choice.ch_op_num3_2)).^next_num3))) } for 3 but 4 Int, 11 Str, 1..8 steps
run c23 { eventually ((some p_days: s_num2 | Step.event = k_loan_DayPasses and Step.x_loan_DayPasses_days = p_days and (((((c_loan.f_loan_status) = str_2) or ((c_loan.f_loan_status) = str_3)) and (p_days in s_num2_1.*next_num2)) and (s_num2_3 in p_days.*next_num2)) and (some Bool) and (some Bool)) and after eventually (Step.event = k_loan_Return and (not ((c_loan.f_loan_status) = str_0)) and (not ((c_loan.f_loan_status) = str_1)) and ((c_loan.f_loan_status) = str_3))) } for 3 but 4 Int, 11 Str, 1..8 steps
run c24 { eventually ((some p_days: s_num2 | Step.event = k_loan_DayPasses and Step.x_loan_DayPasses_days = p_days and (((((c_loan.f_loan_status) = str_2) or ((c_loan.f_loan_status) = str_3)) and (p_days in s_num2_1.*next_num2)) and (s_num2_3 in p_days.*next_num2)) and (some Bool) and (some Bool)) and after eventually (Step.event = k_loan_Return and (not ((c_loan.f_loan_status) = str_0)) and (not ((c_loan.f_loan_status) = str_1)) and (Env.env_loan_world_ReservedBySomeoneElse = True))) } for 3 but 4 Int, 11 Str, 1..8 steps
