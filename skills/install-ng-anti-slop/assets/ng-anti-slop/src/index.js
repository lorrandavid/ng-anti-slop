import { protectedTemplateMembersRule } from './rules/protected-template-members.js';

/** Generic ESLint rules for the Angular style guide that no published rule covers. */
const ngAntiSlopPlugin = {
  meta: { name: 'ng-anti-slop' },
  rules: {
    'protected-template-members': protectedTemplateMembersRule,
  },
};

export default ngAntiSlopPlugin;
