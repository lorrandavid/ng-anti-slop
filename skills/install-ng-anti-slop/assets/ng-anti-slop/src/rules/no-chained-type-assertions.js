/** @typedef {import('@typescript-eslint/utils').TSESTree.Expression} Expression */
/** @typedef {import('@typescript-eslint/utils').TSESTree.Node} Node */
/** @typedef {import('@typescript-eslint/utils').TSESTree.TSAsExpression} AsExpression */
/** @typedef {import('@typescript-eslint/utils').TSESTree.TSTypeAssertion} TypeAssertion */
/** @typedef {AsExpression | TypeAssertion} TypeAssertionExpression */

/**
 * @param {Node} node
 * @returns {node is TypeAssertionExpression}
 */
function isTypeAssertionExpression(node) {
  return node.type === 'TSAsExpression' || node.type === 'TSTypeAssertion';
}

/** @param {TypeAssertionExpression} node */
function isConstAssertion({ typeAnnotation }) {
  return (
    typeAnnotation.type === 'TSTypeReference' &&
    typeAnnotation.typeName.type === 'Identifier' &&
    typeAnnotation.typeName.name === 'const'
  );
}

/** @param {TypeAssertionExpression} node */
function isOutermostAssertionInChain(node) {
  const { parent } = node;
  return !isTypeAssertionExpression(parent) || parent.expression !== node;
}

/** @param {TypeAssertionExpression} node */
function isForbiddenAssertionChain(node) {
  let assertionCount = 0;
  let hasNonConstAssertion = false;
  /** @type {Expression} */
  let current = node;
  while (isTypeAssertionExpression(current)) {
    assertionCount += 1;
    hasNonConstAssertion ||= !isConstAssertion(current);
    current = current.expression;
  }
  return assertionCount > 1 && hasNonConstAssertion;
}

/** @type {import('@typescript-eslint/utils').TSESLint.RuleModule<'chained', []>} */
export const noChainedTypeAssertionsRule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow chained TypeScript as and angle-bracket assertions, including parenthesized chains.',
    },
    schema: [],
    messages: {
      chained:
        'This assertion chain discards type evidence. Keep the original precise type, or parse untrusted input at its boundary before narrowing it.',
    },
  },
  defaultOptions: [],
  create(context) {
    /** @param {TypeAssertionExpression} node */
    const checkTypeAssertion = (node) => {
      if (!isOutermostAssertionInChain(node) || !isForbiddenAssertionChain(node)) return;
      context.report({ node, messageId: 'chained' });
    };

    return { TSAsExpression: checkTypeAssertion, TSTypeAssertion: checkTypeAssertion };
  },
};
