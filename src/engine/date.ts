import type { ISODate, WorkCalendarV094 } from "../domain/types";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function assertISODate(date: string): void {
  if (!ISO_DATE_RE.test(date)) {
    throw new Error(`Invalid ISO schedule date: ${date}`);
  }
  const parsed = new Date(`${date}T00:00:00Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== date
  ) {
    throw new Error(`Invalid calendar date: ${date}`);
  }
}

function toUTCDate(date: ISODate): Date {
  assertISODate(date);
  return new Date(`${date}T00:00:00Z`);
}

function fromUTCDate(date: Date): ISODate {
  return date.toISOString().slice(0, 10);
}

export function isWorkingDay(
  date: ISODate,
  calendar: WorkCalendarV094,
): boolean {
  const d = toUTCDate(date);
  return (
    calendar.workingWeekdays.includes(d.getUTCDay()) &&
    !calendar.holidays.includes(date)
  );
}

export function nextWorkingDay(
  date: ISODate,
  calendar: WorkCalendarV094,
): ISODate {
  let d = toUTCDate(date);
  for (let i = 0; i < 370; i += 1) {
    const candidate = fromUTCDate(d);
    if (isWorkingDay(candidate, calendar)) return candidate;
    d = new Date(d.getTime() + 86_400_000);
  }
  throw new Error("Unable to find next working day within one year");
}

export function addWorkdays(
  date: ISODate,
  workdays: number,
  calendar: WorkCalendarV094,
): ISODate {
  if (!Number.isInteger(workdays))
    throw new Error("workdays must be an integer");
  if (workdays === 0) return nextWorkingDay(date, calendar);
  const direction = workdays > 0 ? 1 : -1;
  let remaining = Math.abs(workdays);
  let d = toUTCDate(date);
  while (remaining > 0) {
    d = new Date(d.getTime() + direction * 86_400_000);
    const candidate = fromUTCDate(d);
    if (isWorkingDay(candidate, calendar)) remaining -= 1;
  }
  return fromUTCDate(d);
}

export function minDate(a: ISODate, b: ISODate): ISODate {
  return a <= b ? a : b;
}

export function maxDate(a: ISODate, b: ISODate): ISODate {
  return a >= b ? a : b;
}

export function workdaysBetween(
  start: ISODate,
  end: ISODate,
  calendar: WorkCalendarV094,
): number {
  if (start === end) return 0;
  const direction = start < end ? 1 : -1;
  let d = toUTCDate(start);
  let count = 0;
  while (fromUTCDate(d) !== end) {
    d = new Date(d.getTime() + direction * 86_400_000);
    const candidate = fromUTCDate(d);
    if (isWorkingDay(candidate, calendar)) count += direction;
    if (Math.abs(count) > 10000)
      throw new Error("workdaysBetween exceeded safety bound");
  }
  return count;
}

export function durationFinish(
  start: ISODate,
  durationWorkdays: number,
  calendar: WorkCalendarV094,
): ISODate {
  if (!Number.isInteger(durationWorkdays) || durationWorkdays < 1) {
    throw new Error(
      `Duration must be an integer >= 1, got ${String(durationWorkdays)}`,
    );
  }
  const normalized = nextWorkingDay(start, calendar);
  return addWorkdays(normalized, durationWorkdays - 1, calendar);
}
