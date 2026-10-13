import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const assetsRoot = join(root, 'skills/install-ng-anti-slop/assets');
const destination = join(assetsRoot, 'ng-anti-slop');
const pluginSource = join(root, 'src');
// The copy keeps the `./src/index.js` import of `eslint.config.js` resolvable.
const pluginDestination = join(destination, 'src');
const check = process.argv.includes('--check');

// The repository root files are canonical; the skill ships verbatim copies of them.
const assets = [
  'eslint.config.js',
  'tsconfig.json',
  '.prettierrc',
  '.prettierignore',
  '.editorconfig',
];

function pluginFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return pluginFiles(path);
    // Tests are development files, not part of the distribution.
    return entry.name.endsWith('.test.js') ? [] : [path];
  });
}

if (check) {
  for (const asset of assets) {
    const copy = join(destination, asset);
    if (
      !existsSync(copy) ||
      readFileSync(join(root, asset), 'utf8') !== readFileSync(copy, 'utf8')
    ) {
      throw new Error(`${asset} differs from its skill asset; run \`pnpm sync:skill-assets\`.`);
    }
  }
  const expected = pluginFiles(pluginSource)
    .map((path) => relative(pluginSource, path))
    .sort();
  const actual = existsSync(pluginDestination)
    ? pluginFiles(pluginDestination)
        .map((path) => relative(pluginDestination, path))
        .sort()
    : [];
  if (JSON.stringify(expected) !== JSON.stringify(actual)) {
    throw new Error('Skill assets differ from src; run `pnpm sync:skill-assets`.');
  }
  for (const path of expected) {
    if (
      readFileSync(join(pluginSource, path), 'utf8') !==
      readFileSync(join(pluginDestination, path), 'utf8')
    ) {
      throw new Error(`${path} differs from its skill asset; run \`pnpm sync:skill-assets\`.`);
    }
  }
  console.log('Skill assets match the root configuration.');
} else {
  rmSync(destination, { recursive: true, force: true });
  mkdirSync(destination, { recursive: true });
  for (const asset of assets) cpSync(join(root, asset), join(destination, asset));
  cpSync(pluginSource, pluginDestination, {
    recursive: true,
    filter: (path) => !path.endsWith('.test.js'),
  });
  console.log('Synced skills/install-ng-anti-slop/assets.');
}
