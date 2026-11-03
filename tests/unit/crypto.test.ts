import test from 'node:test';
import assert from 'node:assert';
import { encryptCredential, decryptCredential, generateEncryptionKey } from '../../src/app/utils/crypto';

test('AES-256-GCM Credential Encryption & Decryption', async (t) => {
  await t.test('successfully encrypts and decrypts a plain text secret', () => {
    const originalSecret = 'AusPost_Super_Secret_Password_2026!';
    const encrypted = encryptCredential(originalSecret);

    assert.notStrictEqual(encrypted, originalSecret);
    assert.match(encrypted, /^[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]+$/i);

    const decrypted = decryptCredential(encrypted);
    assert.strictEqual(decrypted, originalSecret);
  });

  await t.test('returns empty string when encrypting or decrypting empty input', () => {
    assert.strictEqual(encryptCredential(''), '');
    assert.strictEqual(decryptCredential(''), '');
  });

  await t.test('detects payload tampering and throws error on invalid auth tag or ciphertext', () => {
    const encrypted = encryptCredential('ValidCredentialPayload');
    const parts = encrypted.split(':');
    // Tamper with ciphertext by altering last characters
    const tampered = `${parts[0]}:${parts[1]}:${parts[2].slice(0, -2)}ff`;

    assert.throws(() => {
      decryptCredential(tampered);
    });
  });

  await t.test('throws error when encrypted blob does not have 3 parts', () => {
    assert.throws(() => {
      decryptCredential('invalid-unformatted-string');
    }, /Invalid encrypted credential payload format/);
  });

  await t.test('generateEncryptionKey generates 32-byte (64-char hex) random string', () => {
    const key = generateEncryptionKey();
    assert.strictEqual(typeof key, 'string');
    assert.strictEqual(key.length, 64);
  });
});
