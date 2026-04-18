import { createChildItem, createParentEvent } from '../../types/models.js';

function normalizeBundle(bundle) {
  const event = createParentEvent(bundle.event);
  const children = (bundle.children ?? []).map((child, index) =>
    createChildItem({
      ...child,
      parentId: event.id,
      sortOrder: child.sortOrder ?? index
    })
  );

  const seenIds = new Set();
  for (const child of children) {
    if (seenIds.has(child.id)) {
      throw new Error(`duplicate child id found: ${child.id}`);
    }
    seenIds.add(child.id);
  }

  return {
    event,
    children: children.slice().sort((a, b) => a.sortOrder - b.sortOrder)
  };
}

export class InMemoryEventRepository {
  constructor() {
    this.events = new Map();
    this.childrenByParent = new Map();
  }

  upsertBundle(bundle) {
    const normalized = normalizeBundle(bundle);
    this.events.set(normalized.event.id, normalized.event);
    this.childrenByParent.set(normalized.event.id, normalized.children);
    return normalized;
  }

  getBundleByEventId(eventId) {
    const event = this.events.get(eventId);
    if (!event) {
      return null;
    }

    return {
      event,
      children: [...(this.childrenByParent.get(eventId) ?? [])]
    };
  }

  listEventsByDate(date) {
    return [...this.events.values()]
      .filter((event) => event.date === date)
      .sort((a, b) => {
        const left = a.time ?? '99:99';
        const right = b.time ?? '99:99';
        if (left === right) {
          return a.createdAt.localeCompare(b.createdAt);
        }

        return left.localeCompare(right);
      });
  }

  listAllBundles() {
    return [...this.events.values()]
      .sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '99:99').localeCompare(b.time ?? '99:99'))
      .map((event) => ({
        event,
        children: [...(this.childrenByParent.get(event.id) ?? [])]
      }));
  }

  deleteEvent(eventId) {
    const deleted = this.events.delete(eventId);
    this.childrenByParent.delete(eventId);
    return deleted;
  }

  clearAll() {
    this.events.clear();
    this.childrenByParent.clear();
  }
}
