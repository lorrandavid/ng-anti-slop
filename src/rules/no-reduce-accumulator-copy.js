import {
  arrayMethodTarget,
  isKnownArrayExpression,
  resolveArrayBinding,
  unwrapArrayExpression,
} from '../shared/array-method.js';

/** @typedef {import('../shared/scope.js').SourceCode} SourceCode */
/** @typedef {import('../shared/scope.js').Variable} Variable */
/** @typedef {import('@typescript-eslint/utils').TSESTree.ArrowFunctionExpression} ArrowFunction */
/** @typedef {import('@typescript-eslint/utils').TSESTree.CallExpression} CallExpression */
/** @typedef {import('@typescript-eslint/utils').TSESTree.FunctionExpression} FunctionExpression */
/** @typedef {import('@typescript-eslint/utils').TSESTree.Identifier} Identifier */
/** @typedef {import('@typescript-eslint/utils').TSESTree.Node} Node */

const arrayCopyMethods = new Set([
  'concat',
  'slice',
  'toSpliced',
  'toSorted',
  'toReversed',
  'with',
]);

/**
 * @typedef {object} Reducer
 * @property {ArrowFunction | FunctionExpression} callback
 * @property {Identifier} accumulator
 * @property {Node | undefined} initialValue
 */

/**
 * @param {Node} node
 * @returns {Reducer | undefined} The inline `reduce` callback that encloses the node.
 */
function enclosingReducer(node) {
  let parent = node.parent;
  while (parent) {
    if (parent.type === 'FunctionDeclaration') return undefined;
    if (parent.type === 'ArrowFunctionExpression' || parent.type === 'FunctionExpression') {
      const callback = parent;
      /** @type {Node | undefined} */
      let owner = callback.parent;
      while (owner && unwrapArrayExpression(owner) === callback) owner = owner.parent;
      if (owner?.type !== 'CallExpression') return undefined;
      const method = arrayMethodTarget(owner.callee);
      const [firstArgument] = owner.arguments;
      if (
        method === undefined ||
        (method.name !== 'reduce' && method.name !== 'reduceRight') ||
        owner.arguments.length > 2 ||
        firstArgument === undefined ||
        unwrapArrayExpression(firstArgument) !== callback
      ) {
        return undefined;
      }
      const [firstParameter] = callback.params;
      const accumulator =
        firstParameter?.type === 'AssignmentPattern' ? firstParameter.left : firstParameter;
      if (accumulator?.type !== 'Identifier') return undefined;
      return { callback, accumulator, initialValue: owner.arguments[1] };
    }
    parent = parent.parent;
  }
  return undefined;
}

/**
 * @param {SourceCode} sourceCode
 * @param {Node} node
 * @param {Variable} accumulator
 * @param {Set<Variable>} visited
 * @returns {boolean} Whether the node is the accumulator or an immutable alias of it.
 */
function referencesAccumulator(sourceCode, node, accumulator, visited = new Set()) {
  const variable = resolveArrayBinding(sourceCode, node);
  if (variable === undefined || visited.has(variable)) return false;
  if (variable === accumulator) return true;
  visited.add(variable);
  if (variable.references.some((reference) => reference.isWrite() && !reference.init)) {
    return false;
  }
  for (const definition of variable.defs) {
    const declarator = definition.node;
    if (
      declarator.type === 'VariableDeclarator' &&
      declarator.id.type === 'Identifier' &&
      declarator.init !== null &&
      declarator.parent.type === 'VariableDeclaration' &&
      declarator.parent.kind === 'const'
    ) {
      return referencesAccumulator(sourceCode, declarator.init, accumulator, visited);
    }
  }
  return false;
}

/**
 * @param {SourceCode} sourceCode
 * @param {Node} node
 * @param {string} name
 * @returns {boolean} Whether the node is the unshadowed global with this name.
 */
function isGlobalCopyOwner(sourceCode, node, name) {
  const unwrapped = unwrapArrayExpression(node);
  if (unwrapped.type !== 'Identifier' || unwrapped.name !== name) return false;
  const variable = resolveArrayBinding(sourceCode, unwrapped);
  return variable === undefined || variable.defs.length === 0;
}

/**
 * @param {SourceCode} sourceCode
 * @param {CallExpression} node
 * @param {{ name: string, object: Node }} method
 * @param {Reducer} reducer
 * @param {Variable} accumulator
 * @returns {boolean}
 */
function copiesAccumulator(sourceCode, node, method, reducer, accumulator) {
  /** @param {Node} expression */
  const isAccumulator = (expression) => referencesAccumulator(sourceCode, expression, accumulator);
  const [first] = node.arguments;
  if (method.name === 'assign' && isGlobalCopyOwner(sourceCode, method.object, 'Object')) {
    return (
      first !== undefined &&
      unwrapArrayExpression(first).type === 'ObjectExpression' &&
      node.arguments.slice(1).some(isAccumulator)
    );
  }
  if (method.name === 'from' && isGlobalCopyOwner(sourceCode, method.object, 'Array')) {
    return first !== undefined && isAccumulator(first);
  }
  if (!arrayCopyMethods.has(method.name)) return false;
  const { initialValue } = reducer;
  return (
    initialValue !== undefined &&
    isKnownArrayExpression(sourceCode, initialValue) &&
    isAccumulator(method.object)
  );
}

/** @type {import('@typescript-eslint/utils').TSESLint.RuleModule<'accumulatorCopy', []>} */
export const noReduceAccumulatorCopyRule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow copying growing reducer accumulators with Object.assign, Array.from, or array copy methods.',
    },
    schema: [],
    messages: {
      accumulatorCopy:
        'Do not copy the reducer accumulator on every iteration; growing copies can cause quadratic work. Mutate a fresh, locally owned accumulator and return it, or use an iterator pipeline/flatMap.',
    },
  },
  defaultOptions: [],
  create(context) {
    const { sourceCode } = context;
    return {
      CallExpression(node) {
        const method = arrayMethodTarget(node.callee);
        if (method === undefined) return;
        const reducer = enclosingReducer(node);
        if (reducer === undefined) return;
        const accumulator = sourceCode
          .getDeclaredVariables(reducer.callback)
          .find((variable) => variable.identifiers.includes(reducer.accumulator));
        if (accumulator === undefined) return;
        if (copiesAccumulator(sourceCode, node, method, reducer, accumulator)) {
          context.report({ node, messageId: 'accumulatorCopy' });
        }
      },
    };
  },
};
