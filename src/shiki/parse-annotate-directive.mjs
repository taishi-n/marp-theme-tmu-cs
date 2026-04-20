function unescapeQuotedValue(value) {
  return value.replace(/\\(["'\\nrt])/g, (_match, token) => {
    if (token === 'n') return '\n';
    if (token === 'r') return '\r';
    if (token === 't') return '\t';
    return token;
  });
}

function warn(options, message) {
  options.onWarning?.({
    line: options.lineNumber,
    message,
  });
}

export function parseAnnotateDirective(input, options = {}) {
  const raw = String(input ?? '');
  const start = raw.indexOf('[!annotate');

  if (start === -1) return null;

  const end = raw.lastIndexOf(']');
  if (end === -1 || end < start) {
    warn(options, 'annotate directive is missing a closing "]".');
    return null;
  }

  const body = raw.slice(start + 1, end).trim();
  if (!body.startsWith('!annotate')) return null;

  let cursor = '!annotate'.length;
  let range = 1;

  if (body[cursor] === ':') {
    cursor += 1;
    const digitsStart = cursor;

    while (cursor < body.length && /\d/.test(body[cursor])) cursor += 1;

    const rangeText = body.slice(digitsStart, cursor);
    if (!rangeText || !/^[1-9]\d*$/.test(rangeText)) {
      warn(options, 'annotate directive has an invalid ":N" range.');
      return null;
    }

    range = Number.parseInt(rangeText, 10);
  }

  while (cursor < body.length && /\s/.test(body[cursor])) cursor += 1;

  const attributes = {};

  while (cursor < body.length) {
    const keyStart = cursor;

    while (cursor < body.length && /[A-Za-z0-9_-]/.test(body[cursor])) cursor += 1;

    const key = body.slice(keyStart, cursor);
    if (!key) {
      warn(options, 'annotate directive has malformed attributes.');
      return null;
    }

    while (cursor < body.length && /\s/.test(body[cursor])) cursor += 1;

    if (body[cursor] !== '=') {
      warn(options, `annotate directive attribute "${key}" is missing "=".`);
      return null;
    }

    cursor += 1;
    while (cursor < body.length && /\s/.test(body[cursor])) cursor += 1;

    const quote = body[cursor];
    if (quote !== '"' && quote !== "'") {
      warn(options, `annotate directive attribute "${key}" must use quoted values.`);
      return null;
    }

    cursor += 1;

    let value = '';
    let closed = false;

    while (cursor < body.length) {
      const character = body[cursor];

      if (character === '\\') {
        if (cursor + 1 >= body.length) break;
        value += body.slice(cursor, cursor + 2);
        cursor += 2;
        continue;
      }

      if (character === quote) {
        closed = true;
        cursor += 1;
        break;
      }

      value += character;
      cursor += 1;
    }

    if (!closed) {
      warn(options, `annotate directive attribute "${key}" has mismatched quotes.`);
      return null;
    }

    attributes[key] = unescapeQuotedValue(value);

    while (cursor < body.length && /\s/.test(body[cursor])) cursor += 1;
  }

  if (!attributes.label) {
    warn(options, 'annotate directive is missing required "label" attribute.');
    return null;
  }

  if (!attributes.note) {
    warn(options, 'annotate directive is missing required "note" attribute.');
    return null;
  }

  return {
    range,
    label: attributes.label,
    note: attributes.note,
    attrs: attributes,
    raw: raw.slice(start, end + 1),
  };
}

export default parseAnnotateDirective;
