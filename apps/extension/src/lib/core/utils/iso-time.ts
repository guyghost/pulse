const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60 * MS_PER_SECOND;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;

function daysFromCivil(year: number, month: number, day: number): number {
  const adjustedYear = year - (month <= 2 ? 1 : 0);
  const era = Math.floor(adjustedYear / 400);
  const yearOfEra = adjustedYear - era * 400;
  const monthPrime = month + (month > 2 ? -3 : 9);
  const dayOfYear = Math.floor((153 * monthPrime + 2) / 5) + day - 1;
  const dayOfEra =
    yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;

  return era * 146097 + dayOfEra - 719468;
}

function isValidDatePart(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1) {
    return false;
  }

  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const monthLengths = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  return day <= monthLengths[month - 1];
}

function parseInteger(value: string | undefined): number | null {
  if (value === undefined || value.length === 0) {
    return null;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function parseFractionalMilliseconds(value: string | undefined): number {
  if (!value) {
    return 0;
  }

  return Number(value.slice(0, 3).padEnd(3, '0'));
}

function parseTimezoneOffsetMs(value: string | undefined): number | null {
  if (!value || value === 'Z') {
    return 0;
  }

  const match = /^([+-])(\d{2}):?(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }

  const hours = parseInteger(match[2]);
  const minutes = parseInteger(match[3]);
  if (hours === null || minutes === null || hours > 23 || minutes > 59) {
    return null;
  }

  const direction = match[1] === '+' ? 1 : -1;
  return direction * (hours * MS_PER_HOUR + minutes * MS_PER_MINUTE);
}

export function parseIsoDateToEpochMs(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }

  const year = parseInteger(match[1]);
  const month = parseInteger(match[2]);
  const day = parseInteger(match[3]);
  if (year === null || month === null || day === null || !isValidDatePart(year, month, day)) {
    return null;
  }

  return daysFromCivil(year, month, day) * MS_PER_DAY;
}

export function parseIsoDateTimeToEpochMs(value: string): number | null {
  const dateOnly = parseIsoDateToEpochMs(value);
  if (dateOnly !== null) {
    return dateOnly;
  }

  const match =
    /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-]\d{2}:?\d{2})?$/.exec(
      value
    );
  if (!match) {
    return null;
  }

  const year = parseInteger(match[1]);
  const month = parseInteger(match[2]);
  const day = parseInteger(match[3]);
  const hours = parseInteger(match[4]);
  const minutes = parseInteger(match[5]);
  const seconds = parseInteger(match[6] ?? '0');
  const timezoneOffsetMs = parseTimezoneOffsetMs(match[8]);

  if (
    year === null ||
    month === null ||
    day === null ||
    hours === null ||
    minutes === null ||
    seconds === null ||
    timezoneOffsetMs === null ||
    !isValidDatePart(year, month, day) ||
    hours > 23 ||
    minutes > 59 ||
    seconds > 59
  ) {
    return null;
  }

  const utcMs =
    daysFromCivil(year, month, day) * MS_PER_DAY +
    hours * MS_PER_HOUR +
    minutes * MS_PER_MINUTE +
    seconds * MS_PER_SECOND +
    parseFractionalMilliseconds(match[7]);

  return utcMs - timezoneOffsetMs;
}
