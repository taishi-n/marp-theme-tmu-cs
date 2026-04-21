import { joinLines, splitLinesPreservingEOF } from '../core/text-lines.mjs';

const TAB10_COLORS = [
  '#1f77b4',
  '#ff7f0e',
  '#2ca02c',
  '#d62728',
  '#9467bd',
  '#8c564b',
  '#e377c2',
  '#7f7f7f',
  '#bcbd22',
  '#17becf',
];

function stripTrailingWhitespace(line) {
  return String(line ?? '').replace(/[ \t]+$/u, '');
}

function escapeJsonForHtml(value) {
  return JSON.stringify(value)
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026');
}

function warn(options, message) {
  options.onWarning?.({
    line: options.lineNumber,
    message,
  });
}

function unescapeQuotedValue(value) {
  return value.replace(/\\(["'\\nrt])/g, (_match, token) => {
    if (token === 'n') return '\n';
    if (token === 'r') return '\r';
    if (token === 't') return '\t';
    return token;
  });
}

function extractAnnotateComment(line) {
  const markerIndex = line.indexOf('[!annotate');
  if (markerIndex === -1) return null;

  const commentStart = line.lastIndexOf('%', markerIndex);
  if (commentStart === -1) return null;

  return {
    beforeComment: line.slice(0, commentStart),
    comment: line.slice(commentStart),
  };
}

function parseAnnotateDirective(input, options = {}) {
  const raw = String(input ?? '');
  const start = raw.indexOf('[!annotate');

  if (start === -1) return null;

  const end = raw.lastIndexOf(']');
  if (end === -1 || end < start) {
    warn(options, 'math annotate directive is missing a closing "]".');
    return null;
  }

  const body = raw.slice(start + 1, end).trim();
  if (!body.startsWith('!annotate')) return null;

  let cursor = '!annotate'.length;

  if (body[cursor] === ':') {
    cursor += 1;
    const digitsStart = cursor;

    while (cursor < body.length && /\d/.test(body[cursor])) cursor += 1;

    const rangeText = body.slice(digitsStart, cursor);
    if (!rangeText || !/^[1-9]\d*$/.test(rangeText)) {
      warn(options, 'math annotate directive has an invalid ":N" range.');
      return null;
    }

    warn(options, 'math annotate directives ignore ":N". The entire annotated line is already the target.');
  }

  while (cursor < body.length && /\s/.test(body[cursor])) cursor += 1;

  const attributes = {};

  while (cursor < body.length) {
    const keyStart = cursor;

    while (cursor < body.length && /[A-Za-z0-9_-]/.test(body[cursor])) cursor += 1;

    const key = body.slice(keyStart, cursor);
    if (!key) {
      warn(options, 'math annotate directive has malformed attributes.');
      return null;
    }

    while (cursor < body.length && /\s/.test(body[cursor])) cursor += 1;

    if (body[cursor] !== '=') {
      warn(options, `math annotate directive attribute "${key}" is missing "=".`);
      return null;
    }

    cursor += 1;
    while (cursor < body.length && /\s/.test(body[cursor])) cursor += 1;

    const quote = body[cursor];
    if (quote !== '"' && quote !== "'") {
      warn(options, `math annotate directive attribute "${key}" must use quoted values.`);
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
      warn(options, `math annotate directive attribute "${key}" has mismatched quotes.`);
      return null;
    }

    attributes[key] = unescapeQuotedValue(value);

    while (cursor < body.length && /\s/.test(body[cursor])) cursor += 1;
  }

  if (!attributes.note || attributes.note.trim() === '') {
    warn(options, 'math annotate directive is missing required "note" attribute.');
    return null;
  }

  return {
    note: attributes.note,
    label: attributes.label ?? '',
    color: attributes.color ?? '',
    attrs: attributes,
  };
}

function normalizeHexColor(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';

  const withHash = raw.startsWith('#') ? raw : `#${raw}`;
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/iu.test(withHash)) return withHash.toLowerCase();
  return '';
}

function buildAnnotatedLine(line, annotationId, options = {}) {
  const directiveComment = extractAnnotateComment(line);
  if (!directiveComment) return null;

  const sanitizedLine = stripTrailingWhitespace(directiveComment.beforeComment);
  const directive = parseAnnotateDirective(directiveComment.comment, options);

  if (!directive) {
    return {
      annotation: null,
      line: sanitizedLine,
    };
  }

  if (!sanitizedLine.trim()) {
    warn(options, 'math annotate directives must appear at the end of the TeX line they annotate. Comment-only lines are ignored.');
    return {
      annotation: null,
      line: sanitizedLine,
    };
  }

  const leadingWhitespace = sanitizedLine.match(/^\s*/u)?.[0] ?? '';
  const body = sanitizedLine.slice(leadingWhitespace.length);
  const color = normalizeHexColor(directive.color) || TAB10_COLORS[(annotationId - 1) % TAB10_COLORS.length];

  return {
    annotation: {
      id: annotationId,
      note: directive.note,
      label: directive.label,
      color,
    },
    line: `${leadingWhitespace}\\class{eqann-${annotationId}}{${body}}`,
  };
}

function mathAnnotationRuntime() {
  if (window.__tmuCsMathAnnotationRuntimeLoaded) return;
  window.__tmuCsMathAnnotationRuntimeLoaded = true;

  const TAB10_COLORS = ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd', '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf'];
  const HIGHLIGHT_ALPHA = 0.20;
  const BOX_BG_ALPHA = 0.08;
  const BOX_BORDER_ALPHA = 0.45;
  const BAND_MARGIN = 16;
  const HORIZONTAL_GAP = 10;

  function isDebugEnabled() {
    if (window.__TMU_CS_MATH_DEBUG === true) return true;

    try {
      if (window.localStorage?.getItem('tmu-cs-math-debug') === '1') return true;
    } catch (_error) {
      // Ignore storage access failures.
    }

    try {
      const params = new URLSearchParams(window.location.search || '');
      const value = params.get('mathDebug');
      return value === '1' || value === 'true' || value === 'yes';
    } catch (_error) {
      return false;
    }
  }

  function round(value) {
    return Math.round(Number(value || 0) * 1000) / 1000;
  }

  function formatLogValue(value) {
    if (value === null || value === undefined) return String(value);
    if (typeof value === 'number') return String(round(value));
    if (typeof value === 'string') return value;

    try {
      return JSON.stringify(value);
    } catch (_error) {
      return String(value);
    }
  }

  function appendDebugLine(debugEl, args) {
    if (!debugEl) return;
    const line = Array.prototype.map.call(args, formatLogValue).join(' ');
    debugEl.textContent += line + '\n';
  }

  function emitConsoleLog(args) {
    if (typeof console !== 'undefined' && typeof console.log === 'function') {
      console.log.apply(console, ['[tmu-cs math]'].concat(Array.prototype.slice.call(args)));
    }
  }

  function createLogger(debugEl) {
    return function () {
      emitConsoleLog(arguments);
      appendDebugLine(debugEl, arguments);
    };
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function normalizeHexColor(value) {
    const raw = String(value || '').trim();
    if (!raw) return TAB10_COLORS[0];
    const withHash = raw.charAt(0) === '#' ? raw : '#' + raw;
    if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(withHash)) return withHash;
    return TAB10_COLORS[0];
  }

  function hexToRgb(hex) {
    const normalized = normalizeHexColor(hex).replace('#', '');
    const full = normalized.length === 3
      ? normalized.split('').map(function (character) { return character + character; }).join('')
      : normalized;
    const intVal = parseInt(full, 16);
    return {
      r: (intVal >> 16) & 255,
      g: (intVal >> 8) & 255,
      b: intVal & 255,
    };
  }

  function buildTheme(color) {
    const normalizedColor = normalizeHexColor(color);
    const rgb = hexToRgb(normalizedColor);

    return {
      color: normalizedColor,
      fill: 'rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',' + HIGHLIGHT_ALPHA + ')',
      stroke: 'rgb(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ')',
      softStroke: 'rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',' + BOX_BORDER_ALPHA + ')',
      boxBg: 'rgba(' + rgb.r + ',' + rgb.g + ',' + rgb.b + ',' + BOX_BG_ALPHA + ')',
    };
  }

  function simplifyViewportRect(rect) {
    return {
      left: round(rect.left),
      top: round(rect.top),
      width: round(rect.width),
      height: round(rect.height),
    };
  }

  function simplifyLocalRect(rect) {
    return {
      x: round(rect.x),
      y: round(rect.y),
      w: round(rect.w),
      h: round(rect.h),
    };
  }

  function getStageMetrics(stage, overlay) {
    const stageRect = stage.getBoundingClientRect();
    const overlayRect = overlay.getBoundingClientRect();
    const localWidth = Math.max(stage.clientWidth || stage.offsetWidth || 0, 1);
    const localHeight = Math.max(stage.clientHeight || stage.offsetHeight || 0, 1);
    const scaleX = overlayRect.width > 0 ? overlayRect.width / localWidth : 1;
    const scaleY = overlayRect.height > 0 ? overlayRect.height / localHeight : 1;

    return {
      stageRect,
      overlayRect,
      localWidth,
      localHeight,
      scaleX: scaleX || 1,
      scaleY: scaleY || 1,
    };
  }

  function describeMetrics(metrics) {
    return {
      stageRect: simplifyViewportRect(metrics.stageRect),
      overlayRect: simplifyViewportRect(metrics.overlayRect),
      localWidth: round(metrics.localWidth),
      localHeight: round(metrics.localHeight),
      scaleX: round(metrics.scaleX),
      scaleY: round(metrics.scaleY),
    };
  }

  function rectToStageCoords(rect, metrics) {
    return {
      x: (rect.left - metrics.overlayRect.left) / metrics.scaleX,
      y: (rect.top - metrics.overlayRect.top) / metrics.scaleY,
      w: rect.width / metrics.scaleX,
      h: rect.height / metrics.scaleY,
    };
  }

  function makeSvgEl(name) {
    return document.createElementNS('http://www.w3.org/2000/svg', name);
  }

  function clearWarning(warningEl) {
    if (!warningEl) return;
    warningEl.hidden = true;
    warningEl.textContent = '';
  }

  function clearDebug(debugEl, enabled) {
    if (!debugEl) return;
    debugEl.hidden = !enabled;
    debugEl.textContent = '';
  }

  function setWarning(warningEl, log, message) {
    log('warning', message);
    if (!warningEl) return;
    warningEl.hidden = false;
    warningEl.textContent = message;
  }

  function clearStage(stage, overlays, warningEl, debugEl, debugEnabled) {
    overlays.forEach(function (overlay) {
      if (overlay) overlay.innerHTML = '';
    });
    Array.prototype.forEach.call(stage.querySelectorAll('.eqann-box'), function (box) {
      box.remove();
    });
    clearWarning(warningEl);
    clearDebug(debugEl, debugEnabled);
  }

  function updateOverlaySize(overlay, metrics) {
    if (!overlay) return;
    overlay.setAttribute('width', String(metrics.localWidth));
    overlay.setAttribute('height', String(metrics.localHeight));
    overlay.setAttribute('viewBox', '0 0 ' + metrics.localWidth + ' ' + metrics.localHeight);
  }

  function measureBox(stage, note, theme, metrics) {
    const box = document.createElement('div');
    box.className = 'eqann-box';
    box.style.left = '-99999px';
    box.style.top = '-99999px';
    box.style.borderColor = theme.softStroke;
    box.style.color = theme.stroke;
    box.style.background = theme.boxBg;
    box.textContent = note;
    stage.appendChild(box);
    const rect = rectToStageCoords(box.getBoundingClientRect(), metrics);
    box.remove();

    return {
      w: rect.w,
      h: rect.h,
    };
  }

  function clipSegmentToRectBoundary(rect, fromPoint, toPoint) {
    const cx = fromPoint.x;
    const cy = fromPoint.y;
    const dx = toPoint.x - cx;
    const dy = toPoint.y - cy;
    const candidates = [];
    const eps = 1e-9;

    if (Math.abs(dx) > eps) {
      [rect.x, rect.x + rect.w].forEach(function (xEdge) {
        const t = (xEdge - cx) / dx;
        if (t > 0 && t <= 1) {
          const y = cy + t * dy;
          if (y >= rect.y - eps && y <= rect.y + rect.h + eps) {
            candidates.push({ t: t, x: xEdge, y: y });
          }
        }
      });
    }

    if (Math.abs(dy) > eps) {
      [rect.y, rect.y + rect.h].forEach(function (yEdge) {
        const t = (yEdge - cy) / dy;
        if (t > 0 && t <= 1) {
          const x = cx + t * dx;
          if (x >= rect.x - eps && x <= rect.x + rect.w + eps) {
            candidates.push({ t: t, x: x, y: yEdge });
          }
        }
      });
    }

    if (!candidates.length) {
      return { x: cx, y: cy };
    }

    candidates.sort(function (left, right) { return left.t - right.t; });
    return { x: candidates[0].x, y: candidates[0].y };
  }

  function computeMathBounds(stage, math, metrics) {
    const mathRect = math.getBoundingClientRect();
    const mjx = math.querySelector('mjx-container');
    const targetRect = mjx ? mjx.getBoundingClientRect() : mathRect;

    return rectToStageCoords(targetRect, metrics);
  }

  function intersects(candidate, existing) {
    return (
      candidate.x < existing.x + existing.w + HORIZONTAL_GAP
      && candidate.x + candidate.w + HORIZONTAL_GAP > existing.x
    );
  }

  function chooseBandPlacement(targetRect, size, side, placedSide, mathRect, stageWidth) {
    const targetCenterX = targetRect.x + targetRect.w / 2;
    const maxX = Math.max(0, stageWidth - size.w);
    let x = clamp(targetCenterX - size.w / 2, 0, maxX);
    const sorted = placedSide.slice().sort(function (left, right) { return left.x - right.x; });
    let moved = true;

    while (moved) {
      moved = false;

      for (let index = 0; index < sorted.length; index += 1) {
        const existing = sorted[index];
        const candidate = { x: x, y: 0, w: size.w, h: size.h };

        if (!intersects(candidate, existing)) continue;

        const shifted = existing.x + existing.w + HORIZONTAL_GAP;
        const nextX = clamp(shifted, 0, maxX);

        if (Math.abs(nextX - x) < 0.5) continue;

        x = nextX;
        moved = true;
      }
    }

    return {
      x: x,
      y: side === 'top'
        ? Math.max(0, mathRect.y - BAND_MARGIN - size.h)
        : mathRect.y + mathRect.h + BAND_MARGIN,
      w: size.w,
      h: size.h,
      side: side,
    };
  }

  function parseAnnotations(stage) {
    const dataEl = stage.querySelector('.eqann-data');
    if (!dataEl) return [];

    try {
      const parsed = JSON.parse(dataEl.textContent || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      emitConsoleLog(['annotations:parse error', String(error)]);
      return [];
    }
  }

  function renderStage(stage) {
    const math = stage.querySelector('.eqann-math');
    const backOverlay = stage.querySelector('.eqann-overlay-back');
    const frontOverlay = stage.querySelector('.eqann-overlay-front');
    const warningEl = stage.parentElement ? stage.parentElement.querySelector('.eqann-warning') : null;
    const debugEnabled = isDebugEnabled();
    const debugEl = stage.parentElement ? stage.parentElement.querySelector('.eqann-debug') : null;
    const log = createLogger(debugEnabled ? debugEl : null);

    if (!math || !backOverlay || !frontOverlay) return;
    if (stage.clientWidth <= 0 || stage.clientHeight <= 0) return;

    clearStage(stage, [backOverlay, frontOverlay], warningEl, debugEl, debugEnabled);

    const annotations = parseAnnotations(stage);
    if (!annotations.length) return;

    log('preprocess:start');
    log('preprocess:annotations', annotations);

    const measurementMetrics = getStageMetrics(stage, frontOverlay);
    log('stage:metrics:measure', describeMetrics(measurementMetrics));

    const measured = annotations.map(function (annotation, index) {
      const theme = buildTheme(annotation.color || TAB10_COLORS[index % TAB10_COLORS.length]);
      return {
        ann: annotation,
        theme: theme,
        side: index % 2 === 0 ? 'top' : 'bottom',
        size: measureBox(stage, annotation.note || '', theme, measurementMetrics),
      };
    });

    const topBandHeight = measured
      .filter(function (item) { return item.side === 'top'; })
      .reduce(function (maxHeight, item) { return Math.max(maxHeight, item.size.h); }, 0);
    const bottomBandHeight = measured
      .filter(function (item) { return item.side === 'bottom'; })
      .reduce(function (maxHeight, item) { return Math.max(maxHeight, item.size.h); }, 0);

    stage.style.setProperty('--eqann-top-band', Math.max(0, topBandHeight + BAND_MARGIN) + 'px');
    stage.style.setProperty('--eqann-bottom-band', Math.max(0, bottomBandHeight + BAND_MARGIN) + 'px');

    log('mathjax:before typeset');
    const metrics = getStageMetrics(stage, frontOverlay);
    const stageWidth = metrics.localWidth;
    updateOverlaySize(backOverlay, metrics);
    updateOverlaySize(frontOverlay, metrics);
    log('mathjax:after typeset');
    log('stage:metrics', describeMetrics(metrics));

    const mathRect = computeMathBounds(stage, math, metrics);
    log('overlay:math rect', simplifyLocalRect(mathRect));

    if (!mathRect || mathRect.w <= 0 || mathRect.h <= 0) return;

    const totalWidth = measured.reduce(function (sum, item) { return sum + item.size.w; }, 0);
    if (totalWidth > 1.5 * mathRect.w) {
      setWarning(warningEl, log, 'warning: 全 note の幅の総和が数式全体の幅の 1.5 倍を超えています。配置が混み合う可能性があります。');
    }

    const placedTop = [];
    const placedBottom = [];

    measured.forEach(function (item) {
      const targetEl = math.querySelector('.eqann-' + item.ann.id);
      if (!targetEl) {
        log('overlay:target missing', item.ann);
        return;
      }

      const targetViewportRect = targetEl.getBoundingClientRect();
      const targetRect = rectToStageCoords(targetViewportRect, metrics);
      log('overlay:target rect', {
        id: item.ann.id,
        raw: simplifyViewportRect(targetViewportRect),
        rect: simplifyLocalRect(targetRect),
      });

      const placedSide = item.side === 'top' ? placedTop : placedBottom;
      const pos = chooseBandPlacement(targetRect, item.size, item.side, placedSide, mathRect, stageWidth);
      placedSide.push(pos);

      const highlight = makeSvgEl('rect');
      highlight.setAttribute('x', String(targetRect.x));
      highlight.setAttribute('y', String(targetRect.y));
      highlight.setAttribute('width', String(targetRect.w));
      highlight.setAttribute('height', String(targetRect.h));
      highlight.setAttribute('fill', item.theme.fill);
      highlight.setAttribute('stroke', 'none');
      highlight.setAttribute('rx', '0');
      highlight.setAttribute('ry', '0');
      backOverlay.appendChild(highlight);

      const box = document.createElement('div');
      box.className = 'eqann-box';
      box.textContent = item.ann.note || '';
      box.style.left = pos.x + 'px';
      box.style.top = pos.y + 'px';
      box.style.borderColor = item.theme.softStroke;
      box.style.color = item.theme.stroke;
      box.style.background = item.theme.boxBg;
      stage.appendChild(box);

      const boxViewportRect = box.getBoundingClientRect();
      const boxRect = rectToStageCoords(boxViewportRect, metrics);
      pos.x = boxRect.x;
      pos.y = boxRect.y;
      pos.w = boxRect.w;
      pos.h = boxRect.h;
      log('overlay:box rect', {
        id: item.ann.id,
        raw: simplifyViewportRect(boxViewportRect),
        rect: simplifyLocalRect(boxRect),
      });

      const targetCenter = {
        x: targetRect.x + targetRect.w / 2,
        y: targetRect.y + targetRect.h / 2,
      };
      const boxCenter = {
        x: pos.x + pos.w / 2,
        y: pos.y + pos.h / 2,
      };
      const clippedStart = clipSegmentToRectBoundary(targetRect, targetCenter, boxCenter);
      const clippedEnd = clipSegmentToRectBoundary(pos, boxCenter, targetCenter);

      const line = makeSvgEl('line');
      line.setAttribute('x1', String(clippedStart.x));
      line.setAttribute('y1', String(clippedStart.y));
      line.setAttribute('x2', String(clippedEnd.x));
      line.setAttribute('y2', String(clippedEnd.y));
      line.setAttribute('stroke', item.theme.stroke);
      line.setAttribute('stroke-opacity', '0.9');
      line.setAttribute('stroke-width', '1.4');
      frontOverlay.appendChild(line);
    });
  }

  let resizeObserver = null;
  let scheduled = false;
  let initialized = false;

  function renderAll() {
    scheduled = false;
    Array.prototype.forEach.call(document.querySelectorAll('.eqann-stage'), function (stage) {
      renderStage(stage);
    });
  }

  function scheduleRenderAll() {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(renderAll);
  }

  function init() {
    if (initialized) {
      scheduleRenderAll();
      return;
    }

    initialized = true;

    if (typeof ResizeObserver === 'function') {
      resizeObserver = new ResizeObserver(function () {
        scheduleRenderAll();
      });

      Array.prototype.forEach.call(document.querySelectorAll('.eqann-stage'), function (stage) {
        resizeObserver.observe(stage);
      });
    }

    window.addEventListener('resize', scheduleRenderAll);
    window.setTimeout(scheduleRenderAll, 0);
    window.setTimeout(scheduleRenderAll, 100);
    scheduleRenderAll();
  }

  document.addEventListener('DOMContentLoaded', init);
  window.addEventListener('load', init);

  if (document.readyState !== 'loading') {
    init();
  }
}

function buildRuntimeScriptTag() {
  return `<script>(${mathAnnotationRuntime.toString()})();</script>`;
}

export function collectMathAnnotations(source, options = {}) {
  const { lines, hasTrailingNewline } = splitLinesPreservingEOF(source);
  const outputLines = [];
  const annotations = [];
  let annotationId = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const annotatedLine = buildAnnotatedLine(line, annotationId + 1, {
      lineNumber: index + 1,
      onWarning: options.onWarning,
    });

    if (!annotatedLine) {
      outputLines.push(line);
      continue;
    }

    if (annotatedLine.annotation) {
      annotationId += 1;
      annotations.push(annotatedLine.annotation);
    }

    outputLines.push(annotatedLine.line);
  }

  return {
    math: joinLines(outputLines, hasTrailingNewline),
    annotations,
  };
}

export function renderAnnotatedMathBlock(renderedMathHtml, annotationData, options = {}) {
  const annotations = Array.isArray(annotationData?.annotations) ? annotationData.annotations : [];
  if (annotations.length === 0) return renderedMathHtml;

  const annotationsJson = escapeJsonForHtml(annotations);
  const runtimeScript = options.injectRuntime ? buildRuntimeScriptTag() : '';

  return (
    runtimeScript +
    `<div class="marp-math-block has-annotations">` +
    `<div class="eqann-stage">` +
    `<svg class="eqann-overlay eqann-overlay-back" aria-hidden="true"></svg>` +
    `<div class="eqann-math">${renderedMathHtml}</div>` +
    `<svg class="eqann-overlay eqann-overlay-front" aria-hidden="true"></svg>` +
    `<script type="application/json" class="eqann-data">${annotationsJson}</script>` +
    `</div>` +
    `<div class="eqann-warning" hidden></div>` +
    `<pre class="eqann-debug" hidden></pre>` +
    `</div>`
  );
}

export default collectMathAnnotations;
