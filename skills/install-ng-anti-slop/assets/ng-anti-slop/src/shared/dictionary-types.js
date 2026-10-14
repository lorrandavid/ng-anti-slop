import {
  hasVisibleTypeBinding,
  typeReferenceName,
  visibleTypeAlias,
} from './type-alias-resolution.js';

/** @typedef {import('./type-alias-resolution.js').TypeAliasEnvironment} TypeEnvironment */
/** @typedef {import('@typescript-eslint/utils').TSESTree.Expression} Expression */
/** @typedef {import('@typescript-eslint/utils').TSESTree.Node} Node */
/** @typedef {import('@typescript-eslint/utils').TSESTree.TSInterfaceDeclaration} InterfaceDeclaration */
/** @typedef {import('@typescript-eslint/utils').TSESTree.TSTypeAliasDeclaration} AliasDeclaration */
/** @typedef {import('@typescript-eslint/utils').TSESTree.TSTypeLiteral} TypeLiteral */
/** @typedef {import('@typescript-eslint/utils').TSESTree.TSTypeReference} TypeReference */
/** @typedef {import('@typescript-eslint/utils').TSESTree.TypeElement} TypeElement */
/** @typedef {import('@typescript-eslint/utils').TSESTree.TypeNode} TypeNode */
/** @typedef {ReadonlyMap<string, TypeNode>} Substitutions */
/** @typedef {'any' | 'empty-object' | 'object' | 'union' | 'unknown'} UnsafeValue */
/** @typedef {'anonymous object' | 'generic container' | 'object' | 'open dictionary' | 'unknown'} WideningTargetKind */

/**
 * @typedef {object} ResolvedType
 * @property {TypeNode} type
 * @property {Substitutions} substitutions
 */

const BUILT_INS = new Set([
  'Record',
  'Readonly',
  'Partial',
  'Required',
  'Pick',
  'Omit',
  'PropertyKey',
  'NonNullable',
]);
const TRANSPARENT_WRAPPERS = new Set(['Readonly', 'Partial', 'Required', 'NonNullable']);

/**
 * @param {string} name
 * @param {Node} use
 * @param {TypeEnvironment} environment
 */
function isBuiltIn(name, use, environment) {
  return BUILT_INS.has(name) && !hasVisibleTypeBinding(name, use, environment);
}

/**
 * @param {TypeNode} type
 * @returns {TypeNode}
 */
function unwrapTransparentType(type) {
  let current = type;
  while (current.type === 'TSTypeOperator' && current.operator === 'readonly') {
    if (current.typeAnnotation === undefined) break;
    current = current.typeAnnotation;
  }
  return current;
}

/**
 * @param {TypeNode} type
 * @param {string} name
 */
function isUnappliedReferenceTo(type, name) {
  const unwrapped = unwrapTransparentType(type);
  return (
    unwrapped.type === 'TSTypeReference' &&
    typeReferenceName(unwrapped) === name &&
    (unwrapped.typeArguments?.params.length ?? 0) === 0
  );
}

/** @param {TypeElement} member */
function isEffectivelyEmptyMember(member) {
  return (
    member.type === 'TSPropertySignature' &&
    member.optional === true &&
    member.typeAnnotation !== undefined &&
    unwrapTransparentType(member.typeAnnotation.typeAnnotation).type === 'TSNeverKeyword'
  );
}

/** @param {TypeLiteral} type */
function isEffectivelyEmptyTypeLiteral(type) {
  return type.members.every(isEffectivelyEmptyMember);
}

/** @param {readonly InterfaceDeclaration[]} declarations */
function isEffectivelyEmptyInterface(declarations) {
  const [type, ...others] = declarations;
  return (
    type !== undefined &&
    others.length === 0 &&
    type.extends.length === 0 &&
    type.body.body.every(isEffectivelyEmptyMember)
  );
}

/**
 * @param {TypeNode} type
 * @param {Substitutions} base
 * @param {ReadonlySet<string>} resolving
 * @returns {TypeNode}
 */
function resolvedSubstitutionArgument(type, base, resolving = new Set()) {
  const unwrapped = unwrapTransparentType(type);
  if (unwrapped.type !== 'TSTypeReference') return type;
  const name = typeReferenceName(unwrapped);
  if (name === undefined || resolving.has(name)) return type;
  const substitution = base.get(name);
  if (substitution === undefined) return type;
  return resolvedSubstitutionArgument(substitution, base, new Set([...resolving, name]));
}

/**
 * @param {AliasDeclaration} alias
 * @param {TypeReference} type
 * @param {Substitutions} base
 * @returns {Substitutions | undefined}
 */
function aliasSubstitution(alias, type, base) {
  const parameters = alias.typeParameters?.params ?? [];
  const typeArguments = type.typeArguments?.params ?? [];
  /** @type {Map<string, TypeNode>} */
  const next = new Map(base);
  for (const [index, parameter] of parameters.entries()) {
    const argument = typeArguments[index] ?? parameter.default;
    if (argument === undefined) return undefined;
    next.set(parameter.name.name, resolvedSubstitutionArgument(argument, next));
  }
  return next;
}

/**
 * @param {TypeNode} type
 * @param {TypeEnvironment} environment
 * @param {Substitutions} substitutions
 * @param {ReadonlySet<string>} resolvingAliases
 * @returns {UnsafeValue | undefined}
 */
function unsafeDirectValue(type, environment, substitutions, resolvingAliases) {
  const unwrapped = unwrapTransparentType(type);
  if (unwrapped.type === 'TSUnknownKeyword') return 'unknown';
  if (unwrapped.type === 'TSAnyKeyword') return 'any';
  if (unwrapped.type === 'TSObjectKeyword') return 'object';
  if (unwrapped.type === 'TSTypeLiteral' && isEffectivelyEmptyTypeLiteral(unwrapped)) {
    return 'empty-object';
  }
  if (unwrapped.type === 'TSUnionType') {
    return unwrapped.types.some(
      (member) =>
        unsafeDirectValue(member, environment, substitutions, resolvingAliases) !== undefined,
    )
      ? 'union'
      : undefined;
  }
  if (unwrapped.type === 'TSIntersectionType') {
    const unsafeMembers = unwrapped.types.map((member) =>
      unsafeDirectValue(member, environment, substitutions, resolvingAliases),
    );
    if (unsafeMembers.includes('any')) return 'any';
    return unsafeMembers.every((member) => member !== undefined) ? unsafeMembers[0] : undefined;
  }
  if (unwrapped.type !== 'TSTypeReference') return undefined;
  const name = typeReferenceName(unwrapped);
  if (name === undefined) return undefined;
  if (TRANSPARENT_WRAPPERS.has(name) && isBuiltIn(name, unwrapped, environment)) {
    const wrapped = unwrapped.typeArguments?.params[0];
    return wrapped === undefined
      ? undefined
      : unsafeDirectValue(wrapped, environment, substitutions, resolvingAliases);
  }
  const substitution = substitutions.get(name);
  if (substitution !== undefined) {
    return isUnappliedReferenceTo(substitution, name)
      ? undefined
      : unsafeDirectValue(substitution, environment, substitutions, resolvingAliases);
  }
  const interfaceDeclarations = environment.interfaces.get(name);
  if (interfaceDeclarations !== undefined) {
    return isEffectivelyEmptyInterface(interfaceDeclarations) ? 'empty-object' : undefined;
  }
  const alias = visibleTypeAlias(name, unwrapped, environment);
  if (alias === undefined || resolvingAliases.has(name)) return undefined;
  const nextSubstitutions = aliasSubstitution(alias, unwrapped, substitutions);
  if (nextSubstitutions === undefined) return undefined;
  return unsafeDirectValue(
    alias.typeAnnotation,
    environment,
    nextSubstitutions,
    new Set([...resolvingAliases, name]),
  );
}

/**
 * @param {TypeNode} type
 * @param {TypeEnvironment} environment
 * @param {Substitutions} substitutions
 * @param {ReadonlySet<string>} resolvingAliases
 * @returns {readonly ResolvedType[]}
 */
function dictionaryValueTypes(type, environment, substitutions, resolvingAliases) {
  const unwrapped = unwrapTransparentType(type);

  if (unwrapped.type === 'TSTypeLiteral') {
    return unwrapped.members.flatMap((member) =>
      member.type === 'TSIndexSignature' && member.typeAnnotation !== undefined
        ? [{ type: member.typeAnnotation.typeAnnotation, substitutions }]
        : [],
    );
  }

  if (unwrapped.type === 'TSMappedType') {
    return unwrapped.typeAnnotation === undefined
      ? []
      : [{ type: unwrapped.typeAnnotation, substitutions }];
  }

  if (unwrapped.type !== 'TSTypeReference') return [];
  const name = typeReferenceName(unwrapped);
  if (name === undefined) return [];

  const substitution = substitutions.get(name);
  if (substitution !== undefined) {
    return isUnappliedReferenceTo(substitution, name)
      ? []
      : dictionaryValueTypes(substitution, environment, substitutions, resolvingAliases);
  }

  if (TRANSPARENT_WRAPPERS.has(name) && isBuiltIn(name, unwrapped, environment)) {
    const wrapped = unwrapped.typeArguments?.params[0];
    return wrapped === undefined
      ? []
      : dictionaryValueTypes(wrapped, environment, substitutions, resolvingAliases);
  }

  if (name === 'Record' && isBuiltIn(name, unwrapped, environment)) {
    const value = unwrapped.typeArguments?.params[1];
    return value === undefined ? [] : [{ type: value, substitutions }];
  }

  if ((name === 'Pick' || name === 'Omit') && isBuiltIn(name, unwrapped, environment)) {
    const source = unwrapped.typeArguments?.params[0];
    return source === undefined
      ? []
      : dictionaryValueTypes(source, environment, substitutions, resolvingAliases);
  }

  const alias = visibleTypeAlias(name, unwrapped, environment);
  if (alias === undefined || resolvingAliases.has(name)) return [];
  const nextSubstitutions = aliasSubstitution(alias, unwrapped, substitutions);
  if (nextSubstitutions === undefined) return [];
  return dictionaryValueTypes(
    alias.typeAnnotation,
    environment,
    nextSubstitutions,
    new Set([...resolvingAliases, name]),
  );
}

/**
 * @param {TypeNode} valueType
 * @param {TypeEnvironment} environment
 * @returns {UnsafeValue | undefined} The escape hatch that the value type contains.
 */
export function classifyUnsafeDictionaryValue(valueType, environment) {
  return unsafeDirectValue(valueType, environment, new Map(), new Set());
}

/**
 * @param {TypeNode} type
 * @param {TypeEnvironment} environment
 * @returns {UnsafeValue | undefined} The escape hatch of the first unsafe dictionary value.
 */
export function classifyUnsafeDictionary(type, environment) {
  for (const valueType of dictionaryValueTypes(type, environment, new Map(), new Set())) {
    const unsafeValue = unsafeDirectValue(
      valueType.type,
      environment,
      valueType.substitutions,
      new Set(),
    );
    if (unsafeValue !== undefined) return unsafeValue;
  }
  return undefined;
}

/**
 * @param {TypeReference} type
 * @param {TypeEnvironment} environment
 * @param {Substitutions} substitutions
 */
function hasBroadRecordKey(type, environment, substitutions) {
  const key = type.typeArguments?.params[0];
  return key === undefined || isBroadMappedKey(key, environment, substitutions);
}

/**
 * @param {TypeNode} type
 * @param {TypeEnvironment} environment
 * @param {Substitutions} substitutions
 * @param {ReadonlySet<string>} visitedAliases
 * @returns {boolean}
 */
function isBroadMappedKey(type, environment, substitutions, visitedAliases = new Set()) {
  const unwrapped = unwrapTransparentType(type);
  if (
    unwrapped.type === 'TSStringKeyword' ||
    unwrapped.type === 'TSNumberKeyword' ||
    unwrapped.type === 'TSSymbolKeyword'
  ) {
    return true;
  }
  if (unwrapped.type === 'TSUnionType') {
    return unwrapped.types.some((member) =>
      isBroadMappedKey(member, environment, substitutions, visitedAliases),
    );
  }
  if (unwrapped.type !== 'TSTypeReference') return false;
  const name = typeReferenceName(unwrapped);
  if (name === undefined) return false;
  const substitution = substitutions.get(name);
  if (substitution !== undefined && !isUnappliedReferenceTo(substitution, name)) {
    return isBroadMappedKey(substitution, environment, substitutions, visitedAliases);
  }
  if (name === 'PropertyKey' && isBuiltIn(name, unwrapped, environment)) return true;
  const alias = visibleTypeAlias(name, unwrapped, environment);
  if (alias === undefined || alias.typeParameters !== undefined || visitedAliases.has(name)) {
    return false;
  }
  return isBroadMappedKey(
    alias.typeAnnotation,
    environment,
    substitutions,
    new Set([...visitedAliases, name]),
  );
}

/**
 * @param {TypeNode} type
 * @param {TypeEnvironment} environment
 * @param {Substitutions} substitutions
 * @param {ReadonlySet<string>} resolvingAliases
 * @returns {WideningTargetKind | undefined}
 */
function classifyAliasBroadTarget(type, environment, substitutions, resolvingAliases) {
  const unwrapped = unwrapTransparentType(type);
  if (unwrapped.type === 'TSUnknownKeyword') return 'unknown';
  if (unwrapped.type === 'TSObjectKeyword') return 'object';
  if (unwrapped.type === 'TSTypeLiteral') {
    return unwrapped.members.some((member) => member.type === 'TSIndexSignature')
      ? 'open dictionary'
      : undefined;
  }
  if (unwrapped.type === 'TSMappedType') {
    return isBroadMappedKey(unwrapped.constraint, environment, substitutions)
      ? 'open dictionary'
      : undefined;
  }
  if (unwrapped.type !== 'TSTypeReference') return undefined;
  const name = typeReferenceName(unwrapped);
  if (name === undefined) return undefined;
  const substitution = substitutions.get(name);
  if (substitution !== undefined) {
    return isUnappliedReferenceTo(substitution, name)
      ? undefined
      : classifyAliasBroadTarget(substitution, environment, substitutions, resolvingAliases);
  }
  if (TRANSPARENT_WRAPPERS.has(name) && isBuiltIn(name, unwrapped, environment)) {
    const wrapped = unwrapped.typeArguments?.params[0];
    return wrapped === undefined
      ? undefined
      : classifyAliasBroadTarget(wrapped, environment, substitutions, resolvingAliases);
  }
  if (name === 'Record' && isBuiltIn(name, unwrapped, environment)) {
    return hasBroadRecordKey(unwrapped, environment, substitutions) ? 'open dictionary' : undefined;
  }
  const alias = visibleTypeAlias(name, unwrapped, environment);
  if (alias === undefined || resolvingAliases.has(name)) return undefined;
  const nextSubstitutions = aliasSubstitution(alias, unwrapped, substitutions);
  if (nextSubstitutions === undefined) return undefined;
  return classifyAliasBroadTarget(
    alias.typeAnnotation,
    environment,
    nextSubstitutions,
    new Set([...resolvingAliases, name]),
  );
}

/**
 * @param {TypeNode} type
 * @param {TypeEnvironment} environment
 * @returns {WideningTargetKind | undefined} The kind of broad type that discards evidence.
 */
export function classifyWideningTarget(type, environment) {
  const unwrapped = unwrapTransparentType(type);
  if (unwrapped.type === 'TSUnknownKeyword') return 'unknown';
  if (unwrapped.type === 'TSObjectKeyword') return 'object';
  if (unwrapped.type === 'TSTypeLiteral') {
    if (unwrapped.members.some((member) => member.type === 'TSIndexSignature')) {
      return 'open dictionary';
    }
    return unwrapped.members.length > 0 ? 'anonymous object' : undefined;
  }
  if (unwrapped.type === 'TSMappedType') return 'open dictionary';
  if (unwrapped.type !== 'TSTypeReference') return undefined;
  const name = typeReferenceName(unwrapped);
  if (name === undefined) return undefined;
  if (TRANSPARENT_WRAPPERS.has(name) && isBuiltIn(name, unwrapped, environment)) {
    const wrapped = unwrapped.typeArguments?.params[0];
    return wrapped === undefined ? undefined : classifyWideningTarget(wrapped, environment);
  }
  if (name === 'Record' && isBuiltIn(name, unwrapped, environment)) {
    return hasBroadRecordKey(unwrapped, environment, new Map()) ? 'open dictionary' : undefined;
  }
  const alias = visibleTypeAlias(name, unwrapped, environment);
  if (alias === undefined) return undefined;
  const substitutions = aliasSubstitution(alias, unwrapped, new Map());
  if (substitutions === undefined) return undefined;
  const resolved = classifyAliasBroadTarget(
    alias.typeAnnotation,
    environment,
    substitutions,
    new Set([name]),
  );
  if (alias.typeParameters === undefined) return resolved;
  return resolved === 'open dictionary' ? 'generic container' : undefined;
}

/**
 * @param {Expression} expression
 * @returns {boolean} Whether the expression syntactically establishes a concrete value.
 */
export function isKnownEvidenceExpression(expression) {
  let current = expression;
  while (
    current.type === 'TSAsExpression' ||
    current.type === 'TSTypeAssertion' ||
    current.type === 'TSNonNullExpression' ||
    current.type === 'TSSatisfiesExpression'
  ) {
    current = current.expression;
  }
  return (
    current.type === 'ObjectExpression' ||
    current.type === 'ArrayExpression' ||
    current.type === 'ArrowFunctionExpression' ||
    current.type === 'ClassExpression' ||
    current.type === 'FunctionExpression' ||
    current.type === 'NewExpression' ||
    current.type === 'Literal' ||
    current.type === 'TemplateLiteral' ||
    current.type === 'UnaryExpression'
  );
}
