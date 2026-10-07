/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  // La mise en place de certains tests cree des dizaines de comptes via l'API,
  // et bcrypt est volontairement lent : 5 s par defaut ne suffisent pas.
  testTimeout: 30000,
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.spec.json' }],
  },
};
