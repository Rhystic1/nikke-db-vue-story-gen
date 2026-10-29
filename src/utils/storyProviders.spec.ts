import { afterEach, describe, expect, it, vi } from 'vitest'
import { listStoryModels, modelAfterRefresh, parseStoryProviderId, parseZaiKeyPlan, runStoryProvider, storyProviderOptions } from '@/utils/storyProviders'
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

type RecordedRequest = {
  url: string
  method?: string
  body: any
  headers: Record<string, string>
}

let requests: RecordedRequest[] = []

const jsonResponse = (status: number, body: unknown) => {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

const headerRecord = (headers: HeadersInit | undefined): Record<string, string> => {
  if (!headers) {

    return {}
  }
  if (headers instanceof Headers) {

    return Object.fromEntries(headers.entries())
  }
  if (Array.isArray(headers)) {

    return Object.fromEntries(headers)
  }

  return headers
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

const stubFetch = (impl: (request: RecordedRequest) => Response | Promise<Response>) => {
  vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const bodyText = typeof init?.body === 'string' ? init.body : undefined
    const request = {
      url: String(url),
      method: init?.method,
      body: bodyText ? JSON.parse(bodyText) : undefined,
      headers: headerRecord(init?.headers)
    }
    requests.push(request)

    return impl(request)
  }))
}

describe('paid OpenCode catalog', () => {
  afterEach(() => {
    requests = []
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    sessionStorage.removeItem('nikke_opencode_no_json_schema')
    sessionStorage.removeItem('nikke_opencode_no_reasoning')
    sessionStorage.removeItem('nikke_zai_no_json_schema')
    modelsWithoutJsonSupport.value = new Set()
    modelsWithoutReasoningSupport.value = new Set()
  })

  it('lists only glm-5.3 and calls the paid models url', async () => {
    stubFetch(() => jsonResponse(200, catalog))

    const listed = await listStoryModels('opencode', 'test-key')

    expect(listed).toEqual({ ok: true, choices: [{ label: 'glm-5.3', value: 'glm-5.3' }] })
    expect(requests[0].url).toContain('/inference/v1/models')
    expect(requests[0].url).not.toContain('/zen/')
    expect(requests[0].headers.Authorization).toBe('Bearer test-key')
    expect(requests[0].headers['x-api-key']).toBeUndefined()
    expect(requests[0].headers['x-opencode-client']).toBe('nikke-db-story-gen')
  })

  it('keeps Go ids that the paid list drops', async () => {
    stubFetch(() => jsonResponse(200, {
      data: [
        { id: 'glm-5.3' },
        { id: 'beam-free' },
        { id: 'big-pickle' },
        { id: 'minimax-m2.5' }
      ]
    }))

    const listed = await listStoryModels('opencode-go', 'test-key')

    expect(listed).toEqual({
      ok: true,
      choices: [
        { label: 'beam-free', value: 'beam-free' },
        { label: 'big-pickle', value: 'big-pickle' },
        { label: 'glm-5.3', value: 'glm-5.3' }
      ]
    })
    expect(requests[0].url).toContain('/zen/go/v1/models')
    expect(requests[0].url).not.toContain('/inference/v1/models')
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
      'zai',
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
    stubFetch(() => jsonResponse(403, { error: { message: 'forbidden' } }))

    const listed = await listStoryModels('opencode', 'test-key')

    expect(listed).toEqual({ ok: false })
  })

  it('returns ok false when the catalog request fails', async () => {
    stubFetch(() => {
      throw new Error('offline')
    })

    const listed = await listStoryModels('opencode', 'test-key')

    expect(listed).toEqual({ ok: false })
  })

  it('sends reasoning_effort for glm-5.3 on the paid chat url', async () => {
    stubFetch(() => jsonResponse(200, {
      choices: [{ message: { content: 'ok' } }]
    }))

    const text = await runStoryProvider('opencode', 'story', storyRun('glm-5.3', 'high'))

    expect(text).toBe('ok')
    expect(requests[0].url).toContain('/inference/openai/v1/chat/completions')
    expect(requests[0].url).not.toContain('/zen/')
    expect(requests[0].body.reasoning_effort).toBe('high')
    expect(requests[0].body.reasoning).toBeUndefined()
    expect(requests[0].body.response_format.json_schema.name).toBe('StoryResponse')
    expect(requests[0].headers.Authorization).toBe('Bearer test-key')
    expect(requests[0].headers['x-api-key']).toBeUndefined()
    expect(requests[0].headers['x-opencode-client']).toBe('nikke-db-story-gen')
  })

  it('sends an OpenAI reasoning object for other paid ids', async () => {
    stubFetch(() => jsonResponse(200, {
      choices: [{ message: { content: 'ok' } }]
    }))

    await runStoryProvider('opencode', 'story', storyRun('kimi-k2.6', 'low'))

    expect(requests[0].body.reasoning).toEqual({ effort: 'low', exclude: false })
    expect(requests[0].body.reasoning_effort).toBeUndefined()
  })

  it('omits response_format for summarize', async () => {
    stubFetch(() => jsonResponse(200, {
      choices: [{ message: { content: 'sum' } }]
    }))

    const text = await runStoryProvider('opencode', 'summarize', storyRun('glm-5.3', 'low'))

    expect(text).toBe('sum')
    expect(requests[0].body.response_format).toBeUndefined()
    expect(requests[0].body.reasoning_effort).toBe('low')
  })

  it('remembers a schema rejection and omits it on the retry and the next call', async () => {
    stubFetch((request) => {
      if (request.body?.response_format) {

        return jsonResponse(400, { error: { message: 'response_format is not supported' } })
      }

      return jsonResponse(200, { choices: [{ message: { content: 'plain' } }] })
    })

    const text = await runStoryProvider('opencode', 'story', storyRun('kimi-k2.6', 'default'))

    expect(text).toBe('plain')
    expect(requests).toHaveLength(2)
    expect(requests[1].body.response_format).toBeUndefined()
    expect(JSON.parse(sessionStorage.getItem('nikke_opencode_no_json_schema') || '[]')).toContain('kimi-k2.6')
    expect(modelsWithoutJsonSupport.value.has('kimi-k2.6')).toBe(false)

    requests = []
    await runStoryProvider('opencode', 'story', storyRun('kimi-k2.6', 'default'))

    expect(requests).toHaveLength(1)
    expect(requests[0].body.response_format).toBeUndefined()
  })

  it('throws RATE_LIMITED on HTTP 429', async () => {
    stubFetch(() => jsonResponse(429, { error: { message: 'slow down' } }))

    await expect(runStoryProvider('opencode', 'story', storyRun('glm-5.3', 'default'))).rejects.toThrow('RATE_LIMITED')
  })

  it('keeps Go chat on the Go path', async () => {
    stubFetch(() => jsonResponse(200, {
      choices: [{ message: { content: 'go' } }]
    }))

    const text = await runStoryProvider('opencode-go', 'story', storyRun('kimi-k2.6', 'default'))

    expect(text).toBe('go')
    expect(requests[0].url).toContain('/zen/go/v1/chat/completions')
    expect(requests[0].url).not.toContain('/inference/openai/')
  })
})

const zaiModels = [
  'glm-5.3',
  'glm-5.3-flash',
  'glm-5.3-flashx',
  'glm-5.2',
  'glm-5.1',
  'glm-5',
  'glm-4.7',
  'glm-4.7-flash',
  'glm-4.7-flashx',
  'glm-4.6',
  'glm-4.5',
  'glm-4.5-air',
  'glm-4.5-x',
  'glm-4.5-airx',
  'glm-4.5-flash',
  'glm-4-32b-0414-128k'
]

describe('Z.AI provider', () => {
  afterEach(() => {
    requests = []
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    sessionStorage.removeItem('nikke_zai_no_json_schema')
    modelsWithoutJsonSupport.value = new Set()
    modelsWithoutReasoningSupport.value = new Set()
  })

  it('inserts zai before local in the provider list', () => {
    expect(storyProviderOptions.map((option) => option.value)).toEqual([
      'gemini',
      'opencode-go',
      'opencode',
      'openrouter',
      'pollinations',
      'zai',
      'local'
    ])
    expect(storyProviderOptions.find((option) => option.value === 'zai')?.label).toBe('Z.AI')
  })

  it('lists the static catalog without fetching', async () => {
    stubFetch(() => jsonResponse(200, { data: [{ id: 'other' }] }))

    const listed = await listStoryModels('zai', undefined)

    expect(listed).toEqual({
      ok: true,
      choices: zaiModels.map((modelId) => ({ label: modelId, value: modelId }))
    })
    expect(requests).toEqual([])
  })

  it('parses the key plan', () => {
    expect(parseZaiKeyPlan('coding')).toBe('coding')
    expect(parseZaiKeyPlan('payg')).toBe('payg')
    expect(parseZaiKeyPlan('nope')).toBe('payg')
    expect(parseZaiKeyPlan(undefined)).toBe('payg')
  })

  it('posts pay as you go when the run omits the key plan', async () => {
    stubFetch(() => jsonResponse(200, { choices: [{ message: { content: 'ok' } }] }))

    const text = await runStoryProvider('zai', 'story', storyRun('glm-4.7', 'default'))

    expect(text).toBe('ok')
    expect(requests).toHaveLength(1)
    expect(requests[0].method).toBe('POST')
    expect(requests[0].url).toBe('https://api.z.ai/api/paas/v4/chat/completions')
    expect(requests[0].headers.Authorization).toBe('Bearer test-key')
    expect(requests[0].headers['Content-Type']).toBe('application/json')
    expect(requests[0].body.response_format.json_schema.name).toBe('StoryResponse')
  })

  it('posts the coding plan chat url', async () => {
    stubFetch(() => jsonResponse(200, { choices: [{ message: { content: 'ok' } }] }))

    await runStoryProvider('zai', 'story', { ...storyRun('glm-4.7', 'default'), zaiKeyPlan: 'coding' })

    expect(requests[0].url).toBe('https://api.z.ai/api/coding/paas/v4/chat/completions')
    expect(requests[0].headers.Authorization).toBe('Bearer test-key')
  })

  it('sends reasoning_effort for glm-5.3 and drops the reasoning object', async () => {
    stubFetch(() => jsonResponse(200, { choices: [{ message: { content: 'ok' } }] }))

    await runStoryProvider('zai', 'story', storyRun('glm-5.3', 'high'))

    expect(requests[0].body.reasoning_effort).toBe('high')
    expect(requests[0].body.reasoning).toBeUndefined()
    expect(requests[0].body.thinking).toBeUndefined()
  })

  it('sends low effort for glm-5.3 when reasoning is none', async () => {
    stubFetch(() => jsonResponse(200, { choices: [{ message: { content: 'ok' } }] }))

    await runStoryProvider('zai', 'story', storyRun('glm-5.3', 'none'))
    await runStoryProvider('zai', 'story', storyRun('glm-5.3-flashx', 'none'))

    expect(requests[0].body.reasoning_effort).toBe('low')
    expect(requests[0].body.thinking).toBeUndefined()
    expect(requests[0].body.reasoning).toBeUndefined()
    expect(requests[1].body.reasoning_effort).toBe('low')
    expect(requests[1].body.thinking).toBeUndefined()
  })

  it('disables thinking for glm-4.7 when reasoning is none', async () => {
    stubFetch(() => jsonResponse(200, { choices: [{ message: { content: 'ok' } }] }))

    await runStoryProvider('zai', 'story', storyRun('glm-4.7', 'none'))

    expect(requests[0].body.thinking).toEqual({ type: 'disabled' })
    expect(requests[0].body.reasoning).toBeUndefined()
    expect(requests[0].body.reasoning_effort).toBeUndefined()
  })

  it('omits thinking and reasoning_effort when reasoning is default', async () => {
    stubFetch(() => jsonResponse(200, { choices: [{ message: { content: 'ok' } }] }))

    await runStoryProvider('zai', 'story', storyRun('glm-4.7', 'default'))
    await runStoryProvider('zai', 'story', storyRun('glm-5.3', 'default'))

    expect(requests[0].body.thinking).toBeUndefined()
    expect(requests[0].body.reasoning_effort).toBeUndefined()
    expect(requests[1].body.thinking).toBeUndefined()
    expect(requests[1].body.reasoning_effort).toBeUndefined()
  })

  it('omits response_format for summarize', async () => {
    stubFetch(() => jsonResponse(200, { choices: [{ message: { content: 'sum' } }] }))

    const text = await runStoryProvider('zai', 'summarize', storyRun('glm-4.7', 'low'))

    expect(text).toBe('sum')
    expect(requests[0].body.response_format).toBeUndefined()
    expect(requests[0].body.thinking).toEqual({ type: 'enabled' })
    expect(requests[0].body.reasoning_effort).toBe('low')
  })

  it('retries a story schema rejection once and remembers the model', async () => {
    stubFetch((request) => {
      if (request.body?.response_format) {

        return jsonResponse(400, { error: { message: 'response_format is not supported' } })
      }

      return jsonResponse(200, { choices: [{ message: { content: 'plain' } }] })
    })

    const text = await runStoryProvider('zai', 'story', storyRun('glm-4.7', 'default'))

    expect(text).toBe('plain')
    expect(requests).toHaveLength(2)
    expect(requests[1].body.response_format).toBeUndefined()
    expect(JSON.parse(sessionStorage.getItem('nikke_zai_no_json_schema') || '[]')).toContain('glm-4.7')
    expect(modelsWithoutJsonSupport.value.size).toBe(0)

    requests = []
    await runStoryProvider('zai', 'story', storyRun('glm-4.7', 'default'))

    expect(requests).toHaveLength(1)
    expect(requests[0].body.response_format).toBeUndefined()
  })

  it('throws AIError once when the failure is not a schema rejection', async () => {
    stubFetch(() => jsonResponse(400, { error: { message: 'bad request' } }))

    await expect(runStoryProvider('zai', 'story', storyRun('glm-4.7', 'default'))).rejects.toThrow('400: bad request')
    expect(requests).toHaveLength(1)
    expect(sessionStorage.getItem('nikke_zai_no_json_schema')).toBeNull()
  })

  it('rejects native search', async () => {
    await expect(runStoryProvider('zai', 'native', storyRun('glm-5.3', 'default'))).rejects.toThrow('Native search is not available for this provider')
  })
})
