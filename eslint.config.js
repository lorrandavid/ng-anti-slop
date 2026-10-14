// @ts-check
import eslint from '@eslint/js';
import angular from 'angular-eslint';
import prettierConfig from 'eslint-config-prettier';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';
import ngAntiSlop from './src/index.js';

export default defineConfig([
  { ignores: ['.angular/', 'dist/', 'coverage/'] },
  {
    files: ['**/*.ts'],
    extends: [
      eslint.configs.recommended,
      tseslint.configs.recommendedTypeChecked,
      tseslint.configs.stylisticTypeChecked,
      angular.configs.tsRecommended,
      prettierConfig,
    ],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    processor: angular.processInlineTemplates,
    plugins: { 'ng-anti-slop': ngAntiSlop },
    rules: {
      'ng-anti-slop/protected-template-members': 'error',

      // Keep type evidence: parse input at its boundary instead of widening or asserting.
      'ng-anti-slop/no-chained-type-assertions': 'error',
      'ng-anti-slop/no-known-value-widening': 'error',
      'ng-anti-slop/no-object-parameters': 'error',
      'ng-anti-slop/no-reduce-accumulator-copy': 'error',
      'ng-anti-slop/no-runtime-typeof': 'error',
      'ng-anti-slop/no-unknown-parameters': 'error',
      'ng-anti-slop/no-unknown-returns': 'error',
      'ng-anti-slop/no-unknown-type-aliases': 'error',
      'ng-anti-slop/no-unsafe-dictionary-type': 'error',
      'ng-anti-slop/no-widen-then-assert': 'error',

      // Size and complexity limits
      complexity: ['error', 14],
      'max-classes-per-file': ['error', 1],
      'max-depth': ['error', 3],
      'max-lines': ['error', { max: 500, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['error', { max: 50, skipBlankLines: true, skipComments: true }],
      'max-nested-callbacks': ['error', 3],
      'max-params': ['error', 4],
      'max-statements': ['error', 15],

      // Simpler control flow
      'no-else-return': 'error',
      'no-lonely-if': 'error',
      'no-negated-condition': 'error',
      'no-nested-ternary': 'error',
      'no-unneeded-ternary': 'error',
      'no-unreachable-loop': 'error',
      'no-useless-return': 'error',
      'no-lone-blocks': 'error',

      // Bug prevention
      'array-callback-return': 'error',
      'default-case': 'error',
      eqeqeq: ['error', 'always'],
      'no-await-in-loop': 'error',
      'no-constructor-return': 'error',
      'no-promise-executor-return': 'error',
      'no-self-compare': 'error',
      'no-template-curly-in-string': 'error',
      'no-unmodified-loop-condition': 'error',
      'no-bitwise': 'error',
      '@typescript-eslint/no-shadow': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',

      // Immutability and clear intent
      'no-param-reassign': ['error', { props: true }],
      'no-multi-assign': 'error',
      'no-sequences': 'error',

      // Modern, consistent syntax
      'logical-assignment-operators': 'error',
      'no-useless-concat': 'error',
      'no-useless-rename': 'error',
      'object-shorthand': 'error',
      'operator-assignment': 'error',
      'prefer-object-spread': 'error',
      'prefer-template': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',

      // Angular
      '@angular-eslint/component-selector': [
        'error',
        { type: 'element', prefix: 'app', style: 'kebab-case' },
      ],
      '@angular-eslint/directive-selector': [
        'error',
        { type: 'attribute', prefix: 'app', style: 'camelCase' },
      ],
      '@angular-eslint/prefer-on-push-component-change-detection': 'error',
      '@angular-eslint/prefer-signals': 'error',
      '@angular-eslint/prefer-output-readonly': 'error',
      '@angular-eslint/prefer-output-emitter-ref': 'error',
      '@angular-eslint/prefer-host-metadata-property': 'error',
      '@angular-eslint/no-async-lifecycle-method': 'error',

      // Angular style guide
      '@typescript-eslint/explicit-member-accessibility': ['error', { accessibility: 'no-public' }],
      '@typescript-eslint/prefer-readonly': 'error',
      // Name handlers for what they do (`saveUser`), not for the event (`onClick`).
      '@typescript-eslint/naming-convention': [
        'error',
        { selector: 'method', format: null, custom: { regex: '^(on|handle)[A-Z]', match: false } },
      ],
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@angular/common',
              importNames: ['CommonModule', 'NgIf', 'NgFor', 'NgForOf', 'NgSwitch'],
              message: 'Use built-in control flow (@if, @for, @switch) instead.',
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'Decorator[expression.callee.name=/^(Input|Output|ViewChild|ViewChildren|ContentChild|ContentChildren)$/]',
          message:
            'Use input(), output(), viewChild(), viewChildren(), contentChild() or contentChildren().',
        },
        {
          selector: 'Decorator[expression.callee.name="NgModule"]',
          message: 'Use standalone components, directives and pipes instead of NgModule.',
        },
      ],
    },
  },
  {
    files: ['**/*.html'],
    extends: [
      angular.configs.templateRecommended,
      angular.configs.templateAccessibility,
      prettierConfig,
    ],
    rules: {
      '@angular-eslint/template/prefer-class-binding': 'error',
      '@angular-eslint/template/prefer-style-binding': 'error',
      '@angular-eslint/template/prefer-ngsrc': 'error',
      '@angular-eslint/template/no-call-expression': 'error',
    },
  },
]);
