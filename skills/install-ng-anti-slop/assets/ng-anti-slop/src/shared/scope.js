/** @typedef {import('@typescript-eslint/utils').TSESLint.SourceCode} SourceCode */
/** @typedef {import('@typescript-eslint/utils').TSESLint.Scope.Scope} Scope */
/** @typedef {import('@typescript-eslint/utils').TSESLint.Scope.Variable} Variable */
/** @typedef {import('@typescript-eslint/utils').TSESTree.Identifier} Identifier */

/**
 * Resolves an identifier to its binding by walking lexical scopes upward.
 *
 * @param {SourceCode} sourceCode
 * @param {Identifier} identifier
 * @returns {Variable | undefined}
 */
export function resolveVariable(sourceCode, identifier) {
  /** @type {Scope | null} */
  let scope = sourceCode.getScope(identifier);
  while (scope !== null) {
    const variable = scope.set.get(identifier.name);
    if (variable !== undefined) return variable;
    scope = scope.upper;
  }
  return undefined;
}
