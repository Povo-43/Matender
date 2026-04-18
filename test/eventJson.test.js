import test from 'node:test';
import assert from 'node:assert/strict';

import { parseEventBundleJson, stringifyEventBundleJson } from '../src/services/importExport/eventJson.js';

test('parseEventBundleJson validates and normalizes a bundle', () => {
  const json = JSON.stringify({
    id: 'evt-001',
    title: 'プロジェクトMTG',
    date: '2026-04-17',
    time: '10:00',
    children: [
      { id: 'c-1', type: 'memo', content: '前回議事録の確認' },
      { id: 'c-2', type: 'check', content: '担当者の確定', isDone: false }
    ]
  });

  const bundle = parseEventBundleJson(json);

  assert.equal(bundle.event.id, 'evt-001');
  assert.equal(bundle.children.length, 2);
  assert.equal(bundle.children[0].parentId, 'evt-001');
  assert.equal(bundle.children[1].sortOrder, 1);
});

test('parseEventBundleJson rejects invalid date format', () => {
  const json = JSON.stringify({
    id: 'evt-001',
    title: 'Invalid Date',
    date: '2026-02-30'
  });

  assert.throws(() => parseEventBundleJson(json), /YYYY-MM-DD/);
});

test('parseEventBundleJson rejects duplicate child ids', () => {
  const json = JSON.stringify({
    id: 'evt-003',
    title: '重複テスト',
    date: '2026-04-20',
    children: [
      { id: 'dup-1', type: 'memo', content: 'a' },
      { id: 'dup-1', type: 'memo', content: 'b' }
    ]
  });

  assert.throws(() => parseEventBundleJson(json), /duplicate child id/);
});

test('parseEventBundleJson rejects child parentId mismatch', () => {
  const json = JSON.stringify({
    id: 'evt-004',
    title: 'Parent mismatch',
    date: '2026-04-21',
    children: [
      { id: 'c-1', parentId: 'another-event', type: 'memo', content: 'x' }
    ]
  });

  assert.throws(() => parseEventBundleJson(json), /parentId must match/);
});

test('stringifyEventBundleJson emits children sorted by sortOrder and strips parentId', () => {
  const output = stringifyEventBundleJson({
    event: {
      id: 'evt-002',
      title: '整理',
      date: '2026-04-18'
    },
    children: [
      {
        id: 'c-2',
        parentId: 'evt-002',
        type: 'memo',
        content: 'second',
        sortOrder: 2
      },
      {
        id: 'c-1',
        parentId: 'evt-002',
        type: 'memo',
        content: 'first',
        sortOrder: 1
      }
    ]
  });

  const parsed = JSON.parse(output);
  assert.equal(parsed.children[0].id, 'c-1');
  assert.equal(parsed.children[0].parentId, undefined);
});

test('createChildItem enforces file type fields via codec', () => {
  const json = JSON.stringify({
    id: 'evt-file',
    title: 'File test',
    date: '2026-04-22',
    children: [
      { id: 'file-1', type: 'file', fileName: 'agenda.pdf' }
    ]
  });

  assert.throws(() => parseEventBundleJson(json), /fileUri/);
});
