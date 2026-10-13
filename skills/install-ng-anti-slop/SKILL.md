---
name: install-ng-anti-slop
description: Install, configure, or update the vendored ng-anti-slop ESLint, TypeScript and Prettier setup for an Angular 18+ repository. Use when adding ng-anti-slop, strict Angular linting, or picking up upstream configuration changes while preserving local customizations.
---

# Install or update ng-anti-slop

ng-anti-slop is vendored configuration: the target repository owns its ESLint, TypeScript and Prettier files. Preserve local choices when bringing in upstream changes.

## Choose the path

Read the repository's agent instructions and `git status`. Identify the package manager, the Angular version (`@angular/core`), the TypeScript version, and any existing ESLint, Prettier, `tsconfig` and `.editorconfig` files.

- **No existing lint setup:** follow the fresh install below.
- **Existing setup, or an update:** do not run the install script. Compare each bundled file in `assets/ng-anti-slop/` with the repository's file, merge the differences by hand, and ask before changing a policy the repository set on purpose. Complete when no local rule or option was lost.

## Fresh install

1. Copy the bundled files. Run from the target repository root:

   ```bash
   node <skill-directory>/scripts/install.mjs
   ```

   This copies `eslint.config.js`, `tsconfig.json`, `.prettierrc`, `.prettierignore`, and `.editorconfig`. It also copies the custom `ng-anti-slop` rules to `tools/eslint/ng-anti-slop/` and points the `eslint.config.js` import at that directory. The plugin cannot use `src/`, because that directory holds the application source. The script refuses to overwrite any existing file or directory. Complete when all five files and the plugin directory exist.

2. Install current compatible dev dependencies. Query `npm view <package> version` rather than trusting remembered versions, and pin exact versions:
   - `eslint`, `@eslint/js`, `angular-eslint`, `typescript-eslint`, `eslint-config-prettier`
   - `prettier`, `prettier-plugin-organize-imports`
   - `typescript`, only if missing. Keep the version the installed Angular supports (Angular 18 needs TypeScript 5.4 or 5.5).

   ESLint 10 needs Node 20.19 or later; use ESLint 9 on older Node. If the repository already has any of these packages, keep its version. Use the repository's package manager and do not rewrite unrelated ranges. Complete when the packages install without peer-dependency errors.

3. Adapt the copied files:
   - `eslint.config.js` is an ES module. If the repository's `package.json` has no `"type": "module"`, rename it to `eslint.config.mjs`. Do the same for the plugin: rename the `.js` files in `tools/eslint/ng-anti-slop/` to `.mjs` and update the imports.
   - `eslint.config.js` imports `./tools/eslint/ng-anti-slop/index.js`. If you move the directory, update that import.
   - Keep the `app` selector prefix unless the Angular project uses another prefix (check `prefix` in `angular.json`).
   - `tsconfig.json` is a base. In an Angular CLI workspace, move its options into the existing `tsconfig.json` and keep `tsconfig.app.json` and `tsconfig.spec.json`. `include` and `noEmit` are only for a standalone typecheck. Remove them there.
   - If `projectService` cannot find a file, add that file to a `tsconfig` that includes it.

   Complete when the config files match the workspace layout.

4. Add scripts if absent: `lint` (`eslint .`), `format` (`prettier --write .`), `format:check` (`prettier --check .`), `typecheck` (`tsc --noEmit`, or the project's `tsc -p` commands).

5. Run lint, format check and typecheck. Report findings in owned source. Fix them only when the user asked for a migration. Do not add inline disable comments, weaken severities, or add unsafe casts to make lint pass. Run `prettier --write` only when the user agrees to reformat the code. Complete when checks have run and every failure is fixed or reported.

6. Baseline existing lint violations with ESLint bulk suppressions, so that only new violations fail. This needs ESLint 9.24 or later.
   - Run `npx eslint . --suppress-all` (use the repository's package manager runner). ESLint writes `eslint-suppressions.json` at the repository root.
   - Run `eslint .` again. It must exit with code 0. If it does not, report the remaining errors.
   - Commit `eslint-suppressions.json` in its own commit, separate from the configuration files. If the user has not allowed commits in this repository, do not commit; stage nothing and tell the user that the file is ready to commit.
   - Tell the user to run `eslint --prune-suppressions` after fixing old violations, so the file shrinks.
   - Skip this step if step 5 found no lint errors. Do not run it again on an update, because it would hide violations that came from the new configuration. Ask the user first.

   Complete when `eslint .` passes and the baseline file is committed or ready to commit.

7. Record provenance in `UPSTREAM.md`: source repository, source commit when known, installed files and intentional deviations. Record "unknown" instead of guessing.
