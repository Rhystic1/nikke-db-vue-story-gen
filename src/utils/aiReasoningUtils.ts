import { logDebug } from '@/utils/errorUtils'

export interface PromptCacheUsage {
  promptTokens: number
  cachedTokens: number
  cacheWriteTokens: number
}

const finiteCount = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0)

export function parsePromptCacheUsage(data: any): PromptCacheUsage | null {
  const usage = data?.usage
  const promptTokens = usage?.prompt_tokens

  if (typeof promptTokens === 'number' && Number.isFinite(promptTokens)) {
    const details = usage.prompt_tokens_details

    return {
      promptTokens,
      cachedTokens: finiteCount(details?.cached_tokens),
      cacheWriteTokens: finiteCount(details?.cache_write_tokens)
    }
  }

  const inputTokens = usage?.input_tokens

  if (typeof inputTokens === 'number' && Number.isFinite(inputTokens)) {
    const cachedTokens = finiteCount(usage.cache_read_input_tokens)
    const cacheWriteTokens = finiteCount(usage.cache_creation_input_tokens)

    return {
      promptTokens: inputTokens + cachedTokens + cacheWriteTokens,
      cachedTokens,
      cacheWriteTokens
    }
  }

  const geminiPromptTokens = data?.usageMetadata?.promptTokenCount

  if (typeof geminiPromptTokens === 'number' && Number.isFinite(geminiPromptTokens)) {

    return {
      promptTokens: geminiPromptTokens,
      cachedTokens: finiteCount(data.usageMetadata.cachedContentTokenCount),
      cacheWriteTokens: 0
    }
  }

  return null
}

// FNV-1a 32-bit. Sync and stable so the prompt-cache log can compare the system text across turns.
export function fingerprintText(text: string): string {
  let hash = 0x811c9dc5

  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }

  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function logPromptCacheUsage(data: any): void {
  const usage = parsePromptCacheUsage(data)

  if (!usage) {

    return
  }

  const cachedPercent = usage.promptTokens > 0 ? Math.round((usage.cachedTokens / usage.promptTokens) * 100) : 0

  logDebug(`[PromptCache] prompt=${usage.promptTokens} cached=${usage.cachedTokens} (${cachedPercent}%) written=${usage.cacheWriteTokens}`)
}

let pendingReasoning: string | undefined

export function resetModelReasoning() {
  pendingReasoning = undefined
}

export function captureModelReasoning(reasoning?: string) {
  const trimmed = typeof reasoning === 'string' ? reasoning.trim() : ''
  pendingReasoning = trimmed || undefined
}

export function consumeModelReasoning(): string | undefined {
  const value = pendingReasoning
  pendingReasoning = undefined

  return value
}

export function extractOpenAiReasoning(message: any): string | undefined {
  if (!message || typeof message !== 'object') return undefined

  if (typeof message.reasoning === 'string' && message.reasoning.trim()) {
    return message.reasoning
  }

  if (typeof message.reasoning_content === 'string' && message.reasoning_content.trim()) {
    return message.reasoning_content
  }

  if (Array.isArray(message.reasoning_details)) {
    const parts = message.reasoning_details
      .map((detail: any) => {
        if (typeof detail === 'string') return detail
        if (typeof detail?.text === 'string') return detail.text
        if (typeof detail?.summary === 'string') return detail.summary

        return ''
      })
      .filter(Boolean)

    if (parts.length) return parts.join('\n')
  }

  return undefined
}

export function captureReasoningFromOpenAiData(data: any, includeReasoning: boolean) {
  if (!includeReasoning) return

  captureModelReasoning(extractOpenAiReasoning(data?.choices?.[0]?.message))
}

export function takeOpenAiMessageContent(data: any, includeReasoning = false): string {
  captureReasoningFromOpenAiData(data, includeReasoning)
  logPromptCacheUsage(data)

  return data?.choices?.[0]?.message?.content
}

export function extractAnthropicTextAndReasoning(data: any): { content: string; reasoning?: string } {
  logPromptCacheUsage(data)

  const blocks = Array.isArray(data?.content) ? data.content : []
  const thinking = blocks
    .filter((block: any) => block.type === 'thinking')
    .map((block: any) => block.thinking || block.text)
    .filter(Boolean)
  const textBlock = blocks.find((block: any) => block.type === 'text' && typeof block.text === 'string')

  return {
    content: textBlock?.text ?? '',
    reasoning: thinking.length ? thinking.join('\n') : undefined
  }
}
