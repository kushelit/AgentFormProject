/* eslint-disable require-jsdoc */
/* eslint-disable max-len */

import { Timestamp } from "firebase-admin/firestore";
import type {
  MagicTouchJobSchedule,
} from "./jobTypes";

const DEFAULT_TIME_ZONE =
  "Asia/Jerusalem";

function int(
  value: unknown,
  fallback: number
): number {
  const parsed =
    Number(value);

  return Number.isFinite(parsed)
    ? Math.trunc(parsed)
    : fallback;
}

function clamp(
  value: number,
  min: number,
  max: number
): number {
  return Math.min(
    max,
    Math.max(min, value)
  );
}

function getTimeZoneOffsetMs(
  date: Date,
  timeZone: string
): number {
  const formatter =
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
      }
    );

  const parts =
    formatter.formatToParts(date);

  const values:
    Record<string, string> = {};

  for (const part of parts) {
    if (part.type !== "literal") {
      values[part.type] =
        part.value;
    }
  }

  const asUtc =
    Date.UTC(
      Number(values.year),
      Number(values.month) - 1,
      Number(values.day),
      Number(values.hour),
      Number(values.minute),
      Number(values.second)
    );

  return asUtc -
    date.getTime();
}

function zonedDateTimeToUtc(
  input: {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
  },
  timeZone: string
): Date {
  const utcGuess =
    new Date(
      Date.UTC(
        input.year,
        input.month - 1,
        input.day,
        input.hour,
        input.minute,
        0,
        0
      )
    );

  let offset =
    getTimeZoneOffsetMs(
      utcGuess,
      timeZone
    );

  let result =
    new Date(
      utcGuess.getTime() -
      offset
    );

  const secondOffset =
    getTimeZoneOffsetMs(
      result,
      timeZone
    );

  if (secondOffset !== offset) {
    offset =
      secondOffset;

    result =
      new Date(
        utcGuess.getTime() -
        offset
      );
  }

  return result;
}

function zonedParts(
  date: Date,
  timeZone: string
): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
} {
  const formatter =
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }
    );

  const parts =
    formatter.formatToParts(date);

  const values:
    Record<string, string> = {};

  for (const part of parts) {
    if (part.type !== "literal") {
      values[part.type] =
        part.value;
    }
  }

  return {
    year:
      Number(values.year),
    month:
      Number(values.month),
    day:
      Number(values.day),
    hour:
      Number(values.hour),
    minute:
      Number(values.minute),
  };
}

function daysInMonth(
  year: number,
  month: number
): number {
  return new Date(
    Date.UTC(
      year,
      month,
      0
    )
  ).getUTCDate();
}

function addMonths(
  year: number,
  month: number,
  count: number
): {
  year: number;
  month: number;
} {
  const index =
    year * 12 +
    (month - 1) +
    count;

  return {
    year:
      Math.floor(index / 12),
    month:
      (
        index % 12 +
        12
      ) % 12 +
      1,
  };
}

export function normalizeJobSchedule(
  value: unknown
): MagicTouchJobSchedule {
  const schedule =
    value &&
    typeof value === "object"
      ? value as Record<string, unknown>
      : {};

  const type =
    String(
      schedule.type ||
      "manual"
    ).trim();

  const timeZone =
    String(
      schedule.timeZone ||
      DEFAULT_TIME_ZONE
    ).trim() ||
    DEFAULT_TIME_ZONE;

  if (type === "interval") {
    return {
      type:
        "interval",
      every:
        clamp(
          int(
            schedule.every,
            1
          ),
          1,
          365
        ),
      unit:
        schedule.unit ===
          "hours"
          ? "hours"
          : "days",
      timeZone,
    };
  }

  if (type === "daily") {
    return {
      type:
        "daily",
      hour:
        clamp(
          int(
            schedule.hour,
            9
          ),
          0,
          23
        ),
      minute:
        clamp(
          int(
            schedule.minute,
            0
          ),
          0,
          59
        ),
      timeZone,
    };
  }

  if (type === "monthly") {
    return {
      type:
        "monthly",
      dayOfMonth:
        clamp(
          int(
            schedule.dayOfMonth,
            1
          ),
          1,
          31
        ),
      hour:
        clamp(
          int(
            schedule.hour,
            9
          ),
          0,
          23
        ),
      minute:
        clamp(
          int(
            schedule.minute,
            0
          ),
          0,
          59
        ),
      timeZone,
    };
  }

  return {
    type:
      "manual",
    timeZone,
  };
}

export function calculateNextRunAt(
  scheduleInput: unknown,
  fromDate:
    Date = new Date()
): Timestamp | null {
  const schedule =
    normalizeJobSchedule(
      scheduleInput
    );

  if (schedule.type === "manual") {
    return null;
  }

  if (schedule.type === "interval") {
    const multiplier =
      schedule.unit ===
        "hours"
        ? 60 * 60 * 1000
        : 24 * 60 * 60 * 1000;

    return Timestamp.fromDate(
      new Date(
        fromDate.getTime() +
        schedule.every *
        multiplier
      )
    );
  }

  const parts =
    zonedParts(
      fromDate,
      schedule.timeZone
    );

  if (schedule.type === "daily") {
    let candidate =
      zonedDateTimeToUtc(
        {
          year:
            parts.year,
          month:
            parts.month,
          day:
            parts.day,
          hour:
            schedule.hour,
          minute:
            schedule.minute,
        },
        schedule.timeZone
      );

    if (
      candidate.getTime() <=
      fromDate.getTime()
    ) {
      const tomorrow =
        new Date(
          Date.UTC(
            parts.year,
            parts.month - 1,
            parts.day + 1
          )
        );

      candidate =
        zonedDateTimeToUtc(
          {
            year:
              tomorrow.getUTCFullYear(),
            month:
              tomorrow.getUTCMonth() + 1,
            day:
              tomorrow.getUTCDate(),
            hour:
              schedule.hour,
            minute:
              schedule.minute,
          },
          schedule.timeZone
        );
    }

    return Timestamp.fromDate(
      candidate
    );
  }

  let targetYear =
    parts.year;

  let targetMonth =
    parts.month;

  let targetDay =
    Math.min(
      schedule.dayOfMonth,
      daysInMonth(
        targetYear,
        targetMonth
      )
    );

  let candidate =
    zonedDateTimeToUtc(
      {
        year:
          targetYear,
        month:
          targetMonth,
        day:
          targetDay,
        hour:
          schedule.hour,
        minute:
          schedule.minute,
      },
      schedule.timeZone
    );

  if (
    candidate.getTime() <=
    fromDate.getTime()
  ) {
    const nextMonth =
      addMonths(
        targetYear,
        targetMonth,
        1
      );

    targetYear =
      nextMonth.year;

    targetMonth =
      nextMonth.month;

    targetDay =
      Math.min(
        schedule.dayOfMonth,
        daysInMonth(
          targetYear,
          targetMonth
        )
      );

    candidate =
      zonedDateTimeToUtc(
        {
          year:
            targetYear,
          month:
            targetMonth,
          day:
            targetDay,
          hour:
            schedule.hour,
          minute:
            schedule.minute,
        },
        schedule.timeZone
      );
  }

  return Timestamp.fromDate(
    candidate
  );
}
