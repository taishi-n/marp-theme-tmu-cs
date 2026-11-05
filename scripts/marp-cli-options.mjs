import { enginePath, themePath } from '../src/core/package-paths.mjs';

function hasOption(args, optionName) {
  return args.some((arg) => (
    arg === optionName
    || arg.startsWith(`${optionName}=`)
  ));
}

export function applyTmuCsDefaults(args, options = {}) {
  const terminatorIndex = args.indexOf('--');
  const optionArgs = terminatorIndex === -1 ? [...args] : args.slice(0, terminatorIndex);
  const positionalTail = terminatorIndex === -1 ? [] : args.slice(terminatorIndex);

  if (!hasOption(optionArgs, '--engine')) {
    optionArgs.push('--engine', enginePath);
  }

  if (options.themeSet !== false && !hasOption(optionArgs, '--theme-set')) {
    optionArgs.push('--theme-set', themePath);
  }

  return [...optionArgs, ...positionalTail];
}

export { detectOutputFormat } from '../src/core/output-format.mjs';
