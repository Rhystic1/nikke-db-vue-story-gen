import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { callOpenCodeGo, callOpenCodeGoSummarization } from '@/utils/llmUtils'
import { modelsWithoutJsonSupport, modelsWithoutReasoningSupport } from '@/utils/providerConfigUtils'

const PROTOCOL_ERROR = {
  type: 'error',
  error: {
    type: 'ModelProtocolUnsupported',
    message: 'Model does not support this protocol.'
  }
}

const GOOGLE_PATH = '/inference/go/google/v1beta/models/gemini-4-argon:generateContent'

const messages = [
  { role: 'system', content: 'Reply with JSON.' },
  { role: 'user', content: 'Say ok.' },
  { role: 'assistant', content: 'Earlier line.' },
  { role: 'user', content: 'Say ok again.' }
]

let requests: { url: string; body: any; headers: Record<string, string> }[] = []

const headerRecord = (headers: HeadersInit | undefined) => {
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

const jsonResponse = (status: number, body: unknown) => {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

const gateway = (url: string, body: any, headers: Record<string, string>) => {
  if (body?.model === 'kimi-k2.6') {
    return jsonResponse(200, {
      choices: [{ message: { role: 'assistant', content: 'chat-ok' } }]
    })
  }

  if (!url.includes(GOOGLE_PATH)) {
    return jsonResponse(400, PROTOCOL_ERROR)
  }

  const authorization = headers.Authorization || headers.authorization || ''
  if (!authorization.startsWith('Bearer ')) {
    return jsonResponse(401, {
      error: { type: 'authentication_error', message: 'Go requires a credential' }
    })
  }

  const contents = Array.isArray(body?.contents) ? body.contents : []
  const badRole = contents.some((entry: any) => entry?.role === 'system' || entry?.role === 'assistant')
  if (badRole) {
    return jsonResponse(400, {
      error: { code: 400, message: 'Invalid content role.', status: 'INVALID_ARGUMENT' }
    })
  }

  const text = body?.generationConfig?.responseMimeType === 'application/json' ? 'ok' : 'summary-ok'

  return jsonResponse(200, {
    candidates: [
      {
        content: {
          parts: [{ text }]
        }
      }
    ]
  })
}

describe('OpenCode Go gemini-4-argon protocol', () => {
  beforeEach(() => {
    requests = []
    modelsWithoutJsonSupport.value.clear()
    modelsWithoutReasoningSupport.value.clear()
    sessionStorage.clear()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? '{}'))
        const headers = headerRecord(init?.headers)
        requests.push({ url: String(url), body, headers })

        return gateway(String(url), body, headers)
      })
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns text when chat completions rejects gemini-4-argon', async () => {
    const result = await callOpenCodeGo(messages, {
      model: 'gemini-4-argon',
      apiKey: 'test-key',
      modeIsGame: false,
      maxTokens: 32,
      reasoningEffort: 'default'
    })

    expect(result).toBe('ok')
    const accepted = requests.find((request) => request.url.includes(GOOGLE_PATH))
    expect(accepted?.url.endsWith(GOOGLE_PATH)).toBe(true)
    expect(accepted?.headers.Authorization).toBe('Bearer test-key')
    expect(accepted?.body.model).toBeUndefined()
    expect(accepted?.body.systemInstruction.parts[0].text).toBe('Reply with JSON.')
    expect(accepted?.body.contents.map((entry: any) => entry.role)).toEqual(['user', 'model', 'user'])
    expect(accepted?.body.generationConfig.responseMimeType).toBe('application/json')
    expect(accepted?.body.generationConfig.thinkingConfig).toBeUndefined()
  })

  it('sends thinkingLevel HIGH when reasoning effort is high', async () => {
    const result = await callOpenCodeGo(messages, {
      model: 'gemini-4-argon',
      apiKey: 'test-key',
      modeIsGame: false,
      maxTokens: 32,
      reasoningEffort: 'high'
    })

    expect(result).toBe('ok')
    const accepted = requests.find((request) => request.url.includes(GOOGLE_PATH))
    expect(accepted?.body.generationConfig.thinkingConfig.thinkingLevel).toBe('HIGH')
    expect(accepted?.body.reasoning).toBeUndefined()
  })

  it('summarizes gemini-4-argon without JSON mime type', async () => {
    const result = await callOpenCodeGoSummarization(messages, {
      model: 'gemini-4-argon',
      apiKey: 'test-key',
      maxTokens: 32,
      reasoningEffort: 'default'
    })

    expect(result).toBe('summary-ok')
    const accepted = requests.find((request) => request.url.includes(GOOGLE_PATH))
    expect(accepted?.body.generationConfig.responseMimeType).toBeUndefined()
  })

  it('keeps a chat-completions model on chat completions', async () => {
    const result = await callOpenCodeGo(messages, {
      model: 'kimi-k2.6',
      apiKey: 'test-key',
      modeIsGame: false,
      maxTokens: 32,
      reasoningEffort: 'default'
    })

    expect(result).toBe('chat-ok')
    expect(requests.some((request) => request.url.includes(GOOGLE_PATH))).toBe(false)
    expect(requests.some((request) => request.url.includes('/chat/completions'))).toBe(true)
  })
})
