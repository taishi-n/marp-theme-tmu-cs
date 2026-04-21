import { preprocessCitationsWithBackend } from './core.mjs';
import createJsCitationBackend from './backends/js.mjs';
import createPandocCitationBackend from './backends/pandoc.mjs';

export function preprocessCitationMarkdown(markdown, options = {}) {
  const backendMode = options.citationBackend ?? 'auto';

  if (backendMode === 'js') {
    return preprocessCitationsWithBackend(markdown, createJsCitationBackend(options), options);
  }

  if (backendMode === 'pandoc') {
    return preprocessCitationsWithBackend(markdown, createPandocCitationBackend(options), options);
  }

  try {
    return preprocessCitationsWithBackend(markdown, createJsCitationBackend(options), options);
  } catch (jsError) {
    const message = jsError instanceof Error ? jsError.message : String(jsError);
    options.onWarning?.({
      message: `JS citation backend fell back to Pandoc. ${message}`,
    });
    return preprocessCitationsWithBackend(markdown, createPandocCitationBackend(options), options);
  }
}

export { createJsCitationBackend, createPandocCitationBackend, preprocessCitationsWithBackend };

export default {
  createJsCitationBackend,
  createPandocCitationBackend,
  preprocessMarkdown: preprocessCitationMarkdown,
};
