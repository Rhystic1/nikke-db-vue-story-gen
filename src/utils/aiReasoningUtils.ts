import { logLlmExchange } from '@/utils/contextCacheUtils'

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
  logLlmExchange('openai-compatible', undefined, data)

  return data?.choices?.[0]?.message?.content
}

export function extractResponsesReasoning(data: any): string | undefined {
  const parts: string[] = []
  for (const item of data?.output || []) {
    if (item?.type !== 'reasoning') continue
    if (typeof item.summary === 'string' && item.summary.trim()) parts.push(item.summary)
    for (const c of item.content || []) {
      if (typeof c?.text === 'string' && c.text.trim()) parts.push(c.text)
    }
  }
  if (parts.length) return parts.join('\n')
  if (typeof data?.reasoning === 'string' && data.reasoning.trim()) return data.reasoning

  return extractOpenAiReasoning(data)
}

export function takeResponsesOutputText(data: any, includeReasoning = false): string {
  if (includeReasoning) {
    captureModelReasoning(extractResponsesReasoning(data))
  }
  logLlmExchange('openai-responses', undefined, data)
  if (typeof data?.output_text === 'string' && data.output_text) {
    return data.output_text
  }
  const parts: string[] = []
  for (const item of data?.output || []) {
    if (item?.type !== 'message') continue
    for (const c of item.content || []) {
      if ((c?.type === 'output_text' || c?.type === 'text') && typeof c.text === 'string') {
        parts.push(c.text)
      }
    }
  }

  return parts.join('')
}

export function extractAnthropicTextAndReasoning(data: any): { content: string; reasoning?: string } {
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
