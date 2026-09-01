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
const MAX_PROMPT_CACHE_KEY_LEN = 64

export const OPENCODE_GO_CACHE_CONTROL = Object.freeze({ type: 'ephemeral', ttl: '1h' })

/**
 * DeepSeek / OpenAI / xAI cache from a byte-identical prefix and ignore
 * Anthropic-style cache_control. Claude / Gemini / Qwen / Nova need explicit
 * breakpoints on content blocks.
 *
 * Grok is implicit (prefix + server affinity). It is not Anthropic-style.
 * OpenCode Go still wants prompt_cache_key / x-grok-conv-id on Grok even
 * though cache_control is the wrong knob for that model.
 */
export const modelUsesExplicitCacheControl = (model: string): boolean => {
  const id = (model || '').toLowerCase()
  if (!id) return false
  if (IMPLICIT_CACHE_HINTS.some((hint) => id.includes(hint))) return false

  return EXPLICIT_CACHE_HINTS.some((hint) => id.includes(hint))
}

export const isGrokModel = (model: string): boolean => {
  const id = (model || '').toLowerCase()
  if (!id) return false

  return id.includes('grok')
}

export const openCodeGoRejectsCacheStamping = (model: string): boolean => {
  const id = (model || '').toLowerCase()

  return id.includes('glm') || id.includes('zhipu')
}

export const clampPromptCacheKey = (key?: string): string | undefined => {
  if (!key) return undefined
  if (key.length <= MAX_PROMPT_CACHE_KEY_LEN) return key

  return Array.from(key).slice(0, MAX_PROMPT_CACHE_KEY_LEN).join('')
}

export const attachGrokCacheAffinityHeaders = (
  headers: Record<string, string>,
  model: string,
  sessionId?: string
): Record<string, string> => {
  if (!sessionId || !isGrokModel(model)) return headers
  headers['x-grok-conv-id'] = sessionId

  return headers
}

export const attachOpenCodeGoSessionCacheFields = (
  body: any,
  opts: { enable: boolean; model: string; sessionId?: string; includeRetention?: boolean }
): any => {
  if (!opts.enable || openCodeGoRejectsCacheStamping(opts.model)) return body
  const next = { ...body }
  const key = clampPromptCacheKey(opts.sessionId)
  if (key) {
    next.prompt_cache_key = key
    if (opts.includeRetention) next.prompt_cache_retention = '24h'
  }

  return next
}

export const splitSystemInstructionsAndInput = (messages: any[]): { instructions?: string; input: any[] } => {
  const instructionParts: string[] = []
  const input: any[] = []

  for (const msg of messages) {
    if (msg.role === 'system') {
      if (typeof msg.content === 'string' && msg.content) instructionParts.push(msg.content)
      continue
    }
    input.push({ role: msg.role, content: msg.content })
  }

  return {
    instructions: instructionParts.length ? instructionParts.join('\n\n') : undefined,
    input
  }
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

const toCachedTextBlock = (text: string, marker: { type: string; ttl?: string } = { type: 'ephemeral' }) => ({
  type: 'text',
  text,
  cache_control: { ...marker }
})

const stampCacheControlOnMessage = (message: any, marker: { type: string; ttl?: string }): boolean => {
  const content = message.content
  if (typeof content === 'string') {
    if (content.length === 0) return false
    message.content = [toCachedTextBlock(content, marker)]

    return true
  }
  if (Array.isArray(content) && content.length > 0) {
    for (let i = content.length - 1; i >= 0; i--) {
      const part = content[i]
      if (!part || typeof part !== 'object') continue
      if (part.cache_control) return true
      if (part.type === 'text' || part.type === 'image' || part.type === 'image_url' || part.type === 'tool_use' || part.type === 'tool_result') {
        part.cache_control = { ...marker }

        return true
      }
    }
  }

  return false
}

/**
 * OpenCode CLI / pi-opencode-go-cache: up to 2 system messages plus the last
 * 2 user/assistant messages. Used on OpenCode Go chat/completions and
 * Anthropic /messages. Not used for Grok on /responses.
 */
export const applyOpenCodeGoCacheBreakpoints = (
  messages: any[],
  marker: { type: string; ttl?: string } = OPENCODE_GO_CACHE_CONTROL
): any[] => {
  const processed = cloneMessages(messages)
  let systemStamped = 0
  for (const msg of processed) {
    if (msg.role === 'system' || msg.role === 'developer') {
      if (stampCacheControlOnMessage(msg, marker)) {
        systemStamped += 1
        if (systemStamped >= 2) break
      }
    } else {
      break
    }
  }

  let finalStamped = 0
  for (let i = processed.length - 1; i >= 0; i--) {
    const role = processed[i].role
    if (role === 'user' || role === 'assistant') {
      if (stampCacheControlOnMessage(processed[i], marker)) {
        finalStamped += 1
        if (finalStamped >= 2) break
      }
    }
  }

  return processed
}

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
  const details = usage.prompt_tokens_details || usage.input_tokens_details || {}
  const cachedFromDetails = details.cached_tokens
  const cachedFromAnthropic = usage.cache_read_input_tokens
  const cachedFromDeepSeek = usage.prompt_cache_hit_tokens
  const cachedFromXai = usage.cached_prompt_text_tokens

  const cachedTokens =
    typeof cachedFromDetails === 'number'
      ? cachedFromDetails
      : typeof cachedFromAnthropic === 'number'
        ? cachedFromAnthropic
        : typeof cachedFromDeepSeek === 'number'
          ? cachedFromDeepSeek
          : typeof cachedFromXai === 'number'
            ? cachedFromXai
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
  const usage = responseData !== undefined ? extractPromptCacheUsage(responseData) : undefined
  if (usage) {
    logDebug(`[LLM] ${provider} cache:`, usage)
    logDebug(`[LLM] ${provider} response JSON:`, responseData)
  }
  if (typeof window !== 'undefined') {
    const bucket = ((window as any).__llmExchanges ||= [])
    const messages = requestBody?.messages || requestBody?.input
    const systemMsg = Array.isArray(messages) ? messages.find((m: any) => m?.role === 'system') : undefined
    const systemText = typeof systemMsg?.content === 'string'
      ? systemMsg.content
      : typeof requestBody?.instructions === 'string'
        ? requestBody.instructions
        : ''
    const lastMsg = Array.isArray(messages) && messages.length ? messages[messages.length - 1] : undefined
    const lastText = typeof lastMsg?.content === 'string' ? lastMsg.content : ''
    bucket.push({
      ts: Date.now(),
      provider,
      hasRequest: requestBody !== undefined,
      hasResponse: responseData !== undefined,
      usage: usage || null,
      requestSummary: requestBody
        ? {
            model: requestBody.model,
            sessionId: requestBody.session_id || requestBody.prompt_cache_key || null,
            messageCount: Array.isArray(messages) ? messages.length : null,
            systemChars: systemText ? systemText.length : 0,
            lastUserHasTurnContext: lastText.includes('TURN CONTEXT'),
            hasJsonSchema: !!(requestBody.response_format || requestBody.text?.format)
          }
        : null
    })
  }
}

export const buildVolatileTurnContext = (parts: {
  currentCharacterId?: string
  animationsText?: string
  locationsText?: string
  currentBackgroundText?: string
  storySummary?: string
  retryInstruction?: string
  reminders?: string
  newCharacterProfiles?: string
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
  if (parts.newCharacterProfiles && parts.newCharacterProfiles.trim()) {
    blocks.push(`NEW CHARACTER PROFILES (loaded after the cached system prefix):\n${parts.newCharacterProfiles.trim()}`)
  }

  return blocks.join('\n\n')
}
