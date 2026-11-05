import { Marp as FullMarp } from '@marp-team/marp-core/full';
import mathJaxPlugin from '@marp-team/marp-core/plugins/mathjax';
import katexPlugin from '@marp-team/marp-core/plugins/katex';
import shikiPlugin from '@marp-team/marp-core/plugins/shiki';
import mermaidPlugin from '@marp-team/marp-core/plugins/mermaid';

export function initializeMarp(options, outputFormat) {
  const nativeEmoji = { shortcode: true, unicode: false };
  const lazyMarp = Object.getOwnPropertyDescriptor(options, 'marp')?.get;
  if (outputFormat === 'html' && lazyMarp) {
    options.emoji = { ...options.emoji, ...nativeEmoji };
  }

  let marp = options.marp;
  if (!marp || !Array.isArray(marp.shikiTransformers)) {
    // CLI can resolve its bundled Core v4 when run outside this package.
    // Select this package's explicit v5 dependency in that case.
    const constructorOptions = lazyMarp ? options : (marp?.options ?? options);
    marp = new FullMarp({
      ...constructorOptions,
      ...(outputFormat === 'html' && { emoji: { ...constructorOptions.emoji, ...nativeEmoji } }),
    });
  } else if (outputFormat === 'html' && !lazyMarp) {
    const Core = marp.constructor;
    marp = new Core({ ...marp.options, emoji: { ...marp.options.emoji, ...nativeEmoji } });
  }

  // Core v5's root export is lightweight. Fresh base instances need the same
  // public plugins as /full; full instances already installed them once.
  if (!(marp instanceof FullMarp)) {
    marp.use(mathJaxPlugin()).use(katexPlugin()).use(shikiPlugin()).use(mermaidPlugin());
  }
  return marp;
}
