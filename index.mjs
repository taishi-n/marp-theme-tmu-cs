import { fileURLToPath } from 'node:url';

export const themeName = 'tmu-cs';
export const enginePath = fileURLToPath(new URL('./engine.mjs', import.meta.url));
export const themePath = fileURLToPath(new URL('./theme/tmu-cs.css', import.meta.url));
export const defaultCslPath = fileURLToPath(new URL('./vendor/csl/ieee.csl', import.meta.url));

export { default as marpEngine } from './engine.mjs';
