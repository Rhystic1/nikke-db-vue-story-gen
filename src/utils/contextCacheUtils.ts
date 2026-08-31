import { logDebug } from '@/utils/errorUtils'

export type PromptCacheUsage = {
  promptTokens: number | null
  completionTokens: number | null
  cachedTokens: number | null
  cacheWriteTokens: number | null
  cacheHitTokens: number | null
  cacheMissTokens: number | null
}

const EXPLICIT_CACHE_HINTS = ['claude', 'anthropic', 'gemini', 'google/', 'qwen', 'qwq', 'nova', 'minimax']
const IMPLICIT_CACHE_HINTS = ['deepseek', 'openai', 'gpt-', '/gpt', 'o1-', 'o3-', 'o4-', 'grok']

/**
 * DeepSeek / OpenAI / xAI cache from a byte-identical prefix and ignore
 * Anthropic-style cache_control. Claude / Gemini / Qwen / Nova need explicit
 * breakpoints on content blocks.
 */
export const modelUsesExplicitCacheControl = (model: string): boolean => {
  const id = (model || '').toLowerCase()
  if (!id) return false
  if (IMPLICIT_CACHE_HINTS.some((hint) => id.includes(hint))) return false

  return EXPLICIT_CACHE_HINTS.some((hint) => id.includes(hint))
}

export const cloneMessages = (messages: any[]): any[] => messages.map((m) => ({ ...m }))

/**
 * Append turn-local context to the last user message of an *outgoing* request.
 * Does not mutate chat history. Past turns keep their original user text so
 * the system + history prefix can stay identical.
 */
export const appendVolatileContextToOutgoingMessages = (messages: any[], volatileText: string): any[] => {
  const trimmed = (volatileText || '').trim()
  if (!trimmed) return cloneMessages(messages)

  const result = cloneMessages(messages)
  for (let i = result.length - 1; i >= 0; i--) {
    if (result[i].role !== 'user') continue
    const content = result[i].content
    if (typeof content !== 'string') break
    result[i] = { ...result[i], content: `${content}\n\n${trimmed}` }

    return result
  }

  result.push({ role: 'user', content: trimmed })

  return result
}

const toCachedTextBlock = (text: string) => ({
  type: 'text',
  text,
  cache_control: { type: 'ephemeral' }
})

/**
 * Anthropic / OpenRouter explicit caching: breakpoint on the system prompt
 * and on the last *completed* history message (not the current user turn).
 */
export const applyExplicitCacheControl = (messages: any[]): any[] => {
  const processed = cloneMessages(messages)
  if (processed.length === 0) return processed

  if (processed[0].role === 'system' && typeof processed[0].content === 'string') {
    processed[0] = {
      ...processed[0],
      content: [toCachedTextBlock(processed[0].content)]
    }
  }

  if (processed.length >= 2) {
    const lastHistoryIndex = processed.length - 2
    const canMark = lastHistoryIndex > 0 || (lastHistoryIndex === 0 && processed[0].role !== 'system')
    if (canMark) {
      const msg = processed[lastHistoryIndex]
      if (typeof msg.content === 'string') {
        processed[lastHistoryIndex] = {
          ...msg,
          content: [toCachedTextBlock(msg.content)]
        }
      }
    }
  }

  return processed
}

/** Pollinations docs: mark the end of the static prefix on a content block. */
export const applySystemPrefixCacheControl = (messages: any[]): any[] => {
  const processed = cloneMessages(messages)
  if (processed.length === 0) return processed
  if (processed[0].role === 'system' && typeof processed[0].content === 'string') {
    processed[0] = {
      ...processed[0],
      content: [toCachedTextBlock(processed[0].content)]
    }
  }

  return processed
}

export const extractPromptCacheUsage = (data: any): PromptCacheUsage => {
  const usage = data?.usage || {}
  const details = usage.prompt_tokens_details || {}
  const cachedFromDetails = details.cached_tokens
  const cachedFromAnthropic = usage.cache_read_input_tokens
  const cachedFromDeepSeek = usage.prompt_cache_hit_tokens

  const cachedTokens =
    typeof cachedFromDetails === 'number'
      ? cachedFromDetails
      : typeof cachedFromAnthropic === 'number'
        ? cachedFromAnthropic
        : typeof cachedFromDeepSeek === 'number'
          ? cachedFromDeepSeek
          : typeof usage.cached_tokens === 'number'
            ? usage.cached_tokens
            : null

  return {
    promptTokens: typeof usage.prompt_tokens === 'number' ? usage.prompt_tokens : typeof usage.input_tokens === 'number' ? usage.input_tokens : null,
    completionTokens: typeof usage.completion_tokens === 'number' ? usage.completion_tokens : typeof usage.output_tokens === 'number' ? usage.output_tokens : null,
    cachedTokens,
    cacheWriteTokens:
      typeof details.cache_write_tokens === 'number'
        ? details.cache_write_tokens
        : typeof usage.cache_creation_input_tokens === 'number'
          ? usage.cache_creation_input_tokens
          : null,
    cacheHitTokens: typeof usage.prompt_cache_hit_tokens === 'number' ? usage.prompt_cache_hit_tokens : cachedTokens,
    cacheMissTokens: typeof usage.prompt_cache_miss_tokens === 'number' ? usage.prompt_cache_miss_tokens : null
  }
}

export const logLlmExchange = (provider: string, requestBody?: any, responseData?: any) => {
  if (requestBody !== undefined) {
    logDebug(`[LLM] ${provider} request JSON:`, requestBody)
  }
  if (responseData === undefined) return
  const usage = extractPromptCacheUsage(responseData)
  logDebug(`[LLM] ${provider} cache:`, usage)
  logDebug(`[LLM] ${provider} response JSON:`, responseData)
}

export const buildVolatileTurnContext = (parts: {
  currentCharacterId?: string
  animationsText?: string
  locationsText?: string
  currentBackgroundText?: string
  storySummary?: string
  retryInstruction?: string
  reminders?: string
}): string => {
  const blocks: string[] = []
  blocks.push('--- TURN CONTEXT (not story history; keep this after the conversation) ---')
  blocks.push(`Current Character: ${parts.currentCharacterId || '(none)'}.`)
  if (parts.animationsText) {
    blocks.push(`Available Animations:\n${parts.animationsText}`)
  }
  if (parts.locationsText) {
    blocks.push(parts.locationsText)
  }
  if (parts.currentBackgroundText) {
    blocks.push(parts.currentBackgroundText)
  }
  if (parts.storySummary && parts.storySummary.trim()) {
    blocks.push(`PREVIOUS STORY SUMMARY:\n${parts.storySummary.trim()}`)
  }
  if (parts.retryInstruction && parts.retryInstruction.trim()) {
    blocks.push(parts.retryInstruction.trim())
  }
  if (parts.reminders && parts.reminders.trim()) {
    blocks.push(parts.reminders.trim())
  }

  return blocks.join('\n\n')
}
