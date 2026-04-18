const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isValidDateString(value) {
  if (!DATE_PATTERN.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    return false;
  }

  const [year, month, day] = value.split('-').map(Number);
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() + 1 === month &&
    date.getUTCDate() === day
  );
}

export function isValidTimeString(value) {
  return TIME_PATTERN.test(value);
}

export function isValidIsoTimestamp(value) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return false;
  }

  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && value.includes('T');
}

export function nowIsoString() {
  return new Date().toISOString();
}
