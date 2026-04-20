import parseAnnotateDirective from './parse-annotate-directive.mjs';

const META_KEY = '__tmuCsAnnotate';

function isLineElement(node) {
  if (node?.type !== 'element' || node.tagName !== 'span') return false;

  const classes = node.properties?.class;
  if (Array.isArray(classes)) return classes.includes('line');
  return classes === 'line';
}

function splitLinesPreservingEOF(source) {
  const normalized = String(source ?? '').replace(/\r\n/g, '\n');
  const hasTrailingNewline = normalized.endsWith('\n');
  const body = hasTrailingNewline ? normalized.slice(0, -1) : normalized;
  const lines = body.length === 0 ? [''] : body.split('\n');

  return { lines, hasTrailingNewline };
}

function joinLines(lines, hasTrailingNewline) {
  const joined = lines.join('\n');
  return hasTrailingNewline ? `${joined}\n` : joined;
}

function isCommentOnlyLine(line) {
  return /^\s*\/\//.test(line);
}

function isActualCodeLine(line) {
  const trimmed = line.trim();
  return trimmed.length > 0 && !isCommentOnlyLine(line);
}

function stripTrailingWhitespace(line) {
  return line.replace(/[ \t]+$/u, '');
}

function extractAnnotateComment(line) {
  const markerIndex = line.indexOf('[!annotate');
  if (markerIndex === -1) return null;

  const commentStart = line.lastIndexOf('//', markerIndex);
  if (commentStart === -1) return null;

  const beforeComment = line.slice(0, commentStart);

  return {
    beforeComment,
    comment: line.slice(commentStart),
    isCommentOnly: beforeComment.trim().length === 0,
  };
}

function formatLineList(lineNumbers) {
  if (lineNumbers.length === 0) return '';

  const ranges = [];
  let start = lineNumbers[0];
  let end = lineNumbers[0];

  for (let index = 1; index < lineNumbers.length; index += 1) {
    const lineNumber = lineNumbers[index];

    if (lineNumber === end + 1) {
      end = lineNumber;
      continue;
    }

    ranges.push(start === end ? `${start}` : `${start}-${end}`);
    start = lineNumber;
    end = lineNumber;
  }

  ranges.push(start === end ? `${start}` : `${start}-${end}`);
  return `L${ranges.join(', ')}`;
}

function createTextNode(value) {
  return { type: 'text', value };
}

function createElement(tagName, properties = {}, children = []) {
  return { type: 'element', tagName, properties, children };
}

function createAnnotationListNode(annotations) {
  return createElement(
    'div',
    { class: ['code-annotations'] },
    annotations.map((annotation) =>
      createElement(
        'div',
        {
          class: ['code-annotation'],
          'data-lines': annotation.displayLines.join(','),
        },
        [
          createElement('span', { class: ['code-annotation-lines'] }, [createTextNode(formatLineList(annotation.displayLines))]),
          createElement('span', { class: ['code-annotation-label'] }, [createTextNode(annotation.label)]),
          createElement('span', { class: ['code-annotation-note'] }, [createTextNode(annotation.note)]),
        ],
      ),
    ),
  );
}

function collectAnnotateMetadata(source, options = {}) {
  const { lines, hasTrailingNewline } = splitLinesPreservingEOF(source);
  const strippedLines = [];
  const actualCodeSourceLines = [];
  const pendingAnnotations = [];

  const warn = (lineNumber, message) => {
    options.onWarning?.({
      line: options.sourceLineOffset ? options.sourceLineOffset + lineNumber : lineNumber,
      message,
    });
  };

  const findPreviousActualCodeLine = () => actualCodeSourceLines.at(-1) ?? null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const directiveComment = extractAnnotateComment(line);

    if (!directiveComment) {
      strippedLines.push(line);

      if (isActualCodeLine(line)) actualCodeSourceLines.push(strippedLines.length);
      continue;
    }

    const sanitizedLine = directiveComment.isCommentOnly ? null : stripTrailingWhitespace(directiveComment.beforeComment);
    let currentSourceLine = null;

    if (sanitizedLine !== null) {
      strippedLines.push(sanitizedLine);
      currentSourceLine = strippedLines.length;

      if (isActualCodeLine(sanitizedLine)) actualCodeSourceLines.push(currentSourceLine);
    }

    const directive = parseAnnotateDirective(directiveComment.comment, {
      lineNumber: index + 1,
      onWarning: ({ line, message }) => warn(line ?? index + 1, message),
    });

    if (!directive) continue;

    const anchorSourceLine = currentSourceLine && isActualCodeLine(sanitizedLine ?? '')
      ? currentSourceLine
      : findPreviousActualCodeLine();

    if (!anchorSourceLine) {
      warn(index + 1, 'annotate directive has no preceding actual code line to attach to.');
      continue;
    }

    pendingAnnotations.push({
      label: directive.label,
      note: directive.note,
      range: directive.range,
      anchorSourceLine,
      sourceLines: [],
      attrs: directive.attrs,
      lineNumber: index + 1,
    });
  }

  const annotations = pendingAnnotations.flatMap((annotation) => {
    const anchorPosition = actualCodeSourceLines.indexOf(annotation.anchorSourceLine);
    const targetSourceLines = actualCodeSourceLines.slice(anchorPosition, anchorPosition + annotation.range);

    if (targetSourceLines.length === 0) {
      warn(annotation.lineNumber, 'annotate directive resolved to an empty target range.');
      return [];
    }

    return [{
      label: annotation.label,
      note: annotation.note,
      range: annotation.range,
      sourceLines: targetSourceLines,
      displayLines: [],
      attrs: annotation.attrs,
    }];
  });

  return {
    code: joinLines(strippedLines, hasTrailingNewline),
    annotations,
  };
}

export function inspectAnnotatedCodeBlock(source) {
  const { code, annotations } = collectAnnotateMetadata(source, {});

  return {
    annotationCount: annotations.length,
    lineCount: splitLinesPreservingEOF(code).lines.length,
  };
}

export function createAnnotateTransformer(options = {}) {
  return {
    name: 'tmu-cs:annotate',

    preprocess(code) {
      this.meta[META_KEY] = collectAnnotateMetadata(code, options);
      return this.meta[META_KEY].code;
    },

    line(node, lineNumber) {
      node.properties ??= {};
      node.properties['data-source-line'] = String(lineNumber);
      return node;
    },

    code(node) {
      const state = this.meta[META_KEY];
      if (!state) return node;

      const lineNodes = node.children.filter(isLineElement);
      const lineNodeMap = new Map();
      const displayLineMap = new Map();

      lineNodes.forEach((lineNode, index) => {
        const sourceLine = Number.parseInt(String(lineNode.properties?.['data-source-line'] ?? ''), 10);
        if (Number.isFinite(sourceLine)) {
          lineNodeMap.set(sourceLine, lineNode);
          displayLineMap.set(sourceLine, index + 1);
        }
      });

      for (const annotation of state.annotations) {
        annotation.displayLines = annotation.sourceLines
          .map((sourceLine) => displayLineMap.get(sourceLine))
          .filter((lineNumber) => Number.isFinite(lineNumber));

        for (const sourceLine of annotation.sourceLines) {
          const lineNode = lineNodeMap.get(sourceLine);
          if (!lineNode) continue;

          this.addClassToHast(lineNode, 'has-annotation');
          lineNode.properties['data-annotated'] = 'true';
          lineNode.properties['data-label'] = annotation.label;
          lineNode.properties['data-note'] = annotation.note;
        }
      }

      for (const lineNode of lineNodes) {
        delete lineNode.properties['data-source-line'];
      }

      if (state.annotations.some((annotation) => annotation.displayLines.length > 0)) {
        this.addClassToHast(node, 'has-annotations');
      }

      return node;
    },

    pre(node) {
      this.addClassToHast(node, 'marp-code');

      const state = this.meta[META_KEY];
      if (state?.annotations.some((annotation) => annotation.displayLines.length > 0)) {
        this.addClassToHast(node, 'has-annotations');
      }

      return node;
    },

    root(node) {
      const state = this.meta[META_KEY];
      if (!state) return node;

      const visibleAnnotations = state.annotations.filter((annotation) => annotation.displayLines.length > 0);
      if (visibleAnnotations.length === 0) return node;

      node.children.push(createAnnotationListNode(visibleAnnotations));
      return node;
    },
  };
}

export default createAnnotateTransformer;
