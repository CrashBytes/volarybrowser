// Flat config for ESLint v9+ (project uses ESLint v10).
// Replaces the legacy .eslintrc format that ESLint 9+ no longer reads.
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import reactPlugin from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';

export default [
  {
    ignores: [
      'dist/**',
      'release/**',
      'coverage/**',
      'node_modules/**',
      'build/**',
      '**/*.d.ts',
    ],
  },
  {
    files: ['src/**/*.{ts,tsx}', 'core/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      react: reactPlugin,
      'react-hooks': reactHooks,
    },
    settings: {
      // Pin the version explicitly: eslint-plugin-react v7's auto-detection
      // ('detect') calls context.getFilename, which ESLint v10 removed,
      // crashing the lint run. An explicit version skips that code path.
      react: { version: '19.2' },
    },
    rules: {
      ...(tsPlugin.configs.recommended.rules ?? {}),
      ...(reactPlugin.configs.recommended.rules ?? {}),
      // Classic, high-value React Hooks rules. (eslint-plugin-react-hooks v7's
      // full "recommended" set also enables aggressive compiler/immutability
      // rules that flag many pre-existing patterns; we enable only the
      // well-established rules here and leave tightening for follow-up work.)
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',

      // React 19 + new JSX transform: no need to import React in scope.
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      'react/no-unescaped-entities': 'warn',

      // This repo had no lint config previously, so existing code was never
      // linted. Keep these as warnings so CI is green now while still
      // surfacing issues for incremental cleanup.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Electron main-process code uses lazy require() in several places;
      // keep it visible but non-blocking.
      '@typescript-eslint/no-require-imports': 'warn',

      // Disable formatting-related rules; Prettier owns formatting.
      ...prettier.rules,
    },
  },
];
