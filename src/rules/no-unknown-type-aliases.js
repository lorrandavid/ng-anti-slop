import {
  createTypeEnvironmentCollector,
  resolvedTypeMatches,
} from '../shared/type-alias-resolution.js';

/** @typedef {import('@typescript-eslint/utils').TSESTree.TypeNode} TypeNode */

/** @type {import('@typescript-eslint/utils').TSESLint.RuleModule<'unknownAlias', []>} */
export const noUnknownTypeAliasesRule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow type aliases whose resolved type is unknown; unknown must remain visible at an allowed boundary.',
    },
    schema: [],
    messages: {
      unknownAlias:
        'Type alias `{{alias}}` hides `unknown`. Keep `unknown` explicit at the parsing boundary or on an allowed `cause` field; otherwise use the parsed owner type.',
    },
  },
  defaultOptions: [],
  create(context) {
    const { environment, listeners, defer } = createTypeEnvironmentCollector();

    /** @param {TypeNode} type */
    const resolvesToUnknown = (type) =>
      resolvedTypeMatches(type, environment, (resolved, matches) => {
        if (resolved.type === 'TSUnknownKeyword') return true;
        return resolved.type === 'TSUnionType' && resolved.types.some(matches);
      });

    return {
      ...listeners,
      Program() {
        defer(() => {
          for (const alias of environment.aliases) {
            if (!resolvesToUnknown(alias.typeAnnotation)) continue;
            context.report({
              node: alias.id,
              messageId: 'unknownAlias',
              data: { alias: alias.id.name },
            });
          }
        });
      },
    };
  },
};
