import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { inlineStylesheetAssets } from './standalone-assets.mjs';

export function loadThemeOverrides(paths, options = {}) {
  return paths.map((path) => {
    const stylesheetPath = resolve(path);
    const css = readFileSync(stylesheetPath, 'utf8');
    if (/^\s*@import\b/mu.test(css.replace(/\/\*[\s\S]*?\*\//gu, '')) || /@theme\s+\S+/u.test(css)) {
      throw new Error('[tmu-cs] --theme-overrides accepts override declarations without @theme or @import.');
    }
    return inlineStylesheetAssets(css, { ...options, stylesheetPath });
  }).join('\n');
}
