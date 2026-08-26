import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/playwright-report/**', '**/test-results/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { varsIgnorePattern: '^_', argsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // §18.5 contract: the semantic packages ship with zero renderer dependencies.
    // This boundary is mechanical, not a convention (backlog issue #14).
    files: ['packages/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react-*', 'react/*'],
              message: 'packages/* must stay renderer-free (§18.5). React belongs in apps/game.',
            },
            {
              group: ['@babylonjs/*'],
              message: 'packages/* must stay renderer-free (§18.5). Babylon belongs in apps/game.',
            },
            {
              group: ['zustand', 'zustand/*'],
              message: 'packages/* must stay UI-state-free. Zustand belongs in apps/game.',
            },
          ],
        },
      ],
    },
  },
);
