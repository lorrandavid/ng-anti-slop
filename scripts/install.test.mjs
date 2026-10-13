import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const script = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../skills/install-ng-anti-slop/scripts/install.mjs',
);
const directories = [];

function install(manifest) {
  const directory = mkdtempSync(join(tmpdir(), 'ng-anti-slop-install-'));
  directories.push(directory);
  writeFileSync(join(directory, 'package.json'), JSON.stringify(manifest));
  execFileSync('node', [script], { cwd: directory, stdio: 'pipe' });
  return readFileSync(join(directory, 'eslint.config.js'), 'utf8');
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true });
});

describe('install script', () => {
  it('adds the NgRx type-checked config when the repository uses @ngrx/store', () => {
    const config = install({ dependencies: { '@ngrx/store': '19.0.0' } });
    assert.match(config, /^import ngrx from '@ngrx\/eslint-plugin';$/m);
    assert.match(config, /^\s+\.\.\.ngrx\.configs\.allTypeChecked,$/m);
  });

  it('detects @ngrx/store in devDependencies', () => {
    const config = install({ devDependencies: { '@ngrx/store': '19.0.0' } });
    assert.match(config, /ngrx\.configs\.allTypeChecked/);
  });

  it('leaves NgRx out when the repository does not use @ngrx/store', () => {
    const config = install({ dependencies: { '@angular/core': '19.0.0' } });
    assert.doesNotMatch(config, /ngrx/);
  });

  it('points the plugin import at the copied directory', () => {
    const config = install({});
    assert.match(config, /'\.\/tools\/eslint\/ng-anti-slop\/index\.js'/);
  });
});
