import { realpathSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

export function resolveInputRoot(markdownPath) {
  const root = typeof markdownPath === 'string' && markdownPath !== ''
    ? dirname(resolve(markdownPath))
    : process.cwd();

  try {
    return realpathSync(root);
  } catch {
    return resolve(root);
  }
}

export function isPathInside(rootPath, targetPath) {
  const pathFromRoot = relative(rootPath, targetPath);
  return pathFromRoot === ''
    || (pathFromRoot !== '..' && !pathFromRoot.startsWith(`..${sep}`) && !isAbsolute(pathFromRoot));
}

export function resolveConstrainedFilePath(filePath, options = {}) {
  const realPath = realpathSync(filePath);
  const inputRoot = options.inputRoot ?? process.cwd();

  if (!options.allowOutsideRoot && !isPathInside(inputRoot, realPath)) {
    throw new Error(
      `path resolves outside the input root "${inputRoot}". Pass --allow-local-files only for trusted input to allow it.`,
    );
  }

  return realPath;
}
