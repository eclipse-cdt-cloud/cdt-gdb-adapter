// eslint.config.mjs
import chaiFriendly from 'eslint-plugin-chai-friendly';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

const jsLanguageOptions = {
  globals: {
    // Add any specific globals you need
    ...globals.node,
  },
};

const tsLanguageOptions = {
  parser: tseslint.parser,
  parserOptions: {
    project: './tsconfig.json',
  },
  ecmaVersion: 2015,
  sourceType: 'module',
  globals: {
    // Add any specific globals you need
    ...globals.node,
  },
};

export default [
  {
    ignores: [
      // don't ever lint node_modules
      '**/node_modules/**',
      // don't lint build output (make sure
      // it's set to your correct build folder name)
      'dist/**',
    ],
  },
  {
    // Javascript files like build and config scripts
    files: ['**/*.js'],
    ...js.configs.recommended,
    languageOptions: jsLanguageOptions,
  },
  // Recommended rules config array must only apply
  // to Typescript files, not plain Javascript, and
  // should use same language options as
  ...tseslint.configs.recommended.map((config) => ({
    files: ['**/*.ts', '**/*.tsx'],
    ...config,
    languageOptions: tsLanguageOptions,
  })),
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: tsLanguageOptions,
    plugins: {
      '@typescript-eslint': tseslint.plugin,
      'chai-friendly': chaiFriendly,
    },
    rules: {
      ...prettier.rules,
      '@typescript-eslint/no-explicit-any': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      // For backwards compatibility with older recommended rules
      // in eslint/typescript-eslint, based on existing "disable"
      // directives
      '@typescript-eslint/no-non-null-assertion': 'error',
      // Turn off the "no-unused-expressions" default rules...
      'no-unused-expressions': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      // ... and turn on the chai-friendly version
      'chai-friendly/no-unused-expressions': 'error',
    },
  },
];
