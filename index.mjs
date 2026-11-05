export { themeName, enginePath, themePath, defaultCslPath } from './src/core/package-paths.mjs';

import marpEngine from './engine.mjs';
import { detectOutputFormat } from './src/core/output-format.mjs';

export { marpEngine };

export function defineTmuCsConfig(config = {}, args = process.argv.slice(2)) {
  return {
    engine: marpEngine,
    ...config,
    options: { ...config.options, outputFormat: detectOutputFormat(args, config) },
  };
}
