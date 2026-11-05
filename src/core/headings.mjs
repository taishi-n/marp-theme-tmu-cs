import { parseMarkdownBlocks } from './markdown-blocks.mjs';

export function parseMarkdownHeadings(markdown) {
  const tokens = parseMarkdownBlocks(markdown);
  return tokens.flatMap((token, index) => {
    if (token.type !== 'heading_open' || token.level !== 0) return [];
    const rawText = tokens[index + 1].content;
    return [{
      level: Number(token.tag.slice(1)),
      lineIndex: token.map[0],
      endLineIndex: token.map[1],
      rawText,
      text: rawText.trim(),
    }];
  });
}
