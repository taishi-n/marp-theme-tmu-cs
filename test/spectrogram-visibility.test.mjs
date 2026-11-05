import assert from 'node:assert/strict';
import test from 'node:test';
import { installSpectrogramVisibility } from '../src/pipeline/spectrogram-visibility.mjs';

function harness({ intersection = true, plain = false } = {}) {
  const events = [];
  const frames = [];
  const documentListeners = new Map();
  let intersectionCallback;
  const slides = [0, 1].map((index) => ({
    active: index === 0,
    classList: { contains: (name) => name === 'bespoke-marp-active' && slides[index].active },
  }));
  const players = slides.map((slide, index) => {
    const attributes = new Map([['rendering', 'suspended']]);
    const wavegram = {
      setAttribute: (name, value) => {
        attributes.set(name, value);
        events.push(`${index}:${name}:${value}`);
      },
      refresh: () => events.push(`${index}:refresh`),
    };
    return {
      index, wavegram, attributes,
      closest: () => plain ? null : slide,
      querySelector: () => wavegram,
      getBoundingClientRect: () => ({ width: 100, height: 100, bottom: 100, right: 100, top: 0, left: 0 }),
    };
  });
  const document = {
    hidden: false,
    body: { dataset: {} },
    querySelectorAll: () => players,
    addEventListener: (name, callback) => documentListeners.set(name, callback),
  };
  const window = {
    innerWidth: 1000, innerHeight: 800,
    requestAnimationFrame: (callback) => frames.push(callback),
    addEventListener: () => {},
    ...(intersection ? { IntersectionObserver: class {
      constructor(callback) { intersectionCallback = callback; }
      observe() {}
    } } : {}),
  };
  const loads = new Set();
  const manager = installSpectrogramVisibility({
    document, window,
    initialize: (player) => loads.add(player.index),
    pause: (player) => events.push(`${player.index}:pause`),
  });
  function flush() {
    const pending = frames.splice(0);
    pending.forEach((callback) => callback());
  }
  return { manager, document, players, slides, events, loads, frames, flush,
    intersect: (index, visible) => intersectionCallback([{ target: players[index], isIntersecting: visible }]),
    visibility: () => documentListeners.get('visibilitychange')(),
  };
}

test('normal slides initialize only visible players independently of sequential playback', () => {
  const h = harness();
  h.manager.synchronize();
  assert.deepEqual([...h.loads], [0]);
  assert.equal(h.players[0].attributes.get('rendering'), 'active');
  assert.equal(h.players[1].attributes.get('rendering'), 'suspended');
  h.events.length = 0;
  for (let i = 0; i < 10; i += 1) h.manager.synchronize();
  assert.deepEqual(h.events, []);
});

test('leaving a page pauses and suspends it while retaining its player for revisits', () => {
  const h = harness();
  const original = h.players[0].wavegram;
  h.manager.synchronize();
  h.events.length = 0;
  h.slides[0].active = false;
  h.slides[1].active = true;
  h.manager.synchronize();
  assert.deepEqual(h.events, ['0:rendering:suspended', '0:pause', '1:rendering:active', '1:refresh']);
  h.slides[0].active = true;
  h.slides[1].active = false;
  h.manager.synchronize();
  assert.equal(h.players[0].wavegram, original);
  assert.deepEqual([...h.loads], [0, 1]);
});

test('presenter and next-page previews follow their own active slide', () => {
  for (const view of ['presenter', 'next']) {
    const h = harness();
    h.document.body.dataset.bespokeView = view;
    h.slides[0].active = false;
    h.slides[1].active = true;
    h.manager.synchronize();
    assert.deepEqual([...h.loads], [1]);
  }
});

test('overview loads intersecting thumbnails and coalesces visibility notifications', () => {
  const h = harness();
  h.document.body.dataset.bespokeView = 'overview';
  h.manager.synchronize();
  assert.equal(h.loads.size, 0);
  h.intersect(1, true);
  h.intersect(1, true);
  assert.equal(h.frames.length, 1);
  h.flush();
  assert.deepEqual([...h.loads], [1]);
  h.intersect(1, false);
  h.flush();
  assert.equal(h.players[1].attributes.get('rendering'), 'suspended');
});

test('hidden documents suspend all players and resume their visible slide', () => {
  const h = harness();
  h.manager.synchronize();
  h.document.hidden = true;
  h.visibility();
  h.flush();
  assert.equal(h.players[0].attributes.get('rendering'), 'suspended');
  assert.ok(h.events.includes('0:pause'));
  h.document.hidden = false;
  h.visibility();
  h.flush();
  assert.equal(h.players[0].attributes.get('rendering'), 'active');
});

test('plain HTML uses viewport intersections with a measurable-rectangle fallback', () => {
  const h = harness({ plain: true });
  h.manager.synchronize();
  assert.equal(h.loads.size, 0);
  h.intersect(0, true);
  h.flush();
  assert.deepEqual([...h.loads], [0]);
  const fallback = harness({ plain: true, intersection: false });
  fallback.players[1].getBoundingClientRect = () => ({ width: 0, height: 0, bottom: 0, right: 0, top: 0, left: 0 });
  fallback.manager.synchronize();
  assert.deepEqual([...fallback.loads], [0]);
});
