const directiveName = 'mediaPlayback';
const attributeName = 'data-media-playback';

export function normalizeMediaPlaybackMode(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized === 'sequential' || normalized === 'off' ? normalized : undefined;
}

export default function installMediaPlayback(marp, options = {}) {
  marp.customDirectives.local[directiveName] = (value) => {
    const mode = normalizeMediaPlaybackMode(value);
    if (mode === undefined) {
      options.onWarning?.(`Ignoring invalid mediaPlayback value "${value}". Use "sequential" or "off".`);
      return {};
    }

    return { mediaPlayback: mode };
  };

  // Marpit snapshots directive names when its engine is constructed. This
  // directive is registered later, so the built-in dataset pass cannot emit it.
  marp.markdown.core.ruler.after(
    'marpit_directives_apply',
    'tmu_cs_media_playback',
    (state) => {
      if (state.inlineMode) return;

      for (const token of state.tokens) {
        if (token.type !== 'marpit_slide_open') continue;
        if (token.meta?.marpitDirectives?.mediaPlayback === 'sequential') {
          token.attrSet(attributeName, 'sequential');
        }
      }
    },
  );
}
