import { resolveVariable } from './scope.js';

/** @typedef {import('./scope.js').SourceCode} SourceCode */
/** @typedef {import('./scope.js').Variable} Variable */
/** @typedef {import('@typescript-eslint/utils').TSESTree.Node} Node */
/** @typedef {import('@typescript-eslint/utils').TSESTree.TypeNode} TypeNode */

const copyingArrayMethods = new Set([
  'map',
  'filter',
  'flatMap',
  'slice',
  'concat',
  'toSorted',
  'toReversed',
  'toSpliced',
]);

/**
 * Unwraps syntax-only wrappers when inspecting array methods and accumulator references.
 *
 * @param {Node} node
 * @returns {Node}
 */
export function unwrapArrayExpression(node) {
  let current = node;
  while (
    current.type === 'ChainExpression' ||
    current.type === 'TSAsExpression' ||
    current.type === 'TSTypeAssertion' ||
    current.type === 'TSNonNullExpression' ||
    current.type === 'TSSatisfiesExpression'
  ) {
    current = current.expression;
  }
  return current;
}

/**
 * Resolves a local binding by scope, not by identifier spelling.
 *
 * @param {SourceCode} sourceCode
 * @param {Node} node
 * @returns {Variable | undefined}
 */
export function resolveArrayBinding(sourceCode, node) {
  const unwrapped = unwrapArrayExpression(node);
  return unwrapped.type === 'Identifier' ? resolveVariable(sourceCode, unwrapped) : undefined;
}

/**
 * Reads static method names, including computed string literals, without evaluating expressions.
 *
 * @param {Node} node
 * @returns {{ name: string, object: Node } | undefined}
 */
export function arrayMethodTarget(node) {
  const unwrapped = unwrapArrayExpression(node);
  if (unwrapped.type !== 'MemberExpression') return undefined;
  const { property } = unwrapped;
  if (!unwrapped.computed && property.type === 'Identifier') {
    return { name: property.name, object: unwrapped.object };
  }
  if (unwrapped.computed && property.type === 'Literal' && typeof property.value === 'string') {
    return { name: property.value, object: unwrapped.object };
  }
  return undefined;
}

/**
 * @param {TypeNode} type
 * @returns {boolean}
 */
function isArrayAnnotation(type) {
  if (type.type === 'TSArrayType' || type.type === 'TSTupleType') return true;
  if (type.type === 'TSTypeOperator' && type.operator === 'readonly') {
    return type.typeAnnotation !== undefined && isArrayAnnotation(type.typeAnnotation);
  }
  return (
    type.type === 'TSTypeReference' &&
    type.typeName.type === 'Identifier' &&
    (type.typeName.name === 'Array' || type.typeName.name === 'ReadonlyArray')
  );
}

/**
 * Recognizes local array evidence; unknown receivers and iterator pipelines are excluded.
 *
 * @param {SourceCode} sourceCode
 * @param {Node} node
 * @param {Set<Variable>} visited
 * @returns {boolean}
 */
export function isKnownArrayExpression(sourceCode, node, visited = new Set()) {
  const unwrapped = unwrapArrayExpression(node);
  if (unwrapped.type === 'ArrayExpression') return true;
  if (unwrapped.type === 'CallExpression') {
    const method = arrayMethodTarget(unwrapped.callee);
    return (
      method !== undefined &&
      copyingArrayMethods.has(method.name) &&
      isKnownArrayExpression(sourceCode, method.object, visited)
    );
  }
  if (unwrapped.type !== 'Identifier') return false;
  const variable = resolveVariable(sourceCode, unwrapped);
  if (variable === undefined || visited.has(variable)) return false;
  visited.add(variable);
  if (variable.references.some((reference) => reference.isWrite() && !reference.init)) {
    return false;
  }
  for (const identifier of variable.identifiers) {
    const annotation = identifier.typeAnnotation?.typeAnnotation;
    if (annotation !== undefined) return isArrayAnnotation(annotation);
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
      return isKnownArrayExpression(sourceCode, declarator.init, visited);
    }
  }
  return false;
}
