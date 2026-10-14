import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { noWidenThenAssertRule } from './no-widen-then-assert.js';

const tester = new RuleTester({ languageOptions: { parser: tseslint.parser } });
const error = { messageId: 'widenThenAssert' };

tester.run('ng-anti-slop/no-widen-then-assert', noWidenThenAssertRule, {
  valid: [
    "const source = { id: 'first' }; const widened: unknown = source;",
    'declare const input: unknown; const parsed = input as { readonly id: string };',
  ],
  invalid: [
    {
      code: "const source = { id: 'second' }; const widened: unknown = source; const parsed = widened as { readonly id: string };",
      errors: [error],
    },
  ],
});
