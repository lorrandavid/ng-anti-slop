/** @typedef {import('@typescript-eslint/utils').TSESTree.Node} Node */
/** @typedef {import('@typescript-eslint/utils').TSESTree.UnaryExpression} UnaryExpression */

/**
 * @param {Node} node
 * @returns {boolean} Whether the node sits inside a function that declares a type predicate.
 */
function isInsideTypeGuard(node) {
  let current = node.parent;
  while (current !== undefined && current.type !== 'Program') {
    if (
      current.type === 'ArrowFunctionExpression' ||
      current.type === 'FunctionDeclaration' ||
      current.type === 'FunctionExpression'
    ) {
      return current.returnType?.typeAnnotation.type === 'TSTypePredicate';
    }
    current = current.parent;
  }
  return false;
}

/**
 * @param {UnaryExpression} node
 * @returns {boolean} Whether `typeof` safely probes for a possibly absent binding.
 */
function isExistenceProbe(node) {
  const { parent } = node;
  if (parent.type !== 'BinaryExpression') return false;
  if (!['===', '!==', '==', '!='].includes(parent.operator)) return false;
  const other = parent.left === node ? parent.right : parent.left;
  return other.type === 'Literal' && other.value === 'undefined';
}

/**
 * @type {import('@typescript-eslint/utils').TSESLint.RuleModule<
 *   'runtimeTypeof',
 *   [{ allowInTypeGuards: boolean }]
 * >}
 */
export const noRuntimeTypeofRule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow runtime typeof checks; external values must be decoded into meaningful types at their I/O boundary.',
    },
    messages: {
      runtimeTypeof:
        'A `typeof` check narrows a representation without establishing its contract. Parse input at its I/O boundary, then branch on the domain value.',
    },
    schema: [
      {
        type: 'object',
        properties: { allowInTypeGuards: { type: 'boolean' } },
        additionalProperties: false,
      },
    ],
    defaultOptions: [{ allowInTypeGuards: false }],
  },
  create(context) {
    const [{ allowInTypeGuards }] = context.options;
    return {
      UnaryExpression(node) {
        if (node.operator !== 'typeof' || isExistenceProbe(node)) return;
        if (allowInTypeGuards && isInsideTypeGuard(node)) return;
        context.report({ node, messageId: 'runtimeTypeof' });
      },
    };
  },
};
