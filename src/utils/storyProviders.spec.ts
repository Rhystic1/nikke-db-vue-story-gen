import { afterEach, describe, expect, it, vi } from 'vitest'
import { listStoryModels, modelAfterRefresh, parseStoryProviderId, runStoryProvider, storyProviderOptions } from '@/utils/storyProviders'
import { modelsWithoutJsonSupport, modelsWithoutReasoningSupport } from '@/utils/providerConfigUtils'

const catalog = {
  object: 'list',
  data: [
    { id: 'glm-5.3' },
    { id: 'big-pickle' },
    { id: 'beam-free' },
    { id: 'jev-1.13' },
    { id: 'glm-5.3-flash-free' }
  ]
}

const jsonResponse = (status: number, body: unknown) => {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

const storyRun = (model: string, reasoningEffort: string) => {
  return {
    messages: [{ role: 'user', content: 'hi' }],
    apiKey: 'test-key',
    model,
    modeIsGame: false,
    reasoningEffort
  }
}

describe('paid OpenCode catalog', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    sessionStorage.removeItem('nikke_opencode_no_json_schema')
    sessionStorage.removeItem('nikke_opencode_no_reasoning')
    modelsWithoutJsonSupport.value = new Set()
    modelsWithoutReasoningSupport.value = new Set()
  })

  it('lists only glm-5.3 and calls the paid models url', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, catalog))
    vi.stubGlobal('fetch', fetchMock)

    const listed = await listStoryModels('opencode', 'test-key')

    expect(listed).toEqual({ ok: true, choices: [{ label: 'glm-5.3', value: 'glm-5.3' }] })
    const url = String(fetchMock.mock.calls[0][0])
    expect(url).toContain('/inference/v1/models')
    expect(url).not.toContain('/zen/')
    const headers = fetchMock.mock.calls[0][1].headers
    expect(headers.Authorization).toBe('Bearer test-key')
    expect(headers['x-api-key']).toBeUndefined()
    expect(headers['x-opencode-client']).toBe('nikke-db-story-gen')
  })

  it('keeps Go ids that the paid list drops', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, {
      data: [
        { id: 'glm-5.3' },
        { id: 'beam-free' },
        { id: 'big-pickle' },
        { id: 'minimax-m2.5' }
      ]
    }))
    vi.stubGlobal('fetch', fetchMock)

    const listed = await listStoryModels('opencode-go', 'test-key')

    expect(listed).toEqual({
      ok: true,
      choices: [
        { label: 'beam-free', value: 'beam-free' },
        { label: 'big-pickle', value: 'big-pickle' },
        { label: 'glm-5.3', value: 'glm-5.3' }
      ]
    })
    const url = String(fetchMock.mock.calls[0][0])
    expect(url).toContain('/zen/go/v1/models')
    expect(url).not.toContain('/inference/v1/models')
  })

  it('rejects opencode-free and accepts opencode', () => {
    expect(parseStoryProviderId('opencode-free')).toBeUndefined()
    expect(parseStoryProviderId('opencode')).toBe('opencode')
    expect(storyProviderOptions.map((option) => option.value)).toEqual([
      'gemini',
      'opencode-go',
      'opencode',
      'openrouter',
      'pollinations',
      'local'
    ])
    expect(storyProviderOptions.find((option) => option.value === 'opencode')?.label).toBe('OpenCode')
  })

  it('keeps glm-5.3 when the refreshed choices contain it', () => {
    const choices = [{ label: 'glm-5.3', value: 'glm-5.3' }]

    expect(modelAfterRefresh('opencode', 'glm-5.3', choices)).toBe('glm-5.3')
    expect(modelAfterRefresh('opencode-go', 'glm-5.3', choices)).toBe('glm-5.3')
  })

  it('returns ok false for a non-OK list response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(403, { error: { message: 'forbidden' } })))

    const listed = await listStoryModels('opencode', 'test-key')

    expect(listed).toEqual({ ok: false })
  })

  it('returns ok false when the catalog request fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('offline')
    }))

    const listed = await listStoryModels('opencode', 'test-key')

    expect(listed).toEqual({ ok: false })
  })

  it('sends reasoning_effort for glm-5.3 on the paid chat url', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, {
      choices: [{ message: { content: 'ok' } }]
    }))
    vi.stubGlobal('fetch', fetchMock)

    const text = await runStoryProvider('opencode', 'story', storyRun('glm-5.3', 'high'))

    expect(text).toBe('ok')
    const url = String(fetchMock.mock.calls[0][0])
    expect(url).toContain('/inference/openai/v1/chat/completions')
    expect(url).not.toContain('/zen/')
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.reasoning_effort).toBe('high')
    expect(body.reasoning).toBeUndefined()
    expect(body.response_format.json_schema.name).toBe('StoryResponse')
    const headers = fetchMock.mock.calls[0][1].headers
    expect(headers.Authorization).toBe('Bearer test-key')
    expect(headers['x-api-key']).toBeUndefined()
    expect(headers['x-opencode-client']).toBe('nikke-db-story-gen')
  })

  it('sends an OpenAI reasoning object for other paid ids', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, {
      choices: [{ message: { content: 'ok' } }]
    }))
    vi.stubGlobal('fetch', fetchMock)

    await runStoryProvider('opencode', 'story', storyRun('kimi-k2.6', 'low'))

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.reasoning).toEqual({ effort: 'low', exclude: false })
    expect(body.reasoning_effort).toBeUndefined()
  })

  it('omits response_format for summarize', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, {
      choices: [{ message: { content: 'sum' } }]
    }))
    vi.stubGlobal('fetch', fetchMock)

    const text = await runStoryProvider('opencode', 'summarize', storyRun('glm-5.3', 'low'))

    expect(text).toBe('sum')
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.response_format).toBeUndefined()
    expect(body.reasoning_effort).toBe('low')
  })

  it('remembers a schema rejection and omits it on the retry and the next call', async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body))
      if (body.response_format) {

        return jsonResponse(400, { error: { message: 'response_format is not supported' } })
      }

      return jsonResponse(200, { choices: [{ message: { content: 'plain' } }] })
    })
    vi.stubGlobal('fetch', fetchMock)

    const text = await runStoryProvider('opencode', 'story', storyRun('kimi-k2.6', 'default'))

    expect(text).toBe('plain')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).response_format).toBeUndefined()
    expect(JSON.parse(sessionStorage.getItem('nikke_opencode_no_json_schema') || '[]')).toContain('kimi-k2.6')
    expect(modelsWithoutJsonSupport.value.has('kimi-k2.6')).toBe(false)

    fetchMock.mockClear()
    await runStoryProvider('opencode', 'story', storyRun('kimi-k2.6', 'default'))

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).response_format).toBeUndefined()
  })

  it('throws RATE_LIMITED on HTTP 429', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(429, { error: { message: 'slow down' } })))

    await expect(runStoryProvider('opencode', 'story', storyRun('glm-5.3', 'default'))).rejects.toThrow('RATE_LIMITED')
  })

  it('keeps Go chat on the Go path', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(200, {
      choices: [{ message: { content: 'go' } }]
    }))
    vi.stubGlobal('fetch', fetchMock)

    const text = await runStoryProvider('opencode-go', 'story', storyRun('kimi-k2.6', 'default'))

    expect(text).toBe('go')
    const url = String(fetchMock.mock.calls[0][0])
    expect(url).toContain('/zen/go/v1/chat/completions')
    expect(url).not.toContain('/inference/openai/')
  })
})
