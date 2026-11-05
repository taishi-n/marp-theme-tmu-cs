import { collectMathAnnotations, renderAnnotatedMathBlock } from './annotate-math-block.mjs';

function createWarningLogger(token, logPrefix) {
  const markdownStartLine = token.map?.[0];

  return ({ line, message }) => {
    const location = typeof line === 'number' ? `math block line ${line}` : 'math block';
    const block = typeof markdownStartLine === 'number' ? ` (math block starts near markdown line ${markdownStartLine + 1})` : '';
    console.warn(`${logPrefix} ${location}: ${message}${block}`);
  };
}

export function installMathFeature(marp, options = {}) {
  const defaultMathBlock = marp.markdown.renderer.rules.marp_math_block;
  const logPrefix = options.logPrefix;
  let shouldInjectMathAnnotationRuntime = true;

  marp.markdown.renderer.rules.marp_math_block = (tokens, idx, renderOptions, env, self) => {
    const token = tokens[idx];
    const originalContent = token.content;
    const mathAnnotations = collectMathAnnotations(originalContent, {
      onWarning: createWarningLogger(token, logPrefix),
    });

    try {
      token.content = mathAnnotations.math;
      const rendered = defaultMathBlock(tokens, idx, renderOptions, env, self);
      return renderAnnotatedMathBlock(rendered, mathAnnotations, {
        injectRuntime: shouldInjectMathAnnotationRuntime,
        renderInlineMath: (content) => {
          const inlineToken = new token.constructor('marp_math_inline', 'math', 0);
          inlineToken.content = content;
          inlineToken.markup = '$';
          return self.rules.marp_math_inline([inlineToken], 0, renderOptions, env, self);
        },
      });
    } finally {
      if (mathAnnotations.annotations.length > 0) shouldInjectMathAnnotationRuntime = false;
      token.content = originalContent;
    }
  };

  return {
    resetRuntimeInjection() {
      shouldInjectMathAnnotationRuntime = true;
    },
  };
}
