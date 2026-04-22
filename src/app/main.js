import { InMemoryEventRepository } from '../db/repositories/inMemoryEventRepository.js';
import { CHILD_ITEM_TYPES } from '../types/models.js';

const STORAGE_KEY = 'matender.bundles.v1';
const CALENDAR_KEY = 'matender.calendars.v1';
const TEMPLATE_KEY = 'matender.day-templates.v1';
const weekdays = ['日', '月', '火', '水', '木', '金', '土'];

const DEFAULT_CALENDARS = [
  { id: 'personal', name: 'プライベート', color: '#1fa67a', visible: true },
  { id: 'work', name: '仕事', color: '#3d74ff', visible: true }
];

const repository = new InMemoryEventRepository();

const state = {
  monthCursor: startOfMonth(new Date()),
  selectedDate: toDateString(new Date()),
  editingEventId: null,
  searchText: '',
  calendars: DEFAULT_CALENDARS,
  notifiedKeys: new Set(),
  templates: [],
  selectedTemplateId: '',
  viewMode: 'day'
};

bootstrap();
setupReminderLoop();
render();

function bootstrap() {
  const rawCalendars = localStorage.getItem(CALENDAR_KEY);
  if (rawCalendars) {
    try {
      const parsed = JSON.parse(rawCalendars);
      if (Array.isArray(parsed) && parsed.length) {
        state.calendars = parsed;
      }
    } catch {
      state.calendars = DEFAULT_CALENDARS;
    }
  }

  const raw = localStorage.getItem(STORAGE_KEY);
  const rawTemplates = localStorage.getItem(TEMPLATE_KEY);
  if (rawTemplates) {
    try {
      const parsed = JSON.parse(rawTemplates);
      if (Array.isArray(parsed)) {
        state.templates = parsed;
      }
    } catch {
      state.templates = [];
    }
  }

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
      description: 'ローカル同期（ICS）・繰り返し予定・通知リマインダーを使えます。',
      date: today,
      calendarId: 'personal',
      reminderMinutes: 10,
      recurrence: 'none'
    },
    children: [
      {
        id: randomId('child'),
        parentId: 'temp',
        type: CHILD_ITEM_TYPES.MEMO,
        content: 'Googleカレンダー風の主要機能を順次追加',
        sortOrder: 0
      },
      {
        id: randomId('child'),
        parentId: 'temp',
        type: CHILD_ITEM_TYPES.CHECK,
        content: 'ICSでローカルカレンダーと同期',
        isDone: false,
        sortOrder: 1
      }
    ]
  });
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(repository.listAllBundles()));
  localStorage.setItem(CALENDAR_KEY, JSON.stringify(state.calendars));
  localStorage.setItem(TEMPLATE_KEY, JSON.stringify(state.templates));
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
      <div class="sub">ローカル同期(ICS) / 繰り返し / 通知 / 検索 / 複数カレンダー</div>
    </div>
    <div class="stack">
      <select class="select" style="width:120px" data-action="view-mode">
        ${['day', 'week', 'task']
          .map(
            (mode) =>
              `<option value="${mode}" ${state.viewMode === mode ? 'selected' : ''}>${{ day: '日', week: '週', task: 'タスク' }[mode]}ビュー</option>`
          )
          .join('')}
      </select>
      <select class="select" style="width:180px" data-action="template-select">
        <option value="">テンプレート選択</option>
        ${state.templates
          .map((template) => `<option value="${template.id}" ${state.selectedTemplateId === template.id ? 'selected' : ''}>${escapeHtml(template.name)}</option>`)
          .join('')}
      </select>
      <button class="btn secondary" data-action="save-template">1日をテンプレ保存</button>
      <button class="btn secondary" data-action="apply-template">テンプレ適用</button>
      <input class="input" style="width:220px" data-action="search" placeholder="予定を検索" value="${escapeAttr(state.searchText)}" />
      <button class="btn secondary" data-action="import-ics">ICS読み込み</button>
      <button class="btn secondary" data-action="export-ics">ICS書き出し</button>
      <button class="btn secondary" data-action="share-android">Android共有</button>
      <button class="btn secondary" data-action="export-json">JSON書き出し</button>
      <button class="btn primary" data-action="new-event">予定を追加</button>
    </div>
  `;

  node.querySelector('[data-action="new-event"]').addEventListener('click', () => {
    state.editingEventId = null;
    openModal();
  });

  node.querySelector('[data-action="search"]').addEventListener('input', (event) => {
    state.searchText = event.target.value;
    render();
  });

  node.querySelector('[data-action="view-mode"]').addEventListener('change', (event) => {
    state.viewMode = event.target.value;
    render();
  });

  node.querySelector('[data-action="template-select"]').addEventListener('change', (event) => {
    state.selectedTemplateId = event.target.value;
  });

  node.querySelector('[data-action="save-template"]').addEventListener('click', () => {
    saveTemplateFromSelectedDay();
  });

  node.querySelector('[data-action="apply-template"]').addEventListener('click', () => {
    applyTemplateToSelectedDay();
  });

  node.querySelector('[data-action="export-json"]').addEventListener('click', () => {
    const text = JSON.stringify(repository.listAllBundles(), null, 2);
    navigator.clipboard?.writeText(text).then(
      () => alert('JSONをクリップボードにコピーしました。'),
      () => alert('コピーに失敗しました。手動で保存してください。')
    );
  });

  node.querySelector('[data-action="export-ics"]').addEventListener('click', () => {
    const content = buildIcs(repository.listAllBundles());
    downloadFile('matender-export.ics', content, 'text/calendar;charset=utf-8');
  });

  node.querySelector('[data-action="share-android"]').addEventListener('click', async () => {
    const content = buildIcs(repository.listAllBundles());
    await shareIcsToAndroid(content);
  });

  node.querySelector('[data-action="import-ics"]').addEventListener('click', async () => {
    const text = await pickFileText('.ics,text/calendar');
    if (!text) return;
    const imported = parseIcs(text);
    if (!imported.length) {
      alert('取り込めるイベントが見つかりませんでした。');
      return;
    }

    for (const bundle of imported) {
      repository.upsertBundle(bundle);
    }
    persist();
    render();
    alert(`${imported.length}件のイベントを取り込みました。`);
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

    const events = listEventsForDate(cell.dateKey);

    button.innerHTML = `
      <div>${cell.day}</div>
      <div class="dot-row">${events
        .slice(0, 3)
        .map(
          (event) =>
            `<span class="dot" style="background:${escapeAttr(event.eventColor || getCalendarById(event.calendarId)?.color || '#1fa67a')}"></span>`
        )
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
  const events = listEventsForDate(state.selectedDate);

  const head = document.createElement('div');
  head.className = 'side-head';
  head.innerHTML = `
    <div>
      <strong>${selected.getMonth() + 1}/${selected.getDate()} (${weekdays[selected.getDay()]})</strong>
      <div class="event-meta">${events.length}件の予定</div>
    </div>
  `;

  const toggleWrap = document.createElement('div');
  toggleWrap.className = 'stack';
  toggleWrap.innerHTML = state.calendars
    .map(
      (calendar) => `<label class="chip"><input type="checkbox" data-action="toggle-calendar" data-id="${calendar.id}" ${
        calendar.visible ? 'checked' : ''
      } /> ${escapeHtml(calendar.name)}</label>`
    )
    .join('');
  head.appendChild(toggleWrap);

  head.querySelectorAll('[data-action="toggle-calendar"]').forEach((node) => {
    node.addEventListener('change', (event) => {
      const { id } = event.target.dataset;
      state.calendars = state.calendars.map((calendar) =>
        calendar.id === id ? { ...calendar, visible: event.target.checked } : calendar
      );
      persist();
      render();
    });
  });

  panel.appendChild(head);

  const list = document.createElement('div');
  list.className = 'event-list';
  if (state.viewMode === 'day') {
    renderDayView(list, events);
  } else if (state.viewMode === 'week') {
    renderWeekView(list);
  } else {
    renderTaskView(list);
  }

  panel.appendChild(list);
  return panel;
}

function renderDayView(container, events) {
  if (!events.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = '予定がありません。右上の「予定を追加」から登録してください。';
    container.appendChild(empty);
    return;
  }

  for (const event of events) {
    const bundle = repository.getBundleByEventId(event.id);
    const card = document.createElement('article');
    card.className = 'event-card';

    const childHtml = (bundle?.children ?? []).map(formatChild).join('');
    const calendar = getCalendarById(event.calendarId);
    const eventColor = event.eventColor || calendar?.color || '#1fa67a';

    card.innerHTML = `
      <div class="event-title">${escapeHtml(event.title)}</div>
      <div class="event-meta">
        <span style="display:inline-block;width:8px;height:8px;border-radius:99px;background:${escapeAttr(eventColor)};margin-right:4px"></span>
        ${escapeHtml(calendar?.name ?? '未分類')} ・ ${event.time ?? '終日'} ・ ${describeRecurrence(event)}
      </div>
      ${event.location ? `<div class="event-meta">📍 ${escapeHtml(event.location)}</div>` : ''}
      ${event.description ? `<div class="event-meta">${escapeHtml(event.description)}</div>` : ''}
      <div class="child-list">${childHtml || '<div class="child">子要素なし</div>'}</div>
      <div class="stack" style="margin-top:10px;">
        <button class="btn secondary" data-action="edit">編集</button>
        <button class="btn danger" data-action="delete">削除</button>
      </div>
    `;
    card.style.borderLeft = `4px solid ${eventColor}`;

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

    container.appendChild(card);
  }
}

function renderWeekView(container) {
  const selected = fromDateString(state.selectedDate);
  const weekStart = addDays(selected, -selected.getDay());
  const days = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));

  for (const date of days) {
    const dateKey = toDateString(date);
    const events = listEventsForDate(dateKey);
    const section = document.createElement('section');
    section.className = 'event-card';
    section.innerHTML = `<div class="event-title">${date.getMonth() + 1}/${date.getDate()} (${weekdays[date.getDay()]})</div>`;

    if (!events.length) {
      section.innerHTML += `<div class="event-meta">予定なし</div>`;
    } else {
      section.innerHTML += events
        .map((event) => {
          const color = event.eventColor || getCalendarById(event.calendarId)?.color || '#1fa67a';
          return `<div class="event-meta"><span style="display:inline-block;width:8px;height:8px;border-radius:99px;background:${escapeAttr(
            color
          )};margin-right:4px"></span>${event.time ?? '終日'} ${escapeHtml(event.title)}</div>`;
        })
        .join('');
    }

    container.appendChild(section);
  }
}

function renderTaskView(container) {
  const grouped = new Map();
  const monthCells = buildCalendarCells(state.monthCursor).map((cell) => cell.dateKey);

  for (const dateKey of monthCells) {
    for (const event of listEventsForDate(dateKey)) {
      if (!grouped.has(event.title)) {
        grouped.set(event.title, { count: 0, dates: new Set(), color: event.eventColor || getCalendarById(event.calendarId)?.color || '#1fa67a' });
      }
      const item = grouped.get(event.title);
      item.count += 1;
      item.dates.add(dateKey);
    }
  }

  if (!grouped.size) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'タスクがありません。';
    container.appendChild(empty);
    return;
  }

  [...grouped.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .forEach(([title, item]) => {
      const card = document.createElement('article');
      card.className = 'event-card';
      card.style.borderLeft = `4px solid ${item.color}`;
      card.innerHTML = `
        <div class="event-title">${escapeHtml(title)}</div>
        <div class="event-meta">今月の出現回数: ${item.count}回</div>
        <div class="event-meta">日付: ${[...item.dates].sort().slice(0, 5).join(', ')}</div>
      `;
      container.appendChild(card);
    });
}

function listEventsForDate(dateKey) {
  const visibleIds = new Set(state.calendars.filter((c) => c.visible).map((c) => c.id));
  const keyword = state.searchText.trim().toLowerCase();

  return repository
    .listAllBundles()
    .map((bundle) => bundle.event)
    .filter((event) => visibleIds.has(event.calendarId ?? 'personal'))
    .filter((event) => occursOnDate(event, dateKey))
    .filter((event) => {
      if (!keyword) return true;
      return [event.title, event.description, event.location].some((text) => String(text ?? '').toLowerCase().includes(keyword));
    })
    .sort((a, b) => (a.time ?? '99:99').localeCompare(b.time ?? '99:99'));
}

function occursOnDate(event, dateKey) {
  const rule = event.recurrence ?? 'none';
  if (rule === 'none') {
    return event.date === dateKey;
  }

  const base = fromDateString(event.date);
  const target = fromDateString(dateKey);
  if (target < base) return false;

  if (rule === 'daily') return true;
  if (rule === 'weekly') return base.getDay() === target.getDay();
  if (rule === 'monthly') return base.getDate() === target.getDate();
  if (rule === 'custom') {
    const unit = event.recurrenceUnit ?? 'day';
    const interval = Math.max(1, Number(event.recurrenceInterval) || 1);
    const dayDiff = Math.floor((target.getTime() - base.getTime()) / 86400000);

    if (unit === 'day') {
      return dayDiff % interval === 0;
    }

    if (unit === 'week') {
      return base.getDay() === target.getDay() && Math.floor(dayDiff / 7) % interval === 0;
    }

    if (unit === 'month') {
      const monthDiff = (target.getFullYear() - base.getFullYear()) * 12 + (target.getMonth() - base.getMonth());
      return base.getDate() === target.getDate() && monthDiff % interval === 0;
    }
  }

  return event.date === dateKey;
}

function describeRecurrence(event) {
  const rule = event.recurrence ?? 'none';
  if (rule === 'none') return '単発';
  if (rule === 'daily') return '毎日';
  if (rule === 'weekly') return '毎週';
  if (rule === 'monthly') return '毎月';
  if (rule === 'custom') {
    const interval = Math.max(1, Number(event.recurrenceInterval) || 1);
    const unit = { day: '日', week: '週', month: 'か月' }[event.recurrenceUnit ?? 'day'] ?? '日';
    return `${interval}${unit}ごと`;
  }
  return rule;
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
          <label class="label">時刻（空欄で終日）</label>
          <input class="input" type="time" name="time" value="${escapeAttr(event?.time ?? '')}" />
        </div>
      </div>
      <div class="grid2" style="margin-top:8px;">
        <div>
          <label class="label">カレンダー</label>
          <select class="select" name="calendarId">
            ${state.calendars
              .map(
                (calendar) =>
                  `<option value="${calendar.id}" ${(event?.calendarId ?? 'personal') === calendar.id ? 'selected' : ''}>${escapeHtml(
                    calendar.name
                  )}</option>`
              )
              .join('')}
          </select>
        </div>
        <div>
          <label class="label">繰り返し</label>
          <select class="select" name="recurrence">
            ${['none', 'daily', 'weekly', 'monthly', 'custom']
              .map(
                (rule) =>
                  `<option value="${rule}" ${(event?.recurrence ?? 'none') === rule ? 'selected' : ''}>${
                    { none: 'なし', daily: '毎日', weekly: '毎週', monthly: '毎月', custom: 'カスタム' }[rule]
                  }</option>`
              )
              .join('')}
          </select>
        </div>
      </div>
      <div class="grid2" style="margin-top:8px;">
        <div>
          <label class="label">カスタム間隔</label>
          <input class="input" type="number" min="1" name="recurrenceInterval" value="${escapeAttr(event?.recurrenceInterval ?? 1)}" />
        </div>
        <div>
          <label class="label">カスタム単位</label>
          <select class="select" name="recurrenceUnit">
            ${['day', 'week', 'month']
              .map(
                (unit) =>
                  `<option value="${unit}" ${(event?.recurrenceUnit ?? 'day') === unit ? 'selected' : ''}>${
                    { day: '日', week: '週', month: '月' }[unit]
                  }</option>`
              )
              .join('')}
          </select>
        </div>
      </div>
      <div class="grid2" style="margin-top:8px;">
        <div>
          <label class="label">場所</label>
          <input class="input" name="location" value="${escapeAttr(event?.location ?? '')}" />
        </div>
        <div>
          <label class="label">通知（分前）</label>
          <input class="input" type="number" name="reminderMinutes" min="0" value="${escapeAttr(event?.reminderMinutes ?? '')}" />
        </div>
      </div>
      <div style="margin-top:8px;">
        <label class="label">予定カラー</label>
        <input class="input" type="color" name="eventColor" value="${escapeAttr(event?.eventColor ?? '#1fa67a')}" />
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
    <div class="child-editor" data-child-index="${index}" data-id="${child.id ?? ''}">
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
      <label class="label" style="margin-top:8px;">ファイル添付（fileタイプ向け）</label>
      <input class="input" type="file" name="fileUpload" />
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
    bindChildEditorFile(childContainer.lastElementChild);
  });

  childContainer.querySelectorAll('.child-editor').forEach((node) => {
    bindChildEditorRemove(node);
    bindChildEditorFile(node);
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();

    const formData = new FormData(form);
    const eventId = editingBundle?.event.id ?? randomId('evt');

    const bundle = {
      event: {
        id: eventId,
        title: formData.get('title'),
        description: emptyToUndefined(formData.get('description')),
        date: formData.get('date'),
        time: emptyToUndefined(formData.get('time')),
        calendarId: formData.get('calendarId') || 'personal',
        recurrence: formData.get('recurrence') || 'none',
        recurrenceInterval: Number.isFinite(Number(formData.get('recurrenceInterval')))
          ? Math.max(1, Number(formData.get('recurrenceInterval')))
          : 1,
        recurrenceUnit: formData.get('recurrenceUnit') || 'day',
        location: emptyToUndefined(formData.get('location')),
        eventColor: emptyToUndefined(formData.get('eventColor')),
        reminderMinutes: Number.isFinite(Number(formData.get('reminderMinutes')))
          ? Number(formData.get('reminderMinutes'))
          : undefined,
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

function bindChildEditorFile(childEditorNode) {
  const upload = childEditorNode.querySelector('[name="fileUpload"]');
  if (!upload) return;

  upload.addEventListener('change', () => {
    const file = upload.files?.[0];
    if (!file) return;

    const fileNameInput = childEditorNode.querySelector('[name="fileName"]');
    const fileUriInput = childEditorNode.querySelector('[name="fileUri"]');
    if (fileNameInput) fileNameInput.value = file.name;

    const reader = new FileReader();
    reader.onload = () => {
      if (fileUriInput) {
        fileUriInput.value = String(reader.result ?? '');
      }
    };
    reader.readAsDataURL(file);
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

function setupReminderLoop() {
  if (typeof window === 'undefined') return;

  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission().catch(() => {});
  }

  setInterval(() => {
    const now = new Date();
    const today = toDateString(now);
    const events = listEventsForDate(today);

    for (const event of events) {
      if (!event.time || !Number.isFinite(Number(event.reminderMinutes))) continue;

      const eventTime = toDateTime(today, event.time);
      const reminderAt = new Date(eventTime.getTime() - Number(event.reminderMinutes) * 60000);
      const diffMs = now.getTime() - reminderAt.getTime();
      const key = `${event.id}:${today}:${event.time}:${event.reminderMinutes}`;

      if (diffMs >= 0 && diffMs < 60000 && !state.notifiedKeys.has(key)) {
        notifyReminder(event);
        state.notifiedKeys.add(key);
      }
    }
  }, 15000);
}

function notifyReminder(event) {
  const message = `${event.title} (${event.time}) の${event.reminderMinutes}分前です。`;

  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification('Matender リマインダー', { body: message });
  } else {
    alert(message);
  }
}

function buildIcs(bundles) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Matender//Local Sync//JA'];

  for (const bundle of bundles) {
    const event = bundle.event;
    const dtStart = event.time ? `${event.date.replaceAll('-', '')}T${event.time.replace(':', '')}00` : `${event.date.replaceAll('-', '')}`;
    const dtEnd = event.time
      ? `${event.date.replaceAll('-', '')}T${addMinutes(event.time, 60).replace(':', '')}00`
      : event.date.replaceAll('-', '');

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${event.id}@matender.local`);
    lines.push(`SUMMARY:${escapeIcsText(event.title)}`);
    if (event.description) lines.push(`DESCRIPTION:${escapeIcsText(event.description)}`);
    if (event.location) lines.push(`LOCATION:${escapeIcsText(event.location)}`);
    if (event.time) {
      lines.push(`DTSTART:${dtStart}`);
      lines.push(`DTEND:${dtEnd}`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${dtStart}`);
      lines.push(`DTEND;VALUE=DATE:${dtEnd}`);
    }
    if (event.recurrence && event.recurrence !== 'none') {
      if (event.recurrence === 'custom') {
        const freqMap = { day: 'DAILY', week: 'WEEKLY', month: 'MONTHLY' };
        const freq = freqMap[event.recurrenceUnit ?? 'day'] ?? 'DAILY';
        const interval = Math.max(1, Number(event.recurrenceInterval) || 1);
        lines.push(`RRULE:FREQ=${freq};INTERVAL=${interval}`);
      } else {
        lines.push(`RRULE:FREQ=${event.recurrence.toUpperCase()}`);
      }
    }
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

function parseIcs(text) {
  const chunks = text.split('BEGIN:VEVENT').slice(1).map((chunk) => chunk.split('END:VEVENT')[0]);
  return chunks
    .map((chunk) => {
      const get = (key) => {
        const line = chunk
          .split(/\r?\n/)
          .find((item) => item.startsWith(`${key}:`) || item.startsWith(`${key};`));
        if (!line) return undefined;
        return line.split(':').slice(1).join(':').trim();
      };

      const summary = get('SUMMARY');
      const dtStart = get('DTSTART');
      if (!summary || !dtStart) return null;

      const isDateOnly = /^\d{8}$/.test(dtStart);
      const date = `${dtStart.slice(0, 4)}-${dtStart.slice(4, 6)}-${dtStart.slice(6, 8)}`;
      const time = isDateOnly ? undefined : `${dtStart.slice(9, 11)}:${dtStart.slice(11, 13)}`;
      const rrule = get('RRULE');
      const freq = rrule?.match(/FREQ=([^;]+)/)?.[1]?.toLowerCase() ?? 'none';
      const interval = Number(rrule?.match(/INTERVAL=([0-9]+)/)?.[1] ?? 1);
      const recurrenceMap = { daily: 'daily', weekly: 'weekly', monthly: 'monthly' };
      const recurrence = recurrenceMap[freq] ?? 'none';
      const isCustom = recurrence !== 'none' && interval > 1;
      const recurrenceUnit = { daily: 'day', weekly: 'week', monthly: 'month' }[freq] ?? 'day';

      return {
        event: {
          id: randomId('evt'),
          title: unescapeIcsText(summary),
          description: unescapeIcsText(get('DESCRIPTION') ?? ''),
          location: unescapeIcsText(get('LOCATION') ?? ''),
          date,
          time,
          recurrence: isCustom ? 'custom' : recurrence,
          recurrenceInterval: isCustom ? interval : 1,
          recurrenceUnit,
          calendarId: 'personal',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        children: []
      };
    })
    .filter(Boolean);
}

function pickFileText(accept) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return resolve('');
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => resolve('');
      reader.readAsText(file);
    });
    input.click();
  });
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

async function shareIcsToAndroid(content) {
  try {
    const file = new File([content], 'matender-share.ics', { type: 'text/calendar' });
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      await navigator.share({
        title: 'Matender calendar export',
        text: 'Androidの共有カレンダーへ取り込んでください。',
        files: [file]
      });
      return;
    }

    downloadFile('matender-share.ics', content, 'text/calendar;charset=utf-8');
    alert('共有API非対応のため、ICSファイルを保存しました。Androidカレンダーアプリへインポートしてください。');
  } catch (error) {
    alert(`Android共有に失敗しました: ${error.message}`);
  }
}

function saveTemplateFromSelectedDay() {
  const bundles = repository
    .listAllBundles()
    .filter((bundle) => bundle.event.date === state.selectedDate);

  if (!bundles.length) {
    alert('テンプレート化できる予定がありません。');
    return;
  }

  const name = prompt('テンプレート名を入力してください', `テンプレート ${state.selectedDate}`);
  if (!name?.trim()) return;

  const template = {
    id: randomId('tpl'),
    name: name.trim(),
    items: bundles.map((bundle) => ({
      event: {
        ...bundle.event,
        id: undefined,
        date: undefined,
        createdAt: undefined,
        updatedAt: undefined
      },
      children: bundle.children.map((child) => ({
        ...child,
        id: undefined,
        parentId: undefined,
        createdAt: undefined,
        updatedAt: undefined
      }))
    }))
  };

  state.templates = [template, ...state.templates].slice(0, 30);
  state.selectedTemplateId = template.id;
  persist();
  render();
  alert(`テンプレート「${template.name}」を保存しました。`);
}

function applyTemplateToSelectedDay() {
  const template = state.templates.find((item) => item.id === state.selectedTemplateId);
  if (!template) {
    alert('テンプレートを選択してください。');
    return;
  }

  const shouldReplace = confirm('選択日の既存予定を残したままテンプレートを追加します。続行しますか？');
  if (!shouldReplace) return;

  for (const item of template.items) {
    const eventId = randomId('evt');
    repository.upsertBundle({
      event: {
        ...item.event,
        id: eventId,
        date: state.selectedDate,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      children: item.children.map((child, index) => ({
        ...child,
        id: randomId('child'),
        parentId: eventId,
        sortOrder: Number(child.sortOrder ?? index),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }))
    });
  }

  persist();
  render();
  alert(`テンプレート「${template.name}」を適用しました。`);
}

function getCalendarById(id) {
  return state.calendars.find((calendar) => calendar.id === (id ?? 'personal'));
}

function toDateTime(dateText, timeText) {
  const [year, month, day] = dateText.split('-').map(Number);
  const [hour, minute] = timeText.split(':').map(Number);
  return new Date(year, month - 1, day, hour, minute, 0, 0);
}

function addMinutes(timeText, minutes) {
  const [hour, minute] = timeText.split(':').map(Number);
  const total = hour * 60 + minute + minutes;
  const adjusted = ((total % 1440) + 1440) % 1440;
  return `${String(Math.floor(adjusted / 60)).padStart(2, '0')}:${String(adjusted % 60).padStart(2, '0')}`;
}

function escapeIcsText(text) {
  return String(text ?? '').replaceAll('\\', '\\\\').replaceAll(';', '\\;').replaceAll(',', '\\,').replaceAll('\n', '\\n');
}

function unescapeIcsText(text) {
  return String(text ?? '').replaceAll('\\n', '\n').replaceAll('\\,', ',').replaceAll('\\;', ';').replaceAll('\\\\', '\\');
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
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
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
  const trimmed = String(value).trim();
  return trimmed.length ? trimmed : undefined;
}
