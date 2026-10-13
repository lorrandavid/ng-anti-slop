# ng-anti-slop

Opinionated ESLint, TypeScript and Prettier configuration for Angular 18+, based on [extreme-angular](https://github.com/joematthews/extreme-angular).

**This project is meant to be vendored**, not installed as an npm dependency. Copy the configuration into your repository, read it, and change it to match your team's standards. The bundled agent skill does the initial copy; after that, the files are yours to maintain.

## Install with an agent skill

```bash
npx skills add <owner>/ng-anti-slop --skill install-ng-anti-slop
```

Then ask your coding agent to install ng-anti-slop in the current repository. The skill copies the configuration files, installs compatible dependencies, adapts the files to your workspace layout, runs lint, format and typecheck, and baselines existing lint violations with `eslint --suppress-all`, so only new violations fail. It commits the resulting `eslint-suppressions.json` when you allow commits. If the repository uses `@ngrx/store`, the skill also adds the `@ngrx/eslint-plugin` `allTypeChecked` configuration. In a repository that already has a lint setup, the skill merges by hand and does not overwrite.

## What you get

| File               | Purpose                                                                                                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `eslint.config.js` | ESLint flat config. TypeScript uses `strictTypeChecked` and `stylisticTypeChecked`, plus `angular-eslint` recommended rules. Templates use recommended and accessibility rules. |
| `tsconfig.json`    | Strict compiler options and strict Angular template checking.                                                                                                                   |
| `.prettierrc`      | Prettier with 100-column lines, single quotes, the Angular HTML parser and organized imports.                                                                                   |
| `.prettierignore`  | Lockfile and build output.                                                                                                                                                      |
| `.editorconfig`    | Editor defaults that match Prettier.                                                                                                                                            |
| `src/`             | The `ng-anti-slop` ESLint plugin with custom rules. Plain JavaScript with JSDoc types, so it loads on any Node version that ESLint supports.                                    |

The rules enforce the [Angular style guide](https://angular.dev/style-guide). `no-restricted-syntax` and `no-restricted-imports` ban decorator-based inputs, outputs and queries, `NgModule`, `CommonModule`, `NgIf` and `NgFor`. The custom `ng-anti-slop/protected-template-members` rule reports public component members that the template reads, because the style guide asks for `protected` there. The rule has an autofix. It matches names with regular expressions and cannot see usage in other files, so keep a member public with an `eslint-disable` comment when a test or another class needs it. The component and directive selector prefix is `app`, which is the Angular default.

## Compatibility

- **Angular:** 18 and later. The `angular-eslint` rules read the Angular compiler in your project, so templates with control flow (`@if`, `@for`) need Angular 17 or later.
- **Signal APIs:** the decorator ban needs `input()`, `output()` and the signal queries. These exist in Angular 18 but are stable only from Angular 19. On Angular 18, remove the `Decorator[...]` selector from `no-restricted-syntax` if you do not accept developer-preview APIs.
- **TypeScript:** use the version your Angular release supports. Angular 18 needs 5.4 or 5.5. The compiler options in `tsconfig.json` work on those versions.
- **ESLint:** 10 needs Node 20.19 or later. `angular-eslint` 22 also supports ESLint 9 if you need older Node.
- **Decorators:** `experimentalDecorators` is on because the Angular CLI compiles with it.

In an Angular CLI workspace, merge the options from `tsconfig.json` into the workspace `tsconfig.json`. The `include` and `noEmit` options are for a standalone typecheck only.

## Manual local installation

Copy the five files from the repository root into your project. Copy `src/` (without `*.test.js`) to a directory that does not hold your application source, for example `tools/eslint/ng-anti-slop/`, and change the `./src/index.js` import in `eslint.config.js` to match. Then install the dev dependencies listed in `package.json` (use exact versions):

```bash
pnpm add -D eslint @eslint/js angular-eslint typescript-eslint eslint-config-prettier prettier prettier-plugin-organize-imports
```

Add these scripts:

```json
{
  "lint": "eslint .",
  "format": "prettier --write .",
  "format:check": "prettier --check .",
  "typecheck": "tsc --noEmit"
}
```

## Development

The root configuration files are canonical. After you change one, sync the copies in the skill:

```bash
pnpm sync:skill-assets
pnpm check
```

`pnpm check` runs lint, the Prettier check, the plugin tests (`pnpm test`, which needs Node 22 or later for the glob), the plugin typecheck (`pnpm typecheck:plugin`, which uses `tsconfig.plugin.json`) and the skill-asset check. It does not run `typecheck`, because this repository has no TypeScript source. Each custom rule lives in `src/rules/` with a `RuleTester` test beside it.

## Credits

Based on [extreme-angular](https://github.com/joematthews/extreme-angular) by Joe Matthews, and structured after [anti-slop](https://github.com/dmmulroy/anti-slop).

## License

[MIT](LICENSE). The license file keeps the copyright notices of extreme-angular, Angular and anti-slop.
