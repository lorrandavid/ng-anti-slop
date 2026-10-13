import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/** @typedef {import('@typescript-eslint/utils').TSESTree.ClassDeclaration} ClassDeclaration */
/** @typedef {import('@typescript-eslint/utils').TSESTree.ClassElement} ClassElement */
/** @typedef {import('@typescript-eslint/utils').TSESTree.Identifier} Identifier */
/** @typedef {import('@typescript-eslint/utils').TSESTree.MethodDefinition} MethodDefinition */
/** @typedef {import('@typescript-eslint/utils').TSESTree.ObjectExpression} ObjectExpression */
/** @typedef {import('@typescript-eslint/utils').TSESTree.PropertyDefinition} PropertyDefinition */

// Expression contexts in an Angular template: interpolation, bindings, control flow and `@let`.
const templateExpressionPatterns = [
  /\{\{([\s\S]*?)\}\}/g,
  /(?:\[[^\]]+\]|\([^)]+\)|\*\w+)\s*=\s*(["'])([\s\S]*?)\1/g,
  /@(?:else if|if|for|switch|case)\s*\(([\s\S]*?)\)\s*\{/g,
  /@let\s+\w+\s*=\s*([^;]*);/g,
];

// Inputs, outputs and models are the public API of a component, so they stay public.
const signalApiFunctions = new Set(['input', 'output', 'model', 'outputFromObservable']);

/**
 * @param {string} template
 * @returns {Set<string>} The names that the template reads from its component class.
 */
function templateReferencedNames(template) {
  const names = new Set();
  for (const pattern of templateExpressionPatterns) {
    for (const match of template.matchAll(pattern)) {
      const expression = (match.at(-1) ?? '')
        .replace(/(["'`])(?:\\.|(?!\1).)*\1/g, '')
        .replace(/\bthis\./g, '');
      for (const [name] of expression.matchAll(/(?<![\w$.])[A-Za-z_$][\w$]*/g)) names.add(name);
    }
  }
  return names;
}

/**
 * @param {ClassDeclaration} classNode
 * @returns {ObjectExpression | undefined}
 */
function componentMetadata(classNode) {
  for (const { expression } of classNode.decorators) {
    if (
      expression.type === 'CallExpression' &&
      expression.callee.type === 'Identifier' &&
      expression.callee.name === 'Component'
    ) {
      const [metadata] = expression.arguments;
      return metadata?.type === 'ObjectExpression' ? metadata : undefined;
    }
  }
  return undefined;
}

/**
 * @param {ObjectExpression} metadata
 * @param {string} filename
 * @returns {string | undefined} The inline template or the contents of the `templateUrl` file.
 */
function templateText(metadata, filename) {
  for (const property of metadata.properties) {
    if (property.type !== 'Property' || property.key.type !== 'Identifier') continue;
    const { value } = property;
    if (property.key.name === 'template') {
      if (value.type === 'TemplateLiteral') {
        return value.quasis.map((quasi) => quasi.value.cooked).join('');
      }
      if (value.type === 'Literal' && typeof value.value === 'string') return value.value;
    }
    if (
      property.key.name === 'templateUrl' &&
      value.type === 'Literal' &&
      typeof value.value === 'string'
    ) {
      return readFileSync(resolve(dirname(filename), value.value), 'utf8');
    }
  }
  return undefined;
}

/** @param {ClassElement} member */
function isSignalApiMember(member) {
  if (member.type !== 'PropertyDefinition' || member.value?.type !== 'CallExpression') return false;
  const { callee } = member.value;
  const root = callee.type === 'MemberExpression' ? callee.object : callee;
  return root.type === 'Identifier' && signalApiFunctions.has(root.name);
}

/**
 * @typedef {object} Candidate
 * @property {PropertyDefinition | MethodDefinition} member
 * @property {Identifier} key
 */

/**
 * @param {ClassElement} member
 * @returns {Candidate | undefined} A public member that is not part of the component API.
 */
function candidate(member) {
  if (member.type !== 'PropertyDefinition' && member.type !== 'MethodDefinition') return undefined;
  const { key } = member;
  if (key.type !== 'Identifier' || member.computed) return undefined;
  if (member.type === 'MethodDefinition' && member.kind === 'constructor') return undefined;
  const isPublic = member.accessibility === undefined || member.accessibility === 'public';
  const isLifecycleHook = /^ng[A-Z]/.test(key.name);
  const isExcluded =
    member.static || member.override || member.decorators.length > 0 || isLifecycleHook;
  return isPublic && !isExcluded && !isSignalApiMember(member) ? { member, key } : undefined;
}

/**
 * The Angular style guide asks for `protected` on members that only the template uses. A rule
 * cannot see usage in other files, such as tests, so the report names the exception.
 *
 * @type {import('@typescript-eslint/utils').TSESLint.RuleModule<'protectedMember', []>}
 */
export const protectedTemplateMembersRule = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Require protected on public component members that the template reads.',
    },
    fixable: 'code',
    schema: [],
    messages: {
      protectedMember:
        "'{{name}}' is read by the template. Make it protected unless other code needs it.",
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      ClassDeclaration(classNode) {
        const metadata = componentMetadata(classNode);
        if (metadata === undefined) return;
        const template = templateText(metadata, context.filename);
        if (template === undefined) return;
        const names = templateReferencedNames(template);
        for (const element of classNode.body.body) {
          const found = candidate(element);
          if (found === undefined || !names.has(found.key.name)) continue;
          const { member, key } = found;
          context.report({
            node: key,
            messageId: 'protectedMember',
            data: { name: key.name },
            fix: (fixer) => {
              const first = context.sourceCode.getFirstToken(member);
              return member.accessibility === 'public' && first
                ? fixer.replaceText(first, 'protected')
                : fixer.insertTextBeforeRange(member.range, 'protected ');
            },
          });
        }
      },
    };
  },
};
