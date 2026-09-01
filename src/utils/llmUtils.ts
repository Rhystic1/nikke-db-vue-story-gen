// LLM utility functions for summarization and API calls
// These functions handle higher token limits for summarization tasks

import { AIError, logDebug } from '@/utils/chatUtils'
import { callGeminiSummarization } from '@/utils/geminiUtils'
import { callPollinationsSummarization } from '@/utils/pollinationsUtils'
import { modelsWithoutJsonSupport, modelsWithoutReasoningSupport, OPENCODE_GO_CHAT_COMPLETIONS_URL, OPENCODE_GO_MESSAGES_URL, OPENCODE_GO_RESPONSES_URL, OPENCODE_GO_MODELS_URL, OPENCODE_GO_EXCLUDED_MODEL_IDS, modelsWithoutCacheControlSupport, buildStoryResponseSchema, isOpenCodeGoAnthropicModel, isOpenCodeGoResponsesModel } from '@/utils/providerConfigUtils'
import { captureModelReasoning, extractAnthropicTextAndReasoning, takeOpenAiMessageContent, takeResponsesOutputText } from '@/utils/aiReasoningUtils'
import { applyExplicitCacheControl, applyOpenCodeGoCacheBreakpoints, attachGrokCacheAffinityHeaders, attachOpenCodeGoSessionCacheFields, logLlmExchange, modelUsesExplicitCacheControl, openCodeGoRejectsCacheStamping, splitSystemInstructionsAndInput } from '@/utils/contextCacheUtils'

// Re-exports from extracted modules
export { modelsWithoutJsonSupport, modelsRequiringStreamForHighTokens, modelsWithoutCacheControlSupport, modelsWithoutReasoningSupport, providerOptions, tokenUsageOptions, getReasoningEffortOptions, buildStoryResponseSchema } from '@/utils/providerConfigUtils'
export { callPollinationsSummarization, callPollinations, callPollinationsWithoutJson } from '@/utils/pollinationsUtils'
export { getFilteredAnimations, enrichActionsWithAnimations, formatAnimationsForContext } from '@/utils/animationEnrichmentUtils'
export { handleTumblingWindowSummarization, type TumblingWindowState, type TumblingWindowCallbacks, type TumblingWindowResult } from '@/utils/tumblingWindowUtils'
export { callGemini, callGeminiSummarization, fetchGeminiModels, GEMINI_DEFAULT_MODEL, GEMINI_FALLBACK_MODEL_OPTIONS } from '@/utils/geminiUtils'

// --- Internal helpers for OpenAI-compatible APIs ---

const buildOpenAiCompatibleRequestBody = (opts: {
  messages: any[]
  maxTokens: number
  model?: string
  modeIsGame?: boolean
  reasoningEffort?: string
  includeJsonSchema?: boolean
  reasoningExclude?: boolean
  includeAnimReason?: boolean
}) => {
  const { messages, maxTokens, model, modeIsGame = false, reasoningEffort, includeJsonSchema = false, reasoningExclude = false, includeAnimReason = false } = opts
  const requestBody: any = {
    messages,
    max_tokens: maxTokens
  }

  if (model) requestBody.model = model
  if (includeJsonSchema) {
    requestBody.response_format = buildStoryResponseSchema(modeIsGame, includeAnimReason)
  }
  if (reasoningEffort && reasoningEffort !== 'default') {
    requestBody.reasoning = {
      effort: reasoningEffort,
      exclude: reasoningExclude
    }
  }

  return requestBody
}

const getOpenAiCompatibleHeaders = (apiKey?: string) => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  }

  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`
  }

  return headers
}

const parseOpenAiCompatibleTextResponse = async (response: Response, includeReasoning = false) => {
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new AIError(errorData?.error?.code ?? response.status, errorData?.error?.message ?? response.statusText ?? 'Unknown error')
  }

  const data = await response.json()

  return takeOpenAiMessageContent(data, includeReasoning)
}

const sendOpenAiCompatibleRequest = async (url: string, opts: { requestBody: any; apiKey?: string; signal?: AbortSignal; extraHeaders?: Record<string, string> }) => {
  logLlmExchange(url, opts.requestBody)

  return await fetch(url, {
    method: 'POST',
    headers: {
      ...getOpenAiCompatibleHeaders(opts.apiKey),
      ...(opts.extraHeaders || {})
    },
    body: JSON.stringify(opts.requestBody),
    signal: opts.signal
  })
}

const convertOpenAiToAnthropicMessages = (messages: any[], enableContextCaching: boolean, model: string) => {
  const shouldAddCacheControl = enableContextCaching && !openCodeGoRejectsCacheStamping(model) && !modelsWithoutCacheControlSupport.value.has(model)

  let systemContent: string | undefined
  const anthropicMessages: any[] = []

  for (const msg of messages) {
    if (msg.role === 'system') {
      systemContent = typeof msg.content === 'string' ? msg.content : msg.content
      continue
    }
    anthropicMessages.push({
      role: msg.role,
      content: typeof msg.content === 'string' ? msg.content : msg.content
    })
  }

  if (shouldAddCacheControl) {
    const stampedMessages = applyOpenCodeGoCacheBreakpoints(anthropicMessages)
    const system = typeof systemContent === 'string' && systemContent
      ? [{ type: 'text', text: systemContent, cache_control: { type: 'ephemeral', ttl: '1h' } }]
      : systemContent

    return { system, messages: stampedMessages, shouldAddCacheControl }
  }

  return { system: systemContent, messages: anthropicMessages, shouldAddCacheControl }
}

const buildAnthropicRequestBody = (opts: {
  messages: any[]
  maxTokens: number
  model: string
  enableContextCaching: boolean
  reasoningEffort?: string
  sessionId?: string
}) => {
  const { messages, maxTokens, model, enableContextCaching, reasoningEffort, sessionId } = opts
  const { system, messages: anthropicMessages, shouldAddCacheControl } = convertOpenAiToAnthropicMessages(messages, enableContextCaching, model)

  let requestBody: any = {
    model,
    max_tokens: maxTokens,
    messages: anthropicMessages
  }

  if (system) {
    requestBody.system = system
  }

  if (reasoningEffort && reasoningEffort !== 'default') {
    requestBody.reasoning = { effort: reasoningEffort }
  }

  requestBody = attachOpenCodeGoSessionCacheFields(requestBody, {
    enable: enableContextCaching,
    model,
    sessionId,
    includeRetention: true
  })

  return { requestBody, shouldAddCacheControl }
}

const withOpenCodeGoCompletionsCache = (requestBody: any, opts: { enableContextCaching: boolean; model: string; sessionId?: string }) => {
  const { enableContextCaching, model, sessionId } = opts
  if (!enableContextCaching || openCodeGoRejectsCacheStamping(model)) return requestBody

  let next = attachOpenCodeGoSessionCacheFields(requestBody, {
    enable: true,
    model,
    sessionId,
    includeRetention: false
  })

  if (!modelsWithoutCacheControlSupport.value.has(model) && Array.isArray(next.messages)) {
    next = { ...next, messages: applyOpenCodeGoCacheBreakpoints(next.messages) }
  }

  return next
}

const buildOpenCodeGoResponsesBody = (opts: {
  messages: any[]
  model: string
  maxTokens: number
  reasoningEffort?: string
  enableContextCaching?: boolean
  sessionId?: string
  includeJsonSchema?: boolean
  modeIsGame?: boolean
  includeAnimReason?: boolean
}) => {
  const { instructions, input } = splitSystemInstructionsAndInput(opts.messages)
  let requestBody: any = {
    model: opts.model,
    input,
    max_output_tokens: opts.maxTokens,
    store: false
  }

  if (instructions) requestBody.instructions = instructions

  if (opts.reasoningEffort && opts.reasoningEffort !== 'default') {
    requestBody.reasoning = { effort: opts.reasoningEffort }
  }

  if (opts.includeJsonSchema) {
    const schema = buildStoryResponseSchema(!!opts.modeIsGame, !!opts.includeAnimReason)
    requestBody.text = {
      format: {
        type: 'json_schema',
        name: schema.json_schema.name,
        schema: schema.json_schema.schema,
        strict: false
      }
    }
  }

  requestBody = attachOpenCodeGoSessionCacheFields(requestBody, {
    enable: !!opts.enableContextCaching,
    model: opts.model,
    sessionId: opts.sessionId,
    includeRetention: true
  })

  return requestBody
}

const openCodeGoExtraHeaders = (model: string, sessionId?: string) => {
  const headers: Record<string, string> = {}
  attachGrokCacheAffinityHeaders(headers, model, sessionId)

  return headers
}

const parseAnthropicTextResponse = async (response: Response, includeReasoning = false) => {
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new AIError(errorData?.error?.code ?? response.status, errorData?.error?.message ?? response.statusText ?? 'Unknown error')
  }

  const data = await response.json()
  const { content, reasoning } = extractAnthropicTextAndReasoning(data)
  logLlmExchange('anthropic-compatible', undefined, data)
  if (includeReasoning) {
    captureModelReasoning(reasoning)
  }
  if (content) {
    return content
  }
  throw new AIError('PARSE_ERROR', 'Unexpected Anthropic response format')
}

const sendAnthropicCompatibleRequest = async (url: string, opts: { requestBody: any; apiKey: string; signal?: AbortSignal }) => {
  logLlmExchange(url, opts.requestBody)

  return await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': opts.apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify(opts.requestBody),
    signal: opts.signal
  })
}

const sendOpenCodeGoRequest = async (requestBody: any, apiKey: string, signal?: AbortSignal, extraHeaders?: Record<string, string>) => {
  const response = await sendOpenAiCompatibleRequest(OPENCODE_GO_CHAT_COMPLETIONS_URL, {
    requestBody,
    apiKey,
    signal,
    extraHeaders
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    console.error('OpenCode Go API Error Details:', errorData)

    if (response.status === 429) {
      throw new Error('RATE_LIMITED')
    }

    return { response, errorData }
  }

  return { response }
}

const sendOpenCodeGoResponsesRequest = async (requestBody: any, apiKey: string, signal?: AbortSignal, extraHeaders?: Record<string, string>) => {
  const response = await sendOpenAiCompatibleRequest(OPENCODE_GO_RESPONSES_URL, {
    requestBody,
    apiKey,
    signal,
    extraHeaders
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    console.error('OpenCode Go Responses API Error Details:', errorData)

    if (response.status === 429) {
      throw new Error('RATE_LIMITED')
    }

    return { response, errorData }
  }

  return { response }
}

const sendOpenCodeGoAnthropicRequest = async (requestBody: any, apiKey: string, signal?: AbortSignal) => {
  const response = await sendAnthropicCompatibleRequest(OPENCODE_GO_MESSAGES_URL, {
    requestBody,
    apiKey,
    signal
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    console.error('OpenCode Go Anthropic API Error Details:', errorData)

    if (response.status === 429) {
      throw new Error('RATE_LIMITED')
    }

    return { response, errorData }
  }

  return { response }
}

const parseResponsesTextResponse = async (response: Response, includeReasoning = false) => {
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new AIError(errorData?.error?.code ?? response.status, errorData?.error?.message ?? response.statusText ?? 'Unknown error')
  }

  const data = await response.json()

  return takeResponsesOutputText(data, includeReasoning)
}

const isReasoningParameterError = (errorData: any) => {
  const msg = (errorData?.error?.message || '') + ' ' + (errorData?.error?.code || '')
  return msg.toLowerCase().includes('reasoning') || (typeof errorData?.message === 'string' && errorData.message.toLowerCase().includes('reasoning'))
}

const isCacheControlError = (errorData: any) => {
  const msg = JSON.stringify(errorData || {}).toLowerCase()

  return msg.includes('cache_control') || msg.includes('cache control')
}

const isPromptCacheFieldError = (errorData: any) => {
  const msg = JSON.stringify(errorData || {}).toLowerCase()

  return isCacheControlError(errorData) || msg.includes('prompt_cache_key') || msg.includes('prompt_cache_retention')
}

const isJsonSchemaParameterError = (errorData: any) => {
  const msg = JSON.stringify(errorData || '')

  return msg.includes('response_format') || msg.includes('json_schema') || msg.includes('schema') || msg.includes('text.format')
}

const rememberModelLacksCacheControl = (model: string) => {
  modelsWithoutCacheControlSupport.value.add(model)
  sessionStorage.setItem('modelsWithoutCacheControlSupport', JSON.stringify([...modelsWithoutCacheControlSupport.value]))
}

const rememberModelLacksReasoning = (model: string) => {
  modelsWithoutReasoningSupport.value.add(model)
  sessionStorage.setItem('modelsWithoutReasoningSupport', JSON.stringify([...modelsWithoutReasoningSupport.value]))
}

const callOpenCodeGoTextRequest = async (opts: {
  messages: any[]
  model: string
  apiKey: string
  maxTokens: number
  reasoningEffort?: string
  enableContextCaching?: boolean
  includeReasoning?: boolean
  sessionId?: string
  signal?: AbortSignal
}) => {
  const { messages, model, apiKey, maxTokens, signal, enableContextCaching = false, includeReasoning = false, sessionId } = opts
  let { reasoningEffort } = opts
  const extraHeaders = openCodeGoExtraHeaders(model, sessionId)

  if (reasoningEffort && reasoningEffort !== 'default' && modelsWithoutReasoningSupport.value.has(model)) {
    reasoningEffort = undefined
  }

  if (isOpenCodeGoAnthropicModel(model)) {
    const { requestBody, shouldAddCacheControl } = buildAnthropicRequestBody({ messages, maxTokens, model, enableContextCaching, reasoningEffort, sessionId })
    const result = await sendOpenCodeGoAnthropicRequest(requestBody, apiKey, signal)

    if (!result.response.ok) {
      if (result.response.status === 400 && shouldAddCacheControl && isCacheControlError(result.errorData)) {
        console.warn(`Model ${model} does not support cache_control, remembering and retrying without it...`)
        rememberModelLacksCacheControl(model)
        const { requestBody: retryBody } = buildAnthropicRequestBody({ messages, maxTokens, model, enableContextCaching: false, reasoningEffort, sessionId })
        const retryResult = await sendOpenCodeGoAnthropicRequest(retryBody, apiKey, signal)
        if (!retryResult.response.ok) {
          throw new AIError(retryResult.errorData?.error?.code ?? retryResult.response.status, retryResult.errorData?.error?.message ?? retryResult.response.statusText ?? 'Unknown error')
        }

        return await parseAnthropicTextResponse(retryResult.response, includeReasoning)
      }

      if (result.response.status === 400 && isReasoningParameterError(result.errorData)) {
        console.warn(`Model ${model} rejected reasoning settings, remembering and retrying without reasoning...`)
        rememberModelLacksReasoning(model)
        const { requestBody: retryBody } = buildAnthropicRequestBody({ messages, maxTokens, model, enableContextCaching, sessionId })
        const retryResult = await sendOpenCodeGoAnthropicRequest(retryBody, apiKey, signal)
        if (!retryResult.response.ok) {
          throw new AIError(retryResult.errorData?.error?.code ?? retryResult.response.status, retryResult.errorData?.error?.message ?? retryResult.response.statusText ?? 'Unknown error')
        }

        return await parseAnthropicTextResponse(retryResult.response, includeReasoning)
      }

      throw new AIError(result.errorData?.error?.code ?? result.response.status, result.errorData?.error?.message ?? result.response.statusText ?? 'Unknown error')
    }

    return await parseAnthropicTextResponse(result.response, includeReasoning)
  }

  if (isOpenCodeGoResponsesModel(model)) {
    const requestBody = buildOpenCodeGoResponsesBody({
      messages,
      model,
      maxTokens,
      reasoningEffort,
      enableContextCaching,
      sessionId
    })
    const result = await sendOpenCodeGoResponsesRequest(requestBody, apiKey, signal, extraHeaders)

    if (!result.response.ok) {
      if (result.response.status === 400 && enableContextCaching && isPromptCacheFieldError(result.errorData)) {
        console.warn(`Model ${model} rejected prompt cache fields, retrying without them...`)
        rememberModelLacksCacheControl(model)
        const retryBody = buildOpenCodeGoResponsesBody({
          messages,
          model,
          maxTokens,
          reasoningEffort,
          enableContextCaching: false,
          sessionId
        })
        const retryResult = await sendOpenCodeGoResponsesRequest(retryBody, apiKey, signal, extraHeaders)
        if (!retryResult.response.ok) {
          throw new AIError(retryResult.errorData?.error?.code ?? retryResult.response.status, retryResult.errorData?.error?.message ?? retryResult.response.statusText ?? 'Unknown error')
        }

        return await parseResponsesTextResponse(retryResult.response, includeReasoning)
      }

      if (result.response.status === 400 && isReasoningParameterError(result.errorData)) {
        console.warn(`Model ${model} rejected reasoning settings, remembering and retrying without reasoning...`)
        rememberModelLacksReasoning(model)
        const retryBody = buildOpenCodeGoResponsesBody({
          messages,
          model,
          maxTokens,
          enableContextCaching,
          sessionId
        })
        const retryResult = await sendOpenCodeGoResponsesRequest(retryBody, apiKey, signal, extraHeaders)
        if (!retryResult.response.ok) {
          throw new AIError(retryResult.errorData?.error?.code ?? retryResult.response.status, retryResult.errorData?.error?.message ?? retryResult.response.statusText ?? 'Unknown error')
        }

        return await parseResponsesTextResponse(retryResult.response, includeReasoning)
      }

      throw new AIError(result.errorData?.error?.code ?? result.response.status, result.errorData?.error?.message ?? result.response.statusText ?? 'Unknown error')
    }

    return await parseResponsesTextResponse(result.response, includeReasoning)
  }

  const requestBody = withOpenCodeGoCompletionsCache(
    buildOpenAiCompatibleRequestBody({
      messages,
      maxTokens,
      model,
      reasoningEffort
    }),
    { enableContextCaching, model, sessionId }
  )

  const result = await sendOpenCodeGoRequest(requestBody, apiKey, signal, extraHeaders)

  if (!result.response.ok) {
    if (result.response.status === 400 && enableContextCaching && isCacheControlError(result.errorData)) {
      console.warn(`Model ${model} does not support cache_control, remembering and retrying without it...`)
      rememberModelLacksCacheControl(model)
      const retryRequestBody = withOpenCodeGoCompletionsCache(
        buildOpenAiCompatibleRequestBody({
          messages,
          maxTokens,
          model,
          reasoningEffort
        }),
        { enableContextCaching: true, model, sessionId }
      )
      const retryResult = await sendOpenCodeGoRequest(retryRequestBody, apiKey, signal, extraHeaders)
      if (!retryResult.response.ok) {
        throw new AIError(retryResult.errorData?.error?.code ?? retryResult.response.status, retryResult.errorData?.error?.message ?? retryResult.response.statusText ?? 'Unknown error')
      }

      return await parseOpenAiCompatibleTextResponse(retryResult.response, includeReasoning)
    }

    if (result.response.status === 400 && enableContextCaching && isPromptCacheFieldError(result.errorData)) {
      console.warn(`Model ${model} rejected prompt cache fields, retrying without them...`)
      const retryRequestBody = buildOpenAiCompatibleRequestBody({
        messages,
        maxTokens,
        model,
        reasoningEffort
      })
      const retryResult = await sendOpenCodeGoRequest(retryRequestBody, apiKey, signal, extraHeaders)
      if (!retryResult.response.ok) {
        throw new AIError(retryResult.errorData?.error?.code ?? retryResult.response.status, retryResult.errorData?.error?.message ?? retryResult.response.statusText ?? 'Unknown error')
      }

      return await parseOpenAiCompatibleTextResponse(retryResult.response, includeReasoning)
    }

    if (result.response.status === 400 && isReasoningParameterError(result.errorData)) {
      console.warn(`Model ${model} rejected reasoning settings, remembering and retrying without reasoning...`)
      rememberModelLacksReasoning(model)
      const retryRequestBody = withOpenCodeGoCompletionsCache(
        buildOpenAiCompatibleRequestBody({
          messages,
          maxTokens,
          model
        }),
        { enableContextCaching, model, sessionId }
      )
      const retryResult = await sendOpenCodeGoRequest(retryRequestBody, apiKey, signal, extraHeaders)

      if (!retryResult.response.ok) {
        throw new AIError(retryResult.errorData?.error?.code ?? retryResult.response.status, retryResult.errorData?.error?.message ?? retryResult.response.statusText ?? 'Unknown error')
      }

      return await parseOpenAiCompatibleTextResponse(retryResult.response, includeReasoning)
    }

    throw new AIError(result.errorData?.error?.code ?? result.response.status, result.errorData?.error?.message ?? result.response.statusText ?? 'Unknown error')
  }

  return await parseOpenAiCompatibleTextResponse(result.response, includeReasoning)
}

// --- Model fetching ---

export const fetchOpenRouterModels = async () => {
  try {
    const response = await fetch('https://openrouter.ai/api/v1/models')
    const data = await response.json()
    const models = data.data

    return models
      .map((m: any) => {
        const isFree = m.pricing.prompt === '0' && m.pricing.completion === '0'

        return {
          label: (isFree ? '[FREE] ' : '') + m.name,
          value: m.id,
          isFree: isFree,
          style: isFree ? { color: '#18a058', fontWeight: 'bold' } : {}
        }
      })
      .sort((a: any, b: any) => {
        if (a.isFree && !b.isFree) return -1
        if (!a.isFree && b.isFree) return 1

        return a.label.localeCompare(b.label)
      })
  } catch (error) {
    console.error('Failed to fetch OpenRouter models:', error)
    return []
  }
}

export const fetchPollinationsModels = async (apiKey?: string) => {
  const trimmedApiKey = apiKey?.trim()

  if (!trimmedApiKey) {
    return []
  }

  let models: any[] = []

  try {
    const response = await fetch('https://gen.pollinations.ai/text/models', {
      headers: {
        Authorization: `Bearer ${trimmedApiKey}`
      }
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new AIError(errorData?.error?.code ?? response.status, errorData?.error?.message ?? response.statusText ?? 'Unknown error')
    }

    const data = await response.json()
    models = data

    // Handle both old format (array of strings) and new format (array of objects)
    if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'string') {
      models = data.map((name) => ({ name }))
    }

    return models
      .filter((m: any) => {
        const hiddenModels = ['qwen-coder', 'chickytutor', 'midijourney', 'openai-audio']
        return !hiddenModels.includes(m.name)
      })
      .map((m: any) => ({
        label: m.name,
        value: m.name
      }))
      .sort((a: any, b: any) => a.label.localeCompare(b.label))
  } catch (error) {
    console.error('Failed to fetch Pollinations models:', error)
    return []
  }
}

export const fetchOpenCodeGoModels = async (apiKey?: string) => {
  try {
    const headers: Record<string, string> = {}
    if (apiKey?.trim()) {
      headers['Authorization'] = `Bearer ${apiKey.trim()}`
    }

    const response = await fetch(OPENCODE_GO_MODELS_URL, { headers })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new AIError(errorData?.error?.code ?? response.status, errorData?.error?.message ?? response.statusText ?? 'Unknown error')
    }

    const data = await response.json()
    const models = Array.isArray(data?.data) ? data.data : []

    return models
      .filter((m: any) => typeof m?.id === 'string' && !OPENCODE_GO_EXCLUDED_MODEL_IDS.has(m.id))
      .map((m: any) => ({
        label: m.id,
        value: m.id
      }))
      .sort((a: any, b: any) => a.label.localeCompare(b.label))
  } catch (error) {
    console.error('Failed to fetch OpenCode Go models:', error)
    return []
  }
}

// --- Provider-specific summarization ---

export const callOpenRouterSummarization = async (messages: any[], apiKey: string, model: string, signal?: AbortSignal) => {
  const requestBody: any = {
    model: model,
    messages: messages,
    max_tokens: 16384
  }

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'HTTP-Referer': window.location.href,
      'X-Title': 'Nikke DB Story Gen',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestBody),
    signal
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    console.error('OpenRouter Summarization Error Details:', errorData)

    if (response.status === 400 && errorData?.error?.message?.includes('max_tokens')) {
      console.warn(`Model ${model} doesn't support 16384 max_tokens, falling back to 8192...`)
      requestBody.max_tokens = 8192
      const retryResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'HTTP-Referer': window.location.href,
          'X-Title': 'Nikke DB Story Gen',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody),
        signal
      })

      if (!retryResponse.ok) {
        const retryErrorData = await retryResponse.json().catch(() => ({}))
        throw new AIError(retryErrorData?.error?.code ?? retryResponse.status, retryErrorData?.error?.message ?? retryResponse.statusText ?? 'Unknown error')
      }
      const retryData = await retryResponse.json()
      return retryData.choices[0].message.content
    }

    if (response.status === 429 && errorData?.error?.message?.includes('Free-models-per-day')) {
      throw new Error('FREE_MODEL_RATE_LIMITED')
    }

    if (response.status === 404 && errorData?.error?.message?.includes('No endpoints available matching your guardrail restrictions')) {
      throw new Error('GUARDRAIL_RESTRICTION')
    }

    throw new AIError(errorData?.error?.code ?? response.status, errorData?.error?.message ?? response.statusText ?? 'Unknown error')
  }
  const data = await response.json()

  return data.choices[0].message.content
}

export const callLocalSummarization = async (messages: any[], opts: { model?: string; maxTokens?: number; apiKey?: string; localUrl: string; reasoningEffort?: string; signal?: AbortSignal }) => {
  const { model, maxTokens = 16384, apiKey, localUrl, reasoningEffort, signal } = opts

  let endpoint = localUrl.replace(/\/$/, '')
  if (!endpoint.endsWith('/chat/completions')) {
    endpoint = `${endpoint}/chat/completions`
  }

  const requestBody = buildOpenAiCompatibleRequestBody({
    messages,
    maxTokens,
    model,
    reasoningEffort
  })

  const response = await sendOpenAiCompatibleRequest(endpoint, {
    requestBody,
    apiKey,
    signal
  })

  return await parseOpenAiCompatibleTextResponse(response)
}

// --- Provider-specific main call functions ---

export const callLocal = async (
  messages: any[],
  opts: {
    model?: string
    maxTokens?: number
    apiKey?: string
    localUrl: string
    modeIsGame: boolean
    reasoningEffort?: string
    includeAnimReason?: boolean
    includeReasoning?: boolean
    signal?: AbortSignal
  }
) => {
  const { model, maxTokens = 16384, apiKey, localUrl, modeIsGame, reasoningEffort, includeAnimReason = false, includeReasoning = false, signal } = opts

  let endpoint = localUrl.replace(/\/$/, '')
  if (!endpoint.endsWith('/chat/completions')) {
    endpoint = `${endpoint}/chat/completions`
  }

  const callWithoutJsonFormat = async () => {
    const requestBody = buildOpenAiCompatibleRequestBody({
      messages,
      maxTokens,
      model,
      reasoningEffort
    })

    const response = await sendOpenAiCompatibleRequest(endpoint, {
      requestBody,
      apiKey,
      signal
    })

    return await parseOpenAiCompatibleTextResponse(response, includeReasoning)
  }

  if (model && modelsWithoutJsonSupport.value.has(model)) {
    logDebug(`Model ${model} known to not support json_schema, using text fallback...`)
    return callWithoutJsonFormat()
  }

  const requestBody = buildOpenAiCompatibleRequestBody({
    messages,
    maxTokens,
    model,
    modeIsGame,
    reasoningEffort,
    includeJsonSchema: true,
    includeAnimReason
  })

  const response = await sendOpenAiCompatibleRequest(endpoint, {
    requestBody,
    apiKey,
    signal
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    console.error('Local API Error Details:', errorData)

    if (response.status === 400 && (JSON.stringify(errorData).includes('response_format') || JSON.stringify(errorData).includes('json_schema') || JSON.stringify(errorData).includes('schema'))) {
      console.warn(`Model ${model || 'local'} does not support json_schema response format, remembering and retrying without it...`)
      if (model) {
        modelsWithoutJsonSupport.value.add(model)
        sessionStorage.setItem('modelsWithoutJsonSupport', JSON.stringify([...modelsWithoutJsonSupport.value]))
      }
      return callWithoutJsonFormat()
    }

    throw new AIError(errorData?.error?.code ?? response.status, errorData?.error?.message ?? response.statusText ?? 'Unknown error')
  }

  const data = await response.json()

  return takeOpenAiMessageContent(data, includeReasoning)
}

export const callOpenCodeGoSummarization = async (messages: any[], opts: { model: string; apiKey: string; maxTokens?: number; reasoningEffort?: string; enableContextCaching?: boolean; sessionId?: string; signal?: AbortSignal }) => {
  const { model, apiKey, maxTokens = 16384, reasoningEffort, enableContextCaching, sessionId, signal } = opts

  return await callOpenCodeGoTextRequest({
    messages,
    model,
    apiKey,
    maxTokens,
    reasoningEffort,
    enableContextCaching,
    sessionId,
    signal
  })
}

export const callOpenCodeGo = async (
  messages: any[],
  opts: {
    model: string
    apiKey: string
    modeIsGame: boolean
    maxTokens?: number
    reasoningEffort?: string
    enableContextCaching?: boolean
    includeAnimReason?: boolean
    includeReasoning?: boolean
    sessionId?: string
    signal?: AbortSignal
  }
) => {
  const { model, apiKey, modeIsGame, maxTokens = 16384, signal, enableContextCaching = false, includeAnimReason = false, includeReasoning = false, sessionId } = opts
  let { reasoningEffort } = opts
  const extraHeaders = openCodeGoExtraHeaders(model, sessionId)

  if (reasoningEffort && reasoningEffort !== 'default' && modelsWithoutReasoningSupport.value.has(model)) {
    reasoningEffort = undefined
  }

  const callWithoutJsonFormat = async () => {
    return await callOpenCodeGoTextRequest({
      messages,
      model,
      apiKey,
      maxTokens,
      reasoningEffort,
      enableContextCaching,
      includeReasoning,
      sessionId,
      signal
    })
  }

  if (isOpenCodeGoAnthropicModel(model)) {
    return callWithoutJsonFormat()
  }

  if (modelsWithoutJsonSupport.value.has(model)) {
    logDebug(`Model ${model} known to not support json_schema, using text fallback...`)
    return callWithoutJsonFormat()
  }

  if (isOpenCodeGoResponsesModel(model)) {
    const requestBody = buildOpenCodeGoResponsesBody({
      messages,
      model,
      maxTokens,
      reasoningEffort,
      enableContextCaching,
      sessionId,
      includeJsonSchema: true,
      modeIsGame,
      includeAnimReason
    })
    const result = await sendOpenCodeGoResponsesRequest(requestBody, apiKey, signal, extraHeaders)

    if (!result.response.ok) {
      if (result.response.status === 400 && isJsonSchemaParameterError(result.errorData)) {
        console.warn(`Model ${model} does not support json_schema response format, remembering and retrying without it...`)
        modelsWithoutJsonSupport.value.add(model)
        sessionStorage.setItem('modelsWithoutJsonSupport', JSON.stringify([...modelsWithoutJsonSupport.value]))

        return callWithoutJsonFormat()
      }

      if (result.response.status === 400 && enableContextCaching && isPromptCacheFieldError(result.errorData)) {
        console.warn(`Model ${model} rejected prompt cache fields, retrying without them...`)
        rememberModelLacksCacheControl(model)
        const retryBody = buildOpenCodeGoResponsesBody({
          messages,
          model,
          maxTokens,
          reasoningEffort,
          enableContextCaching: false,
          sessionId,
          includeJsonSchema: true,
          modeIsGame,
          includeAnimReason
        })
        const retryResult = await sendOpenCodeGoResponsesRequest(retryBody, apiKey, signal, extraHeaders)
        if (!retryResult.response.ok) {
          if (retryResult.response.status === 400 && isJsonSchemaParameterError(retryResult.errorData)) {
            modelsWithoutJsonSupport.value.add(model)
            sessionStorage.setItem('modelsWithoutJsonSupport', JSON.stringify([...modelsWithoutJsonSupport.value]))

            return callWithoutJsonFormat()
          }
          throw new AIError(retryResult.errorData?.error?.code ?? retryResult.response.status, retryResult.errorData?.error?.message ?? retryResult.response.statusText ?? 'Unknown error')
        }

        return await parseResponsesTextResponse(retryResult.response, includeReasoning)
      }

      if (result.response.status === 400 && isReasoningParameterError(result.errorData)) {
        console.warn(`Model ${model} rejected reasoning settings, remembering and retrying without reasoning...`)
        rememberModelLacksReasoning(model)
        const retryBody = buildOpenCodeGoResponsesBody({
          messages,
          model,
          maxTokens,
          enableContextCaching,
          sessionId,
          includeJsonSchema: true,
          modeIsGame,
          includeAnimReason
        })
        const retryResult = await sendOpenCodeGoResponsesRequest(retryBody, apiKey, signal, extraHeaders)
        if (!retryResult.response.ok) {
          if (retryResult.response.status === 400 && isJsonSchemaParameterError(retryResult.errorData)) {
            modelsWithoutJsonSupport.value.add(model)
            sessionStorage.setItem('modelsWithoutJsonSupport', JSON.stringify([...modelsWithoutJsonSupport.value]))

            return callWithoutJsonFormat()
          }
          throw new AIError(retryResult.errorData?.error?.code ?? retryResult.response.status, retryResult.errorData?.error?.message ?? retryResult.response.statusText ?? 'Unknown error')
        }

        return await parseResponsesTextResponse(retryResult.response, includeReasoning)
      }

      throw new AIError(result.errorData?.error?.code ?? result.response.status, result.errorData?.error?.message ?? result.response.statusText ?? 'Unknown error')
    }

    return await parseResponsesTextResponse(result.response, includeReasoning)
  }

  const requestBody = withOpenCodeGoCompletionsCache(
    buildOpenAiCompatibleRequestBody({
      messages,
      maxTokens,
      model,
      modeIsGame,
      reasoningEffort,
      includeJsonSchema: true,
      includeAnimReason
    }),
    { enableContextCaching, model, sessionId }
  )

  const result = await sendOpenCodeGoRequest(requestBody, apiKey, signal, extraHeaders)

  if (!result.response.ok) {
    if (result.response.status === 400 && isJsonSchemaParameterError(result.errorData)) {
      console.warn(`Model ${model} does not support json_schema response format, remembering and retrying without it...`)
      modelsWithoutJsonSupport.value.add(model)
      sessionStorage.setItem('modelsWithoutJsonSupport', JSON.stringify([...modelsWithoutJsonSupport.value]))

      return callWithoutJsonFormat()
    }

    if (result.response.status === 400 && enableContextCaching && isCacheControlError(result.errorData)) {
      console.warn(`Model ${model} does not support cache_control, remembering and retrying without it...`)
      rememberModelLacksCacheControl(model)
      const retryRequestBody = withOpenCodeGoCompletionsCache(
        buildOpenAiCompatibleRequestBody({
          messages,
          maxTokens,
          model,
          modeIsGame,
          reasoningEffort,
          includeJsonSchema: true,
          includeAnimReason
        }),
        { enableContextCaching: true, model, sessionId }
      )
      const retryResult = await sendOpenCodeGoRequest(retryRequestBody, apiKey, signal, extraHeaders)
      if (!retryResult.response.ok) {
        if (retryResult.response.status === 400 && isJsonSchemaParameterError(retryResult.errorData)) {
          modelsWithoutJsonSupport.value.add(model)
          sessionStorage.setItem('modelsWithoutJsonSupport', JSON.stringify([...modelsWithoutJsonSupport.value]))

          return callWithoutJsonFormat()
        }
        throw new AIError(retryResult.errorData?.error?.code ?? retryResult.response.status, retryResult.errorData?.error?.message ?? retryResult.response.statusText ?? 'Unknown error')
      }

      const retryData = await retryResult.response.json()

      return takeOpenAiMessageContent(retryData, includeReasoning)
    }

    if (result.response.status === 400 && isReasoningParameterError(result.errorData)) {
      console.warn(`Model ${model} rejected reasoning settings, remembering and retrying without reasoning...`)
      rememberModelLacksReasoning(model)
      const retryRequestBody = withOpenCodeGoCompletionsCache(
        buildOpenAiCompatibleRequestBody({
          messages,
          maxTokens,
          model,
          modeIsGame,
          includeJsonSchema: true,
          includeAnimReason
        }),
        { enableContextCaching, model, sessionId }
      )
      const retryResult = await sendOpenCodeGoRequest(retryRequestBody, apiKey, signal, extraHeaders)

      if (!retryResult.response.ok) {
        if (retryResult.response.status === 400 && isJsonSchemaParameterError(retryResult.errorData)) {
          console.warn(`Model ${model} does not support json_schema response format after retrying without reasoning, remembering and retrying without it...`)
          modelsWithoutJsonSupport.value.add(model)
          sessionStorage.setItem('modelsWithoutJsonSupport', JSON.stringify([...modelsWithoutJsonSupport.value]))

          return callWithoutJsonFormat()
        }

        throw new AIError(retryResult.errorData?.error?.code ?? retryResult.response.status, retryResult.errorData?.error?.message ?? retryResult.response.statusText ?? 'Unknown error')
      }

      const retryData = await retryResult.response.json()

      return takeOpenAiMessageContent(retryData, includeReasoning)
    }

    throw new AIError(result.errorData?.error?.code ?? result.response.status, result.errorData?.error?.message ?? result.response.statusText ?? 'Unknown error')
  }

  const data = await result.response.json()

  return takeOpenAiMessageContent(data, includeReasoning)
}

export const callOpenRouter = async (
  messages: any[],
  opts: {
    model: string
    apiKey: string
    enableContextCaching: boolean
    allowWebSearchFallback: boolean
    modeIsGame: boolean
    enableWebSearch?: boolean
    searchUrl?: string
    prompts: any
    reasoningEffort?: string
    includeAnimReason?: boolean
    includeReasoning?: boolean
    sessionId?: string
    signal?: AbortSignal
  }
) => {
  const { model, apiKey, enableContextCaching, allowWebSearchFallback, modeIsGame, enableWebSearch = false, prompts, reasoningEffort, includeAnimReason = false, includeReasoning = false, sessionId, signal } = opts

  let processedMessages = messages

  if (enableContextCaching && modelUsesExplicitCacheControl(model)) {
    processedMessages = applyExplicitCacheControl(messages)
  }

  const jsonEnforcement = includeAnimReason && prompts.systemPrompt?.debugAnimReasonInstruction
    ? `${prompts.reminders.jsonEnforcement}\n${prompts.systemPrompt.debugAnimReasonInstruction}`
    : prompts.reminders.jsonEnforcement
  const messagesWithEnforcement = [...processedMessages, { role: 'user', content: jsonEnforcement }]

  const openRouterHeaders: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    'HTTP-Referer': window.location.href,
    'X-Title': 'Nikke DB Story Gen',
    'Content-Type': 'application/json'
  }
  if (sessionId) {
    openRouterHeaders['x-session-id'] = sessionId
    attachGrokCacheAffinityHeaders(openRouterHeaders, model, sessionId)
  }

  const attachSession = (body: any) => {
    if (sessionId) body.session_id = sessionId

    return body
  }

  const buildWebPlugin = () => {
    if (!enableWebSearch) return undefined
    if (!allowWebSearchFallback) return undefined
    return [{ id: 'web', max_results: 10 }]
  }

  const callWithoutJsonFormat = async () => {
    const requestBody: any = {
      model: model,
      messages: messagesWithEnforcement,
      max_tokens: 16384
    }

    if (reasoningEffort && reasoningEffort !== 'default') {
      requestBody.reasoning = {
        effort: reasoningEffort,
        exclude: !includeReasoning
      }
    }

    const webPlugin = buildWebPlugin()
    if (webPlugin) {
      requestBody.plugins = webPlugin
    }

    attachSession(requestBody)
    logLlmExchange('OpenRouter', requestBody)

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: openRouterHeaders,
      body: JSON.stringify(requestBody),
      signal
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      console.error('OpenRouter API Error Details:', errorData)

      if (response.status === 429 && errorData?.error?.message?.includes('is temporarily rate-limited upstream')) {
        throw new Error('RATE_LIMITED')
      }

      if (response.status === 429 && errorData?.error?.message?.includes('Free-models-per-day')) {
        throw new Error('FREE_MODEL_RATE_LIMITED')
      }

      if (response.status === 404 && errorData?.error?.message?.includes('No endpoints available matching your guardrail restrictions')) {
        throw new Error('GUARDRAIL_RESTRICTION')
      }

      throw new AIError(errorData?.error?.code ?? response.status, errorData?.error?.message ?? response.statusText ?? 'Unknown error')
    }

    const data = await response.json()

    return takeOpenAiMessageContent(data, includeReasoning)
  }

  if (modelsWithoutJsonSupport.value.has(model)) {
    logDebug(`Model ${model} known to not support json_object, skipping to fallback...`)
    return callWithoutJsonFormat()
  }

  const responseSchema = buildStoryResponseSchema(modeIsGame, includeAnimReason)

  const requestBody: any = {
    model: model,
    messages: processedMessages,
    max_tokens: 16384,
    response_format: responseSchema,
    provider: { require_parameters: true }
  }

  if (reasoningEffort && reasoningEffort !== 'default') {
    requestBody.reasoning = {
      effort: reasoningEffort,
      exclude: !includeReasoning
    }
  }

  let plugins: any[] = []
  const webPlugin = buildWebPlugin()
  if (webPlugin) plugins = [...webPlugin]
  plugins.push({ id: 'response-healing' })

  if (plugins.length > 0) requestBody.plugins = plugins

  attachSession(requestBody)
  logLlmExchange('OpenRouter', requestBody)

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: openRouterHeaders,
    body: JSON.stringify(requestBody),
    signal
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    console.error('OpenRouter API Error Details:', errorData)

    if (response.status === 429 && errorData?.error?.message?.includes('is temporarily rate-limited upstream')) {
      throw new Error('RATE_LIMITED')
    }

    if (response.status === 429 && errorData?.error?.message?.includes('Free-models-per-day')) {
      throw new Error('FREE_MODEL_RATE_LIMITED')
    }

    if (response.status === 404 && errorData?.error?.message?.includes('No endpoints available matching your guardrail restrictions')) {
      throw new Error('GUARDRAIL_RESTRICTION')
    }

    if (response.status === 404 && errorData?.error?.message?.includes('No endpoints found that can handle the requested parameters.')) {
      console.warn(`Model ${model} does not support json_object response format, remembering and retrying without it...`)
      modelsWithoutJsonSupport.value.add(model)
      sessionStorage.setItem('modelsWithoutJsonSupport', JSON.stringify([...modelsWithoutJsonSupport.value]))
      return callWithoutJsonFormat()
    }

    throw new AIError(errorData?.error?.code ?? response.status, errorData?.error?.message ?? response.statusText ?? 'Unknown error')
  }

  const data = await response.json()

  return takeOpenAiMessageContent(data, includeReasoning)
}

// --- Summarization orchestration ---

export const summarizeChunk = async (
  messages: { role: string; content: string }[],
  opts: {
    apiProvider: string
    apiKey: string
    model: string
    localUrl: string
    prompts: any
    enableContextCaching?: boolean
    reasoningEffort?: string
    signal?: AbortSignal
    existingSummary?: string
    sessionId?: string
  }
) => {
  if (messages.length === 0) return ''

  const textToSummarize = messages.map((m) => `${m.role}: ${m.content}`).join('\n\n')

  const systemMsg = { role: 'system', content: opts.prompts.summarizeChunk.system }

  let userContent: string
  if (opts.existingSummary && opts.existingSummary.trim().length > 0) {
    userContent = opts.prompts.summarizeChunk.userContinuation.replace('${existingSummary}', opts.existingSummary).replace('${textToSummarize}', textToSummarize)
  } else {
    userContent = opts.prompts.summarizeChunk.user.replace('${textToSummarize}', textToSummarize)
  }

  const userMsg = { role: 'user', content: userContent }
  const msgs = [systemMsg, userMsg]

  let summary = ''

  if (opts.apiProvider === 'gemini') {
    summary = await callGeminiSummarization(msgs, opts.apiKey, opts.model, opts.signal)
  } else if (opts.apiProvider === 'opencode-go') {
    summary = await callOpenCodeGoSummarization(msgs, { model: opts.model, apiKey: opts.apiKey, reasoningEffort: opts.reasoningEffort, enableContextCaching: opts.enableContextCaching, sessionId: opts.sessionId, signal: opts.signal })
  } else if (opts.apiProvider === 'openrouter') {
    summary = await callOpenRouterSummarization(msgs, opts.apiKey, opts.model, opts.signal)
  } else if (opts.apiProvider === 'pollinations') {
    summary = await callPollinationsSummarization(msgs, opts.apiKey, opts.model, opts.enableContextCaching, opts.signal)
  } else if (opts.apiProvider === 'local') {
    summary = await callLocalSummarization(msgs, { apiKey: opts.apiKey, localUrl: opts.localUrl, signal: opts.signal, reasoningEffort: opts.reasoningEffort })
  }

  if (summary && summary.trim().length > 0) {
    return summary
  }

  throw new Error('Summarization returned empty output.')
}

export const compactSummary = async (
  fullSummary: string,
  opts: {
    apiProvider: string
    apiKey: string
    model: string
    localUrl: string
    prompts: any
    enableContextCaching?: boolean
    reasoningEffort?: string
    sessionId?: string
    signal?: AbortSignal
  }
) => {
  if (!fullSummary || fullSummary.trim().length === 0) return ''

  const systemMsg = { role: 'system', content: opts.prompts.compactSummary.system }
  const userContent = opts.prompts.compactSummary.user.replace('${fullSummary}', fullSummary)
  const userMsg = { role: 'user', content: userContent }
  const msgs = [systemMsg, userMsg]

  let summary = ''

  if (opts.apiProvider === 'gemini') {
    summary = await callGeminiSummarization(msgs, opts.apiKey, opts.model, opts.signal)
  } else if (opts.apiProvider === 'opencode-go') {
    summary = await callOpenCodeGoSummarization(msgs, { model: opts.model, apiKey: opts.apiKey, reasoningEffort: opts.reasoningEffort, enableContextCaching: opts.enableContextCaching, sessionId: opts.sessionId, signal: opts.signal })
  } else if (opts.apiProvider === 'openrouter') {
    summary = await callOpenRouterSummarization(msgs, opts.apiKey, opts.model, opts.signal)
  } else if (opts.apiProvider === 'pollinations') {
    summary = await callPollinationsSummarization(msgs, opts.apiKey, opts.model, opts.enableContextCaching, opts.signal)
  } else if (opts.apiProvider === 'local') {
    summary = await callLocalSummarization(msgs, { apiKey: opts.apiKey, localUrl: opts.localUrl, signal: opts.signal, reasoningEffort: opts.reasoningEffort })
  }

  if (summary && summary.trim().length > 0) {
    return summary
  }

  throw new Error('Summary compaction returned empty output.')
}
