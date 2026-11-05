import assert from 'node:assert/strict';
import test from 'node:test';
import engine from '../engine.mjs';

test('rendering a named slide size restores the theme for the next deck', async () => {
  const marp = await engine();
  const theme = marp.themeSet.add('/*\n * @theme resizable\n * @size square 400px 400px\n */\nsection { width: 1280px; height: 720px; }');
  const originalSize = [theme.width, theme.height];
  const size = () => {
    const current = marp.themeSet.get('resizable');
    return [current.width, current.height];
  };
  marp.render('---\ntheme: resizable\nsize: square\n---\n# Square');
  assert.deepEqual(size(), originalSize);
  marp.render('---\ntheme: resizable\n---\n# Original size');
  assert.deepEqual(size(), originalSize);
});

test('overflow diagnostics apply to code without treating diagram source as displayed lines', async (t) => {
  const messages = [];
  t.mock.method(console, 'warn', message => messages.push(message));
  const marp = await engine();
  marp.render('```plantuml\n' + Array(50).fill('Alice -> Bob: Hello').join('\n') + '\n```');
  assert.deepEqual(messages, []);
  marp.render('```js\n' + Array(50).fill('const x = 1;').join('\n') + '\n```');
  assert.equal(messages.length, 1);
  assert.match(messages[0], /code block.*overflow/u);
});
