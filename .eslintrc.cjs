module.exports = {
  ignorePatterns: ['out/**', 'dist/**', 'node_modules/**'],
  extends: [
    '@electron-toolkit/eslint-config-ts/recommended',
    '@electron-toolkit/eslint-config-prettier',
  ],
}
