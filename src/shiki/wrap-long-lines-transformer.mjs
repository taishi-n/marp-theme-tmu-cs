const DEFAULT_MAX_COLUMNS = 96;
const DEFAULT_CONTINUATION_MARKER = '\\';

function splitLinesPreservingEOF(source) {
  const normalized = String(source ?? '').replace(/\r\n/g, '\n');
  const hasTrailingNewline = normalized.endsWith('\n');
  const body = hasTrailingNewline ? normalized.slice(0, -1) : normalized;
  const lines = body.length === 0 ? [''] : body.split('\n');

  return { lines, hasTrailingNewline };
}

function joinLines(lines, hasTrailingNewline) {
  const joined = lines.join('\n');
  return hasTrailingNewline ? `${joined}\n` : joined;
}

function cloneProperties(properties = {}) {
  return Object.fromEntries(
    Object.entries(properties).map(([key, value]) => [key, Array.isArray(value) ? [...value] : value]),
  );
}

function measureTextWidth(value = '') {
  return Array.from(String(value ?? '')).length;
}

function resolveWrapOptions(options = {}) {
  const maxColumns = Number.isInteger(options.maxColumns) && options.maxColumns > 8
    ? options.maxColumns
    : DEFAULT_MAX_COLUMNS;
  const continuationMarker = typeof options.continuationMarker === 'string' && options.continuationMarker !== ''
    ? options.continuationMarker
    : DEFAULT_CONTINUATION_MARKER;

  return {
    continuationMarker,
    continuationWidth: measureTextWidth(continuationMarker),
    maxColumns,
  };
}

function wrapPlainLine(line, options) {
  const { continuationMarker, continuationWidth, maxColumns } = options;
  const width = measureTextWidth(line);

  if (width <= maxColumns) return [line];

  const segmentWidth = Math.max(1, maxColumns - continuationWidth);
  const characters = Array.from(line);
  const segments = [];
  let cursor = 0;

  while (cursor < characters.length) {
    const end = Math.min(cursor + segmentWidth, characters.length);
    const segment = characters.slice(cursor, end).join('');
    segments.push(segment);
    cursor = end;
  }

  return segments;
}

export function wrapCodeSource(source, rawOptions = {}) {
  const options = resolveWrapOptions(rawOptions);
  const { lines, hasTrailingNewline } = splitLinesPreservingEOF(source);

  return joinLines(lines.flatMap((line) => wrapPlainLine(line, options)), hasTrailingNewline);
}

function measureNodeWidth(node) {
  if (!node) return 0;
  if (node.type === 'text') return measureTextWidth(node.value);
  if (!Array.isArray(node.children)) return 0;

  return node.children.reduce((sum, child) => sum + measureNodeWidth(child), 0);
}

function sliceNode(node, start, end) {
  if (!node || end <= start) return null;

  if (node.type === 'text') {
    const characters = Array.from(String(node.value ?? ''));
    const sliced = characters.slice(start, end).join('');
    return sliced === '' ? null : createTextNode(sliced);
  }

  if (!Array.isArray(node.children)) return null;

  let cursor = 0;
  const children = [];

  for (const child of node.children) {
    const childWidth = measureNodeWidth(child);
    const childStart = cursor;
    const childEnd = cursor + childWidth;

    if (end <= childStart) break;
    if (start < childEnd && end > childStart) {
      const slicedChild = sliceNode(
        child,
        Math.max(0, start - childStart),
        Math.min(childWidth, end - childStart),
      );
      if (slicedChild) children.push(slicedChild);
    }

    cursor = childEnd;
  }

  if (children.length === 0) return null;

  return {
    ...node,
    properties: cloneProperties(node.properties),
    children,
  };
}

function wrapLineNode(lineNode, rawOptions = {}) {
  const options = resolveWrapOptions(rawOptions);
  const totalWidth = measureNodeWidth(lineNode);
  const { continuationMarker, continuationWidth, maxColumns } = options;

  if (totalWidth <= maxColumns) return [lineNode];

  const segmentWidth = Math.max(1, maxColumns - continuationWidth);
  const segments = [];
  let cursor = 0;

  while (cursor < totalWidth) {
    const end = Math.min(cursor + segmentWidth, totalWidth);
    const children = [];
    let childCursor = 0;

    for (const child of lineNode.children ?? []) {
      const childWidth = measureNodeWidth(child);
      const childStart = childCursor;
      const childEnd = childStart + childWidth;
      childCursor = childEnd;

      if (end <= childStart) break;
      if (cursor < childEnd && end > childStart) {
        const slicedChild = sliceNode(
          child,
          Math.max(0, cursor - childStart),
          Math.min(childWidth, end - childStart),
        );
        if (slicedChild) children.push(slicedChild);
      }
    }

    const hasMore = end < totalWidth;

    segments.push({
      ...lineNode,
      properties: {
        ...cloneProperties(lineNode.properties),
        'data-wrapped': 'true',
        ...(hasMore ? { 'data-wrap-marker': continuationMarker } : {}),
      },
      children,
    });

    cursor = end;
  }

  return segments;
}

function isLineElement(node) {
  if (node?.type !== 'element' || node.tagName !== 'span') return false;

  const classes = node.properties?.class;
  if (Array.isArray(classes)) return classes.includes('line');
  return classes === 'line';
}

export function createWrapLongLinesTransformer(options = {}) {
  return {
    name: 'tmu-cs:wrap-long-lines',

    code(node) {
      const wrappedChildren = [];

      for (const child of node.children ?? []) {
        if (!isLineElement(child)) {
          wrappedChildren.push(child);
          continue;
        }

        wrappedChildren.push(...wrapLineNode(child, options));
      }

      node.children = wrappedChildren;
      return node;
    },
  };
}

export default createWrapLongLinesTransformer;
