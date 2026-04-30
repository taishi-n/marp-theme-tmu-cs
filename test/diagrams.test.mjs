import assert from 'node:assert/strict';
import test from 'node:test';
import { installDiagramFeature } from '../src/features/diagrams/index.mjs';
import { createKrokiBackend } from '../src/features/diagrams/kroki-backend.mjs';

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

test('installDiagramFeature renders mermaid fences through Kroki', () => {
  const marp = createMockMarp();
  installDiagramFeature(marp, {
    backend: createKrokiBackend(),
  });

  const tokens = [{
    content: 'graph TD;\nA-->B\n',
    info: 'mermaid',
  }];
  const html = marp.markdown.renderer.rules.fence(tokens, 0, {}, {}, {});

  assert.match(html, /^<p><marp-auto-scaling data-downscale-only><img src="https:\/\/kroki\.io\/mermaid\/svg\//);
  assert.match(html, /alt="mermaid diagram"/);
  assert.match(html, /marp-auto-scaling/);
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
  const html = marp.markdown.renderer.rules.fence(tokens, 0, {}, {}, {});

  assert.match(html, /https:\/\/kroki\.io\/plantuml\/svg\//);
  assert.match(html, /alt="plantuml diagram"/);
});

test('installDiagramFeature falls back to the previous fence renderer for non-diagram languages', () => {
  const marp = createMockMarp((tokens, idx) => `<pre class="default">${tokens[idx].content}</pre>`);
  installDiagramFeature(marp, {
    backend: createKrokiBackend(),
  });

  const tokens = [{
    content: 'const value = 1;\n',
    info: 'javascript',
  }];
  const html = marp.markdown.renderer.rules.fence(tokens, 0, {}, {}, {});

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
  const html = marp.markdown.renderer.rules.fence(tokens, 0, {}, {}, {});

  assert.match(html, /https:\/\/kroki\.io\/graphviz\/svg\//);
});
