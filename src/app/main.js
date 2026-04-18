import { InMemoryEventRepository } from '../db/repositories/inMemoryEventRepository.js';
import { CHILD_ITEM_TYPES } from '../types/models.js';

const STORAGE_KEY = 'matender.bundles.v1';
const weekdays = ['日', '月', '火', '水', '木', '金', '土'];

const repository = new InMemoryEventRepository();

const state = {
  monthCursor: startOfMonth(new Date()),
  selectedDate: toDateString(new Date()),
  editingEventId: null
};

bootstrap();
render();

function bootstrap() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    seedData();
    persist();
    return;
  }

  try {
    const bundles = JSON.parse(raw);
    for (const bundle of bundles) {
      repository.upsertBundle(bundle);
    }
  } catch (error) {
    console.warn('Failed to read local data, reseeding.', error);
    repository.clearAll();
    seedData();
    persist();
  }
}

function seedData() {
  const today = toDateString(new Date());
  repository.upsertBundle({
    event: {
      id: randomId('evt'),
      title: 'Matenderへようこそ',
      description: '右上の「予定を追加」から通常の予定を作成できます。',
      date: today
    },
    children: [
      {
        id: randomId('child'),
        parentId: 'temp',
        type: CHILD_ITEM_TYPES.MEMO,
        content: '会議やタスクに紐づくメモを保存',
        sortOrder: 0
      },
      {
        id: randomId('child'),
        parentId: 'temp',
        type: CHILD_ITEM_TYPES.CHECK,
        content: 'チェックリストで進捗を管理',
        isDone: false,
        sortOrder: 1
      }
    ]
  });
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(repository.listAllBundles()));
}

function render() {
  const app = document.getElementById('app');
  app.innerHTML = '';

  const wrapper = document.createElement('div');
  wrapper.className = 'app-shell';

  wrapper.appendChild(renderHeader());

  const layout = document.createElement('div');
  layout.className = 'layout';

  layout.appendChild(renderCalendarPanel());
  layout.appendChild(renderSidePanel());

  wrapper.appendChild(layout);
  wrapper.appendChild(renderModal());

  app.appendChild(wrapper);
}

function renderHeader() {
  const date = fromDateString(state.selectedDate);

  const node = document.createElement('div');
  node.className = 'header';
  node.innerHTML = `
    <div>
      <h1 class="h1">Matender</h1>
      <p class="sub">${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日の予定</p>
    </div>
    <div class="stack">
      <button class="btn secondary" data-action="export-json">JSONエクスポート</button>
      <button class="btn primary" data-action="new-event">予定を追加</button>
    </div>
  `;

  node.querySelector('[data-action="new-event"]').addEventListener('click', () => {
    state.editingEventId = null;
    openModal();
  });

  node.querySelector('[data-action="export-json"]').addEventListener('click', () => {
    const text = JSON.stringify(repository.listAllBundles(), null, 2);
    navigator.clipboard?.writeText(text).then(
      () => alert('JSONをクリップボードにコピーしました。'),
      () => alert('コピーに失敗しました。手動で保存してください。')
    );
  });

  return node;
}

function renderCalendarPanel() {
  const panel = document.createElement('section');
  panel.className = 'panel';

  const monthLabel = `${state.monthCursor.getFullYear()}年 ${state.monthCursor.getMonth() + 1}月`;

  const head = document.createElement('div');
  head.className = 'calendar-head';
  head.innerHTML = `
    <div class="stack">
      <button class="btn ghost" data-action="prev-month">← 前月</button>
      <button class="btn ghost" data-action="today">今日</button>
      <button class="btn ghost" data-action="next-month">次月 →</button>
    </div>
    <strong>${monthLabel}</strong>
  `;

  head.querySelector('[data-action="prev-month"]').addEventListener('click', () => {
    state.monthCursor = startOfMonth(addMonths(state.monthCursor, -1));
    render();
  });

  head.querySelector('[data-action="next-month"]').addEventListener('click', () => {
    state.monthCursor = startOfMonth(addMonths(state.monthCursor, 1));
    render();
  });

  head.querySelector('[data-action="today"]').addEventListener('click', () => {
    const now = new Date();
    state.selectedDate = toDateString(now);
    state.monthCursor = startOfMonth(now);
    render();
  });

  panel.appendChild(head);

  const grid = document.createElement('div');
  grid.className = 'calendar-grid';

  weekdays.forEach((day) => {
    const label = document.createElement('div');
    label.className = 'weekday';
    label.textContent = day;
    grid.appendChild(label);
  });

  const cells = buildCalendarCells(state.monthCursor);

  for (const cell of cells) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'day';

    if (!cell.isCurrentMonth) {
      button.classList.add('muted');
    }

    if (cell.dateKey === state.selectedDate) {
      button.classList.add('selected');
    }

    const events = repository.listEventsByDate(cell.dateKey);

    button.innerHTML = `
      <div>${cell.day}</div>
      <div class="dot-row">${Array.from({ length: Math.min(events.length, 3) })
        .map(() => '<span class="dot"></span>')
        .join('')}</div>
      <div class="event-meta">${events.length ? `${events.length}件` : ''}</div>
    `;

    button.addEventListener('click', () => {
      state.selectedDate = cell.dateKey;
      render();
    });

    grid.appendChild(button);
  }

  panel.appendChild(grid);
  return panel;
}

function renderSidePanel() {
  const panel = document.createElement('section');
  panel.className = 'panel side';

  const selected = fromDateString(state.selectedDate);
  const events = repository.listEventsByDate(state.selectedDate);

  const head = document.createElement('div');
  head.className = 'side-head';
  head.innerHTML = `
    <div>
      <strong>${selected.getMonth() + 1}/${selected.getDate()} (${weekdays[selected.getDay()]})</strong>
      <div class="event-meta">${events.length}件の予定</div>
    </div>
  `;

  panel.appendChild(head);

  const list = document.createElement('div');
  list.className = 'event-list';

  if (!events.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = '予定がありません。右上の「予定を追加」から登録してください。';
    list.appendChild(empty);
  }

  for (const event of events) {
    const bundle = repository.getBundleByEventId(event.id);
    const card = document.createElement('article');
    card.className = 'event-card';

    const childHtml = (bundle?.children ?? []).map(formatChild).join('');

    card.innerHTML = `
      <div class="event-title">${escapeHtml(event.title)}</div>
      <div class="event-meta">${event.time ?? '時刻未設定'} ・ 子要素 ${(bundle?.children ?? []).length}件</div>
      ${event.description ? `<div class="event-meta">${escapeHtml(event.description)}</div>` : ''}
      <div class="child-list">${childHtml || '<div class="child">子要素なし</div>'}</div>
      <div class="stack" style="margin-top:10px;">
        <button class="btn secondary" data-action="edit">編集</button>
        <button class="btn danger" data-action="delete">削除</button>
      </div>
    `;

    card.querySelector('[data-action="edit"]').addEventListener('click', () => {
      state.editingEventId = event.id;
      openModal();
    });

    card.querySelector('[data-action="delete"]').addEventListener('click', () => {
      if (!confirm(`「${event.title}」を削除しますか？`)) return;
      repository.deleteEvent(event.id);
      persist();
      render();
    });

    list.appendChild(card);
  }

  panel.appendChild(list);
  return panel;
}

function formatChild(child) {
  if (child.type === CHILD_ITEM_TYPES.CHECK) {
    return `<div class="child">☑ ${escapeHtml(child.content)} (${child.isDone ? '完了' : '未完了'})</div>`;
  }

  if (child.type === CHILD_ITEM_TYPES.FILE) {
    return `<div class="child">📎 ${escapeHtml(child.fileName)}<br /><small>${escapeHtml(child.fileUri)}</small></div>`;
  }

  return `<div class="child">📝 ${escapeHtml(child.content)}</div>`;
}

function renderModal() {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.id = 'event-modal';
  backdrop.innerHTML = `<div class="modal"></div>`;

  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) {
      closeModal();
    }
  });

  return backdrop;
}

function openModal() {
  const modal = document.getElementById('event-modal');
  const content = modal.querySelector('.modal');
  const editingBundle = state.editingEventId ? repository.getBundleByEventId(state.editingEventId) : null;

  content.innerHTML = buildEventFormHtml(editingBundle);
  modal.classList.add('show');

  bindModalEvents(content, editingBundle);
}

function closeModal() {
  const modal = document.getElementById('event-modal');
  modal.classList.remove('show');
}

function buildEventFormHtml(bundle) {
  const event = bundle?.event;
  const children = bundle?.children ?? [];

  return `
    <h3 style="margin:0 0 14px;">${event ? '予定を編集' : '予定を追加'}</h3>
    <form id="event-form">
      <label class="label">タイトル</label>
      <input class="input" name="title" required value="${escapeAttr(event?.title ?? '')}" />
      <label class="label" style="margin-top:8px;">説明</label>
      <textarea class="textarea" name="description">${escapeHtml(event?.description ?? '')}</textarea>
      <div class="grid2" style="margin-top:8px;">
        <div>
          <label class="label">日付</label>
          <input class="input" type="date" name="date" required value="${escapeAttr(event?.date ?? state.selectedDate)}" />
        </div>
        <div>
          <label class="label">時刻</label>
          <input class="input" type="time" name="time" value="${escapeAttr(event?.time ?? '')}" />
        </div>
      </div>

      <div style="margin-top:14px; display:flex; justify-content:space-between; align-items:center;">
        <strong>子要素</strong>
        <button class="btn secondary" type="button" data-action="add-child">子要素を追加</button>
      </div>
      <div id="child-editors">
        ${children.map((child, index) => childEditorHtml(child, index)).join('')}
      </div>

      <div class="stack" style="margin-top:16px; justify-content:flex-end;">
        <button class="btn ghost" type="button" data-action="cancel">キャンセル</button>
        <button class="btn primary" type="submit">保存</button>
      </div>
    </form>
  `;
}

function childEditorHtml(child, index) {
  return `
    <div class="child-editor" data-child-index="${index}" data-id="${child.id ?? ""}">
      <div class="grid2">
        <div>
          <label class="label">種別</label>
          <select class="select" name="childType">
            ${[CHILD_ITEM_TYPES.MEMO, CHILD_ITEM_TYPES.CHECK, CHILD_ITEM_TYPES.FILE]
              .map((type) => `<option value="${type}" ${child.type === type ? 'selected' : ''}>${type}</option>`)
              .join('')}
          </select>
        </div>
        <div>
          <label class="label">並び順</label>
          <input class="input" type="number" name="sortOrder" value="${child.sortOrder ?? index}" min="0" />
        </div>
      </div>
      <label class="label" style="margin-top:8px;">内容</label>
      <input class="input" name="content" value="${escapeAttr(child.content ?? '')}" />
      <div class="grid2" style="margin-top:8px;">
        <div>
          <label class="label">ファイル名</label>
          <input class="input" name="fileName" value="${escapeAttr(child.fileName ?? '')}" />
        </div>
        <div>
          <label class="label">ファイルURI</label>
          <input class="input" name="fileUri" value="${escapeAttr(child.fileUri ?? '')}" />
        </div>
      </div>
      <label class="label" style="margin-top:8px;">チェック状態（checkのみ）</label>
      <select class="select" name="isDone">
        <option value="">未指定</option>
        <option value="false" ${child.isDone === false ? 'selected' : ''}>未完了</option>
        <option value="true" ${child.isDone === true ? 'selected' : ''}>完了</option>
      </select>
      <div class="stack" style="margin-top:8px; justify-content:flex-end;">
        <button class="btn danger" type="button" data-action="remove-child">削除</button>
      </div>
    </div>
  `;
}

function bindModalEvents(content, editingBundle) {
  const form = content.querySelector('#event-form');
  const childContainer = content.querySelector('#child-editors');

  content.querySelector('[data-action="cancel"]').addEventListener('click', closeModal);

  content.querySelector('[data-action="add-child"]').addEventListener('click', () => {
    const index = childContainer.querySelectorAll('.child-editor').length;
    childContainer.insertAdjacentHTML(
      'beforeend',
      childEditorHtml(
        {
          id: randomId('child'),
          parentId: editingBundle?.event.id ?? 'pending',
          type: CHILD_ITEM_TYPES.MEMO,
          content: '',
          sortOrder: index
        },
        index
      )
    );
    bindChildEditorRemove(childContainer.lastElementChild);
  });

  childContainer.querySelectorAll('.child-editor').forEach(bindChildEditorRemove);

  form.addEventListener('submit', (event) => {
    event.preventDefault();

    const formData = new FormData(form);
    const eventId = editingBundle?.event.id ?? randomId('evt');

    const bundle = {
      event: {
        id: eventId,
        title: formData.get('title'),
        description: formData.get('description') || undefined,
        date: formData.get('date'),
        time: formData.get('time') || undefined,
        createdAt: editingBundle?.event.createdAt,
        updatedAt: new Date().toISOString()
      },
      children: collectChildItems(childContainer, eventId)
    };

    try {
      repository.upsertBundle(bundle);
      state.selectedDate = bundle.event.date;
      state.monthCursor = startOfMonth(fromDateString(bundle.event.date));
      persist();
      closeModal();
      render();
    } catch (error) {
      alert(`保存できませんでした: ${error.message}`);
    }
  });
}

function bindChildEditorRemove(childEditorNode) {
  childEditorNode.querySelector('[data-action="remove-child"]').addEventListener('click', () => {
    childEditorNode.remove();
  });
}

function collectChildItems(container, parentId) {
  const editors = [...container.querySelectorAll('.child-editor')];

  return editors.map((editor, index) => {
    const child = {
      id: editor.dataset.id ?? randomId('child'),
      parentId,
      type: editor.querySelector('[name="childType"]').value,
      content: emptyToUndefined(editor.querySelector('[name="content"]').value),
      fileName: emptyToUndefined(editor.querySelector('[name="fileName"]').value),
      fileUri: emptyToUndefined(editor.querySelector('[name="fileUri"]').value),
      sortOrder: Number(editor.querySelector('[name="sortOrder"]').value || index),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const isDone = editor.querySelector('[name="isDone"]').value;
    if (isDone) {
      child.isDone = isDone === 'true';
    }

    return child;
  });
}

function buildCalendarCells(cursor) {
  const first = startOfMonth(cursor);
  const startWeekday = first.getDay();
  const start = addDays(first, -startWeekday);

  return Array.from({ length: 42 }, (_, index) => {
    const date = addDays(start, index);
    return {
      day: date.getDate(),
      dateKey: toDateString(date),
      isCurrentMonth: date.getMonth() === cursor.getMonth()
    };
  });
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date, value) {
  return new Date(date.getFullYear(), date.getMonth() + value, 1);
}

function addDays(date, value) {
  const d = new Date(date);
  d.setDate(d.getDate() + value);
  return d;
}

function toDateString(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;
}

function fromDateString(value) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function randomId(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeAttr(value) {
  return escapeHtml(value ?? '');
}

function emptyToUndefined(value) {
  if (value == null) return undefined;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
}
