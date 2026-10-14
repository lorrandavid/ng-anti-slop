import {
  classifyUnsafeDictionary,
  classifyUnsafeDictionaryValue,
} from '../shared/dictionary-types.js';
import {
  createTypeEnvironmentCollector,
  typeReferenceName,
  visibleTypeAlias,
} from '../shared/type-alias-resolution.js';

/** @typedef {import('../shared/type-alias-resolution.js').TypeAliasEnvironment} TypeEnvironment */
/** @typedef {import('@typescript-eslint/utils').TSESTree.Node} Node */
/** @typedef {import('@typescript-eslint/utils').TSESTree.TypeNode} TypeNode */
/** @typedef {import('@typescript-eslint/utils').TSESTree.TSIndexSignature} IndexSignature */

const typeNodeKinds = new Set([
  'TSAnyKeyword',
  'TSArrayType',
  'TSBigIntKeyword',
  'TSBooleanKeyword',
  'TSConditionalType',
  'TSConstructorType',
  'TSFunctionType',
  'TSImportType',
  'TSIndexedAccessType',
  'TSInferType',
  'TSIntersectionType',
  'TSIntrinsicKeyword',
  'TSLiteralType',
  'TSMappedType',
  'TSNamedTupleMember',
  'TSNeverKeyword',
  'TSNullKeyword',
  'TSNumberKeyword',
  'TSObjectKeyword',
  'TSStringKeyword',
  'TSSymbolKeyword',
  'TSTemplateLiteralType',
  'TSThisType',
  'TSTupleType',
  'TSTypeLiteral',
  'TSTypeOperator',
  'TSTypePredicate',
  'TSTypeQuery',
  'TSTypeReference',
  'TSUndefinedKeyword',
  'TSUnionType',
  'TSUnknownKeyword',
  'TSVoidKeyword',
]);

/**
 * @param {Node} node
 * @returns {node is TypeNode}
 */
function isTypeNode(node) {
  return typeNodeKinds.has(node.type);
}

/** @param {Node} node */
function isInsideTypeAliasDeclaration(node) {
  let current = node.parent;
  while (current !== undefined && current.type !== 'Program') {
    if (current.type === 'TSTypeAliasDeclaration') return true;
    current = current.parent;
  }
  return false;
}

/**
 * @param {TypeNode} node
 * @param {TypeEnvironment} environment
 */
function isPlainAliasConsumerUse(node, environment) {
  if (node.type !== 'TSTypeReference' || node.typeArguments?.params.length) return false;
  const name = typeReferenceName(node);
  return (
    name !== undefined &&
    visibleTypeAlias(name, node, environment) !== undefined &&
    !isInsideTypeAliasDeclaration(node)
  );
}

/** @param {TypeNode} node */
function isInsideTypeParameterConstraint(node) {
  /** @type {Node} */
  let child = node;
  let parent = child.parent;
  while (parent !== undefined && parent.type !== 'Program') {
    if (parent.type === 'TSTypeParameter' && parent.constraint === child) return true;
    child = parent;
    parent = child.parent;
  }
  return false;
}

/**
 * Reports only the outermost unsafe type, so one dictionary yields one report.
 *
 * @param {TypeNode} node
 * @param {TypeEnvironment} environment
 */
function shouldReportType(node, environment) {
  if (isInsideTypeParameterConstraint(node)) return false;
  if (isPlainAliasConsumerUse(node, environment)) return false;
  if (classifyUnsafeDictionary(node, environment) === undefined) return false;
  let current = node.parent;
  while (current !== undefined && current.type !== 'Program') {
    if (isTypeNode(current) && classifyUnsafeDictionary(current, environment) !== undefined) {
      return false;
    }
    current = current.parent;
  }
  return true;
}

/** @type {import('@typescript-eslint/utils').TSESLint.RuleModule<'unsafeDictionary', []>} */
export const noUnsafeDictionaryTypeRule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow object-dictionary contracts whose direct value type is unknown, any, object, {}, or a union/alias containing one of those escape hatches.',
    },
    schema: [],
    messages: {
      unsafeDictionary:
        "This dictionary's {{value}} value type gives callers no concrete value contract. Use an owner/schema-derived value type; parse external payloads before insertion.",
    },
  },
  defaultOptions: [],
  create(context) {
    const { environment, listeners, defer } = createTypeEnvironmentCollector();

    /** @param {TypeNode} node */
    const reportIfUnsafe = (node) => {
      defer(() => {
        if (!shouldReportType(node, environment)) return;
        const value = classifyUnsafeDictionary(node, environment);
        if (value !== undefined)
          context.report({ node, messageId: 'unsafeDictionary', data: { value } });
      });
    };

    return {
      ...listeners,
      TSTypeReference: reportIfUnsafe,
      TSTypeLiteral: reportIfUnsafe,
      TSMappedType: reportIfUnsafe,
      /** @param {IndexSignature} node */
      TSIndexSignature(node) {
        if (node.typeAnnotation === undefined || node.parent.type === 'TSTypeLiteral') return;
        const { typeAnnotation } = node.typeAnnotation;
        defer(() => {
          const value = classifyUnsafeDictionaryValue(typeAnnotation, environment);
          if (value !== undefined)
            context.report({ node, messageId: 'unsafeDictionary', data: { value } });
        });
      },
    };
  },
};
