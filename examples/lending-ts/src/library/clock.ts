/**
 * The outside world's calendar (specification component `clock`, external).
 *
 * The library is given one when it is created and asks it for today's date
 * whenever a command needs it. The library never tells the clock anything.
 */
export interface Clock {
  /**
   * Query `clock.Today()`: today's date, as a whole number of days since
   * 1970-01-01. Successive answers never go backwards; the library relies on
   * that and does not check it. Asking never fails.
   */
  today(): number;
}
