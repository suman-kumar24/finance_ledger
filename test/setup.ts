// expo-crypto is native; tests use Node's implementation.
jest.mock('expo-crypto', () => {
  const nodeCrypto = jest.requireActual('node:crypto');
  return {
    randomUUID: () => nodeCrypto.randomUUID(),
    getRandomBytes: (n: number) => new Uint8Array(nodeCrypto.randomBytes(n)),
  };
});
