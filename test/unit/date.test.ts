import { describe, expect, it } from "vitest";
import {
  addWorkdays,
  assertISODate,
  durationFinish,
  isWorkingDay,
  maxDate,
  minDate,
  nextWorkingDay,
  workdaysBetween,
} from "../../src/engine/date";
import type { WorkCalendarV094 } from "../../src/domain/types";

const calendar: WorkCalendarV094 = {
  workingWeekdays: [1, 2, 3, 4, 5],
  holidays: [],
};
const calendarWithHoliday: WorkCalendarV094 = {
  workingWeekdays: [1, 2, 3, 4, 5],
  holidays: ["2026-08-28"],
};

describe("assertISODate", () => {
  it("accepts a valid calendar date", () => {
    expect(() => {
      assertISODate("2026-08-26");
    }).not.toThrow();
  });

  it("rejects a malformed date string", () => {
    expect(() => {
      assertISODate("08/26/2026");
    }).toThrow("Invalid ISO schedule date: 08/26/2026");
  });

  it("rejects a calendar date that does not exist", () => {
    expect(() => {
      assertISODate("2026-02-30");
    }).toThrow("Invalid calendar date: 2026-02-30");
  });
});

describe("isWorkingDay", () => {
  it("treats Monday through Friday as working days", () => {
    expect(isWorkingDay("2026-08-24", calendar)).toBe(true);
    expect(isWorkingDay("2026-08-28", calendar)).toBe(true);
  });

  it("treats Saturday and Sunday as non-working days", () => {
    expect(isWorkingDay("2026-08-29", calendar)).toBe(false);
    expect(isWorkingDay("2026-08-30", calendar)).toBe(false);
  });

  it("treats a listed holiday as a non-working day even on a weekday", () => {
    expect(isWorkingDay("2026-08-28", calendarWithHoliday)).toBe(false);
  });
});

describe("nextWorkingDay", () => {
  it("returns the same date when it is already a working day", () => {
    expect(nextWorkingDay("2026-08-24", calendar)).toBe("2026-08-24");
  });

  it("skips forward over a weekend", () => {
    expect(nextWorkingDay("2026-08-29", calendar)).toBe("2026-08-31");
  });

  it("skips forward over a holiday landing on a weekday", () => {
    expect(nextWorkingDay("2026-08-28", calendarWithHoliday)).toBe(
      "2026-08-31",
    );
  });
});

describe("addWorkdays", () => {
  it("returns the next working day when workdays is zero", () => {
    expect(addWorkdays("2026-08-29", 0, calendar)).toBe("2026-08-31");
  });

  it("adds positive workdays skipping the weekend", () => {
    expect(addWorkdays("2026-08-27", 2, calendar)).toBe("2026-08-31");
  });

  it("subtracts negative workdays skipping the weekend", () => {
    expect(addWorkdays("2026-08-31", -2, calendar)).toBe("2026-08-27");
  });

  it("rejects a non-integer workday count", () => {
    expect(() => addWorkdays("2026-08-26", 1.5, calendar)).toThrow(
      "workdays must be an integer",
    );
  });
});

describe("minDate and maxDate", () => {
  it("returns the earlier date for minDate", () => {
    expect(minDate("2026-08-26", "2026-08-27")).toBe("2026-08-26");
    expect(minDate("2026-08-27", "2026-08-26")).toBe("2026-08-26");
  });

  it("returns the later date for maxDate", () => {
    expect(maxDate("2026-08-26", "2026-08-27")).toBe("2026-08-27");
    expect(maxDate("2026-08-27", "2026-08-26")).toBe("2026-08-27");
  });
});

describe("workdaysBetween", () => {
  it("returns zero for identical dates", () => {
    expect(workdaysBetween("2026-08-26", "2026-08-26", calendar)).toBe(0);
  });

  it("counts forward working days excluding the weekend", () => {
    expect(workdaysBetween("2026-08-27", "2026-08-31", calendar)).toBe(2);
  });

  it("counts backward working days as a negative value", () => {
    expect(workdaysBetween("2026-08-31", "2026-08-27", calendar)).toBe(-2);
  });
});

describe("durationFinish", () => {
  it("normalizes a non-working start date before counting the duration", () => {
    expect(durationFinish("2026-08-29", 1, calendar)).toBe("2026-08-31");
  });

  it("computes the finish date for a multi-day duration", () => {
    expect(durationFinish("2026-08-26", 3, calendar)).toBe("2026-08-28");
  });

  it("rejects a duration below one workday", () => {
    expect(() => durationFinish("2026-08-26", 0, calendar)).toThrow(
      "Duration must be an integer >= 1, got 0",
    );
  });
});
