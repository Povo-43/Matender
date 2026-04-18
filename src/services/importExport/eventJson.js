import { createChildItem, createParentEvent } from '../../types/models.js';

function assertUniqueChildIds(children) {
  const ids = new Set();
  for (const child of children) {
    if (ids.has(child.id)) {
      throw new Error(`duplicate child id found: ${child.id}`);
    }
    ids.add(child.id);
  }
}

/**
 * Parse a JSON string and validate it against the Matender import format.
 * @param {string} rawJson
 * @returns {{event: object, children: object[]}}
 */
export function parseEventBundleJson(rawJson) {
  const parsed = JSON.parse(rawJson);

  if (typeof parsed !== 'object' || parsed == null || Array.isArray(parsed)) {
    throw new Error('Input must be a JSON object.');
  }

  const event = createParentEvent(parsed);

  const childrenRaw = parsed.children ?? [];
  if (!Array.isArray(childrenRaw)) {
    throw new Error('children must be an array when provided.');
  }

  const children = childrenRaw.map((child, index) => {
    if (typeof child !== 'object' || child == null || Array.isArray(child)) {
      throw new Error(`children[${index}] must be an object.`);
    }

    if (child.parentId != null && child.parentId !== event.id) {
      throw new Error(`children[${index}] parentId must match event.id when provided.`);
    }

    return createChildItem({
      ...child,
      parentId: event.id,
      sortOrder: child.sortOrder ?? index
    });
  });

  assertUniqueChildIds(children);

  return { event, children };
}

/**
 * @param {{event: object, children: object[]}} bundle
 * @returns {string}
 */
export function stringifyEventBundleJson(bundle) {
  const event = createParentEvent(bundle.event);

  const children = (bundle.children ?? []).map((child, index) =>
    createChildItem({
      ...child,
      parentId: event.id,
      sortOrder: child.sortOrder ?? index
    })
  );

  assertUniqueChildIds(children);

  const exportObject = {
    ...event,
    children: children
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(({ parentId, ...rest }) => rest)
  };

  return JSON.stringify(exportObject, null, 2);
}
