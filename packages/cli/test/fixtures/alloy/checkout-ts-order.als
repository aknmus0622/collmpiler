module spec

abstract sig Bool {}
one sig True, False extends Bool {}
sig Str {}
sig Json {}
one sig str_0, str_1, str_2, str_3, str_4, str_5, str_6, str_7, str_8, str_9, str_10, str_11, str_12, str_13 extends Str {}
abstract sig s_num0 {}
one sig s_num0_0, s_num0_1, s_num0_2, s_num0_3, s_num0_4, s_num0_5, s_num0_6, s_num0_7, s_num0_8 extends s_num0 {}
fun next_num0: s_num0 -> s_num0 { s_num0_0 -> s_num0_1 + s_num0_1 -> s_num0_2 + s_num0_2 -> s_num0_3 + s_num0_3 -> s_num0_4 + s_num0_4 -> s_num0_5 + s_num0_5 -> s_num0_6 + s_num0_6 -> s_num0_7 + s_num0_7 -> s_num0_8 }
one sig c_order { var f_order_status: one Str, var f_order_rank: lone Str, var f_order_price: one s_num0 }
one sig Env { var env_calendar_IsMonthEnd: one Bool, var env_payment_Active: one Bool, var env_payment_Result: one Str }
abstract sig Entry {}
one sig k_order_Cancel, k_order_Checkout, k_order_PlaceOrder, k_order_Ship extends Entry {}
one sig Step { var event: lone Entry, var x_order_PlaceOrder_customerRank: lone Str, var x_order_PlaceOrder_listPrice: lone s_num0 }
pred same_order { c_order.f_order_status' = c_order.f_order_status and c_order.f_order_rank' = c_order.f_order_rank and c_order.f_order_price' = c_order.f_order_price }
pred ev_order_PlaceOrder_otherwise[p_customerRank: Str, p_listPrice: s_num0] {
  (some Bool)
  c_order.f_order_status' = str_5
  c_order.f_order_rank' = p_customerRank
  c_order.f_order_price' = p_listPrice
}
pred cmd_order_PlaceOrder[p_customerRank: Str, p_listPrice: s_num0] {
  p_customerRank in (str_3 + str_8 + str_0) and ((((c_order.f_order_status) = str_2) and (p_listPrice in s_num0_2.*next_num0)) and (s_num0_6 in p_listPrice.*next_num0)) and (ev_order_PlaceOrder_otherwise[p_customerRank, p_listPrice])
}
pred ev_order_Checkout_paid[] {
  (Env.env_payment_Result = str_13)
  c_order.f_order_status' = str_4
  c_order.f_order_rank' = c_order.f_order_rank
  c_order.f_order_price' = c_order.f_order_price
}
pred ev_order_Checkout_otherwise[] {
  (not (Env.env_payment_Result = str_13))
  c_order.f_order_status' = c_order.f_order_status
  c_order.f_order_rank' = c_order.f_order_rank
  c_order.f_order_price' = c_order.f_order_price
}
pred cmd_order_Checkout[] {
  (((c_order.f_order_status) = str_5) and (Env.env_payment_Active = True)) and (ev_order_Checkout_paid[] or ev_order_Checkout_otherwise[])
}
pred ev_order_Ship_otherwise[] {
  (some Bool)
  c_order.f_order_status' = str_7
  c_order.f_order_rank' = c_order.f_order_rank
  c_order.f_order_price' = c_order.f_order_price
}
pred cmd_order_Ship[] {
  ((c_order.f_order_status) = str_4) and (ev_order_Ship_otherwise[])
}
pred ev_order_Cancel_case1[] {
  ((c_order.f_order_status) = str_4)
  c_order.f_order_status' = str_1
  c_order.f_order_rank' = c_order.f_order_rank
  c_order.f_order_price' = c_order.f_order_price
}
pred ev_order_Cancel_case2[] {
  ((not ((c_order.f_order_status) = str_4)) and ((c_order.f_order_status) = str_5))
  c_order.f_order_status' = str_1
  c_order.f_order_rank' = c_order.f_order_rank
  c_order.f_order_price' = c_order.f_order_price
}
pred ev_order_Cancel_otherwise[] {
  ((not ((c_order.f_order_status) = str_4)) and (not ((c_order.f_order_status) = str_5)))
  c_order.f_order_status' = c_order.f_order_status
  c_order.f_order_rank' = c_order.f_order_rank
  c_order.f_order_price' = c_order.f_order_price
}
pred cmd_order_Cancel[] {
  (ev_order_Cancel_case1[] or ev_order_Cancel_case2[] or ev_order_Cancel_otherwise[])
}
fact initial_values { c_order.f_order_status = str_2 and c_order.f_order_rank = none and c_order.f_order_price = s_num0_2 }
fact transitions { always ((same_order and no Step.event and no Step.x_order_PlaceOrder_customerRank and no Step.x_order_PlaceOrder_listPrice)
  or (cmd_order_Cancel[] and Step.event = k_order_Cancel and no Step.x_order_PlaceOrder_customerRank and no Step.x_order_PlaceOrder_listPrice)
  or (cmd_order_Checkout[] and Step.event = k_order_Checkout and no Step.x_order_PlaceOrder_customerRank and no Step.x_order_PlaceOrder_listPrice)
  or (some p_customerRank: Str, p_listPrice: s_num0 | cmd_order_PlaceOrder[p_customerRank, p_listPrice] and Step.event = k_order_PlaceOrder and Step.x_order_PlaceOrder_customerRank = p_customerRank and Step.x_order_PlaceOrder_listPrice = p_listPrice)
  or (cmd_order_Ship[] and Step.event = k_order_Ship and no Step.x_order_PlaceOrder_customerRank and no Step.x_order_PlaceOrder_listPrice)) }
fact { always (Env.env_payment_Result in (str_13 + str_11)) }
check c0 { (always (((c_order.f_order_status) = str_2) or (not ((c_order.f_order_rank) = none)))) } for 3 but 4 Int, 17 Str, 6 steps
run c1 { eventually (some p_customerRank: Str, p_listPrice: s_num0 | Step.event = k_order_PlaceOrder and Step.x_order_PlaceOrder_customerRank = p_customerRank and Step.x_order_PlaceOrder_listPrice = p_listPrice and p_customerRank in (str_3 + str_8 + str_0) and ((((c_order.f_order_status) = str_2) and (p_listPrice in s_num0_2.*next_num0)) and (s_num0_6 in p_listPrice.*next_num0)) and (some Bool)) } for 3 but 4 Int, 17 Str, 1..8 steps
run c2 { eventually (Step.event = k_order_Checkout and (((c_order.f_order_status) = str_5) and (Env.env_payment_Active = True)) and (Env.env_payment_Result = str_13)) } for 3 but 4 Int, 17 Str, 1..8 steps
run c3 { eventually (Step.event = k_order_Checkout and (((c_order.f_order_status) = str_5) and (Env.env_payment_Active = True)) and (Env.env_payment_Result = str_13) and (((c_order.f_order_rank) = str_3) and (Env.env_calendar_IsMonthEnd = True))) } for 3 but 4 Int, 17 Str, 1..8 steps
run c4 { eventually (Step.event = k_order_Checkout and (((c_order.f_order_status) = str_5) and (Env.env_payment_Active = True)) and (Env.env_payment_Result = str_13) and not (((c_order.f_order_rank) = str_3) and (Env.env_calendar_IsMonthEnd = True)) and ((c_order.f_order_rank) = str_8)) } for 3 but 4 Int, 17 Str, 1..8 steps
run c5 { eventually (Step.event = k_order_Checkout and (((c_order.f_order_status) = str_5) and (Env.env_payment_Active = True)) and (Env.env_payment_Result = str_13) and not (((c_order.f_order_rank) = str_3) and (Env.env_calendar_IsMonthEnd = True)) and not ((c_order.f_order_rank) = str_8) and (some Bool)) } for 3 but 4 Int, 17 Str, 1..8 steps
run c6 { eventually (Step.event = k_order_Checkout and (((c_order.f_order_status) = str_5) and (Env.env_payment_Active = True)) and (Env.env_payment_Result = str_13) and ((((((c_order.f_order_rank) = str_3) and (Env.env_calendar_IsMonthEnd = True)) => True else (((c_order.f_order_rank) = str_8) => False else False)) = True) and (not (((((c_order.f_order_rank) = str_3) and (Env.env_calendar_IsMonthEnd = True)) => str_6 else (((c_order.f_order_rank) = str_8) => none else none)) = none)))) } for 3 but 4 Int, 17 Str, 1..8 steps
run c7 { eventually (Step.event = k_order_Checkout and (((c_order.f_order_status) = str_5) and (Env.env_payment_Active = True)) and (not (Env.env_payment_Result = str_13))) } for 3 but 4 Int, 17 Str, 1..8 steps
run c8 { eventually (Step.event = k_order_Ship and ((c_order.f_order_status) = str_4) and (some Bool)) } for 3 but 4 Int, 17 Str, 1..8 steps
run c9 { eventually (Step.event = k_order_Ship and ((c_order.f_order_status) = str_4) and (some Bool) and (((c_order.f_order_rank) = str_3) or ((c_order.f_order_price) in s_num0_4.*next_num0))) } for 3 but 4 Int, 17 Str, 1..8 steps
run c10 { eventually (Step.event = k_order_Ship and ((c_order.f_order_status) = str_4) and (some Bool) and not (((c_order.f_order_rank) = str_3) or ((c_order.f_order_price) in s_num0_4.*next_num0)) and (some Bool)) } for 3 but 4 Int, 17 Str, 1..8 steps
run c11 { eventually (Step.event = k_order_Cancel and ((c_order.f_order_status) = str_4)) } for 3 but 4 Int, 17 Str, 1..8 steps
run c12 { eventually (Step.event = k_order_Cancel and ((not ((c_order.f_order_status) = str_4)) and ((c_order.f_order_status) = str_5))) } for 3 but 4 Int, 17 Str, 1..8 steps
run c13 { eventually (Step.event = k_order_Cancel and ((not ((c_order.f_order_status) = str_4)) and (not ((c_order.f_order_status) = str_5)))) } for 3 but 4 Int, 17 Str, 1..8 steps
run sane { some Bool } for 3 but 4 Int, 17 Str, 1..8 steps
