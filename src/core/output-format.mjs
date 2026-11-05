const formats = new Set(['html', 'image', 'images', 'notes', 'pdf', 'pptx']);
const booleanOptions = new Map([
  ['pdf', 'pdf'], ['pptx', 'pptx'], ['notes', 'notes'], ['pdf-notes', 'pdfNotes'],
  ['pdf-outlines', 'pdfOutlines'], ['pptx-editable', 'pptxEditable'],
]);

function formatArguments(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--') break;
    const [option, assigned] = argument.split(/=(.*)/su);
    const positive = option.replace(/^--no-/u, '--');
    const key = booleanOptions.get(positive.slice(2));
    if (key) {
      const next = args[index + 1];
      const value = assigned ?? (['true', 'false'].includes(next) ? args[++index] : undefined);
      options[key] = !option.startsWith('--no-') && value !== 'false';
    } else if (option === '-o' || option === '--output') {
      options.output = assigned ?? args[++index];
    } else if (option === '--image' || option === '--images') {
      const next = args[index + 1];
      options[option.slice(2)] = assigned ?? (next && !next.startsWith('-') ? args[++index] : 'png');
    }
  }
  return options;
}

// Config data is supplied by the config module itself; CLI keeps ownership of
// locating and loading it. Match Marp CLI's flag/config/extension precedence.
export function detectOutputFormat(args = [], config = {}) {
  const options = formatArguments(args);
  if (options.pdf || config.pdf) return 'pdf';
  if (options.pptx || config.pptx) return 'pptx';
  if (options.notes || config.notes) return 'notes';
  if (options.images || config.images || options.image || config.image) return options.images || config.images ? 'images' : 'image';
  const output = String(options.output ?? config.output ?? '').toLowerCase();
  if (/\.html?$/u.test(output)) return 'html';
  if (output.endsWith('.pdf')) return 'pdf';
  if (output.endsWith('.pptx')) return 'pptx';
  if (/\.(?:jpe?g|png)$/u.test(output)) return 'image';
  if (output.endsWith('.txt')) return 'notes';
  const outlines = options.pdfOutlines ?? config.pdfOutlines;
  const hasOutlines = outlines && (typeof outlines !== 'object' || outlines.pages !== false || outlines.headings !== false);
  if ((options.pdf ?? config.pdf) !== false && (options.pdfNotes || config.pdfNotes || hasOutlines)) return 'pdf';
  if ((options.pptx ?? config.pptx) !== false && (options.pptxEditable || config.pptxEditable)) return 'pptx';
  return 'html';
}

export function validateOutputFormat(format) {
  if (!formats.has(format)) throw new Error('[tmu-cs] outputFormat must be html, image, images, notes, pdf, or pptx.');
  return format;
}
