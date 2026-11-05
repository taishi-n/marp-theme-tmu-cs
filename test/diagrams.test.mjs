import assert from 'node:assert/strict';
import test from 'node:test';
import { inflateSync } from 'node:zlib';
import engine from '../engine.mjs';
import { installDiagramFeature } from '../src/features/diagrams/index.mjs';
import { createKrokiBackend } from '../src/features/diagrams/kroki-backend.mjs';
import { attributes, findElements, parseFragment } from '../test-support/html.mjs';

function createMockMarp(defaultFence = (tokens, idx) => `<pre>${tokens[idx].content}</pre>`) {
  return {
    markdown: {
      renderer: {
        rules: {
          fence: defaultFence,
        },
      },
      utils: {
        unescapeAll(value) {
          return String(value ?? '');
        },
      },
    },
  };
}

test('the diagram fence adapter provides the Kroki Mermaid fallback', () => {
  const marp = createMockMarp();
  installDiagramFeature(marp, {
    backend: createKrokiBackend(),
  });

  const tokens = [{
    content: 'graph TD;\nA-->B\n',
    info: 'mermaid',
  }];
  const html = marp.markdown.renderer.rules.fence(tokens, 0);

  const scaling = findElements(parseFragment(html), node => node.tagName === 'marp-auto-scaling')[0];
  assert.ok(scaling);
  assert.ok('data-downscale-only' in attributes(scaling));
  const image = findElements(scaling, node => node.tagName === 'img')[0];
  assert.equal(attributes(image).alt, 'mermaid diagram');
  const source = new URL(attributes(image).src);
  assert.equal(source.origin, 'https://kroki.io');
  assert.match(source.pathname, /^\/mermaid\/svg\//u);
});

test('integrated Mermaid prefers native SVG and preserves source in Kroki fallbacks', async (t) => {
  const warnings = [];
  t.mock.method(console, 'warn', (...args) => warnings.push(args));
  const marp = await engine();
  const native = marp.render('```mermaid\nflowchart LR\nUser[User] --> API[Web API]\n```').html;
  assert.match(native, /<svg data-marp-mermaid/u);
  assert.doesNotMatch(native, /kroki\.io/u);
  assert.equal(warnings.length, 0);

  const unsupported = 'pie title Pets\n  "Dogs" : 10\n  "Cats" : 20\n';
  const explicit = 'flowchart LR\n' + 'LongNode'.repeat(24) + ' --> B\n';
  for (const [language, source] of [['mermaid', unsupported], ['mermaid-kroki', explicit]]) {
    const { html } = marp.render(`\`\`\`${language}\n${source}\`\`\``);
    assert.doesNotMatch(html, /<svg data-marp-mermaid/u);
    const encoded = html.match(/kroki\.io\/mermaid\/svg\/([^"/]+)/u)?.[1];
    assert.ok(encoded);
    assert.equal(inflateSync(Buffer.from(encoded, 'base64url')).toString(), source);
  }
  assert.equal(warnings.length, 1, 'only the unsupported native diagram emits a Core warning');
});

test('installDiagramFeature renders additional Kroki languages through the same backend', () => {
  const marp = createMockMarp();
  installDiagramFeature(marp, {
    backend: createKrokiBackend(),
  });

  const tokens = [{
    content: '@startuml\nAlice -> Bob: Hello\n@enduml\n',
    info: 'plantuml',
  }];
  const html = marp.markdown.renderer.rules.fence(tokens, 0);

  assert.match(html, /https:\/\/kroki\.io\/plantuml\/svg\//);
  assert.match(html, /alt="plantuml diagram"/);
});

test('installDiagramFeature delegates non-diagram languages to the base fence renderer', () => {
  const marp = createMockMarp((tokens, idx) => `<pre class="default">${tokens[idx].content}</pre>`);
  installDiagramFeature(marp, {
    backend: createKrokiBackend(),
  });

  const tokens = [{
    content: 'const value = 1;\n',
    info: 'javascript',
  }];
  const html = marp.markdown.renderer.rules.fence(tokens, 0);

  assert.equal(html, '<pre class="default">const value = 1;\n</pre>');
});

test('installDiagramFeature passes through attribute-bearing fence info for supported languages', () => {
  const marp = createMockMarp();
  installDiagramFeature(marp, {
    backend: createKrokiBackend(),
  });

  const tokens = [{
    content: 'digraph G { a -> b; }\n',
    info: 'graphviz fit-height="true"',
  }];
  const html = marp.markdown.renderer.rules.fence(tokens, 0);

  assert.match(html, /https:\/\/kroki\.io\/graphviz\/svg\//);
});
