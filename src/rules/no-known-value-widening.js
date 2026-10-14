import {
  classifyUnsafeDictionaryValue,
  classifyWideningTarget,
  isKnownEvidenceExpression,
} from '../shared/dictionary-types.js';
import {
  containsUnknownType,
  functionParameterBindingName,
  functionParameterTypeAnnotation,
} from '../shared/function-parameters.js';
import { resolveVariable } from '../shared/scope.js';
import { createTypeEnvironmentCollector } from '../shared/type-alias-resolution.js';

/** @typedef {import('../shared/scope.js').SourceCode} SourceCode */
/** @typedef {import('../shared/scope.js').Variable} Variable */
/** @typedef {import('../shared/dictionary-types.js').TypeEnvironment} TypeEnvironment */
/** @typedef {import('../shared/dictionary-types.js').WideningTargetKind} WideningTargetKind */
/** @typedef {import('@typescript-eslint/utils').TSESTree.ArrowFunctionExpression} ArrowFunction */
/** @typedef {import('@typescript-eslint/utils').TSESTree.Expression} Expression */
/** @typedef {import('@typescript-eslint/utils').TSESTree.FunctionDeclaration} FunctionDeclaration */
/** @typedef {import('@typescript-eslint/utils').TSESTree.FunctionExpression} FunctionExpression */
/** @typedef {import('@typescript-eslint/utils').TSESTree.Node} Node */
/** @typedef {import('@typescript-eslint/utils').TSESTree.PropertyName} PropertyName */
/** @typedef {import('@typescript-eslint/utils').TSESTree.TSDeclareFunction} DeclareFunction */
/** @typedef {import('@typescript-eslint/utils').TSESTree.TSEmptyBodyFunctionExpression} EmptyBodyFunction */
/** @typedef {import('@typescript-eslint/utils').TSESTree.TSTypeAnnotation} TypeAnnotation */
/** @typedef {import('@typescript-eslint/utils').TSESTree.TypeNode} TypeNode */
/** @typedef {import('@typescript-eslint/utils').TSESTree.VariableDeclarator} VariableDeclarator */
/** @typedef {ArrowFunction | FunctionDeclaration | FunctionExpression | DeclareFunction | EmptyBodyFunction} FunctionLike */

/**
 * @param {Expression} expression
 * @returns {Expression}
 */
function unwrapExpression(expression) {
  let current = expression;
  while (
    current.type === 'TSAsExpression' ||
    current.type === 'TSSatisfiesExpression' ||
    current.type === 'TSTypeAssertion' ||
    current.type === 'TSNonNullExpression'
  ) {
    current = current.expression;
  }
  return current;
}

/**
 * @param {Variable} variable
 * @returns {VariableDeclarator | undefined}
 */
function variableDeclarator(variable) {
  const [definition, ...others] = variable.defs;
  return others.length === 0 && definition?.node.type === 'VariableDeclarator'
    ? definition.node
    : undefined;
}

/**
 * @param {Variable} variable
 * @param {VariableDeclarator} declarator
 */
function isStableConstVariable(variable, declarator) {
  return (
    declarator.parent.type === 'VariableDeclaration' &&
    declarator.parent.kind === 'const' &&
    variable.references.every((reference) => reference.init || !reference.isWrite())
  );
}

/**
 * @param {Node} node
 * @returns {node is FunctionLike}
 */
function isFunctionLike(node) {
  return (
    node.type === 'ArrowFunctionExpression' ||
    node.type === 'FunctionDeclaration' ||
    node.type === 'FunctionExpression' ||
    node.type === 'TSDeclareFunction' ||
    node.type === 'TSEmptyBodyFunctionExpression'
  );
}

/**
 * @param {SourceCode} sourceCode
 * @param {Expression} expression
 * @param {Set<Variable>} visitedVariables
 * @returns {boolean}
 */
function hasKnownEvidence(sourceCode, expression, visitedVariables = new Set()) {
  if (isKnownEvidenceExpression(expression)) return true;
  const unwrapped = unwrapExpression(expression);
  if (unwrapped.type !== 'Identifier') return false;
  const variable = resolveVariable(sourceCode, unwrapped);
  if (variable === undefined || visitedVariables.has(variable)) return false;
  const declarator = variableDeclarator(variable);
  if (
    declarator === undefined ||
    declarator.init === null ||
    !isStableConstVariable(variable, declarator)
  ) {
    return false;
  }
  visitedVariables.add(variable);
  return hasKnownEvidence(sourceCode, declarator.init, visitedVariables);
}

/**
 * @param {SourceCode} sourceCode
 * @param {Expression} callee
 * @returns {FunctionLike | undefined} The function that a call invokes, when the file declares it.
 */
function localFunctionForCall(sourceCode, callee) {
  const unwrapped = unwrapExpression(callee);
  if (isFunctionLike(unwrapped)) return unwrapped;
  if (unwrapped.type !== 'Identifier') return undefined;
  const variable = resolveVariable(sourceCode, unwrapped);
  const [definition, ...others] = variable?.defs ?? [];
  if (definition === undefined || others.length > 0) return undefined;
  if (isFunctionLike(definition.node)) return definition.node;
  if (definition.node.type !== 'VariableDeclarator' || definition.node.init === null) {
    return undefined;
  }
  const initializer = unwrapExpression(definition.node.init);
  return isFunctionLike(initializer) ? initializer : undefined;
}

/**
 * @param {SourceCode} sourceCode
 * @param {Variable} variable
 * @returns {TypeAnnotation | undefined}
 */
function variableTypeAnnotation(sourceCode, variable) {
  const [definition, ...others] = variable.defs;
  if (definition === undefined || others.length > 0) return undefined;
  const { node } = definition;
  if (node.type === 'VariableDeclarator') {
    return node.id.type === 'Identifier' ? node.id.typeAnnotation : undefined;
  }
  // A parameter definition points at its function; a function-name definition points at the same
  // function but names its `id`.
  if (!isFunctionLike(node) || definition.name === node.id) return undefined;
  const parameter = node.params.find(
    (candidate) => functionParameterBindingName(candidate, sourceCode) === variable.name,
  );
  return parameter === undefined ? undefined : functionParameterTypeAnnotation(parameter);
}

/**
 * @param {TypeNode} type
 * @param {TypeEnvironment} environment
 */
function hasInformativeType(type, environment) {
  return classifyUnsafeDictionaryValue(type, environment) === undefined;
}

/**
 * @param {SourceCode} sourceCode
 * @param {Expression} expression
 * @param {TypeEnvironment} environment
 * @param {Set<Variable>} visitedVariables
 * @returns {boolean}
 */
function hasKnownCallArgumentEvidence(
  sourceCode,
  expression,
  environment,
  visitedVariables = new Set(),
) {
  if (expression.type === 'TSNonNullExpression' || expression.type === 'TSSatisfiesExpression') {
    return hasKnownCallArgumentEvidence(
      sourceCode,
      expression.expression,
      environment,
      visitedVariables,
    );
  }
  if (expression.type === 'TSAsExpression' || expression.type === 'TSTypeAssertion') {
    return hasInformativeType(expression.typeAnnotation, environment);
  }
  if (expression.type === 'CallExpression') {
    const returnType = localFunctionForCall(sourceCode, expression.callee)?.returnType
      ?.typeAnnotation;
    return returnType !== undefined && hasInformativeType(returnType, environment);
  }
  if (expression.type !== 'Identifier') return isKnownEvidenceExpression(expression);
  const variable = resolveVariable(sourceCode, expression);
  if (variable === undefined || visitedVariables.has(variable)) return false;
  const annotation = variableTypeAnnotation(sourceCode, variable);
  if (annotation !== undefined) return hasInformativeType(annotation.typeAnnotation, environment);
  const declarator = variableDeclarator(variable);
  if (
    declarator === undefined ||
    declarator.init === null ||
    !isStableConstVariable(variable, declarator)
  ) {
    return false;
  }
  visitedVariables.add(variable);
  return hasKnownCallArgumentEvidence(sourceCode, declarator.init, environment, visitedVariables);
}

/**
 * @param {SourceCode} sourceCode
 * @param {FunctionLike} owner
 * @returns {number | undefined}
 */
function typePredicateSubjectIndex(sourceCode, owner) {
  const predicate = owner.returnType?.typeAnnotation;
  if (predicate?.type !== 'TSTypePredicate' || predicate.parameterName.type !== 'Identifier') {
    return undefined;
  }
  const subject = predicate.parameterName.name;
  const index = owner.params.findIndex(
    (parameter) => functionParameterBindingName(parameter, sourceCode) === subject,
  );
  return index === -1 ? undefined : index;
}

/**
 * @param {Node} node
 * @returns {ArrowFunction | FunctionDeclaration | FunctionExpression | undefined}
 */
function enclosingFunction(node) {
  let current = node.parent;
  while (current !== undefined && current.type !== 'Program') {
    if (
      current.type === 'ArrowFunctionExpression' ||
      current.type === 'FunctionDeclaration' ||
      current.type === 'FunctionExpression'
    ) {
      return current;
    }
    current = current.parent;
  }
  return undefined;
}

/**
 * @param {SourceCode} sourceCode
 * @param {PropertyName | Node} key
 */
function sourceKeyName(sourceCode, key) {
  if (key.type === 'Identifier' || key.type === 'PrivateIdentifier') return key.name;
  if (key.type === 'Literal') return String(key.value);
  return sourceCode.getText(key);
}

/**
 * @param {SourceCode} sourceCode
 * @param {FunctionLike | undefined} owner
 */
function functionName(sourceCode, owner) {
  if (owner === undefined) return 'anonymous function';
  if (owner.id !== null && owner.id !== undefined) return owner.id.name;
  const { parent } = owner;
  if (parent.type === 'VariableDeclarator' && parent.id.type === 'Identifier') {
    return parent.id.name;
  }
  if (parent.type === 'MethodDefinition') return sourceKeyName(sourceCode, parent.key);
  return 'anonymous function';
}

/** @param {Expression} expression */
function isEmptyObjectExpression(expression) {
  const unwrapped = unwrapExpression(expression);
  return unwrapped.type === 'ObjectExpression' && unwrapped.properties.length === 0;
}

/** @param {Node} node */
function hasParentAssertion(node) {
  const type = node.parent?.type;
  return type === 'TSAsExpression' || type === 'TSTypeAssertion';
}

/** @type {import('@typescript-eslint/utils').TSESLint.RuleModule<'widening', []>} */
export const noKnownValueWideningRule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow syntactically established values from flowing into explicitly broad or anonymous target types that discard useful evidence.',
    },
    schema: [],
    messages: {
      widening:
        'The explicit {{target}} type on {{subject}} discards known type evidence. Keep inference, validate with `satisfies`, or use a named owner contract.',
    },
  },
  defaultOptions: [],
  create(context) {
    const { sourceCode } = context;
    const { environment, listeners, defer } = createTypeEnvironmentCollector();

    /**
     * @param {Expression} expression
     * @param {TypeNode | undefined} targetType
     * @param {string} subject
     */
    const reportFlow = (expression, targetType, subject) => {
      if (targetType === undefined) return;
      defer(() => {
        const target = classifyWideningTarget(targetType, environment);
        if (target === undefined) return;
        const isDictionaryAccumulator =
          target === 'open dictionary' || target === 'generic container';
        if (isDictionaryAccumulator && isEmptyObjectExpression(expression)) return;
        if (!hasKnownEvidence(sourceCode, expression)) return;
        context.report({ node: expression, messageId: 'widening', data: { subject, target } });
      });
    };

    /**
     * @param {TypeAnnotation | undefined} annotation
     * @returns {TypeNode | undefined}
     */
    const annotatedType = (annotation) => annotation?.typeAnnotation;

    /**
     * @param {Expression | null} value
     * @param {TypeAnnotation | undefined} annotation
     * @param {PropertyName} key
     */
    const checkProperty = (value, annotation, key) => {
      if (value === null) return;
      reportFlow(
        value,
        annotatedType(annotation),
        `property \`${sourceKeyName(sourceCode, key)}\``,
      );
    };

    /** @param {import('@typescript-eslint/utils').TSESTree.CallExpression} node */
    const checkTypePredicateCall = (node) => {
      const owner = localFunctionForCall(sourceCode, node.callee);
      if (owner === undefined) return;
      const parameterIndex = typePredicateSubjectIndex(sourceCode, owner);
      if (parameterIndex === undefined) return;
      const parameter = owner.params[parameterIndex];
      const argument = node.arguments[parameterIndex];
      if (parameter === undefined || argument === undefined || argument.type === 'SpreadElement') {
        return;
      }
      const parameterAnnotation = functionParameterTypeAnnotation(parameter);
      if (
        parameterAnnotation === undefined ||
        !containsUnknownType(parameterAnnotation.typeAnnotation)
      ) {
        return;
      }
      defer(() => {
        if (!hasKnownCallArgumentEvidence(sourceCode, argument, environment)) return;
        const parameterName = functionParameterBindingName(parameter, sourceCode);
        context.report({
          node: argument,
          messageId: 'widening',
          data: {
            subject: `argument for parameter \`${parameterName}\` of \`${functionName(sourceCode, owner)}\``,
            target: 'unknown',
          },
        });
      });
    };

    /** @param {import('@typescript-eslint/utils').TSESTree.TSAsExpression | import('@typescript-eslint/utils').TSESTree.TSTypeAssertion} node */
    const checkAssertion = (node) => {
      if (hasParentAssertion(node)) return;
      reportFlow(node.expression, node.typeAnnotation, 'assertion');
    };

    return {
      ...listeners,
      VariableDeclarator(node) {
        if (node.init === null || node.id.type !== 'Identifier') return;
        reportFlow(node.init, annotatedType(node.id.typeAnnotation), `binding \`${node.id.name}\``);
      },
      PropertyDefinition: (node) => checkProperty(node.value, node.typeAnnotation, node.key),
      AccessorProperty: (node) => checkProperty(node.value, node.typeAnnotation, node.key),
      AssignmentExpression(node) {
        if (node.operator !== '=' || node.left.type !== 'Identifier') return;
        const variable = resolveVariable(sourceCode, node.left);
        const declarator = variable === undefined ? undefined : variableDeclarator(variable);
        if (declarator === undefined || declarator.id.type !== 'Identifier') return;
        reportFlow(
          node.right,
          annotatedType(declarator.id.typeAnnotation),
          `binding \`${declarator.id.name}\``,
        );
      },
      CallExpression: checkTypePredicateCall,
      ReturnStatement(node) {
        if (node.argument === null) return;
        const owner = enclosingFunction(node);
        reportFlow(
          node.argument,
          annotatedType(owner?.returnType),
          `return value of \`${functionName(sourceCode, owner)}\``,
        );
      },
      ArrowFunctionExpression(node) {
        if (node.body.type === 'BlockStatement') return;
        reportFlow(
          node.body,
          annotatedType(node.returnType),
          `return value of \`${functionName(sourceCode, node)}\``,
        );
      },
      TSAsExpression: checkAssertion,
      TSTypeAssertion: checkAssertion,
    };
  },
};
