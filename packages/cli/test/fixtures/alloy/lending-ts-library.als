module spec

abstract sig Bool {}
one sig True, False extends Bool {}
sig Str {}
sig Json {}
one sig str_0, str_1, str_2, str_3, str_4, str_5, str_6, str_7 extends Str {}
sig s_BookId {}
sig s_MemberId {}
one sig c_library { var f_library_lentTo: s_BookId -> lone s_MemberId, var f_library_dueOf: s_BookId -> lone Int }
one sig c_fines { var f_fines_owed: s_MemberId -> lone Int }
one sig c_members { var f_members_members: set s_MemberId, var f_members_extended: set s_MemberId }
one sig Env { var env_clock_Today: one Int }
abstract sig Entry {}
one sig k_library_Borrow, k_library_Return, k_fines_Pay, k_members_Extend, k_members_Register extends Entry {}
one sig Step { var event: lone Entry, var x_library_Borrow_member: lone s_MemberId, var x_library_Borrow_book: lone s_BookId, var x_library_Return_book: lone s_BookId, var x_fines_Pay_member: lone s_MemberId, var x_members_Extend_member: lone s_MemberId, var x_members_Register_member: lone s_MemberId }
pred same_library { c_library.f_library_lentTo' = c_library.f_library_lentTo and c_library.f_library_dueOf' = c_library.f_library_dueOf }
pred same_fines { c_fines.f_fines_owed' = c_fines.f_fines_owed }
pred same_members { c_members.f_members_members' = c_members.f_members_members and c_members.f_members_extended' = c_members.f_members_extended }
pred ev_library_Borrow_notMember[p_member: s_MemberId, p_book: s_BookId] {
  (let l_member = p_member | (not ((let l_member = l_member | ((l_member in (c_members.f_members_members)) => True else False)) = True)))
  c_library.f_library_lentTo' = c_library.f_library_lentTo
  c_library.f_library_dueOf' = c_library.f_library_dueOf
}
pred ev_library_Borrow_unpaid[p_member: s_MemberId, p_book: s_BookId] {
  ((not (let l_member = p_member | (not ((let l_member = l_member | ((l_member in (c_members.f_members_members)) => True else False)) = True)))) and (let l_member = p_member | ((let l_member = l_member | ((l_member in ((c_fines.f_fines_owed).univ)) => (l_member.(c_fines.f_fines_owed)) else 0)) > 0)))
  c_library.f_library_lentTo' = c_library.f_library_lentTo
  c_library.f_library_dueOf' = c_library.f_library_dueOf
}
pred ev_library_Borrow_onLoan[p_member: s_MemberId, p_book: s_BookId] {
  ((not (let l_member = p_member | (not ((let l_member = l_member | ((l_member in (c_members.f_members_members)) => True else False)) = True)))) and (not (let l_member = p_member | ((let l_member = l_member | ((l_member in ((c_fines.f_fines_owed).univ)) => (l_member.(c_fines.f_fines_owed)) else 0)) > 0))) and (let l_book = p_book | (l_book in ((c_library.f_library_lentTo).univ))))
  c_library.f_library_lentTo' = c_library.f_library_lentTo
  c_library.f_library_dueOf' = c_library.f_library_dueOf
}
pred ev_library_Borrow_atLimit[p_member: s_MemberId, p_book: s_BookId] {
  ((not (let l_member = p_member | (not ((let l_member = l_member | ((l_member in (c_members.f_members_members)) => True else False)) = True)))) and (not (let l_member = p_member | ((let l_member = l_member | ((l_member in ((c_fines.f_fines_owed).univ)) => (l_member.(c_fines.f_fines_owed)) else 0)) > 0))) and (not (let l_book = p_book | (l_book in ((c_library.f_library_lentTo).univ)))) and (let l_member = p_member | (#{ b__: (c_library.f_library_lentTo).univ | ((b__.(c_library.f_library_lentTo)) = l_member) } >= (let l_member = l_member | (((let l_member = l_member | ((l_member in (c_members.f_members_extended)) => True else False)) = True) => 3 else 2)))))
  c_library.f_library_lentTo' = c_library.f_library_lentTo
  c_library.f_library_dueOf' = c_library.f_library_dueOf
}
pred ev_library_Borrow_otherwise[p_member: s_MemberId, p_book: s_BookId] {
  ((not (let l_member = p_member | (not ((let l_member = l_member | ((l_member in (c_members.f_members_members)) => True else False)) = True)))) and (not (let l_member = p_member | ((let l_member = l_member | ((l_member in ((c_fines.f_fines_owed).univ)) => (l_member.(c_fines.f_fines_owed)) else 0)) > 0))) and (not (let l_book = p_book | (l_book in ((c_library.f_library_lentTo).univ)))) and (not (let l_member = p_member | (#{ b__: (c_library.f_library_lentTo).univ | ((b__.(c_library.f_library_lentTo)) = l_member) } >= (let l_member = l_member | (((let l_member = l_member | ((l_member in (c_members.f_members_extended)) => True else False)) = True) => 3 else 2))))))
  c_library.f_library_lentTo' = ((c_library.f_library_lentTo) ++ p_book -> p_member)
  c_library.f_library_dueOf' = ((c_library.f_library_dueOf) ++ p_book -> plus[Env.env_clock_Today, (let l_member = p_member | (((let l_member = l_member | ((l_member in (c_members.f_members_extended)) => True else False)) = True) => 28 else 14))])
}
pred cmd_library_Borrow[p_member: s_MemberId, p_book: s_BookId] {
  (ev_library_Borrow_notMember[p_member, p_book] or ev_library_Borrow_unpaid[p_member, p_book] or ev_library_Borrow_onLoan[p_member, p_book] or ev_library_Borrow_atLimit[p_member, p_book] or ev_library_Borrow_otherwise[p_member, p_book])
}
pred ev_library_Return_otherwise[p_book: s_BookId] {
  (not (p_book in ((c_library.f_library_lentTo).univ)))
  c_library.f_library_lentTo' = c_library.f_library_lentTo
  c_library.f_library_dueOf' = c_library.f_library_dueOf
  same_fines
}
pred ev_library_Return_case1[p_book: s_BookId] {
  (p_book in ((c_library.f_library_lentTo).univ))
  c_library.f_library_lentTo' = ((c_library.f_library_lentTo) - p_book -> univ)
  c_library.f_library_dueOf' = ((c_library.f_library_dueOf) - p_book -> univ)
  ((Env.env_clock_Today > (p_book.(c_library.f_library_dueOf))) implies cmd_fines_Charge[(p_book.(c_library.f_library_lentTo)), minus[Env.env_clock_Today, (p_book.(c_library.f_library_dueOf))]] else (same_fines))
}
pred cmd_library_Return[p_book: s_BookId] {
  (ev_library_Return_otherwise[p_book] or ev_library_Return_case1[p_book])
}
pred ev_fines_Charge_otherwise[p_member: s_MemberId, p_days: Int] {
  (some Bool)
  c_fines.f_fines_owed' = ((c_fines.f_fines_owed) ++ p_member -> plus[((p_member in ((c_fines.f_fines_owed).univ)) => (p_member.(c_fines.f_fines_owed)) else 0), mul[p_days, 10]])
}
pred cmd_fines_Charge[p_member: s_MemberId, p_days: Int] {
  (p_days > 0) and (ev_fines_Charge_otherwise[p_member, p_days])
}
pred ev_fines_Pay_otherwise[p_member: s_MemberId] {
  (some Bool)
  c_fines.f_fines_owed' = ((c_fines.f_fines_owed) - p_member -> univ)
}
pred cmd_fines_Pay[p_member: s_MemberId] {
  (ev_fines_Pay_otherwise[p_member])
}
pred ev_members_Register_otherwise[p_member: s_MemberId] {
  (some Bool)
  c_members.f_members_members' = ((c_members.f_members_members) + p_member)
  c_members.f_members_extended' = c_members.f_members_extended
}
pred cmd_members_Register[p_member: s_MemberId] {
  (ev_members_Register_otherwise[p_member])
}
pred ev_members_Extend_otherwise[p_member: s_MemberId] {
  (not (p_member in (c_members.f_members_members)))
  c_members.f_members_members' = c_members.f_members_members
  c_members.f_members_extended' = c_members.f_members_extended
}
pred ev_members_Extend_case1[p_member: s_MemberId] {
  (p_member in (c_members.f_members_members))
  c_members.f_members_members' = c_members.f_members_members
  c_members.f_members_extended' = ((c_members.f_members_extended) + p_member)
}
pred cmd_members_Extend[p_member: s_MemberId] {
  (ev_members_Extend_otherwise[p_member] or ev_members_Extend_case1[p_member])
}
fact initial_values { no c_library.f_library_lentTo and no c_library.f_library_dueOf and no c_fines.f_fines_owed and no c_members.f_members_members and no c_members.f_members_extended }
fact transitions { always ((same_library and same_fines and same_members and no Step.event and no Step.x_library_Borrow_member and no Step.x_library_Borrow_book and no Step.x_library_Return_book and no Step.x_fines_Pay_member and no Step.x_members_Extend_member and no Step.x_members_Register_member)
  or (some p_member: s_MemberId, p_book: s_BookId | cmd_library_Borrow[p_member, p_book] and Step.event = k_library_Borrow and Step.x_library_Borrow_member = p_member and Step.x_library_Borrow_book = p_book and same_fines and same_members and no Step.x_library_Return_book and no Step.x_fines_Pay_member and no Step.x_members_Extend_member and no Step.x_members_Register_member)
  or (some p_book: s_BookId | cmd_library_Return[p_book] and Step.event = k_library_Return and Step.x_library_Return_book = p_book and same_members and no Step.x_library_Borrow_member and no Step.x_library_Borrow_book and no Step.x_fines_Pay_member and no Step.x_members_Extend_member and no Step.x_members_Register_member)
  or (some p_member: s_MemberId | cmd_fines_Pay[p_member] and Step.event = k_fines_Pay and Step.x_fines_Pay_member = p_member and same_library and same_members and no Step.x_library_Borrow_member and no Step.x_library_Borrow_book and no Step.x_library_Return_book and no Step.x_members_Extend_member and no Step.x_members_Register_member)
  or (some p_member: s_MemberId | cmd_members_Extend[p_member] and Step.event = k_members_Extend and Step.x_members_Extend_member = p_member and same_library and same_fines and no Step.x_library_Borrow_member and no Step.x_library_Borrow_book and no Step.x_library_Return_book and no Step.x_fines_Pay_member and no Step.x_members_Register_member)
  or (some p_member: s_MemberId | cmd_members_Register[p_member] and Step.event = k_members_Register and Step.x_members_Register_member = p_member and same_library and same_fines and no Step.x_library_Borrow_member and no Step.x_library_Borrow_book and no Step.x_library_Return_book and no Step.x_fines_Pay_member and no Step.x_members_Extend_member)) }
fact { always (Env.env_clock_Today' >= Env.env_clock_Today) }
check c0 { (always (all b_book: ((c_library.f_library_lentTo).univ) | (b_book in ((c_library.f_library_dueOf).univ)))) } for 3 but 6 Int, 11 Str, 6 steps
check c1 { (always (all b_book: s_BookId | (Step.event = k_library_Return and Step.x_library_Return_book = b_book) implies (after (not (b_book in ((c_library.f_library_lentTo).univ)))))) } for 3 but 6 Int, 11 Str, 6 steps
run c2 { eventually (some p_member: s_MemberId, p_book: s_BookId | Step.event = k_library_Borrow and Step.x_library_Borrow_member = p_member and Step.x_library_Borrow_book = p_book and (let l_member = p_member | (not ((let l_member = l_member | ((l_member in (c_members.f_members_members)) => True else False)) = True)))) } for 3 but 6 Int, 11 Str, 1..8 steps
run c3 { eventually (some p_member: s_MemberId, p_book: s_BookId | Step.event = k_library_Borrow and Step.x_library_Borrow_member = p_member and Step.x_library_Borrow_book = p_book and ((not (let l_member = p_member | (not ((let l_member = l_member | ((l_member in (c_members.f_members_members)) => True else False)) = True)))) and (let l_member = p_member | ((let l_member = l_member | ((l_member in ((c_fines.f_fines_owed).univ)) => (l_member.(c_fines.f_fines_owed)) else 0)) > 0)))) } for 3 but 6 Int, 11 Str, 1..8 steps
run c4 { eventually (some p_member: s_MemberId, p_book: s_BookId | Step.event = k_library_Borrow and Step.x_library_Borrow_member = p_member and Step.x_library_Borrow_book = p_book and ((not (let l_member = p_member | (not ((let l_member = l_member | ((l_member in (c_members.f_members_members)) => True else False)) = True)))) and (not (let l_member = p_member | ((let l_member = l_member | ((l_member in ((c_fines.f_fines_owed).univ)) => (l_member.(c_fines.f_fines_owed)) else 0)) > 0))) and (let l_book = p_book | (l_book in ((c_library.f_library_lentTo).univ))))) } for 3 but 6 Int, 11 Str, 1..8 steps
run c5 { eventually (some p_member: s_MemberId, p_book: s_BookId | Step.event = k_library_Borrow and Step.x_library_Borrow_member = p_member and Step.x_library_Borrow_book = p_book and ((not (let l_member = p_member | (not ((let l_member = l_member | ((l_member in (c_members.f_members_members)) => True else False)) = True)))) and (not (let l_member = p_member | ((let l_member = l_member | ((l_member in ((c_fines.f_fines_owed).univ)) => (l_member.(c_fines.f_fines_owed)) else 0)) > 0))) and (not (let l_book = p_book | (l_book in ((c_library.f_library_lentTo).univ)))) and (let l_member = p_member | (#{ b__: (c_library.f_library_lentTo).univ | ((b__.(c_library.f_library_lentTo)) = l_member) } >= (let l_member = l_member | (((let l_member = l_member | ((l_member in (c_members.f_members_extended)) => True else False)) = True) => 3 else 2)))))) } for 3 but 6 Int, 11 Str, 1..8 steps
run c6 { eventually (some p_member: s_MemberId, p_book: s_BookId | Step.event = k_library_Borrow and Step.x_library_Borrow_member = p_member and Step.x_library_Borrow_book = p_book and ((not (let l_member = p_member | (not ((let l_member = l_member | ((l_member in (c_members.f_members_members)) => True else False)) = True)))) and (not (let l_member = p_member | ((let l_member = l_member | ((l_member in ((c_fines.f_fines_owed).univ)) => (l_member.(c_fines.f_fines_owed)) else 0)) > 0))) and (not (let l_book = p_book | (l_book in ((c_library.f_library_lentTo).univ)))) and (let l_member = p_member | (#{ b__: (c_library.f_library_lentTo).univ | ((b__.(c_library.f_library_lentTo)) = l_member) } >= (let l_member = l_member | (((let l_member = l_member | ((l_member in (c_members.f_members_extended)) => True else False)) = True) => 3 else 2))))) and (let l_member = p_member | ((let l_member = l_member | ((l_member in (c_members.f_members_extended)) => True else False)) = True))) } for 3 but 6 Int, 11 Str, 1..8 steps
run c7 { eventually (some p_member: s_MemberId, p_book: s_BookId | Step.event = k_library_Borrow and Step.x_library_Borrow_member = p_member and Step.x_library_Borrow_book = p_book and ((not (let l_member = p_member | (not ((let l_member = l_member | ((l_member in (c_members.f_members_members)) => True else False)) = True)))) and (not (let l_member = p_member | ((let l_member = l_member | ((l_member in ((c_fines.f_fines_owed).univ)) => (l_member.(c_fines.f_fines_owed)) else 0)) > 0))) and (not (let l_book = p_book | (l_book in ((c_library.f_library_lentTo).univ)))) and (let l_member = p_member | (#{ b__: (c_library.f_library_lentTo).univ | ((b__.(c_library.f_library_lentTo)) = l_member) } >= (let l_member = l_member | (((let l_member = l_member | ((l_member in (c_members.f_members_extended)) => True else False)) = True) => 3 else 2))))) and not (let l_member = p_member | ((let l_member = l_member | ((l_member in (c_members.f_members_extended)) => True else False)) = True)) and (some Bool)) } for 3 but 6 Int, 11 Str, 1..8 steps
run c8 { eventually (some p_member: s_MemberId, p_book: s_BookId | Step.event = k_library_Borrow and Step.x_library_Borrow_member = p_member and Step.x_library_Borrow_book = p_book and ((not (let l_member = p_member | (not ((let l_member = l_member | ((l_member in (c_members.f_members_members)) => True else False)) = True)))) and (not (let l_member = p_member | ((let l_member = l_member | ((l_member in ((c_fines.f_fines_owed).univ)) => (l_member.(c_fines.f_fines_owed)) else 0)) > 0))) and (not (let l_book = p_book | (l_book in ((c_library.f_library_lentTo).univ)))) and (not (let l_member = p_member | (#{ b__: (c_library.f_library_lentTo).univ | ((b__.(c_library.f_library_lentTo)) = l_member) } >= (let l_member = l_member | (((let l_member = l_member | ((l_member in (c_members.f_members_extended)) => True else False)) = True) => 3 else 2))))))) } for 3 but 6 Int, 11 Str, 1..8 steps
run c9 { eventually (some p_member: s_MemberId, p_book: s_BookId | Step.event = k_library_Borrow and Step.x_library_Borrow_member = p_member and Step.x_library_Borrow_book = p_book and ((not (let l_member = p_member | (not ((let l_member = l_member | ((l_member in (c_members.f_members_members)) => True else False)) = True)))) and (not (let l_member = p_member | ((let l_member = l_member | ((l_member in ((c_fines.f_fines_owed).univ)) => (l_member.(c_fines.f_fines_owed)) else 0)) > 0))) and (not (let l_book = p_book | (l_book in ((c_library.f_library_lentTo).univ)))) and (not (let l_member = p_member | (#{ b__: (c_library.f_library_lentTo).univ | ((b__.(c_library.f_library_lentTo)) = l_member) } >= (let l_member = l_member | (((let l_member = l_member | ((l_member in (c_members.f_members_extended)) => True else False)) = True) => 3 else 2)))))) and (let l_member = p_member | ((let l_member = l_member | ((l_member in (c_members.f_members_extended)) => True else False)) = True))) } for 3 but 6 Int, 11 Str, 1..8 steps
run c10 { eventually (some p_member: s_MemberId, p_book: s_BookId | Step.event = k_library_Borrow and Step.x_library_Borrow_member = p_member and Step.x_library_Borrow_book = p_book and ((not (let l_member = p_member | (not ((let l_member = l_member | ((l_member in (c_members.f_members_members)) => True else False)) = True)))) and (not (let l_member = p_member | ((let l_member = l_member | ((l_member in ((c_fines.f_fines_owed).univ)) => (l_member.(c_fines.f_fines_owed)) else 0)) > 0))) and (not (let l_book = p_book | (l_book in ((c_library.f_library_lentTo).univ)))) and (not (let l_member = p_member | (#{ b__: (c_library.f_library_lentTo).univ | ((b__.(c_library.f_library_lentTo)) = l_member) } >= (let l_member = l_member | (((let l_member = l_member | ((l_member in (c_members.f_members_extended)) => True else False)) = True) => 3 else 2)))))) and not (let l_member = p_member | ((let l_member = l_member | ((l_member in (c_members.f_members_extended)) => True else False)) = True)) and (some Bool)) } for 3 but 6 Int, 11 Str, 1..8 steps
run c11 { eventually (some p_book: s_BookId | Step.event = k_library_Return and Step.x_library_Return_book = p_book and (not (p_book in ((c_library.f_library_lentTo).univ)))) } for 3 but 6 Int, 11 Str, 1..8 steps
check c12 { always (all p_book: s_BookId | ((p_book in ((c_library.f_library_lentTo).univ)) and (Env.env_clock_Today > (p_book.(c_library.f_library_dueOf)))) implies (let l_member = (p_book.(c_library.f_library_lentTo)), l_days = minus[Env.env_clock_Today, (p_book.(c_library.f_library_dueOf))] | (l_days > 0))) } for 3 but 6 Int, 11 Str, 6 steps
run c13 { eventually (some p_book: s_BookId | Step.event = k_library_Return and Step.x_library_Return_book = p_book and (p_book in ((c_library.f_library_lentTo).univ))) } for 3 but 6 Int, 11 Str, 1..8 steps
run c14 { eventually (some p_book: s_BookId | Step.event = k_library_Return and Step.x_library_Return_book = p_book and (p_book in ((c_library.f_library_lentTo).univ)) and (Env.env_clock_Today > (p_book.(c_library.f_library_dueOf)))) } for 3 but 6 Int, 11 Str, 1..8 steps
check c15 { always (all p_member: s_MemberId | (p_member in ((c_fines.f_fines_owed).univ)) implies (p_member in (c_fines.f_fines_owed).univ)) } for 3 but 6 Int, 11 Str, 6 steps
run c16 { eventually (some p_member: s_MemberId | (p_member in ((c_fines.f_fines_owed).univ))) } for 3 but 6 Int, 11 Str, 1..8 steps
run c17 { eventually (some p_member: s_MemberId | (not (p_member in ((c_fines.f_fines_owed).univ)))) } for 3 but 6 Int, 11 Str, 1..8 steps
check c18 { always (all p_member: s_MemberId, p_days: Int | (p_days > 0) and (some Bool) and (p_member in ((c_fines.f_fines_owed).univ)) implies (p_member in (c_fines.f_fines_owed).univ)) } for 3 but 6 Int, 11 Str, 6 steps
run c19 { eventually (some p_member: s_MemberId | Step.event = k_fines_Pay and Step.x_fines_Pay_member = p_member and (some Bool)) } for 3 but 6 Int, 11 Str, 1..8 steps
run c20 { eventually (some p_member: s_MemberId | Step.event = k_members_Register and Step.x_members_Register_member = p_member and (some Bool)) } for 3 but 6 Int, 11 Str, 1..8 steps
run c21 { eventually (some p_member: s_MemberId | Step.event = k_members_Extend and Step.x_members_Extend_member = p_member and (not (p_member in (c_members.f_members_members)))) } for 3 but 6 Int, 11 Str, 1..8 steps
run c22 { eventually (some p_member: s_MemberId | Step.event = k_members_Extend and Step.x_members_Extend_member = p_member and (p_member in (c_members.f_members_members))) } for 3 but 6 Int, 11 Str, 1..8 steps
run sane { some Bool } for 3 but 6 Int, 11 Str, 1..8 steps
run c23 { eventually ((some p_member: s_MemberId, p_book: s_BookId | Step.event = k_library_Borrow and Step.x_library_Borrow_member = p_member and Step.x_library_Borrow_book = p_book and ((not (let l_member = p_member | (not ((let l_member = l_member | ((l_member in (c_members.f_members_members)) => True else False)) = True)))) and (not (let l_member = p_member | ((let l_member = l_member | ((l_member in ((c_fines.f_fines_owed).univ)) => (l_member.(c_fines.f_fines_owed)) else 0)) > 0))) and (not (let l_book = p_book | (l_book in ((c_library.f_library_lentTo).univ)))) and (not (let l_member = p_member | (#{ b__: (c_library.f_library_lentTo).univ | ((b__.(c_library.f_library_lentTo)) = l_member) } >= (let l_member = l_member | (((let l_member = l_member | ((l_member in (c_members.f_members_extended)) => True else False)) = True) => 3 else 2)))))) and (let l_member = p_member | ((let l_member = l_member | ((l_member in (c_members.f_members_extended)) => True else False)) = True))) and after eventually (some p_book: s_BookId | Step.event = k_library_Return and Step.x_library_Return_book = p_book and (p_book in ((c_library.f_library_lentTo).univ)) and (Env.env_clock_Today > (p_book.(c_library.f_library_dueOf))))) } for 3 but 6 Int, 11 Str, 1..8 steps
run c24 { eventually ((some p_member: s_MemberId, p_book: s_BookId | Step.event = k_library_Borrow and Step.x_library_Borrow_member = p_member and Step.x_library_Borrow_book = p_book and ((not (let l_member = p_member | (not ((let l_member = l_member | ((l_member in (c_members.f_members_members)) => True else False)) = True)))) and (not (let l_member = p_member | ((let l_member = l_member | ((l_member in ((c_fines.f_fines_owed).univ)) => (l_member.(c_fines.f_fines_owed)) else 0)) > 0))) and (not (let l_book = p_book | (l_book in ((c_library.f_library_lentTo).univ)))) and (not (let l_member = p_member | (#{ b__: (c_library.f_library_lentTo).univ | ((b__.(c_library.f_library_lentTo)) = l_member) } >= (let l_member = l_member | (((let l_member = l_member | ((l_member in (c_members.f_members_extended)) => True else False)) = True) => 3 else 2)))))) and not (let l_member = p_member | ((let l_member = l_member | ((l_member in (c_members.f_members_extended)) => True else False)) = True)) and (some Bool)) and after eventually (some p_book: s_BookId | Step.event = k_library_Return and Step.x_library_Return_book = p_book and (p_book in ((c_library.f_library_lentTo).univ)) and (Env.env_clock_Today > (p_book.(c_library.f_library_dueOf))))) } for 3 but 6 Int, 11 Str, 1..8 steps
