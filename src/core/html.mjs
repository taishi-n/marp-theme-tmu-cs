export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function escapeHtmlAttribute(value) {
  return escapeHtml(value);
}

export function replaceHtmlRanges(html, replacements) {
  const chunks = [];
  let cursor = 0;
  for (const { start, end, html: replacement } of replacements.sort((a, b) => a.start - b.start)) {
    if (start < cursor) continue;
    chunks.push(html.slice(cursor, start), replacement);
    cursor = end;
  }
  chunks.push(html.slice(cursor));
  return chunks.join('');
}
