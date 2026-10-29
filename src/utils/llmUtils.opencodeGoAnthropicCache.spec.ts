import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { callOpenCodeGo } from '@/utils/llmUtils'
import { modelsWithoutCacheControlSupport } from '@/utils/providerConfigUtils'

const ephemeral = { type: 'ephemeral' }

let bodies: any[] = []

describe('OpenCode Go Anthropic cache breakpoints', () => {
  beforeEach(() => {
    bodies = []
    modelsWithoutCacheControlSupport.value.clear()
    sessionStorage.clear()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        bodies.push(JSON.parse(String(init?.body ?? '{}')))

        return new Response(JSON.stringify({ content: [{ type: 'text', text: 'ok' }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        })
      })
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('marks the system prompt and the last history message, not the volatile final turn', async () => {
    const result = await callOpenCodeGo(
      [
        { role: 'system', content: 'Story rules.' },
        { role: 'user', content: 'Hello.' },
        { role: 'assistant', content: 'Rapi nods.' },
        { role: 'user', content: 'Next.\n\n[SCENE CONTEXT FOR THIS TURN]' }
      ],
      { model: 'minimax-m3', apiKey: 'test-key', modeIsGame: false, maxTokens: 32, enableContextCaching: true }
    )

    expect(result).toBe('ok')
    const body = bodies[0]
    expect(body.system).toEqual([{ type: 'text', text: 'Story rules.', cache_control: ephemeral }])
    expect(body.messages[0].content).toBe('Hello.')
    expect(body.messages[1].content).toEqual([{ type: 'text', text: 'Rapi nods.', cache_control: ephemeral }])
    expect(body.messages[2].content).toBe('Next.\n\n[SCENE CONTEXT FOR THIS TURN]')
  })

  it('joins every system message instead of keeping only the last one', async () => {
    await callOpenCodeGo(
      [
        { role: 'system', content: 'Story rules.' },
        { role: 'user', content: 'Hello.' },
        { role: 'system', content: 'Session restored successfully.' }
      ],
      { model: 'minimax-m3', apiKey: 'test-key', modeIsGame: false, maxTokens: 32, enableContextCaching: true }
    )

    expect(bodies[0].system[0].text).toBe('Story rules.\n\nSession restored successfully.')
  })
})
