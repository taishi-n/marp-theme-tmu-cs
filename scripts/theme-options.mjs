/** Consume wrapper options while preserving Marp arguments and the -- boundary. */
export function parseThemeOptions(args) {
  const options = { args: [], standalone: false, editLabels: false, slideIndex: undefined, themeOverrides: [] };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--') {
      options.args.push(...args.slice(index));
      break;
    }
    if (argument === '--standalone') options.standalone = true;
    else if (argument === '--edit-labels') options.editLabels = true;
    else if (['--slide-index', '--theme-overrides'].some((name) => argument === name || argument.startsWith(`${name}=`))) {
      const name = argument.split('=')[0];
      const value = argument.includes('=') ? argument.slice(argument.indexOf('=') + 1) : args[++index];
      if (!value || value.startsWith('-')) throw new Error(`${name} requires ${name === '--slide-index' ? 'an output path' : 'a stylesheet path'}.`);
      if (name === '--slide-index') options.slideIndex = value;
      else options.themeOverrides.push(value);
    } else options.args.push(argument);
  }
  return options;
}
