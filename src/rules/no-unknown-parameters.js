import {
  containsUnknownType,
  functionParameterBindingName,
  functionParameterTypeAnnotation,
} from '../shared/function-parameters.js';

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

/**
 * @param {ParameterOwner} owner
 * @param {string} parameterName
 * @returns {boolean}
 */
function isTypePredicateSubject(owner, parameterName) {
  const predicate = owner.returnType?.typeAnnotation;
  return (
    predicate?.type === 'TSTypePredicate' &&
    predicate.parameterName.type === 'Identifier' &&
    predicate.parameterName.name === parameterName
  );
}

/** @type {import('@typescript-eslint/utils').TSESLint.RuleModule<'unknownParameter', []>} */
export const noUnknownParametersRule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow explicitly unknown function parameters except `cause` and type-predicate subjects; decode unknown input at its I/O boundary instead.',
    },
    schema: [],
    messages: {
      unknownParameter:
        'Parameter `{{parameter}}` leaves input unparsed. Accept a named domain type; run the expected schema or parser at the I/O boundary before calling this function.',
    },
  },
  defaultOptions: [],
  create(context) {
    /** @param {ParameterOwner} node */
    const checkParameters = (node) => {
      for (const parameter of node.params) {
        const annotation = functionParameterTypeAnnotation(parameter);
        if (annotation === undefined || !containsUnknownType(annotation.typeAnnotation)) continue;
        const name = functionParameterBindingName(parameter, context.sourceCode);
        if (name === 'cause' || isTypePredicateSubject(node, name)) continue;
        context.report({
          node: annotation.typeAnnotation,
          messageId: 'unknownParameter',
          data: { parameter: name },
        });
      }
    };

    return {
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
