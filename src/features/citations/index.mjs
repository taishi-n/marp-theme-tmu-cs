import { preprocessCitationsWithBackend } from './core.mjs';
import createJsCitationBackend from './backends/js.mjs';

export function preprocessCitationMarkdown(markdown, options = {}) {
  return preprocessCitationsWithBackend(markdown, createJsCitationBackend(options), options);
}

export { createJsCitationBackend, preprocessCitationsWithBackend };

export default {
  createJsCitationBackend,
  preprocessMarkdown: preprocessCitationMarkdown,
};
