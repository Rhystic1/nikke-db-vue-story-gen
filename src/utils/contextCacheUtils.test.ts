import { describe, it, expect } from 'vitest'
import {
  modelUsesExplicitCacheControl,
  appendVolatileContextToOutgoingMessages,
  applyExplicitCacheControl,
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

  it('treats Claude, Gemini, Qwen, and MiniMax as explicit', () => {
    expect(modelUsesExplicitCacheControl('anthropic/claude-sonnet-4')).toBe(true)
    expect(modelUsesExplicitCacheControl('google/gemini-2.5-flash')).toBe(true)
    expect(modelUsesExplicitCacheControl('qwen3.7-plus')).toBe(true)
    expect(modelUsesExplicitCacheControl('minimax-m3')).toBe(true)
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
})
