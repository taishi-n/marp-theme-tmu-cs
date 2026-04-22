import { enginePath, themePath } from '../index.mjs';

function hasOption(args, optionName) {
  return args.some((arg, index) => (
    arg === optionName
    || arg.startsWith(`${optionName}=`)
    || (index > 0 && args[index - 1] === optionName)
  ));
}

export function applyTmuCsDefaults(args) {
  const normalizedArgs = [...args];

  if (!hasOption(normalizedArgs, '--engine')) {
    normalizedArgs.push('--engine', enginePath);
  }

  if (!hasOption(normalizedArgs, '--theme-set')) {
    normalizedArgs.push('--theme-set', themePath);
  }

  return normalizedArgs;
}
