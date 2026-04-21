export function splitLinesPreservingEOF(source) {
  const normalized = String(source ?? '').replace(/\r\n/g, '\n');
  const hasTrailingNewline = normalized.endsWith('\n');
  const body = hasTrailingNewline ? normalized.slice(0, -1) : normalized;

  return {
    lines: body === '' ? [''] : body.split('\n'),
    hasTrailingNewline,
  };
}

export function joinLines(lines, hasTrailingNewline) {
  const joined = lines.join('\n');
  return hasTrailingNewline ? `${joined}\n` : joined;
}
