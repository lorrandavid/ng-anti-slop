import { noChainedTypeAssertionsRule } from './rules/no-chained-type-assertions.js';
import { noKnownValueWideningRule } from './rules/no-known-value-widening.js';
import { noObjectParametersRule } from './rules/no-object-parameters.js';
import { noReduceAccumulatorCopyRule } from './rules/no-reduce-accumulator-copy.js';
import { noRuntimeTypeofRule } from './rules/no-runtime-typeof.js';
import { noUnknownParametersRule } from './rules/no-unknown-parameters.js';
import { noUnknownReturnsRule } from './rules/no-unknown-returns.js';
import { noUnknownTypeAliasesRule } from './rules/no-unknown-type-aliases.js';
import { noUnsafeDictionaryTypeRule } from './rules/no-unsafe-dictionary-type.js';
import { noWidenThenAssertRule } from './rules/no-widen-then-assert.js';
import { protectedTemplateMembersRule } from './rules/protected-template-members.js';

/** Generic ESLint rules for the Angular style guide and for low-evidence TypeScript patterns. */
const ngAntiSlopPlugin = {
  meta: { name: 'ng-anti-slop' },
  rules: {
    'no-chained-type-assertions': noChainedTypeAssertionsRule,
    'no-known-value-widening': noKnownValueWideningRule,
    'no-object-parameters': noObjectParametersRule,
    'no-reduce-accumulator-copy': noReduceAccumulatorCopyRule,
    'no-runtime-typeof': noRuntimeTypeofRule,
    'no-unknown-parameters': noUnknownParametersRule,
    'no-unknown-returns': noUnknownReturnsRule,
    'no-unknown-type-aliases': noUnknownTypeAliasesRule,
    'no-unsafe-dictionary-type': noUnsafeDictionaryTypeRule,
    'no-widen-then-assert': noWidenThenAssertRule,
    'protected-template-members': protectedTemplateMembersRule,
  },
};

export default ngAntiSlopPlugin;
