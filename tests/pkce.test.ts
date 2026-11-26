import { generateCodeVerifier, deriveCodeChallengeS256, createPkcePair } from '../src/auth/pkce'

describe('PKCE S256', () => {
  const TEST_VECTOR_VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
  const TEST_VECTOR_CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'

  test('generates valid S256 challenge from known verifier', async () => {
    const challenge = await deriveCodeChallengeS256(TEST_VECTOR_VERIFIER)
    expect(challenge).toBe(TEST_VECTOR_CHALLENGE)
  })

  test('createPkcePair produces valid verifier and challenge', async () => {
    const { codeVerifier, codeChallenge, codeChallengeMethod } = await createPkcePair()
    expect(codeChallengeMethod).toBe('S256')
    expect(typeof codeVerifier).toBe('string')
    expect(typeof codeChallenge).toBe('string')
  })

  test('verifier length is within RFC 7636 bounds', () => {
    expect(() => generateCodeVerifier(42)).toThrow()
    expect(() => generateCodeVerifier(129)).toThrow()
    expect(() => generateCodeVerifier(64)).not.toThrow()
  })
})