import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  { ignores: ['dist/**', 'node_modules/**'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'off',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'prefer-const': ['error', { destructuring: 'all' }],
    },
  },
];
