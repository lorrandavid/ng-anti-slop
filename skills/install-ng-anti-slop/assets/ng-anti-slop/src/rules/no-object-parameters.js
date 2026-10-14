import {
  functionParameterBindingName,
  functionParameterTypeAnnotation,
} from '../shared/function-parameters.js';
import {
  createTypeEnvironmentCollector,
  resolvedTypeMatches,
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
 *   | import('@typescript-eslint/utils').TSESTree.TSMethodSignature} ParameterOwner
 */

/** @type {import('@typescript-eslint/utils').TSESLint.RuleModule<'objectParameter', []>} */
export const noObjectParametersRule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow object function parameters; inputs must use an owner-provided type and be parsed at their boundary.',
    },
    schema: [],
    messages: {
      objectParameter:
        'Parameter `{{parameter}}` uses the broad `object` type. Accept a named owner type; parse external input at its boundary before calling this function.',
    },
  },
  defaultOptions: [],
  create(context) {
    const { environment, listeners, defer } = createTypeEnvironmentCollector();

    /** @param {TypeNode} type */
    const resolvesToObject = (type) =>
      resolvedTypeMatches(type, environment, (resolved, matches) => {
        if (resolved.type === 'TSObjectKeyword') return true;
        return resolved.type === 'TSUnionType' && resolved.types.some(matches);
      });

    /** @param {ParameterOwner} node */
    const checkParameters = (node) => {
      for (const parameter of node.params) {
        const annotation = functionParameterTypeAnnotation(parameter);
        if (annotation === undefined) continue;
        defer(() => {
          if (!resolvesToObject(annotation.typeAnnotation)) return;
          context.report({
            node: annotation.typeAnnotation,
            messageId: 'objectParameter',
            data: { parameter: functionParameterBindingName(parameter, context.sourceCode) },
          });
        });
      }
    };

    return {
      ...listeners,
      ArrowFunctionExpression: checkParameters,
      FunctionDeclaration: checkParameters,
      FunctionExpression: checkParameters,
      TSCallSignatureDeclaration: checkParameters,
      TSConstructSignatureDeclaration: checkParameters,
      TSConstructorType: checkParameters,
      TSDeclareFunction: checkParameters,
      TSEmptyBodyFunctionExpression: checkParameters,
      TSFunctionType: checkParameters,
      TSMethodSignature: checkParameters,
    };
  },
};
