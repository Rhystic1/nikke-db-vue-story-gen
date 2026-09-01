import { describe, it, expect } from 'vitest'
import {
  modelUsesExplicitCacheControl,
  isGrokModel,
  openCodeGoRejectsCacheStamping,
  clampPromptCacheKey,
  attachGrokCacheAffinityHeaders,
  attachOpenCodeGoSessionCacheFields,
  splitSystemInstructionsAndInput,
  appendVolatileContextToOutgoingMessages,
  applyExplicitCacheControl,
  applyOpenCodeGoCacheBreakpoints,
  applySystemPrefixCacheControl,
  extractPromptCacheUsage,
  buildVolatileTurnContext
} from '@/utils/contextCacheUtils'

describe('modelUsesExplicitCacheControl', () => {
  it('treats DeepSeek as implicit', () => {
    expect(modelUsesExplicitCacheControl('deepseek-v4-flash')).toBe(false)
    expect(modelUsesExplicitCacheControl('deepseek/deepseek-v4-flash')).toBe(false)
    expect(modelUsesExplicitCacheControl('deepseek')).toBe(false)
  })

  it('treats Grok as implicit, not Anthropic-style', () => {
    expect(modelUsesExplicitCacheControl('grok-4.6')).toBe(false)
    expect(modelUsesExplicitCacheControl('x-ai/grok-4.6')).toBe(false)
    expect(modelUsesExplicitCacheControl('opencode-go/grok-4.6')).toBe(false)
  })

  it('treats Claude, Gemini, Qwen, and MiniMax as explicit', () => {
    expect(modelUsesExplicitCacheControl('anthropic/claude-sonnet-4')).toBe(true)
    expect(modelUsesExplicitCacheControl('google/gemini-2.5-flash')).toBe(true)
    expect(modelUsesExplicitCacheControl('qwen3.7-plus')).toBe(true)
    expect(modelUsesExplicitCacheControl('minimax-m3')).toBe(true)
  })
})

describe('isGrokModel', () => {
  it('matches Grok ids across providers', () => {
    expect(isGrokModel('grok-4.6')).toBe(true)
    expect(isGrokModel('x-ai/grok-4.6')).toBe(true)
    expect(isGrokModel('deepseek-v4-flash')).toBe(false)
    expect(isGrokModel('minimax-m3')).toBe(false)
  })
})

describe('openCodeGoRejectsCacheStamping', () => {
  it('skips GLM / Zhipu', () => {
    expect(openCodeGoRejectsCacheStamping('glm-5.2')).toBe(true)
    expect(openCodeGoRejectsCacheStamping('zhipu-glm')).toBe(true)
    expect(openCodeGoRejectsCacheStamping('deepseek-v4-flash')).toBe(false)
    expect(openCodeGoRejectsCacheStamping('grok-4.6')).toBe(false)
  })
})

describe('clampPromptCacheKey', () => {
  it('caps keys at 64 characters', () => {
    expect(clampPromptCacheKey('abc')).toBe('abc')
    expect(clampPromptCacheKey('x'.repeat(80))?.length).toBe(64)
  })
})

describe('attachGrokCacheAffinityHeaders', () => {
  it('sets x-grok-conv-id only for Grok with a session id', () => {
    expect(attachGrokCacheAffinityHeaders({}, 'x-ai/grok-4.6', 'sess-1')['x-grok-conv-id']).toBe('sess-1')
    expect(attachGrokCacheAffinityHeaders({}, 'deepseek/deepseek-v4-flash', 'sess-1')['x-grok-conv-id']).toBeUndefined()
    expect(attachGrokCacheAffinityHeaders({}, 'x-ai/grok-4.6')['x-grok-conv-id']).toBeUndefined()
  })
})

describe('attachOpenCodeGoSessionCacheFields', () => {
  it('adds prompt_cache_key and optional 24h retention', () => {
    const withKey = attachOpenCodeGoSessionCacheFields({ model: 'deepseek-v4-flash' }, {
      enable: true,
      model: 'deepseek-v4-flash',
      sessionId: 'sess-1'
    })
    expect(withKey.prompt_cache_key).toBe('sess-1')
    expect(withKey.prompt_cache_retention).toBeUndefined()

    const withRetention = attachOpenCodeGoSessionCacheFields({ model: 'grok-4.6' }, {
      enable: true,
      model: 'grok-4.6',
      sessionId: 'sess-1',
      includeRetention: true
    })
    expect(withRetention.prompt_cache_key).toBe('sess-1')
    expect(withRetention.prompt_cache_retention).toBe('24h')
  })

  it('does not stamp GLM', () => {
    const body = attachOpenCodeGoSessionCacheFields({ model: 'glm-5.2' }, {
      enable: true,
      model: 'glm-5.2',
      sessionId: 'sess-1',
      includeRetention: true
    })
    expect(body.prompt_cache_key).toBeUndefined()
  })
})

describe('splitSystemInstructionsAndInput', () => {
  it('moves system text into instructions for the Responses API', () => {
    const { instructions, input } = splitSystemInstructionsAndInput([
      { role: 'system', content: 'stable prefix' },
      { role: 'user', content: 'Test scene with Chime' },
      { role: 'assistant', content: 'Chime waves.' }
    ])

    expect(instructions).toBe('stable prefix')
    expect(input).toEqual([
      { role: 'user', content: 'Test scene with Chime' },
      { role: 'assistant', content: 'Chime waves.' }
    ])
  })
})

describe('appendVolatileContextToOutgoingMessages', () => {
  it('appends to the last user message without mutating the original', () => {
    const original = [
      { role: 'system', content: 'stable' },
      { role: 'user', content: 'Test scene with Chime' }
    ]
    const result = appendVolatileContextToOutgoingMessages(original, 'Current Character: c351')

    expect(original[1].content).toBe('Test scene with Chime')
    expect(result[1].content).toContain('Test scene with Chime')
    expect(result[1].content).toContain('Current Character: c351')
    expect(result[0].content).toBe('stable')
  })

  it('keeps earlier user turns unchanged so the prefix can cache', () => {
    const original = [
      { role: 'system', content: 'stable' },
      { role: 'user', content: 'Turn 1' },
      { role: 'assistant', content: 'Reply 1' },
      { role: 'user', content: 'Turn 2' }
    ]
    const result = appendVolatileContextToOutgoingMessages(original, 'Current Character: c351')

    expect(result[1].content).toBe('Turn 1')
    expect(result[3].content).toContain('Turn 2')
    expect(result[3].content).toContain('Current Character: c351')
  })
})

describe('applyExplicitCacheControl', () => {
  it('marks the system prompt and the penultimate history message', () => {
    const messages = [
      { role: 'system', content: 'stable' },
      { role: 'user', content: 'Turn 1' },
      { role: 'assistant', content: 'Reply 1' },
      { role: 'user', content: 'Turn 2 plus volatile' }
    ]
    const result = applyExplicitCacheControl(messages)

    expect(result[0].content[0].cache_control).toEqual({ type: 'ephemeral' })
    expect(result[0].content[0].text).toBe('stable')
    expect(result[2].content[0].cache_control).toEqual({ type: 'ephemeral' })
    expect(typeof result[3].content).toBe('string')
  })
})

describe('applyOpenCodeGoCacheBreakpoints', () => {
  it('stamps system plus the last two user/assistant messages with 1h ttl', () => {
    const messages = [
      { role: 'system', content: 'stable' },
      { role: 'user', content: 'Turn 1' },
      { role: 'assistant', content: 'Reply 1' },
      { role: 'user', content: 'Turn 2 plus volatile' }
    ]
    const result = applyOpenCodeGoCacheBreakpoints(messages)

    expect(result[0].content[0].cache_control).toEqual({ type: 'ephemeral', ttl: '1h' })
    expect(result[2].content[0].cache_control).toEqual({ type: 'ephemeral', ttl: '1h' })
    expect(result[3].content[0].cache_control).toEqual({ type: 'ephemeral', ttl: '1h' })
    expect(typeof result[1].content).toBe('string')
  })
})

describe('applySystemPrefixCacheControl', () => {
  it('only marks the system message', () => {
    const messages = [
      { role: 'system', content: 'stable' },
      { role: 'user', content: 'hi' }
    ]
    const result = applySystemPrefixCacheControl(messages)

    expect(result[0].content[0].cache_control).toEqual({ type: 'ephemeral' })
    expect(result[1].content).toBe('hi')
  })
})

describe('extractPromptCacheUsage', () => {
  it('reads OpenRouter nested cached_tokens including zero', () => {
    const usage = extractPromptCacheUsage({
      usage: {
        prompt_tokens: 1381,
        completion_tokens: 16,
        prompt_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 }
      }
    })

    expect(usage.cachedTokens).toBe(0)
    expect(usage.promptTokens).toBe(1381)
  })

  it('reads DeepSeek prompt_cache_hit_tokens', () => {
    const usage = extractPromptCacheUsage({
      usage: {
        prompt_tokens: 2338,
        prompt_cache_hit_tokens: 2300,
        prompt_cache_miss_tokens: 38
      }
    })

    expect(usage.cacheHitTokens).toBe(2300)
    expect(usage.cachedTokens).toBe(2300)
    expect(usage.cacheMissTokens).toBe(38)
  })

  it('reads Responses API input_tokens_details.cached_tokens', () => {
    const usage = extractPromptCacheUsage({
      usage: {
        input_tokens: 2400,
        output_tokens: 80,
        input_tokens_details: { cached_tokens: 2100 }
      }
    })

    expect(usage.cachedTokens).toBe(2100)
    expect(usage.promptTokens).toBe(2400)
    expect(usage.completionTokens).toBe(80)
  })
})

describe('buildVolatileTurnContext', () => {
  it('puts current character and animations after the conversation prefix', () => {
    const text = buildVolatileTurnContext({
      currentCharacterId: 'c351',
      animationsText: 'Animations for Chime (c351): ["smile"]',
      storySummary: 'They met in the outpost.'
    })

    expect(text).toContain('Current Character: c351')
    expect(text).toContain('Available Animations')
    expect(text).toContain('PREVIOUS STORY SUMMARY')
  })

  it('puts newly loaded profiles after the cached prefix', () => {
    const text = buildVolatileTurnContext({
      currentCharacterId: 'c351',
      newCharacterProfiles: '{"Crown":{"id":"c100"}}'
    })

    expect(text).toContain('NEW CHARACTER PROFILES')
    expect(text).toContain('Crown')
  })
})
