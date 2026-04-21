import { preprocessCitationMarkdown } from '../features/citations/index.mjs';

export default function processCitations(markdown, options = {}) {
  return preprocessCitationMarkdown(markdown, options);
}
