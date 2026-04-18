import test from 'node:test';
import assert from 'node:assert/strict';

import { InMemoryEventRepository } from '../src/db/repositories/inMemoryEventRepository.js';
import {
  MIGRATION_STATEMENTS,
  toDbRowEvent,
  toDbRowChild,
  fromDbRowEvent,
  fromDbRowChild
} from '../src/db/schema.js';

test('migration statements contain table creation SQL', () => {
  assert.ok(MIGRATION_STATEMENTS.some((sql) => sql.includes('parent_events')));
  assert.ok(MIGRATION_STATEMENTS.some((sql) => sql.includes('child_items')));
});

test('schema mappers round-trip event and child rows', () => {
  const event = {
    id: 'evt-100',
    title: 'Schema test',
    date: '2026-04-24',
    createdAt: '2026-04-20T00:00:00.000Z',
    updatedAt: '2026-04-20T00:00:00.000Z'
  };

  const child = {
    id: 'c-100',
    parentId: 'evt-100',
    type: 'check',
    content: 'Confirm room',
    isDone: false,
    sortOrder: 0,
    createdAt: '2026-04-20T00:00:00.000Z',
    updatedAt: '2026-04-20T00:00:00.000Z'
  };

  assert.deepEqual(fromDbRowEvent(toDbRowEvent(event)), {
    ...event,
    description: undefined,
    time: undefined
  });

  assert.deepEqual(fromDbRowChild(toDbRowChild(child)), {
    ...child,
    fileName: undefined,
    fileUri: undefined
  });
});

test('repository can upsert and fetch a normalized bundle', () => {
  const repository = new InMemoryEventRepository();

  repository.upsertBundle({
    event: {
      id: 'evt-1',
      title: 'Morning meeting',
      date: '2026-04-23',
      time: '09:00',
      createdAt: '2026-04-22T10:00:00.000Z',
      updatedAt: '2026-04-22T10:00:00.000Z'
    },
    children: [
      {
        id: 'c-2',
        parentId: 'evt-1',
        type: 'memo',
        content: 'Bring docs',
        sortOrder: 2,
        createdAt: '2026-04-22T10:00:00.000Z',
        updatedAt: '2026-04-22T10:00:00.000Z'
      },
      {
        id: 'c-1',
        parentId: 'evt-1',
        type: 'check',
        content: 'Confirm attendees',
        isDone: true,
        sortOrder: 1,
        createdAt: '2026-04-22T10:00:00.000Z',
        updatedAt: '2026-04-22T10:00:00.000Z'
      }
    ]
  });

  const bundle = repository.getBundleByEventId('evt-1');
  assert.equal(bundle?.children[0].id, 'c-1');
  assert.equal(bundle?.children[1].id, 'c-2');
});

test('repository lists events by date and time order', () => {
  const repository = new InMemoryEventRepository();

  repository.upsertBundle({
    event: {
      id: 'evt-early',
      title: 'Early',
      date: '2026-04-25',
      time: '08:30',
      createdAt: '2026-04-22T09:00:00.000Z',
      updatedAt: '2026-04-22T09:00:00.000Z'
    },
    children: []
  });

  repository.upsertBundle({
    event: {
      id: 'evt-late',
      title: 'Late',
      date: '2026-04-25',
      time: '17:30',
      createdAt: '2026-04-22T09:01:00.000Z',
      updatedAt: '2026-04-22T09:01:00.000Z'
    },
    children: []
  });

  const events = repository.listEventsByDate('2026-04-25');
  assert.deepEqual(events.map((event) => event.id), ['evt-early', 'evt-late']);
});



test('repository exposes listAllBundles ordered by schedule', () => {
  const repository = new InMemoryEventRepository();

  repository.upsertBundle({
    event: {
      id: 'evt-b',
      title: 'B',
      date: '2026-04-28',
      time: '20:00',
      createdAt: '2026-04-22T00:00:00.000Z',
      updatedAt: '2026-04-22T00:00:00.000Z'
    },
    children: []
  });

  repository.upsertBundle({
    event: {
      id: 'evt-a',
      title: 'A',
      date: '2026-04-28',
      time: '08:00',
      createdAt: '2026-04-22T00:00:00.000Z',
      updatedAt: '2026-04-22T00:00:00.000Z'
    },
    children: []
  });

  assert.deepEqual(repository.listAllBundles().map((bundle) => bundle.event.id), ['evt-a', 'evt-b']);
});

test('repository delete removes event and children', () => {
  const repository = new InMemoryEventRepository();

  repository.upsertBundle({
    event: {
      id: 'evt-delete',
      title: 'Delete test',
      date: '2026-04-26',
      createdAt: '2026-04-22T00:00:00.000Z',
      updatedAt: '2026-04-22T00:00:00.000Z'
    },
    children: [
      {
        id: 'c-del',
        parentId: 'evt-delete',
        type: 'memo',
        content: 'temporary',
        sortOrder: 0,
        createdAt: '2026-04-22T00:00:00.000Z',
        updatedAt: '2026-04-22T00:00:00.000Z'
      }
    ]
  });

  assert.equal(repository.deleteEvent('evt-delete'), true);
  assert.equal(repository.getBundleByEventId('evt-delete'), null);
});
