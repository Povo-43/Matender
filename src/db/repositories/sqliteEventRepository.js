import {
  fromDbRowChild,
  fromDbRowEvent,
  MIGRATION_STATEMENTS,
  toDbRowChild,
  toDbRowEvent
} from '../schema.js';
import { createChildItem, createParentEvent } from '../../types/models.js';

const SQL = {
  upsertEvent: `
    INSERT INTO parent_events (id, title, description, date, time, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      description = excluded.description,
      date = excluded.date,
      time = excluded.time,
      updated_at = excluded.updated_at
  `,
  deleteChildrenByParentId: 'DELETE FROM child_items WHERE parent_id = ?;',
  insertChild: `
    INSERT INTO child_items
      (id, parent_id, type, content, is_done, file_name, file_uri, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      parent_id = excluded.parent_id,
      type = excluded.type,
      content = excluded.content,
      is_done = excluded.is_done,
      file_name = excluded.file_name,
      file_uri = excluded.file_uri,
      sort_order = excluded.sort_order,
      updated_at = excluded.updated_at
  `,
  getEventById: 'SELECT * FROM parent_events WHERE id = ?;',
  listChildrenByParentId: 'SELECT * FROM child_items WHERE parent_id = ? ORDER BY sort_order ASC;',
  listEventsByDate: 'SELECT * FROM parent_events WHERE date = ? ORDER BY COALESCE(time, "99:99") ASC, created_at ASC;',
  listAllEvents: 'SELECT * FROM parent_events ORDER BY date ASC, COALESCE(time, "99:99") ASC, created_at ASC;',
  deleteEvent: 'DELETE FROM parent_events WHERE id = ?;'
};

export class SQLiteEventRepository {
  constructor(db) {
    this.db = db;
  }

  async migrate() {
    await this.db.execAsync(MIGRATION_STATEMENTS.join('\n'));
  }

  async upsertBundle(bundle) {
    const event = createParentEvent(bundle.event);
    const children = (bundle.children ?? []).map((child, index) =>
      createChildItem({
        ...child,
        parentId: event.id,
        sortOrder: child.sortOrder ?? index
      })
    );

    await this._transaction(async () => {
      const row = toDbRowEvent(event);
      await this.db.runAsync(SQL.upsertEvent, [
        row.id,
        row.title,
        row.description,
        row.date,
        row.time,
        row.created_at,
        row.updated_at
      ]);

      await this.db.runAsync(SQL.deleteChildrenByParentId, [event.id]);

      for (const child of children) {
        const c = toDbRowChild(child);
        await this.db.runAsync(SQL.insertChild, [
          c.id,
          c.parent_id,
          c.type,
          c.content,
          c.is_done,
          c.file_name,
          c.file_uri,
          c.sort_order,
          c.created_at,
          c.updated_at
        ]);
      }
    });

    return { event, children };
  }

  async getBundleByEventId(eventId) {
    const eventRow = await this.db.getFirstAsync(SQL.getEventById, [eventId]);
    if (!eventRow) return null;

    const childRows = await this.db.getAllAsync(SQL.listChildrenByParentId, [eventId]);

    return {
      event: fromDbRowEvent(eventRow),
      children: childRows.map(fromDbRowChild)
    };
  }

  async listEventsByDate(date) {
    const rows = await this.db.getAllAsync(SQL.listEventsByDate, [date]);
    return rows.map(fromDbRowEvent);
  }

  async exportBundles() {
    const eventRows = await this.db.getAllAsync(SQL.listAllEvents);
    const bundles = [];

    for (const eventRow of eventRows) {
      const event = fromDbRowEvent(eventRow);
      const childRows = await this.db.getAllAsync(SQL.listChildrenByParentId, [event.id]);
      bundles.push({
        event,
        children: childRows.map(fromDbRowChild)
      });
    }

    return bundles;
  }

  async deleteEvent(eventId) {
    const result = await this.db.runAsync(SQL.deleteEvent, [eventId]);
    return (result?.changes ?? 0) > 0;
  }

  async _transaction(work) {
    if (typeof this.db.withTransactionAsync === 'function') {
      return this.db.withTransactionAsync(work);
    }

    await this.db.execAsync('BEGIN;');
    try {
      const result = await work();
      await this.db.execAsync('COMMIT;');
      return result;
    } catch (error) {
      await this.db.execAsync('ROLLBACK;');
      throw error;
    }
  }
}

export { SQL as SQLiteEventRepositorySql };
