import { fileURLToPath } from 'node:url';

export const themeName = 'tmu-cs';
export const enginePath = fileURLToPath(new URL('./engine.mjs', import.meta.url));
export const themePath = fileURLToPath(new URL('./theme/tmu-cs.css', import.meta.url));
export const defaultCslPath = fileURLToPath(new URL('./vendor/csl/ieee.csl', import.meta.url));
export const pandocCitationFilterPath = fileURLToPath(new URL('./src/pandoc/citation-placeholder.lua', import.meta.url));

export { default as marpEngine } from './engine.mjs';

export { default as processCitations } from './src/markdown/process-citations.mjs';
export { expandStepSlides } from './src/markdown/expand-step-slides.mjs';
export { resolveExternalCode } from './src/markdown/resolve-external-code.mjs';

export {
  collectMathAnnotations,
  default as collectMathAnnotationsDefault,
  renderAnnotatedMathBlock,
} from './src/math/annotate-math-block.mjs';

export {
  createAnnotateTransformer,
  inspectAnnotatedCodeBlock,
} from './src/shiki/annotate-transformer.mjs';

export { parseAnnotateDirective } from './src/shiki/parse-annotate-directive.mjs';
export { parseStepDirective } from './src/shiki/parse-step-directive.mjs';
