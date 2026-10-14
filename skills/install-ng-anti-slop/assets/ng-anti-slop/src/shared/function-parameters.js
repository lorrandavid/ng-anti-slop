/** @typedef {import('@typescript-eslint/utils').TSESLint.SourceCode} SourceCode */
/** @typedef {import('@typescript-eslint/utils').TSESTree.Parameter} Parameter */
/** @typedef {import('@typescript-eslint/utils').TSESTree.DestructuringPattern} DestructuringPattern */
/** @typedef {Parameter | DestructuringPattern} FunctionParameter */
/** @typedef {import('@typescript-eslint/utils').TSESTree.TSTypeAnnotation} TypeAnnotation */
/** @typedef {import('@typescript-eslint/utils').TSESTree.TypeNode} TypeNode */

/**
 * @param {TypeNode} type
 * @returns {boolean} Whether the type is or contains TypeScript's absorbing unknown top type.
 */
export function containsUnknownType(type) {
  if (type.type === 'TSUnknownKeyword') return true;
  return type.type === 'TSUnionType' && type.types.some(containsUnknownType);
}

/**
 * @param {FunctionParameter} parameter
 * @returns {TypeAnnotation | undefined} The annotation of a parameter or of its wrapped binding.
 */
export function functionParameterTypeAnnotation(parameter) {
  if (parameter.type === 'TSParameterProperty') {
    return functionParameterTypeAnnotation(parameter.parameter);
  }
  if (parameter.type === 'RestElement') {
    return parameter.typeAnnotation ?? functionParameterTypeAnnotation(parameter.argument);
  }
  if (parameter.type === 'AssignmentPattern') {
    return parameter.typeAnnotation ?? functionParameterTypeAnnotation(parameter.left);
  }
  if (parameter.type === 'MemberExpression') return undefined;
  return parameter.typeAnnotation;
}

/**
 * @param {FunctionParameter} parameter
 * @param {SourceCode} sourceCode
 * @returns {string} The local binding of a parameter, without its annotation and default value.
 */
export function functionParameterBindingName(parameter, sourceCode) {
  if (parameter.type === 'TSParameterProperty') {
    return functionParameterBindingName(parameter.parameter, sourceCode);
  }
  if (parameter.type === 'AssignmentPattern') {
    return functionParameterBindingName(parameter.left, sourceCode);
  }
  if (parameter.type === 'RestElement') {
    return functionParameterBindingName(parameter.argument, sourceCode);
  }
  if (parameter.type === 'Identifier') return parameter.name;
  if (parameter.type === 'MemberExpression') return sourceCode.getText(parameter);

  const annotationStart = parameter.typeAnnotation?.range[0];
  const text = sourceCode.getText(parameter);
  return annotationStart === undefined
    ? text
    : text.slice(0, annotationStart - parameter.range[0]).trimEnd();
}
