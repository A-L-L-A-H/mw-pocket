import { MoonWitnessMobileClient } from '../src/api/client'
import { createInMemorySnapshotCache } from '../src/api/client'

describe('MoonWitnessMobileClient', () => {
  let client: MoonWitnessMobileClient

  beforeEach(() => {
    client = new MoonWitnessMobileClient({
      echoUrl: 'http://192.168.1.10:3000',
      myloveUrl: 'https://a-l-l-a-h.com',
      accessToken: 'test-token',
    })
  })

  test('has default timeout of 8000ms', () => {
    expect(client['timeoutMs']).toBe(8000)
  })

  test('builds headers with bearer token', () => {
    const headers = client['buildHeaders'](true)
    expect(headers.Authorization).toBe('Bearer test-token')
  })

  test('builds headers without token when no accessToken', () => {
    const clientNoToken = new MoonWitnessMobileClient({
      echoUrl: 'http://192.168.1.10:3000',
      myloveUrl: 'https://a-l-l-a-h.com',
    })
    const headers = clientNoToken['buildHeaders'](true)
    expect(headers.Authorization).toBeUndefined()
  })

  test('requestJson aborts on timeout', async () => {
    // Mock slow response
    const originalFetch = global.fetch
    const clientWithShortTimeout = new MoonWitnessMobileClient({
      echoUrl: 'http://192.168.1.10:3000',
      myloveUrl: 'https://a-l-l-a-h.com',
      accessToken: 'test-token',
      timeoutMs: 50,
    })
    ;(global as any).fetch = async () => {
      await new Promise(r => setTimeout(r, 200))
      return new Response(JSON.stringify({ status: 'ok' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    }

    await expect(clientWithShortTimeout.getEchoHealth()).rejects.toThrow('The operation was aborted.')
    ;(global as any).fetch = originalFetch
  })

  test('falls back to cache on network error GET', async () => {
    const originalFetch = global.fetch
    ;(global as any).fetch = async () => {
      throw new Error('Network error')
    }
    const cache = createInMemorySnapshotCache()
    await cache.setSnapshot('echo_health', JSON.stringify({ status: 'ok', uptimeSec: 100 }))

    const clientWithCache = new MoonWitnessMobileClient({
      echoUrl: 'http://test',
      myloveUrl: 'https://a-l-l-a-h.com',
      accessToken: 'test-token',
      cache,
    })

    const result = await clientWithCache['requestJson']<{ status: string; uptimeSec: number }>('http://test', '/health', {
      cacheKey: 'echo_health',
      method: 'GET',
    })
    expect(result.fromCache).toBe(true)
    expect(result.payload.status).toBe('ok')
    ;(global as any).fetch = originalFetch
  })
})