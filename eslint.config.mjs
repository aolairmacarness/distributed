import nx from '@nx/eslint-plugin';

export default [
  {
    // Build configs, not app code. Nx 24's @nx/enforce-module-boundaries
    // flags their require('../../webpack.app.config'); Nx 22 did not.
    ignores: ['**/webpack.config.js'],
  },
  ...nx.configs['flat/base'],
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: [],
          depConstraints: [
            {
              sourceTag: '*',
              onlyDependOnLibsWithTags: ['*'],
            },
          ],
        },
      ],
    },
  },
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],
  // No test-globals block: specs import describe/it/expect/vi from 'vitest'.
];
