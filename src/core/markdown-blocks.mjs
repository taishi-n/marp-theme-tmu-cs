import { Marp } from '@marp-team/marp-core';
import mathJaxPlugin from '@marp-team/marp-core/plugins/mathjax';

// Run only the block grammar: a full Core parse also mutates deck/theme state.
const parser = new Marp({ html: true, script: false }).use(mathJaxPlugin()).markdown;
let previousSource;
let previousTokens;

export function parseMarkdownBlocks(markdown) {
  const source = String(markdown ?? '').replace(/\r\n?/gu, '\n').replace(/\0/gu, '\uFFFD');
  if (source === previousSource) return previousTokens;
  const tokens = [];
  parser.block.parse(source, parser, {}, tokens);
  previousSource = source;
  previousTokens = tokens;
  return tokens;
}
