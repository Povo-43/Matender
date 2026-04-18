export const CREATE_PARENT_EVENTS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS parent_events (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  date TEXT NOT NULL,
  time TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

export const CREATE_CHILD_ITEMS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS child_items (
  id TEXT PRIMARY KEY NOT NULL,
  parent_id TEXT NOT NULL,
  type TEXT NOT NULL,
  content TEXT,
  is_done INTEGER,
  file_name TEXT,
  file_uri TEXT,
  sort_order INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(parent_id) REFERENCES parent_events(id) ON DELETE CASCADE
);
`;

export const CREATE_INDEXES_SQL = [
  'CREATE INDEX IF NOT EXISTS idx_parent_events_date ON parent_events(date);',
  'CREATE INDEX IF NOT EXISTS idx_child_items_parent_id ON child_items(parent_id);',
  'CREATE INDEX IF NOT EXISTS idx_child_items_parent_sort ON child_items(parent_id, sort_order);'
];

export const MIGRATION_STATEMENTS = [
  'PRAGMA foreign_keys = ON;',
  CREATE_PARENT_EVENTS_TABLE_SQL,
  CREATE_CHILD_ITEMS_TABLE_SQL,
  ...CREATE_INDEXES_SQL
];

export function toDbRowEvent(event) {
  return {
    id: event.id,
    title: event.title,
    description: event.description ?? null,
    date: event.date,
    time: event.time ?? null,
    created_at: event.createdAt,
    updated_at: event.updatedAt
  };
}

export function toDbRowChild(child) {
  return {
    id: child.id,
    parent_id: child.parentId,
    type: child.type,
    content: child.content ?? null,
    is_done: child.isDone == null ? null : child.isDone ? 1 : 0,
    file_name: child.fileName ?? null,
    file_uri: child.fileUri ?? null,
    sort_order: child.sortOrder,
    created_at: child.createdAt,
    updated_at: child.updatedAt
  };
}

export function fromDbRowEvent(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? undefined,
    date: row.date,
    time: row.time ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function fromDbRowChild(row) {
  return {
    id: row.id,
    parentId: row.parent_id,
    type: row.type,
    content: row.content ?? undefined,
    isDone: row.is_done == null ? undefined : Boolean(row.is_done),
    fileName: row.file_name ?? undefined,
    fileUri: row.file_uri ?? undefined,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
