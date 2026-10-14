import { lexicalTypeParameterNames } from './lexical-type-parameters.js';

/** @typedef {import('@typescript-eslint/utils').TSESLint.RuleListener} RuleListener */
/** @typedef {import('@typescript-eslint/utils').TSESTree.Node} Node */
/** @typedef {import('@typescript-eslint/utils').TSESTree.TSConditionalType} ConditionalType */
/** @typedef {import('@typescript-eslint/utils').TSESTree.TSInterfaceDeclaration} InterfaceDeclaration */
/** @typedef {import('@typescript-eslint/utils').TSESTree.TSTypeAliasDeclaration} AliasDeclaration */
/** @typedef {import('@typescript-eslint/utils').TSESTree.TSTypeReference} TypeReference */
/** @typedef {import('@typescript-eslint/utils').TSESTree.TypeNode} TypeNode */

/**
 * @typedef {object} TypeBinding
 * @property {AliasDeclaration | undefined} alias Set when the binding is a type alias.
 * @property {string} name
 * @property {Node} scope The block that owns the declaration.
 */

/**
 * @typedef {object} Substitution
 * @property {TypeNode} type
 * @property {Substitutions} substitutions
 */

/** @typedef {ReadonlyMap<string, Substitution>} Substitutions */

/**
 * @typedef {object} TypeAliasEnvironment
 * @property {readonly AliasDeclaration[]} aliases
 * @property {ReadonlyMap<string, readonly InterfaceDeclaration[]>} interfaces Top-level interfaces.
 * @property {ReadonlyMap<string, readonly TypeBinding[]>} bindingsByName
 * @property {ReadonlyMap<ConditionalType, ReadonlySet<string>>} inferredNames
 */

/**
 * @callback ResolvedTypeMatcher
 * @param {TypeNode} type
 * @param {(child: TypeNode) => boolean} matches
 * @returns {boolean}
 */

/**
 * @param {Node} node
 * @returns {Node} The nearest block that scopes a type declaration.
 */
function enclosingTypeScope(node) {
  let current = node.parent;
  while (current) {
    if (
      current.type === 'Program' ||
      current.type === 'BlockStatement' ||
      current.type === 'TSModuleBlock' ||
      current.type === 'StaticBlock' ||
      current.type === 'SwitchStatement'
    ) {
      return current;
    }
    current = current.parent;
  }
  return node;
}

/**
 * @param {Node} node
 * @returns {{ alias: AliasDeclaration | undefined, name: string } | undefined}
 */
function declaredTypeBinding(node) {
  if (node.type === 'TSTypeAliasDeclaration') return { alias: node, name: node.id.name };
  if (
    node.type === 'TSInterfaceDeclaration' ||
    node.type === 'TSEnumDeclaration' ||
    node.type === 'ClassDeclaration' ||
    node.type === 'ClassExpression'
  ) {
    return node.id === null ? undefined : { alias: undefined, name: node.id.name };
  }
  if (
    node.type === 'ImportSpecifier' ||
    node.type === 'ImportDefaultSpecifier' ||
    node.type === 'ImportNamespaceSpecifier'
  ) {
    return { alias: undefined, name: node.local.name };
  }
  return undefined;
}

/**
 * @param {Node} node
 * @returns {boolean}
 */
function isTopLevelDeclaration(node) {
  const { parent } = node;
  if (parent === undefined) return false;
  if (parent.type === 'Program') return true;
  return (
    (parent.type === 'ExportNamedDeclaration' || parent.type === 'ExportDefaultDeclaration') &&
    parent.parent?.type === 'Program'
  );
}

/**
 * Collects every lexical type binding while ESLint walks the program. The collected data is
 * complete only at `Program:exit`, because a type can be used before its declaration, so the
 * checks of a rule run through `defer`.
 *
 * @returns {{
 *   environment: TypeAliasEnvironment,
 *   listeners: RuleListener,
 *   defer: (check: () => void) => void,
 * }}
 */
export function createTypeEnvironmentCollector() {
  /** @type {Map<string, TypeBinding[]>} */
  const bindingsByName = new Map();
  /** @type {AliasDeclaration[]} */
  const aliases = [];
  /** @type {Map<string, InterfaceDeclaration[]>} */
  const interfaces = new Map();
  /** @type {Map<ConditionalType, Set<string>>} */
  const inferredNames = new Map();
  /** @type {(() => void)[]} */
  const deferred = [];

  /** @param {Node} node */
  const collect = (node) => {
    const declared = declaredTypeBinding(node);
    if (declared === undefined) return;
    const bindings = bindingsByName.get(declared.name) ?? [];
    bindings.push({ ...declared, scope: enclosingTypeScope(node) });
    bindingsByName.set(declared.name, bindings);
    if (declared.alias !== undefined) aliases.push(declared.alias);
  };

  return {
    environment: { aliases, interfaces, bindingsByName, inferredNames },
    listeners: {
      TSTypeAliasDeclaration: collect,
      TSEnumDeclaration: collect,
      ClassDeclaration: collect,
      ClassExpression: collect,
      ImportSpecifier: collect,
      ImportDefaultSpecifier: collect,
      ImportNamespaceSpecifier: collect,
      TSInterfaceDeclaration(node) {
        collect(node);
        if (!isTopLevelDeclaration(node)) return;
        const declarations = interfaces.get(node.id.name) ?? [];
        declarations.push(node);
        interfaces.set(node.id.name, declarations);
      },
      TSInferType(node) {
        /** @type {Node} */
        let child = node;
        /** @type {Node | undefined} */
        let current = node.parent;
        while (current) {
          if (current.type === 'TSConditionalType' && current.extendsType === child) {
            const names = inferredNames.get(current) ?? new Set();
            names.add(node.typeParameter.name.name);
            inferredNames.set(current, names);
          }
          child = current;
          current = current.parent;
        }
      },
      'Program:exit'() {
        for (const check of deferred) check();
      },
    },
    defer: (check) => {
      deferred.push(check);
    },
  };
}

/**
 * @param {Node} ancestor
 * @param {Node} node
 * @returns {number | undefined} The number of parents between the node and its ancestor.
 */
function ancestorDistance(ancestor, node) {
  /** @type {Node | undefined} */
  let current = node;
  let distance = 0;
  while (current) {
    if (current === ancestor) return distance;
    current = current.parent;
    distance += 1;
  }
  return undefined;
}

/**
 * @param {string} name
 * @param {Node} use
 * @param {TypeAliasEnvironment} environment
 * @returns {readonly TypeBinding[]}
 */
function nearestTypeBindings(name, use, environment) {
  const candidates = environment.bindingsByName.get(name) ?? [];
  let nearestDistance = Number.POSITIVE_INFINITY;
  /** @type {TypeBinding[]} */
  let nearest = [];
  for (const candidate of candidates) {
    const distance = ancestorDistance(candidate.scope, use);
    if (distance === undefined || distance > nearestDistance) continue;
    if (distance === nearestDistance) {
      nearest.push(candidate);
      continue;
    }
    nearestDistance = distance;
    nearest = [candidate];
  }
  return nearest;
}

/**
 * Resolves the nearest visible alias with this name, respecting lexical shadowing.
 *
 * @param {string} name
 * @param {Node} use
 * @param {TypeAliasEnvironment} environment
 * @returns {AliasDeclaration | undefined}
 */
export function visibleTypeAlias(name, use, environment) {
  if (lexicalTypeParameterNames(use, environment.inferredNames).has(name)) return undefined;
  const [binding, ...others] = nearestTypeBindings(name, use, environment);
  return others.length === 0 ? binding?.alias : undefined;
}

/**
 * @param {string} name
 * @param {Node} use
 * @param {TypeAliasEnvironment} environment
 * @returns {boolean} Whether a local declaration shadows a built-in type at this use.
 */
export function hasVisibleTypeBinding(name, use, environment) {
  return (
    lexicalTypeParameterNames(use, environment.inferredNames).has(name) ||
    nearestTypeBindings(name, use, environment).length > 0
  );
}

/**
 * @param {TypeReference} type
 * @returns {string | undefined}
 */
export function typeReferenceName(type) {
  return type.typeName.type === 'Identifier' ? type.typeName.name : undefined;
}

/**
 * @param {AliasDeclaration} alias
 * @param {TypeReference} reference
 * @param {Substitutions} base
 * @returns {Substitutions | undefined}
 */
function aliasSubstitutions(alias, reference, base) {
  const parameters = alias.typeParameters?.params ?? [];
  const typeArguments = reference.typeArguments?.params ?? [];
  /** @type {Map<string, Substitution>} */
  const next = new Map(base);
  for (const [index, parameter] of parameters.entries()) {
    const explicitArgument = typeArguments[index];
    const argument = explicitArgument ?? parameter.default;
    if (argument === undefined) return undefined;
    const argumentSubstitutions = explicitArgument === undefined ? next : base;
    next.set(parameter.name.name, {
      type: argument,
      substitutions: new Map(argumentSubstitutions),
    });
  }
  return next;
}

/**
 * Matches a type after resolving visible aliases and substituting their type parameters.
 *
 * @param {TypeNode} type
 * @param {TypeAliasEnvironment} environment
 * @param {ResolvedTypeMatcher} matcher
 * @returns {boolean}
 */
export function resolvedTypeMatches(type, environment, matcher) {
  /**
   * @param {TypeNode} current
   * @param {Substitutions} substitutions
   * @param {ReadonlySet<AliasDeclaration>} resolvingAliases
   * @returns {boolean}
   */
  const evaluate = (current, substitutions, resolvingAliases) => {
    if (current.type === 'TSTypeReference') {
      const name = typeReferenceName(current);
      if (name !== undefined) {
        const substitution = substitutions.get(name);
        if (substitution !== undefined && !current.typeArguments?.params.length) {
          return evaluate(substitution.type, substitution.substitutions, resolvingAliases);
        }
        const alias = visibleTypeAlias(name, current, environment);
        if (alias !== undefined && !resolvingAliases.has(alias)) {
          const nextSubstitutions = aliasSubstitutions(alias, current, substitutions);
          if (nextSubstitutions !== undefined) {
            return evaluate(
              alias.typeAnnotation,
              nextSubstitutions,
              new Set([...resolvingAliases, alias]),
            );
          }
        }
      }
    }
    return matcher(current, (child) => evaluate(child, substitutions, resolvingAliases));
  };

  return evaluate(type, new Map(), new Set());
}
