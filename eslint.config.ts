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
          './packages/preprocessor/tsconfig.json',
        ],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    processor: angular.processInlineTemplates,
    rules: { '@typescript-eslint/consistent-type-imports': 'error' },
  },
  {
    files: ['**/*.html'],
    extends: [angular.configs.templateRecommended, angular.configs.templateAccessibility],
  },
  // Formatting belongs to Prettier; keep conflicting ESLint style rules off.
  prettier,
);
