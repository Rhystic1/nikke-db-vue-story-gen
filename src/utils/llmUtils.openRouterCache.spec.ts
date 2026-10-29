import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { callOpenRouter } from '@/utils/llmUtils'
import prompts from '@/utils/json/prompts.json'

const messages = [
  { role: 'system', content: 'Story rules.' },
  { role: 'user', content: 'Hello.' },
  { role: 'assistant', content: 'Rapi nods.' },
  { role: 'user', content: 'Next.\n\n[SCENE CONTEXT FOR THIS TURN]' }
]

let bodies: any[] = []

const markedIndexes = (body: any) => {
  return body.messages
    .map((message: any, index: number) => (Array.isArray(message.content) && message.content.some((part: any) => part.cache_control) ? index : -1))
    .filter((index: number) => index >= 0)
}

const send = (model: string) => {
  return callOpenRouter(messages, { model, apiKey: 'test-key', enableContextCaching: true, allowWebSearchFallback: false, modeIsGame: false, prompts })
}

describe('OpenRouter cache breakpoints', () => {
  beforeEach(() => {
    bodies = []
    sessionStorage.clear()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (String(url).endsWith('/chat/completions')) bodies.push(JSON.parse(String(init?.body)))

        return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: '{"actions":[]}' } }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      })
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('marks the system prompt and the last history message for Claude', async () => {
    await send('anthropic/claude-haiku-4.5')

    expect(markedIndexes(bodies[0])).toEqual([0, 2])
  })

  it('marks only the system prompt for Gemini so one cache write is reused across turns', async () => {
    await send('google/gemini-3.7-flash')

    expect(markedIndexes(bodies[0])).toEqual([0])
    expect(bodies[0].messages[2].content).toBe('Rapi nods.')
  })
})
