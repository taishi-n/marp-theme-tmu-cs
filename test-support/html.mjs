import { parseFragment } from 'parse5';

export { parseFragment };

export function findElements(node, predicate) {
  const children = node.content?.childNodes ?? node.childNodes ?? [];
  return [...(node.tagName && predicate(node) ? [node] : []), ...children.flatMap(child => findElements(child, predicate))];
}

export function attributes(node) {
  return Object.fromEntries((node.attrs ?? []).map(({ name, value }) => [name, value]));
}

export function elementClasses(node) {
  return (attributes(node).class ?? '').split(/\s+/u);
}

export function textContent(node) {
  return node.nodeName === '#text' ? node.value : (node.childNodes ?? []).map(textContent).join('');
}
