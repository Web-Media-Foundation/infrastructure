module.exports = {
  env: {
    browser: true,
    es2021: true,
  },
  extends: [
    'airbnb-base',
    'airbnb-typescript/base'
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: './tsconfig.json',
    ecmaVersion: 12,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  rules: {
    'global-require': 'off',
    'linebreak-style': ['off', 'windows'],
    'max-len': ['warn', { code: 120 }],
    'max-classes-per-file': 'off',
    'no-bitwise': 'off',
    'no-continue': 'off',
    'no-await-in-loop': 'off',
    'no-param-reassign': ['error', { props: false }],
    'no-underscore-dangle': 'off',
    'operator-assignment': 'off',
    'import/extensions': 'off',
    'import/no-unresolved': 'off',
    'import/no-dynamic-require': 'off',
    'import/prefer-default-export': 'off',
    '@typescript-eslint/naming-convention': 'off',
    '@typescript-eslint/type-annotation-spacing':'error',
  },
};