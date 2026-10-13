#!/usr/bin/env node
import { cpSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const skillRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(skillRoot, 'assets/ng-anti-slop');
const pluginSource = resolve(source, 'src');
const target = process.cwd();
// The plugin cannot stay in `src/`, which holds the application source in the target repository.
const pluginPath = 'tools/eslint/ng-anti-slop';

// Every file is a repository-root config the target probably already owns, so refuse before writing anything.
const files = readdirSync(source).filter((file) => file !== 'src');
const existing = [...files, pluginPath].filter((file) => existsSync(join(target, file)));
if (existing.length > 0) {
  console.error(`Refusing to overwrite: ${existing.join(', ')}. Merge these by hand instead.`);
  process.exit(1);
}

// Each edit anchors on a line of the bundled config. A missing anchor means the config changed
// shape, so fail before writing instead of guessing where the edit belongs.
function insertAfter(text, anchor, addition) {
  if (!text.includes(anchor)) {
    throw new Error(`Cannot find \`${anchor}\` in the bundled eslint.config.js.`);
  }
  return text.replace(anchor, `${anchor}\n${addition}`);
}

const manifest = JSON.parse(readFileSync(join(target, 'package.json'), 'utf8'));
const ngrxStoreVersion = { ...manifest.devDependencies, ...manifest.dependencies }['@ngrx/store'];

let config = readFileSync(join(source, 'eslint.config.js'), 'utf8').replace(
  "'./src/index.js'",
  `'./${pluginPath}/index.js'`,
);
if (ngrxStoreVersion !== undefined) {
  config = insertAfter(
    config,
    "import eslint from '@eslint/js';",
    "import ngrx from '@ngrx/eslint-plugin';",
  );
  config = insertAfter(
    config,
    '      angular.configs.tsRecommended,',
    '      ...ngrx.configs.allTypeChecked,',
  );
}

for (const file of files) cpSync(join(source, file), join(target, file));
cpSync(pluginSource, join(target, pluginPath), { recursive: true });
writeFileSync(join(target, 'eslint.config.js'), config);
console.log(`Copied ${files.join(', ')} and ${pluginPath} to ${target}`);
if (ngrxStoreVersion !== undefined) {
  console.log(
    `Found @ngrx/store (${ngrxStoreVersion}). Added ngrx.configs.allTypeChecked to eslint.config.js. ` +
      'Install @ngrx/eslint-plugin at the exact version of the installed @ngrx/store.',
  );
}
