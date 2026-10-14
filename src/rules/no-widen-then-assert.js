import { resolveVariable } from '../shared/scope.js';

/** @typedef {import('../shared/scope.js').Variable} Variable */
/** @typedef {import('@typescript-eslint/utils').TSESTree.Expression} Expression */
/** @typedef {import('@typescript-eslint/utils').TSESTree.Node} Node */
/** @typedef {import('@typescript-eslint/utils').TSESTree.TSAsExpression} AsExpression */
/** @typedef {import('@typescript-eslint/utils').TSESTree.TSTypeAssertion} TypeAssertion */
/** @typedef {import('@typescript-eslint/utils').TSESTree.TSTypeReference} TypeReference */
/** @typedef {import('@typescript-eslint/utils').TSESTree.TypeNode} TypeNode */
/** @typedef {import('@typescript-eslint/utils').TSESTree.VariableDeclarator} VariableDeclarator */
/** @typedef {AsExpression | TypeAssertion} TypeAssertionExpression */
/** @typedef {'top' | 'object' | 'record'} BroadTypeKind */

/**
 * @typedef {object} KnownValueEvidence
 * @property {TypeNode | undefined} type The type that the value already carries, if it has one.
 */

/**
 * @typedef {object} WidenedBinding
 * @property {BroadTypeKind} broadKind
 * @property {KnownValueEvidence} evidence
 * @property {number} declaredAt
 * @property {Node | undefined} boundary
 */

const functionBoundaryTypes = new Set([
  'ArrowFunctionExpression',
  'FunctionDeclaration',
  'FunctionExpression',
  'TSDeclareFunction',
  'TSEmptyBodyFunctionExpression',
]);

/** @param {TypeReference} type */
function typeReferenceName(type) {
  return type.typeName.type === 'Identifier' ? type.typeName.name : undefined;
}

/** @param {TypeNode} type */
function isUnknownOrAnyType(type) {
  return type.type === 'TSUnknownKeyword' || type.type === 'TSAnyKeyword';
}

/** @param {TypeNode} type */
function isBroadRecordKeyType(type) {
  if (
    type.type === 'TSStringKeyword' ||
    type.type === 'TSNumberKeyword' ||
    type.type === 'TSSymbolKeyword'
  ) {
    return true;
  }
  if (type.type === 'TSUnionType') return type.types.every(isBroadRecordKeyType);
  return type.type === 'TSTypeReference' && typeReferenceName(type) === 'PropertyKey';
}

/**
 * @param {TypeNode} type
 * @returns {boolean}
 */
function isBroadRecordType(type) {
  if (type.type === 'TSTypeReference') {
    const parameters = type.typeArguments?.params ?? [];
    if (typeReferenceName(type) === 'Readonly') {
      const [inner] = parameters;
      return inner !== undefined && isBroadRecordType(inner);
    }
    if (typeReferenceName(type) !== 'Record') return false;
    const [key, value] = parameters;
    return (
      parameters.length === 2 &&
      key !== undefined &&
      value !== undefined &&
      isBroadRecordKeyType(key) &&
      isUnknownOrAnyType(value)
    );
  }

  if (type.type !== 'TSTypeLiteral') return false;
  const [member, ...others] = type.members;
  if (member?.type !== 'TSIndexSignature' || others.length > 0) return false;
  const [parameter, ...otherParameters] = member.parameters;
  return (
    parameter?.type === 'Identifier' &&
    otherParameters.length === 0 &&
    parameter.typeAnnotation !== undefined &&
    isBroadRecordKeyType(parameter.typeAnnotation.typeAnnotation) &&
    member.typeAnnotation !== undefined &&
    isUnknownOrAnyType(member.typeAnnotation.typeAnnotation)
  );
}

/**
 * @param {TypeNode} type
 * @returns {BroadTypeKind | undefined}
 */
function broadTypeKind(type) {
  if (isUnknownOrAnyType(type)) return 'top';
  if (type.type === 'TSObjectKeyword') return 'object';
  return isBroadRecordType(type) ? 'record' : undefined;
}

/**
 * @param {Expression} expression
 * @returns {TypeAssertionExpression | undefined}
 */
function assertionFromExpression(expression) {
  return expression.type === 'TSAsExpression' || expression.type === 'TSTypeAssertion'
    ? expression
    : undefined;
}

/**
 * @param {string} sourceText
 * @param {TypeNode} type
 */
function normalizedTypeText(sourceText, type) {
  return sourceText.slice(type.range[0], type.range[1]).replaceAll(/\s+/gu, '');
}

/**
 * @param {string} sourceText
 * @param {TypeNode | undefined} left
 * @param {TypeNode} right
 */
function typesHaveSameSyntax(sourceText, left, right) {
  return (
    left !== undefined &&
    normalizedTypeText(sourceText, left) === normalizedTypeText(sourceText, right)
  );
}

/**
 * @param {TypeNode} type
 * @returns {boolean}
 */
function isDefinitelyObjectType(type) {
  switch (type.type) {
    case 'TSArrayType':
    case 'TSConstructorType':
    case 'TSFunctionType':
    case 'TSMappedType':
    case 'TSObjectKeyword':
    case 'TSTupleType':
      return true;
    case 'TSTypeLiteral':
      return type.members.length > 0;
    case 'TSIntersectionType':
      return type.types.every(isDefinitelyObjectType);
    case 'TSTypeOperator':
      return (
        type.operator === 'readonly' &&
        type.typeAnnotation !== undefined &&
        isDefinitelyObjectType(type.typeAnnotation)
      );
    default:
      return false;
  }
}

/**
 * @param {TypeNode} type
 * @returns {boolean}
 */
function isDefinitelyNarrowerRecordType(type) {
  if (type.type === 'TSTypeLiteral') {
    return type.members.some((member) => member.type !== 'TSIndexSignature');
  }
  if (type.type !== 'TSTypeReference') return false;
  const parameters = type.typeArguments?.params ?? [];
  if (typeReferenceName(type) === 'Readonly') {
    const [inner] = parameters;
    return inner !== undefined && isDefinitelyNarrowerRecordType(inner);
  }
  if (typeReferenceName(type) !== 'Record') return false;
  const [, value] = parameters;
  return parameters.length === 2 && value !== undefined && !isUnknownOrAnyType(value);
}

/**
 * @param {Node} node
 * @returns {Node | undefined}
 */
function functionBoundary(node) {
  let current = node.parent;
  while (current !== undefined && current.type !== 'Program') {
    if (functionBoundaryTypes.has(current.type)) return current;
    current = current.parent;
  }
  return undefined;
}

/**
 * @param {Variable} variable
 * @returns {VariableDeclarator | undefined}
 */
function variableDeclarator(variable) {
  for (const { node } of variable.defs) {
    if (node.type === 'VariableDeclarator') return node;
  }
  return undefined;
}

/**
 * @param {Variable} variable
 * @param {VariableDeclarator} declarator
 */
function isStableConst(variable, declarator) {
  return (
    declarator.parent.type === 'VariableDeclaration' &&
    declarator.parent.kind === 'const' &&
    declarator.init !== null &&
    !variable.references.some((reference) => reference.isWrite() && !reference.init)
  );
}

/**
 * @param {import('../shared/scope.js').SourceCode} sourceCode
 * @param {Expression} expression
 * @param {Node | undefined} boundary
 * @param {ReadonlySet<Variable>} visitedVariables
 * @returns {KnownValueEvidence | undefined}
 */
function knownValueEvidence(sourceCode, expression, boundary, visitedVariables) {
  if (expression.type === 'TSAsExpression' || expression.type === 'TSTypeAssertion') {
    if (broadTypeKind(expression.typeAnnotation) !== undefined) return undefined;
    return { type: expression.typeAnnotation };
  }

  if (
    expression.type === 'Literal' ||
    expression.type === 'TemplateLiteral' ||
    expression.type === 'ArrayExpression' ||
    expression.type === 'ArrowFunctionExpression' ||
    expression.type === 'ClassExpression' ||
    expression.type === 'FunctionExpression' ||
    expression.type === 'NewExpression' ||
    expression.type === 'ObjectExpression'
  ) {
    return { type: undefined };
  }

  if (expression.type !== 'Identifier') return undefined;
  const variable = resolveVariable(sourceCode, expression);
  if (variable === undefined || visitedVariables.has(variable)) return undefined;

  const annotatedIdentifier = variable.identifiers.find(
    (identifier) => identifier.typeAnnotation !== undefined,
  );
  const annotation = annotatedIdentifier?.typeAnnotation?.typeAnnotation;
  if (annotation !== undefined && annotatedIdentifier !== undefined) {
    if (
      functionBoundary(annotatedIdentifier) !== boundary ||
      broadTypeKind(annotation) !== undefined
    ) {
      return undefined;
    }
    return { type: annotation };
  }

  const declarator = variableDeclarator(variable);
  if (
    declarator === undefined ||
    declarator.init === null ||
    !isStableConst(variable, declarator) ||
    functionBoundary(declarator) !== boundary
  ) {
    return undefined;
  }

  return knownValueEvidence(
    sourceCode,
    declarator.init,
    boundary,
    new Set([...visitedVariables, variable]),
  );
}

/**
 * @param {import('../shared/scope.js').SourceCode} sourceCode
 * @param {Variable} variable
 * @returns {WidenedBinding | undefined}
 */
function widenedBinding(sourceCode, variable) {
  const declarator = variableDeclarator(variable);
  if (
    declarator === undefined ||
    declarator.init === null ||
    declarator.id.type !== 'Identifier' ||
    !isStableConst(variable, declarator)
  ) {
    return undefined;
  }

  const boundary = functionBoundary(declarator);
  const declaredType = declarator.id.typeAnnotation?.typeAnnotation;
  const initializerAssertion = assertionFromExpression(declarator.init);
  const initializerBroadKind =
    initializerAssertion === undefined
      ? undefined
      : broadTypeKind(initializerAssertion.typeAnnotation);
  const declaredBroadKind = declaredType === undefined ? undefined : broadTypeKind(declaredType);
  const broadKind = declaredBroadKind ?? initializerBroadKind;
  if (broadKind === undefined) return undefined;

  const originalExpression =
    initializerAssertion !== undefined && initializerBroadKind !== undefined
      ? initializerAssertion.expression
      : declarator.init;
  const evidence = knownValueEvidence(
    sourceCode,
    originalExpression,
    boundary,
    new Set([variable]),
  );
  return evidence === undefined
    ? undefined
    : { broadKind, evidence, declaredAt: declarator.range[1], boundary };
}

/**
 * @param {string} sourceText
 * @param {BroadTypeKind} broadKind
 * @param {KnownValueEvidence} evidence
 * @param {TypeNode} assertedType
 */
function assertionIsNarrower(sourceText, broadKind, evidence, assertedType) {
  if (broadTypeKind(assertedType) !== undefined) return false;
  if (broadKind === 'top') return true;
  if (typesHaveSameSyntax(sourceText, evidence.type, assertedType)) return true;
  if (broadKind === 'object') return isDefinitelyObjectType(assertedType);
  return isDefinitelyNarrowerRecordType(assertedType);
}

/** @type {import('@typescript-eslint/utils').TSESLint.RuleModule<'widenThenAssert', []>} */
export const noWidenThenAssertRule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow local const flows that explicitly widen a known value before asserting the widened binding to a narrower type.',
    },
    schema: [],
    messages: {
      widenThenAssert:
        'Binding "{{name}}" discards type evidence and later recreates it with an assertion. Keep the precise type from initialization through use; parse boundary input once.',
    },
  },
  defaultOptions: [],
  create(context) {
    const { sourceCode } = context;

    /** @param {TypeAssertionExpression} node */
    const checkAssertion = (node) => {
      const { expression } = node;
      if (expression.type !== 'Identifier') return;

      const variable = resolveVariable(sourceCode, expression);
      if (variable === undefined) return;
      const widened = widenedBinding(sourceCode, variable);
      if (
        widened === undefined ||
        node.range[0] <= widened.declaredAt ||
        functionBoundary(node) !== widened.boundary ||
        !assertionIsNarrower(
          sourceCode.text,
          widened.broadKind,
          widened.evidence,
          node.typeAnnotation,
        )
      ) {
        return;
      }

      context.report({ node, messageId: 'widenThenAssert', data: { name: expression.name } });
    };

    return { TSAsExpression: checkAssertion, TSTypeAssertion: checkAssertion };
  },
};
