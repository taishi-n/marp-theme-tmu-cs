import { Marp as FullMarp } from '@marp-team/marp-core/full';
import mathJaxPlugin from '@marp-team/marp-core/plugins/mathjax';
import katexPlugin from '@marp-team/marp-core/plugins/katex';
import shikiPlugin from '@marp-team/marp-core/plugins/shiki';
import mermaidPlugin from '@marp-team/marp-core/plugins/mermaid';

export function initializeMarp(options, outputFormat) {
  const lazyMarp = Object.getOwnPropertyDescriptor(options, 'marp')?.get;
  let marp = lazyMarp ? undefined : options.marp;
  const constructorOptions = marp?.options ?? Object.fromEntries(
    Object.keys(options).filter((key) => key !== 'marp').map((key) => [key, options[key]]),
  );
  const emoji = outputFormat === 'html'
    ? { ...constructorOptions.emoji, shortcode: true, unicode: false }
    : constructorOptions.emoji;

  if (!marp || !Array.isArray(marp.shikiTransformers)) {
    // Use the explicit Core v5 dependency without constructing CLI's unused Core.
    marp = new FullMarp({ ...constructorOptions, emoji });
  } else if (outputFormat === 'html') {
    const Core = marp.constructor;
    marp = new Core({ ...constructorOptions, emoji });
  }

  // Fresh lightweight Core instances need the same public plugins as /full.
  if (!(marp instanceof FullMarp)) {
    marp.use(mathJaxPlugin()).use(katexPlugin()).use(shikiPlugin()).use(mermaidPlugin());
  }
  return marp;
}
