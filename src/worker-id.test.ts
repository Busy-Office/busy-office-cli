// Unit tests for worker ID derivation.
// Key invariant (ADR-42): hashEmail() must produce the same output as
// workerName() in contracts/index.mjs, which uses Web Crypto SHA-256.
// Verifying cross-implementation parity here catches algorithm drift at build time.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { hashEmail, deriveWorkerId } from './worker-id.js';

describe('hashEmail — ADR-42 SHA-256 identity contract', () => {
  it('returns 12-char lowercase hex', () => {
    assert.match(hashEmail('alice@example.com'), /^[0-9a-f]{12}$/);
  });

  it('is deterministic', () => {
    assert.equal(hashEmail('alice@example.com'), hashEmail('alice@example.com'));
  });

  it('is case-insensitive (matches workerName() case-fold in contracts/index.mjs)', () => {
    assert.equal(hashEmail('alice@example.com'), hashEmail('ALICE@EXAMPLE.COM'));
    assert.equal(hashEmail('alice@example.com'), hashEmail('Alice@Example.COM'));
  });

  it('different emails produce different IDs', () => {
    assert.notEqual(hashEmail('alice@example.com'), hashEmail('bob@example.com'));
  });

  it('matches Web Crypto SHA-256 output (ADR-42 cross-impl parity)', async () => {
    const email = 'alice@example.com';
    const nodeCryptoResult = hashEmail(email);

    // This is exactly what contracts/index.mjs workerName() does:
    const buf = await webcrypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(email.toLowerCase().trim()),
    );
    const webCryptoResult = Array.from(new Uint8Array(buf))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, 12);

    assert.equal(nodeCryptoResult, webCryptoResult,
      'node:crypto and Web Crypto API must produce the same 12-char worker ID');
  });
});

describe('deriveWorkerId', () => {
  it('returns 12-char lowercase hex', () => {
    assert.match(deriveWorkerId(), /^[0-9a-f]{12}$/);
  });

  it('is deterministic within a single environment', () => {
    assert.equal(deriveWorkerId(), deriveWorkerId());
  });
});
