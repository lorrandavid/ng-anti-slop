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

for (const file of files) cpSync(join(source, file), join(target, file));
cpSync(pluginSource, join(target, pluginPath), { recursive: true });

const config = join(target, 'eslint.config.js');
writeFileSync(
  config,
  readFileSync(config, 'utf8').replace("'./src/index.js'", `'./${pluginPath}/index.js'`),
);
console.log(`Copied ${files.join(', ')} and ${pluginPath} to ${target}`);
