function extractFenceLanguage(markdown, token) {
  const info = markdown.utils.unescapeAll(token.info ?? '').trim();
  if (info === '') return '';

  const [language = ''] = info.split(/\s+/u);
  return language.trim().toLowerCase();
}

export function installDiagramFeature(marp, options = {}) {
  const backend = options.backend;
  if (!backend || typeof backend.supports !== 'function' || typeof backend.renderFence !== 'function') {
    throw new TypeError('installDiagramFeature requires a backend with supports() and renderFence().');
  }

  const fallbackFence = marp.markdown.renderer.rules.fence;

  marp.markdown.renderer.rules.fence = (tokens, idx, renderOptions, env, self) => {
    const token = tokens[idx];
    const language = extractFenceLanguage(marp.markdown, token);

    if (backend.supports(language)) {
      const rendered = backend.renderFence({
        env,
        idx,
        info: token.info ?? '',
        language,
        renderOptions,
        source: token.content ?? '',
        token,
      });

      if (typeof rendered === 'string' && rendered !== '') return rendered;
    }

    return fallbackFence.call(self, tokens, idx, renderOptions, env, self);
  };
}

export default {
  install: installDiagramFeature,
};
