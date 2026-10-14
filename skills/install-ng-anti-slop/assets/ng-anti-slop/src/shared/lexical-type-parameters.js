/** @typedef {import('@typescript-eslint/utils').TSESTree.Node} Node */
/** @typedef {import('@typescript-eslint/utils').TSESTree.TSConditionalType} ConditionalType */

/**
 * Collects the type binders that are in scope at a node and can shadow module aliases.
 *
 * @param {Node} node
 * @param {ReadonlyMap<ConditionalType, ReadonlySet<string>>} inferredNames Names that each
 *   conditional type declares with `infer` in its `extends` clause.
 * @returns {ReadonlySet<string>}
 */
export function lexicalTypeParameterNames(node, inferredNames) {
  /** @type {Set<string>} */
  const names = new Set();
  /** @type {Node} */
  let descendant = node;
  /** @type {Node | undefined} */
  let current = node;
  while (current !== undefined && current.type !== 'Program') {
    if ('typeParameters' in current) {
      for (const parameter of current.typeParameters?.params ?? []) names.add(parameter.name.name);
    }
    if (
      current.type === 'TSMappedType' &&
      (descendant === current.nameType || descendant === current.typeAnnotation)
    ) {
      names.add(current.key.name);
    }
    if (current.type === 'TSConditionalType' && descendant === current.trueType) {
      for (const name of inferredNames.get(current) ?? []) names.add(name);
    }
    descendant = current;
    current = current.parent;
  }
  return names;
}
