import { describe, expect, it } from 'vitest'
import { parsePromptCacheUsage } from '@/utils/aiReasoningUtils'

describe('parsePromptCacheUsage', () => {
  it('reads OpenAI chat usage and keeps cached tokens inside the prompt total', () => {
    expect(parsePromptCacheUsage({
      usage: {
        prompt_tokens: 12345,
        prompt_tokens_details: {
          cached_tokens: 10000,
          cache_write_tokens: 20
        }
      }
    })).toEqual({
      promptTokens: 12345,
      cachedTokens: 10000,
      cacheWriteTokens: 20
    })

    expect(parsePromptCacheUsage({
      usage: { prompt_tokens: 40 }
    })).toEqual({
      promptTokens: 40,
      cachedTokens: 0,
      cacheWriteTokens: 0
    })

    expect(parsePromptCacheUsage({
      usage: {
        prompt_tokens: 100,
        input_tokens: 5,
        cache_read_input_tokens: 7,
        prompt_tokens_details: { cached_tokens: 40 }
      }
    })).toEqual({
      promptTokens: 100,
      cachedTokens: 40,
      cacheWriteTokens: 0
    })
  })

  it('adds Anthropic cache reads and writes on top of input tokens', () => {
    expect(parsePromptCacheUsage({
      usage: {
        input_tokens: 300,
        cache_read_input_tokens: 10000,
        cache_creation_input_tokens: 45
      }
    })).toEqual({
      promptTokens: 10345,
      cachedTokens: 10000,
      cacheWriteTokens: 45
    })

    expect(parsePromptCacheUsage({
      usage: { input_tokens: 12 }
    })).toEqual({
      promptTokens: 12,
      cachedTokens: 0,
      cacheWriteTokens: 0
    })
  })

  it('reads Gemini prompt usage and reports no cache writes', () => {
    expect(parsePromptCacheUsage({
      usageMetadata: {
        promptTokenCount: 12345,
        cachedContentTokenCount: 10000
      }
    })).toEqual({
      promptTokens: 12345,
      cachedTokens: 10000,
      cacheWriteTokens: 0
    })

    expect(parsePromptCacheUsage({
      usageMetadata: { promptTokenCount: 8 }
    })).toEqual({
      promptTokens: 8,
      cachedTokens: 0,
      cacheWriteTokens: 0
    })
  })

  it('returns null when the payload has no recognized usage', () => {
    expect(parsePromptCacheUsage(null)).toBeNull()
    expect(parsePromptCacheUsage(undefined)).toBeNull()
    expect(parsePromptCacheUsage({})).toBeNull()
    expect(parsePromptCacheUsage({ usage: { completion_tokens: 12 } })).toBeNull()
    expect(parsePromptCacheUsage({ usageMetadata: { candidatesTokenCount: 4 } })).toBeNull()
  })
})
