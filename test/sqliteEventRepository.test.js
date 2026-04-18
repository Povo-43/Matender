import test from 'node:test';
import assert from 'node:assert/strict';

import { MIGRATION_STATEMENTS } from '../src/db/schema.js';
import { SQLiteEventRepository } from '../src/db/repositories/sqliteEventRepository.js';

function createMockDb(overrides = {}) {
  const calls = {
    exec: [],
    run: [],
    getFirst: [],
    getAll: []
  };

  return {
    calls,
    execAsync: async (sql) => {
      calls.exec.push(sql);
      return null;
    },
    runAsync: async (sql, params = []) => {
      calls.run.push({ sql, params });
      if (sql.includes('DELETE FROM parent_events')) {
        return { changes: 1 };
      }
      return { changes: 1 };
    },
    getFirstAsync: async (sql, params = []) => {
      calls.getFirst.push({ sql, params });
      return null;
    },
    getAllAsync: async (sql, params = []) => {
      calls.getAll.push({ sql, params });
      return [];
    },
    withTransactionAsync: async (work) => work(),
    ...overrides
  };
}

test('migrate executes migration statements in one batch', async () => {
  const db = createMockDb();
  const repo = new SQLiteEventRepository(db);

  await repo.migrate();

  assert.equal(db.calls.exec.length, 1);
  assert.equal(db.calls.exec[0], MIGRATION_STATEMENTS.join('\n'));
});

test('upsertBundle stores parent event and replaces children', async () => {
  const db = createMockDb();
  const repo = new SQLiteEventRepository(db);

  await repo.upsertBundle({
    event: {
      id: 'evt-1',
      title: 'Project MTG',
      date: '2026-04-30',
      time: '10:30',
      createdAt: '2026-04-28T00:00:00.000Z',
      updatedAt: '2026-04-28T00:00:00.000Z'
    },
    children: [
      {
        id: 'c-1',
        parentId: 'evt-1',
        type: 'memo',
        content: 'Agenda',
        sortOrder: 0,
        createdAt: '2026-04-28T00:00:00.000Z',
        updatedAt: '2026-04-28T00:00:00.000Z'
      }
    ]
  });

  assert.equal(db.calls.run.length, 3);
  assert.ok(db.calls.run[0].sql.includes('INSERT INTO parent_events'));
  assert.ok(db.calls.run[1].sql.includes('DELETE FROM child_items'));
  assert.ok(db.calls.run[2].sql.includes('INSERT INTO child_items'));
});

test('getBundleByEventId maps rows back to domain objects', async () => {
  const db = createMockDb({
    getFirstAsync: async () => ({
      id: 'evt-22',
      title: 'Review',
      description: null,
      date: '2026-05-01',
      time: null,
      created_at: '2026-04-29T00:00:00.000Z',
      updated_at: '2026-04-29T00:00:00.000Z'
    }),
    getAllAsync: async () => [
      {
        id: 'c-1',
        parent_id: 'evt-22',
        type: 'check',
        content: 'Bring laptop',
        is_done: 1,
        file_name: null,
        file_uri: null,
        sort_order: 0,
        created_at: '2026-04-29T00:00:00.000Z',
        updated_at: '2026-04-29T00:00:00.000Z'
      }
    ]
  });

  const repo = new SQLiteEventRepository(db);
  const bundle = await repo.getBundleByEventId('evt-22');

  assert.equal(bundle?.event.id, 'evt-22');
  assert.equal(bundle?.children[0].isDone, true);
});

test('exportBundles returns all events with their children', async () => {
  const db = createMockDb({
    getAllAsync: async (sql, params = []) => {
      if (sql.includes('FROM parent_events')) {
        return [
          {
            id: 'evt-1',
            title: 'A',
            description: null,
            date: '2026-05-02',
            time: null,
            created_at: '2026-04-29T00:00:00.000Z',
            updated_at: '2026-04-29T00:00:00.000Z'
          },
          {
            id: 'evt-2',
            title: 'B',
            description: null,
            date: '2026-05-03',
            time: null,
            created_at: '2026-04-29T00:00:00.000Z',
            updated_at: '2026-04-29T00:00:00.000Z'
          }
        ];
      }

      return [
        {
          id: `child-${params[0]}`,
          parent_id: params[0],
          type: 'memo',
          content: 'x',
          is_done: null,
          file_name: null,
          file_uri: null,
          sort_order: 0,
          created_at: '2026-04-29T00:00:00.000Z',
          updated_at: '2026-04-29T00:00:00.000Z'
        }
      ];
    }
  });

  const repo = new SQLiteEventRepository(db);
  const bundles = await repo.exportBundles();

  assert.equal(bundles.length, 2);
  assert.equal(bundles[0].children[0].parentId, 'evt-1');
  assert.equal(bundles[1].children[0].parentId, 'evt-2');
});

test('deleteEvent returns true when changes > 0', async () => {
  const db = createMockDb({
    runAsync: async () => ({ changes: 1 })
  });
  const repo = new SQLiteEventRepository(db);

  const deleted = await repo.deleteEvent('evt-delete');
  assert.equal(deleted, true);
});
