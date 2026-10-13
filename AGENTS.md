# Repository guidance

- The root `eslint.config.js`, `tsconfig.json`, `.prettierrc`, `.prettierignore` and `.editorconfig` are the canonical configuration.
- Keep the configuration generic and suitable for reuse across Angular 18+ repositories. Do not add application-specific names or paths. The `app` selector prefix is the Angular default and stays.
- Do not use TypeScript or ESLint options that need a newer Angular, TypeScript or Node version than Angular 18 supports without saying so in the README.
- `src/` is the canonical implementation of the custom rules. Keep the rules generic, in plain JavaScript with JSDoc types, with no runtime dependency beyond Node and ESLint.
- Add focused `RuleTester` coverage in `src/rules/` for every semantic rule change.
- Run `pnpm sync:skill-assets` after changing a root configuration file or `src/`.
- Run `pnpm check` before committing.
