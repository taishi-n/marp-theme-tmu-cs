import processCitations from '../../markdown/process-citations.mjs';

export function preprocessCitationMarkdown(markdown, options = {}) {
  return processCitations(markdown, options);
}

export default {
  preprocessMarkdown: preprocessCitationMarkdown,
};
