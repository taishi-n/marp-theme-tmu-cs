import { enginePath, themePath } from '../index.mjs';

function hasOption(args, optionName) {
  return args.some((arg) => (
    arg === optionName
    || arg.startsWith(`${optionName}=`)
  ));
}

export function applyTmuCsDefaults(args) {
  const terminatorIndex = args.indexOf('--');
  const optionArgs = terminatorIndex === -1 ? [...args] : args.slice(0, terminatorIndex);
  const positionalTail = terminatorIndex === -1 ? [] : args.slice(terminatorIndex);

  if (!hasOption(optionArgs, '--engine')) {
    optionArgs.push('--engine', enginePath);
  }

  if (!hasOption(optionArgs, '--theme-set')) {
    optionArgs.push('--theme-set', themePath);
  }

  return [...optionArgs, ...positionalTail];
}

export function findOutputPath(args) {
  const terminatorIndex = args.indexOf('--');
  const optionArgs = terminatorIndex === -1 ? args : args.slice(0, terminatorIndex);

  for (let index = 0; index < optionArgs.length; index += 1) {
    const argument = optionArgs[index];
    if (argument === '-o' || argument === '--output') return optionArgs[index + 1];
    if (argument.startsWith('--output=')) return argument.slice('--output='.length);
  }
  return undefined;
}

export function detectOutputFormat(args) {
  const terminatorIndex = args.indexOf('--');
  const optionArgs = terminatorIndex === -1 ? args : args.slice(0, terminatorIndex);
  if (optionArgs.includes('--pdf')) return 'pdf';
  if (optionArgs.includes('--pptx')) return 'pptx';
  if (optionArgs.some((arg) => arg === '--image' || arg.startsWith('--image='))) return 'image';
  if (optionArgs.some((arg) => arg === '--images' || arg.startsWith('--images='))) return 'images';
  if (optionArgs.includes('--notes')) return 'notes';

  const outputPath = findOutputPath(optionArgs)?.toLowerCase();
  if (outputPath?.endsWith('.pdf')) return 'pdf';
  if (outputPath?.endsWith('.pptx')) return 'pptx';
  if (/\.(?:jpe?g|png)$/u.test(outputPath ?? '')) return 'image';
  if (outputPath?.endsWith('.txt')) return 'notes';
  return 'html';
}
