/** Source of the current date. */
export interface Clock {
  today(): Date;
}

/** True when `date` is the last calendar day of its month (UTC). */
export function isLastDayOfMonth(date: Date): boolean {
  const nextDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1));
  return nextDay.getUTCMonth() !== date.getUTCMonth();
}
