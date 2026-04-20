function warn(options, message) {
  options.onWarning?.({
    line: options.lineNumber,
    message,
  });
}

const ACTION_ALIASES = new Map([
  ['highlight', 'highlight'],
  ['hl', 'highlight'],
  ['focus', 'focus'],
  ['warning', 'warning'],
  ['error', 'error'],
  ['info', 'info'],
]);

export function parseStepDirective(input, options = {}) {
  const raw = String(input ?? '');
  const start = raw.indexOf('[!step');

  if (start === -1) return null;

  const end = raw.lastIndexOf(']');
  if (end === -1 || end < start) {
    warn(options, 'step directive is missing a closing "]".');
    return null;
  }

  const directive = raw.slice(start + 1, end).trim();
  const match = directive.match(/^!step\s+(\d+)\s+([A-Za-z]+)(:\d+)?$/);

  if (!match) {
    warn(options, 'step directive must match `[!step <number> <highlight|focus|warning|error|info>[:N]]`.');
    return null;
  }

  const step = Number.parseInt(match[1], 10);
  if (!Number.isInteger(step) || step <= 0) {
    warn(options, 'step directive requires a positive step number.');
    return null;
  }

  const action = ACTION_ALIASES.get(match[2].toLowerCase());
  if (!action) {
    warn(options, `step directive action "${match[2]}" is not supported.`);
    return null;
  }

  const range = match[3] ? Number.parseInt(match[3].slice(1), 10) : 1;
  if (!Number.isInteger(range) || range <= 0) {
    warn(options, 'step directive range `:N` must be a positive integer.');
    return null;
  }

  return {
    step,
    action,
    range,
    raw: raw.slice(start, end + 1),
  };
}

export default parseStepDirective;
