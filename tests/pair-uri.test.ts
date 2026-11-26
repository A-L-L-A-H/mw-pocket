import { parsePairUri } from '../src/pairing/pairUri'

describe('Pair URI', () => {
  test('valid mw-pocket:// pair URI parses correctly', () => {
    const uri = 'mw-pocket://pair?echo=http://192.168.1.10:3010&rid=http://192.168.1.10:3005&mylove=https://a-l-l-a-h.com&token=abc123'
    const result = parsePairUri(uri)
    expect(result).toBeDefined()
    expect(result?.echoUrl).toBe('http://192.168.1.10:3010')
    expect(result?.ridUrl).toBe('http://192.168.1.10:3005')
    expect(result?.myloveUrl).toBe('https://a-l-l-a-h.com')
    expect(result?.token).toBe('abc123')
  })

  test('rejects javascript: scheme', () => {
    const uri = 'mw-pocket://pair?echo=javascript:alert(1)&rid=http://example.com&mylove=https://example.com'
    expect(() => parsePairUri(uri)).toThrow('Unsafe URL scheme rejected')
  })

  test('rejects data: scheme', () => {
    const uri = 'mw-pocket://pair?echo=data:text/html,&rid=http://example.com&mylove=https://example.com'
    expect(() => parsePairUri(uri)).toThrow('Unsafe URL scheme rejected')
  })

  test('rejects missing required fields', () => {
    expect(() => parsePairUri('mw-pocket://pair?echo=http://example.com')).toThrow('Missing required')
  })

  test('validates URL format', () => {
    expect(() => parsePairUri('mw-pocket://pair?echo=not-a-url&rid=http://example.com&mylove=https://example.com')).toThrow('Malformed URL')
  })
})