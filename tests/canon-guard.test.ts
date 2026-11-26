import { evaluateCanon0011, assertCanon0011, filterCanonSafePayloads, DynamicMediaPayload, CanonCheckResult } from '../src/guards/canon'

describe('CAN-0011 Guard', () => {
  describe('evaluateCanon0011', () => {
    test('allows typographic visualType', () => {
      const payload: DynamicMediaPayload = { visualType: 'typographic', title: 'Some title' }
      const result = evaluateCanon0011(payload)
      expect(result.allowed).toBe(true)
    })

    test('allows geometric visualType', () => {
      const payload: DynamicMediaPayload = { visualType: 'geometric', title: 'Some title' }
      const result = evaluateCanon0011(payload)
      expect(result.allowed).toBe(true)
    })

    test('allows celestial visualType', () => {
      const payload: DynamicMediaPayload = { visualType: 'celestial', title: 'Some title' }
      const result = evaluateCanon0011(payload)
      expect(result.allowed).toBe(true)
    })

    test('allows crescent visualType', () => {
      const payload: DynamicMediaPayload = { visualType: 'crescent', title: 'Some title' }
      const result = evaluateCanon0011(payload)
      expect(result.allowed).toBe(true)
    })

    test('allows orbit visualType', () => {
      const payload: DynamicMediaPayload = { visualType: 'orbit', title: 'Some title' }
      const result = evaluateCanon0011(payload)
      expect(result.allowed).toBe(true)
    })

    test('allows calligraphy-text visualType', () => {
      const payload: DynamicMediaPayload = { visualType: 'calligraphy-text', title: 'Some title' }
      const result = evaluateCanon0011(payload)
      expect(result.allowed).toBe(true)
    })

    test('blocks figurative Allah depiction', () => {
      const payload: DynamicMediaPayload = {
        visualType: 'typographic',
        title: 'Image of Allah portrait'
      }
      const result = evaluateCanon0011(payload)
      expect(result.allowed).toBe(false)
      expect(result.reason).toContain('prohibited')
    })

    test('blocks figurative Prophet depiction', () => {
      const payload: DynamicMediaPayload = {
        visualType: 'geometric',
        title: 'Portrait of Muhammad'
      }
      const result = evaluateCanon0011(payload)
      expect(result.allowed).toBe(false)
    })

    test('blocks figurative Isa/Jesus depiction', () => {
      const payload: DynamicMediaPayload = {
        visualType: 'typographic',
        title: 'Picture of Jesus face'
      }
      const result = evaluateCanon0011(payload)
      expect(result.allowed).toBe(false)
    })

    test('blocks title containing prohibited subject', () => {
      const payload: DynamicMediaPayload = {
        visualType: 'typographic',
        title: 'Allah portrait image'
      }
      const result = evaluateCanon0011(payload)
      expect(result.allowed).toBe(false)
    })

    test('allows non-figurative content', () => {
      const payload: DynamicMediaPayload = {
        visualType: 'geometric',
        title: 'Abstract geometric pattern'
      }
      const result = evaluateCanon0011(payload)
      expect(result.allowed).toBe(true)
    })
  })

  describe('assertCanon0011', () => {
    test('passes for allowed payload', () => {
      const payload: DynamicMediaPayload = { visualType: 'typographic', title: 'Safe title' }
      expect(() => assertCanon0011(payload)).not.toThrow()
    })

    test('throws for blocked payload', () => {
      const payload: DynamicMediaPayload = {
        visualType: 'typographic',
        title: 'Allah portrait'
      }
      expect(() => assertCanon0011(payload)).toThrow('[CAN-0011]')
    })
  })

  describe('filterCanonSafePayloads', () => {
    test('filters out prohibited payloads', () => {
      const payloads: DynamicMediaPayload[] = [
        { visualType: 'typographic', title: 'Safe 1' },
        { visualType: 'typographic', title: 'Allah portrait' },
        { visualType: 'geometric', title: 'Safe 2' },
        { visualType: 'typographic', title: 'Jesus image' }
      ]
      const safe = filterCanonSafePayloads(payloads)
      expect(safe.length).toBe(2)
      expect(safe[0].title).toBe('Safe 1')
      expect(safe[1].title).toBe('Safe 2')
    })
  })
})