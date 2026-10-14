import {
  createTypeEnvironmentCollector,
  resolvedTypeMatches,
  typeReferenceName,
} from '../shared/type-alias-resolution.js';

/** @typedef {import('@typescript-eslint/utils').TSESTree.TypeNode} TypeNode */
/**
 * @typedef {import('@typescript-eslint/utils').TSESTree.ArrowFunctionExpression
 *   | import('@typescript-eslint/utils').TSESTree.FunctionDeclaration
 *   | import('@typescript-eslint/utils').TSESTree.FunctionExpression
 *   | import('@typescript-eslint/utils').TSESTree.TSCallSignatureDeclaration
 *   | import('@typescript-eslint/utils').TSESTree.TSConstructSignatureDeclaration
 *   | import('@typescript-eslint/utils').TSESTree.TSConstructorType
 *   | import('@typescript-eslint/utils').TSESTree.TSDeclareFunction
 *   | import('@typescript-eslint/utils').TSESTree.TSEmptyBodyFunctionExpression
 *   | import('@typescript-eslint/utils').TSESTree.TSFunctionType
 *   | import('@typescript-eslint/utils').TSESTree.TSMethodSignature} FunctionWithReturnType
 */

/** @type {import('@typescript-eslint/utils').TSESLint.RuleModule<'unknownReturn', []>} */
export const noUnknownReturnsRule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow functions whose explicit return contract is unknown or Promise<unknown>.',
    },
    schema: [],
    messages: {
      unknownReturn:
        'This function exposes `unknown` to its caller. Parse the value at its boundary and return a named domain type.',
    },
  },
  defaultOptions: [],
  create(context) {
    const { environment, listeners, defer } = createTypeEnvironmentCollector();

    /** @param {TypeNode} type */
    const resolvesToUnknown = (type) =>
      resolvedTypeMatches(type, environment, (resolved, matches) => {
        if (resolved.type === 'TSUnknownKeyword') return true;
        if (resolved.type === 'TSUnionType') return resolved.types.some(matches);
        if (resolved.type !== 'TSTypeReference') return false;
        const name = typeReferenceName(resolved);
        if (name !== 'Promise' && name !== 'PromiseLike') return false;
        const value = resolved.typeArguments?.params[0];
        return value !== undefined && matches(value);
      });

    /** @param {FunctionWithReturnType} node */
    const checkReturnType = (node) => {
      const annotation = node.returnType;
      if (annotation === undefined) return;
      defer(() => {
        if (!resolvesToUnknown(annotation.typeAnnotation)) return;
        context.report({ node: annotation.typeAnnotation, messageId: 'unknownReturn' });
      });
    };

    return {
      ...listeners,
      ArrowFunctionExpression: checkReturnType,
      FunctionDeclaration: checkReturnType,
      FunctionExpression: checkReturnType,
      TSCallSignatureDeclaration: checkReturnType,
      TSConstructSignatureDeclaration: checkReturnType,
      TSConstructorType: checkReturnType,
      TSDeclareFunction: checkReturnType,
      TSEmptyBodyFunctionExpression: checkReturnType,
      TSFunctionType: checkReturnType,
      TSMethodSignature: checkReturnType,
    };
  },
};
