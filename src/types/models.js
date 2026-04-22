import { isValidDateString, isValidTimeString, isValidIsoTimestamp, nowIsoString } from '../utils/dateTime.js';

export const CHILD_ITEM_TYPES = Object.freeze({
  MEMO: 'memo',
  CHECK: 'check',
  FILE: 'file'
});

const CHILD_TYPE_SET = new Set(Object.values(CHILD_ITEM_TYPES));

function assertString(value, fieldName) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${fieldName} must be a non-empty string.`);
  }
}

function assertOptionalString(value, fieldName) {
  if (value != null && typeof value !== 'string') {
    throw new Error(`${fieldName} must be a string when provided.`);
  }
}

function assertOptionalNumber(value, fieldName) {
  if (value != null && (!Number.isFinite(value) || value < 0)) {
    throw new Error(`${fieldName} must be a non-negative number when provided.`);
  }
}

function assertIsoDate(value, fieldName) {
  assertString(value, fieldName);
  if (!isValidDateString(value)) {
    throw new Error(`${fieldName} must be in YYYY-MM-DD format.`);
  }
}

function assertIsoTime(value, fieldName) {
  assertString(value, fieldName);
  if (!isValidTimeString(value)) {
    throw new Error(`${fieldName} must be in HH:mm format.`);
  }
}

function assertIsoTimestamp(value, fieldName) {
  assertString(value, fieldName);
  if (!isValidIsoTimestamp(value)) {
    throw new Error(`${fieldName} must be an ISO-8601 timestamp.`);
  }
}

function normalizeMetadata(input) {
  const createdAt = input.createdAt ?? nowIsoString();
  const updatedAt = input.updatedAt ?? createdAt;

  assertIsoTimestamp(createdAt, 'createdAt');
  assertIsoTimestamp(updatedAt, 'updatedAt');

  return { createdAt, updatedAt };
}

export function createParentEvent(input) {
  const metadata = normalizeMetadata(input);

  assertString(input.id, 'id');
  assertString(input.title, 'title');
  assertIsoDate(input.date, 'date');

  if (input.time != null) {
    assertIsoTime(input.time, 'time');
  }

  assertOptionalString(input.description, 'description');
  assertOptionalString(input.calendarId, 'calendarId');
  assertOptionalString(input.location, 'location');
  assertOptionalString(input.eventColor, 'eventColor');
  assertOptionalString(input.recurrence, 'recurrence');
  assertOptionalString(input.recurrenceUnit, 'recurrenceUnit');
  assertOptionalNumber(input.reminderMinutes, 'reminderMinutes');
  assertOptionalNumber(input.recurrenceInterval, 'recurrenceInterval');

  if (input.recurrence != null && !['none', 'daily', 'weekly', 'monthly', 'custom'].includes(input.recurrence)) {
    throw new Error('recurrence must be one of: none, daily, weekly, monthly, custom.');
  }

  if (input.recurrenceUnit != null && !['day', 'week', 'month'].includes(input.recurrenceUnit)) {
    throw new Error('recurrenceUnit must be one of: day, week, month.');
  }

  return {
    id: input.id,
    title: input.title,
    description: input.description,
    date: input.date,
    time: input.time,
    calendarId: input.calendarId,
    location: input.location,
    eventColor: input.eventColor,
    recurrence: input.recurrence ?? 'none',
    recurrenceInterval: input.recurrenceInterval ?? 1,
    recurrenceUnit: input.recurrenceUnit ?? 'day',
    reminderMinutes: input.reminderMinutes,
    ...metadata
  };
}

function validateChildTypeSpecificFields(input) {
  if (input.type === CHILD_ITEM_TYPES.CHECK) {
    if (input.isDone != null && typeof input.isDone !== 'boolean') {
      throw new Error('isDone must be a boolean when provided.');
    }

    assertString(input.content, 'content');
    return;
  }

  if (input.type === CHILD_ITEM_TYPES.FILE) {
    assertString(input.fileName, 'fileName');
    assertString(input.fileUri, 'fileUri');

    if (input.isDone != null) {
      throw new Error('isDone is only valid for check type items.');
    }

    return;
  }

  assertString(input.content, 'content');

  if (input.isDone != null) {
    throw new Error('isDone is only valid for check type items.');
  }
}

export function createChildItem(input) {
  const metadata = normalizeMetadata(input);

  assertString(input.id, 'id');
  assertString(input.parentId, 'parentId');

  if (!CHILD_TYPE_SET.has(input.type)) {
    throw new Error(`type must be one of: ${Object.values(CHILD_ITEM_TYPES).join(', ')}`);
  }

  if (!Number.isInteger(input.sortOrder) || input.sortOrder < 0) {
    throw new Error('sortOrder must be a non-negative integer.');
  }

  assertOptionalString(input.content, 'content');
  assertOptionalString(input.fileName, 'fileName');
  assertOptionalString(input.fileUri, 'fileUri');

  validateChildTypeSpecificFields(input);

  return {
    id: input.id,
    parentId: input.parentId,
    type: input.type,
    content: input.content,
    isDone: input.type === CHILD_ITEM_TYPES.CHECK ? input.isDone ?? false : undefined,
    fileName: input.fileName,
    fileUri: input.fileUri,
    sortOrder: input.sortOrder,
    ...metadata
  };
}
