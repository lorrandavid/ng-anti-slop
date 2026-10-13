import { RuleTester } from 'eslint';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import tseslint from 'typescript-eslint';
import { protectedTemplateMembersRule } from './protected-template-members.js';

const tester = new RuleTester({ languageOptions: { parser: tseslint.parser } });
const error = { messageId: 'protectedMember' };

/** @param {string} template @param {string} body */
const component = (template, body) =>
  `@Component({ selector: 'app-x', template: \`${template}\` })\nclass X { ${body} }`;

const directory = mkdtempSync(join(tmpdir(), 'protected-template-members-'));
writeFileSync(join(directory, 'x.html'), '<p>{{ title }}</p>');

try {
  tester.run('ng-anti-slop/protected-template-members', protectedTemplateMembersRule, {
    valid: [
      { name: 'already protected', code: component('{{ title }}', "protected title = 'a';") },
      { name: 'not read by the template', code: component('<p></p>', "title = 'a';") },
      { name: 'private member', code: component('{{ title }}', "private title = 'a';") },
      { name: 'input', code: component('{{ title() }}', "title = input('a');") },
      { name: 'required input', code: component('{{ title() }}', 'title = input.required();') },
      { name: 'output', code: component('<p></p>', 'saved = output();') },
      { name: 'model', code: component('{{ title() }}', "title = model('a');") },
      { name: 'decorated member', code: component('{{ title }}', "@HostBinding() title = 'a';") },
      { name: 'static member', code: component('{{ title }}', "static title = 'a';") },
      { name: 'lifecycle hook', code: component('{{ ngOnInit }}', 'ngOnInit() {}') },
      { name: 'member of a plain class', code: "class X { title = 'a'; }" },
      {
        name: 'member read after a member access',
        code: component('{{ user.title }}', "title = 'a';"),
      },
      {
        name: 'member name inside a string literal',
        code: component("{{ 'title' }}", "title = 'a';"),
      },
    ],
    invalid: [
      {
        name: 'interpolation',
        code: component('{{ title }}', "title = 'a';"),
        errors: [error],
        output: component('{{ title }}', "protected title = 'a';"),
      },
      {
        name: 'explicit public is replaced',
        code: component('{{ title }}', "public title = 'a';"),
        errors: [error],
        output: component('{{ title }}', "protected title = 'a';"),
      },
      {
        name: 'readonly property',
        code: component('{{ title }}', "readonly title = 'a';"),
        errors: [error],
        output: component('{{ title }}', "protected readonly title = 'a';"),
      },
      {
        name: 'event binding',
        code: component('<button (click)="save($event)"></button>', 'save(event: Event) {}'),
        errors: [error],
        output: component(
          '<button (click)="save($event)"></button>',
          'protected save(event: Event) {}',
        ),
      },
      {
        name: 'property binding',
        code: component('<button [disabled]="busy"></button>', 'busy = false;'),
        errors: [error],
        output: component('<button [disabled]="busy"></button>', 'protected busy = false;'),
      },
      {
        name: 'this-prefixed read',
        code: component('{{ this.title }}', "title = 'a';"),
        errors: [error],
        output: component('{{ this.title }}', "protected title = 'a';"),
      },
      {
        name: 'control flow condition',
        code: component('@if (visible) { <p></p> }', 'visible = true;'),
        errors: [error],
        output: component('@if (visible) { <p></p> }', 'protected visible = true;'),
      },
      {
        name: 'for loop source',
        code: component('@for (item of items; track item) { {{ item }} }', 'items = [1];'),
        errors: [error],
        output: component(
          '@for (item of items; track item) { {{ item }} }',
          'protected items = [1];',
        ),
      },
      {
        name: 'let declaration',
        code: component('@let total = sum; {{ total }}', 'sum = 3;'),
        errors: [error],
        output: component('@let total = sum; {{ total }}', 'protected sum = 3;'),
      },
      {
        name: 'getter',
        code: component('{{ title }}', "get title() { return 'a'; }"),
        errors: [error],
        output: component('{{ title }}', "protected get title() { return 'a'; }"),
      },
      {
        name: 'templateUrl file',
        filename: join(directory, 'x.component.ts'),
        code: "@Component({ selector: 'app-x', templateUrl: './x.html' })\nclass X { title = 'a'; }",
        errors: [error],
        output:
          "@Component({ selector: 'app-x', templateUrl: './x.html' })\nclass X { protected title = 'a'; }",
      },
    ],
  });
} finally {
  rmSync(directory, { recursive: true, force: true });
}
