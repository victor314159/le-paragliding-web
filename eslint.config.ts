import js from '@eslint/js';
import angular from 'angular-eslint';
import { defineConfig } from 'eslint/config';
import prettier from 'eslint-config-prettier/flat';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  {
    ignores: [
      '.husky/_/**',
      '.playwright-mcp/**',
      'build/**',
      'dist/**',
      'fortran/*/original/**',
      'node_modules/**',
      'oracle/**',
    ],
  },
  {
    files: ['**/*.{js,cjs,mjs}'],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['**/*.ts'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommendedTypeChecked,
      angular.configs.tsRecommended,
    ],
    languageOptions: {
      parserOptions: {
        project: [
          './tsconfig.app.json',
          './tsconfig.worker.json',
          './tsconfig.tools.json',
          './packages/engine/tsconfig.json',
          './packages/engine/smoke/tsconfig.json',
          './packages/design/tsconfig.json',
          './packages/format/tsconfig.json',
          './packages/geometry/tsconfig.json',
          './packages/preprocessor/tsconfig.json',
          './packages/views/tsconfig.json',
        ],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    processor: angular.processInlineTemplates,
    rules: { '@typescript-eslint/consistent-type-imports': 'error' },
  },
  // Geometry models (packages/geometry/MODELS.md): the reference never reaches
  // improved code, and shared code never selects a model.
  {
    files: ['packages/geometry/src/fortran/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '/(enhanced|fortran-3\\.29)|^@lepara/geometry',
              message: 'The reference never imports improved code or a public entry.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/geometry/src/shared/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '/(enhanced|fortran)|^@lepara/geometry',
              message: 'Shared code cannot import or select a model.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['**/*.html'],
    extends: [angular.configs.templateRecommended, angular.configs.templateAccessibility],
  },
  // Formatting belongs to Prettier; keep conflicting ESLint style rules off.
  prettier,
);
