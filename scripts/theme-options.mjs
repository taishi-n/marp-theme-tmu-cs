/** Consume wrapper options while preserving Marp arguments and the -- boundary. */
export function parseThemeOptions(args) {
  const options = { args: [], standalone: false, editLabels: false, slideIndex: undefined };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--') {
      options.args.push(...args.slice(index));
      break;
    }
    if (argument === '--standalone') options.standalone = true;
    else if (argument === '--edit-labels') options.editLabels = true;
    else if (argument === '--slide-index' || argument.startsWith('--slide-index=')) {
      const value = argument.includes('=') ? argument.slice(argument.indexOf('=') + 1) : args[++index];
      if (!value || value.startsWith('-')) throw new Error('--slide-index requires an output path.');
      options.slideIndex = value;
    } else options.args.push(argument);
  }
  return options;
}
