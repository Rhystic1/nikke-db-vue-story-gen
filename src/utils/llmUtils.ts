import { AIError, logDebug } from '@/utils/chatUtils'
import { extractGeminiText } from '@/utils/geminiUtils'
import { modelsWithoutJsonSupport, modelsWithoutReasoningSupport, OPENCODE_GO_CHAT_COMPLETIONS_URL, OPENCODE_GO_MESSAGES_URL, OPENCODE_GO_MODELS_URL, OPENCODE_GO_EXCLUDED_MODEL_IDS, OPENCODE_GO_ANTHROPIC_MODELS, OPENCODE_GO_GOOGLE_MODELS, openCodeGoGoogleGenerateContentUrl, modelsWithoutCacheControlSupport, buildStoryResponseSchema, buildOpenCodeGoHeaders, normalizeOpenRouterSpeed, type OpenRouterSpeed } from '@/utils/providerConfigUtils'
import { captureModelReasoning, extractAnthropicTextAndReasoning, takeOpenAiMessageContent } from '@/utils/aiReasoningUtils'

export { modelsWithoutJsonSupport, modelsRequiringStreamForHighTokens, modelsWithoutCacheControlSupport, modelsWithoutReasoningSupport, tokenUsageOptions, openRouterSpeedOptions, normalizeOpenRouterSpeed, buildStoryResponseSchema, rotateOpenCodeGoSessionId, type OpenRouterSpeed } from '@/utils/providerConfigUtils'
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

// GLM-5.3 and GLM-5.3-Flash accept reasoning_effort (low | high | max), not an OpenRouter reasoning object.
// Neither model can disable thinking. The None dropdown value is sent as low.
// https://docs.z.ai/guides/llm/glm-5.3
// https://docs.z.ai/guides/capabilities/thinking
const OPENCODE_GO_GLM_5_3_MODELS = new Set(['glm-5.3', 'glm-5.3-flash'])

const toGlm53ReasoningEffort = (effort: string) => {
  switch (effort) {
    case 'none':
    case 'minimal':
    case 'low':
      return 'low'
    case 'medium':
    case 'high':
      return 'high'
    case 'xhigh':
    case 'max':
      return 'max'
    default:
      return effort
  }
}

export const buildOpenCodeGoChatRequestBody = (opts: {
  messages: any[]
  maxTokens: number
  model?: string
  modeIsGame?: boolean
  reasoningEffort?: string
  includeJsonSchema?: boolean
  reasoningExclude?: boolean
  includeAnimReason?: boolean
}) => {
  const requestBody = buildOpenAiCompatibleRequestBody(opts)

  if (!opts.model || !OPENCODE_GO_GLM_5_3_MODELS.has(opts.model) || !requestBody.reasoning) {
    return requestBody
  }

  const effort = requestBody.reasoning.effort
  delete requestBody.reasoning
  if (typeof effort === 'string' && effort && effort !== 'default') {
    requestBody.reasoning_effort = toGlm53ReasoningEffort(effort)
  }

  return requestBody
}

const ZAI_GLM_5_3_MODELS = new Set(['glm-5.3', 'glm-5.3-flash', 'glm-5.3-flashx'])

export const buildZaiChatRequestBody = (opts: {
  messages: any[]
  maxTokens: number
  model?: string
  modeIsGame?: boolean
  reasoningEffort?: string
  includeJsonSchema?: boolean
  reasoningExclude?: boolean
  includeAnimReason?: boolean
}) => {
  const requestBody = buildOpenAiCompatibleRequestBody({
    ...opts,
    reasoningEffort: undefined
  })

  const effort = opts.reasoningEffort
  if (!effort || effort === 'default') {

    return requestBody
  }

  if (opts.model && ZAI_GLM_5_3_MODELS.has(opts.model)) {
    requestBody.reasoning_effort = toGlm53ReasoningEffort(effort)

    return requestBody
  }

  if (effort === 'none') {
    requestBody.thinking = { type: 'disabled' }

    return requestBody
  }

  requestBody.thinking = { type: 'enabled' }
  requestBody.reasoning_effort = effort

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

const sendOpenAiCompatibleRequest = async (url: string, opts: { requestBody: any; apiKey?: string; signal?: AbortSignal }) => {
  return await fetch(url, {
    method: 'POST',
    headers: getOpenAiCompatibleHeaders(opts.apiKey),
    body: JSON.stringify(opts.requestBody),
    signal: opts.signal
  })
}

const isOpenCodeGoAnthropicModel = (model: string) => OPENCODE_GO_ANTHROPIC_MODELS.has(model)
const isOpenRouterGeminiModel = (model: string) => model.startsWith('google/gemini')
const isOpenCodeGoGoogleModel = (model: string) => OPENCODE_GO_GOOGLE_MODELS.has(model)

const convertOpenAiToAnthropicMessages = (messages: any[], enableContextCaching: boolean, model: string) => {
  const shouldAddCacheControl = enableContextCaching && !modelsWithoutCacheControlSupport.value.has(model)

  const systemParts: string[] = []
  let fallbackSystem: any
  const anthropicMessages: any[] = []

  for (const msg of messages) {
    if (msg.role === 'system') {
      if (typeof msg.content === 'string') systemParts.push(msg.content)
      else fallbackSystem = msg.content
      continue
    }
    anthropicMessages.push({
      role: msg.role,
      content: typeof msg.content === 'string' ? msg.content : msg.content
    })
  }

  const systemContent = systemParts.length > 0 ? systemParts.join('\n\n') : fallbackSystem

  if (shouldAddCacheControl && systemContent) {
    const systemBlock = [{ type: 'text', text: systemContent, cache_control: { type: 'ephemeral' } }]
    const markerIdx = anthropicMessages.length - 2
    if (markerIdx >= 0 && typeof anthropicMessages[markerIdx].content === 'string') {
      const markerMsg = anthropicMessages[markerIdx]
      anthropicMessages[markerIdx] = {
        ...markerMsg,
        content: [{ type: 'text', text: markerMsg.content, cache_control: { type: 'ephemeral' } }]
      }
    }

    return { system: systemBlock, messages: anthropicMessages, shouldAddCacheControl }
  }

  return { system: systemContent, messages: anthropicMessages, shouldAddCacheControl }
}

const buildAnthropicRequestBody = (opts: {
  messages: any[]
  maxTokens: number
  model: string
  enableContextCaching: boolean
  reasoningEffort?: string
}) => {
  const { messages, maxTokens, model, enableContextCaching, reasoningEffort } = opts
  const { system, messages: anthropicMessages, shouldAddCacheControl } = convertOpenAiToAnthropicMessages(messages, enableContextCaching, model)

  const requestBody: any = {
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

  return { requestBody, shouldAddCacheControl }
}

const parseAnthropicTextResponse = async (response: Response, includeReasoning = false) => {
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    throw new AIError(errorData?.error?.code ?? response.status, errorData?.error?.message ?? response.statusText ?? 'Unknown error')
  }

  const data = await response.json()
  const { content, reasoning } = extractAnthropicTextAndReasoning(data)
  if (includeReasoning) {
    captureModelReasoning(reasoning)
  }
  if (content) {
    return content
  }
  throw new AIError('PARSE_ERROR', 'Unexpected Anthropic response format')
}

const sendOpenCodeGoRequest = async (requestBody: any, apiKey: string, signal?: AbortSignal) => {
  const response = await fetch(OPENCODE_GO_CHAT_COMPLETIONS_URL, {
    method: 'POST',
    headers: buildOpenCodeGoHeaders(getOpenAiCompatibleHeaders(apiKey)),
    body: JSON.stringify(requestBody),
    signal
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

const sendOpenCodeGoAnthropicRequest = async (requestBody: any, apiKey: string, signal?: AbortSignal) => {
  const response = await fetch(OPENCODE_GO_MESSAGES_URL, {
    method: 'POST',
    headers: buildOpenCodeGoHeaders({
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    }),
    body: JSON.stringify(requestBody),
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

const toGemini4ThinkingLevel = (effort?: string) => {
  switch (effort) {
    case 'minimal':
    case 'low':
      return 'LOW'
    case 'medium':
      return 'MEDIUM'
    case 'high':
    case 'xhigh':
      return 'HIGH'
    default:
      return undefined
  }
}

const buildOpenCodeGoGoogleRequestBody = (opts: { messages: any[]; maxTokens: number; reasoningEffort?: string; includeReasoning?: boolean; jsonMime?: boolean }) => {
  const systemTexts: string[] = []
  const contents: any[] = []

  for (const message of opts.messages) {
    if (message?.role === 'system') {
      if (typeof message.content === 'string' && message.content) {
        systemTexts.push(message.content)
      }
      continue
    }

    const text = typeof message?.content === 'string' ? message.content : ''
    contents.push({
      role: message?.role === 'assistant' ? 'model' : 'user',
      parts: [{ text }]
    })
  }

  const generationConfig: any = {
    maxOutputTokens: opts.maxTokens
  }

  if (opts.jsonMime) {
    generationConfig.responseMimeType = 'application/json'
  }

  const thinkingLevel = toGemini4ThinkingLevel(opts.reasoningEffort)
  if (thinkingLevel) {
    generationConfig.thinkingConfig = {
      thinkingLevel
    }
    if (opts.includeReasoning) {
      generationConfig.thinkingConfig.includeThoughts = true
    }
  } else if (opts.includeReasoning) {
    generationConfig.thinkingConfig = {
      includeThoughts: true
    }
  }

  const requestBody: any = {
    contents,
    generationConfig
  }

  if (systemTexts.length > 0) {
    requestBody.systemInstruction = {
      parts: [{ text: systemTexts.join('\n\n') }]
    }
  }

  return requestBody
}

const sendOpenCodeGoGoogleRequest = async (model: string, requestBody: any, apiKey: string, signal?: AbortSignal) => {
  const response = await fetch(openCodeGoGoogleGenerateContentUrl(model), {
    method: 'POST',
    headers: buildOpenCodeGoHeaders(getOpenAiCompatibleHeaders(apiKey)),
    body: JSON.stringify(requestBody),
    signal
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))
    console.error('OpenCode Go Google API Error Details:', errorData)

    if (response.status === 429) {
      throw new Error('RATE_LIMITED')
    }

    return { response, errorData }
  }

  return { response }
}

const callOpenCodeGoGoogle = async (opts: { messages: any[]; model: string; apiKey: string; maxTokens: number; reasoningEffort?: string; includeReasoning?: boolean; jsonMime?: boolean; signal?: AbortSignal }) => {
  const requestBody = buildOpenCodeGoGoogleRequestBody(opts)
  const result = await sendOpenCodeGoGoogleRequest(opts.model, requestBody, opts.apiKey, opts.signal)

  if (!result.response.ok) {
    throw new AIError(result.errorData?.error?.code ?? result.response.status, result.errorData?.error?.message ?? result.response.statusText ?? 'Unknown error')
  }

  const data = await result.response.json()

  return extractGeminiText(data, {
    checkProhibitedContent: true,
    includeReasoning: opts.includeReasoning
  })
}

const isReasoningParameterError = (errorData: any) => {
  const msg = (errorData?.error?.message || '') + ' ' + (errorData?.error?.code || '')
  return msg.toLowerCase().includes('reasoning') || (typeof errorData?.message === 'string' && errorData.message.toLowerCase().includes('reasoning'))
}

const isCacheControlError = (errorData: any) => {
  const msg = (errorData?.error?.message || '') + ' ' + (errorData?.error?.type || '')
  return msg.toLowerCase().includes('cache_control') || msg.toLowerCase().includes('cache control')
}

const callOpenCodeGoTextRequest = async (opts: { messages: any[]; model: string; apiKey: string; maxTokens: number; reasoningEffort?: string; enableContextCaching?: boolean; includeReasoning?: boolean; signal?: AbortSignal }) => {
  const { messages, model, apiKey, maxTokens, signal, enableContextCaching = false, includeReasoning = false } = opts
  let { reasoningEffort } = opts

  if (reasoningEffort && reasoningEffort !== 'default' && modelsWithoutReasoningSupport.value.has(model)) {
    reasoningEffort = undefined
  }

  if (isOpenCodeGoGoogleModel(model)) {
    return await callOpenCodeGoGoogle({
      messages,
      model,
      apiKey,
      maxTokens,
      reasoningEffort,
      includeReasoning,
      signal
    })
  }

  if (isOpenCodeGoAnthropicModel(model)) {
    const { requestBody, shouldAddCacheControl } = buildAnthropicRequestBody({ messages, maxTokens, model, enableContextCaching, reasoningEffort })
    const result = await sendOpenCodeGoAnthropicRequest(requestBody, apiKey, signal)

    if (!result.response.ok) {
      if (result.response.status === 400 && shouldAddCacheControl && isCacheControlError(result.errorData)) {
        console.warn(`Model ${model} does not support cache_control, remembering and retrying without it...`)
        modelsWithoutCacheControlSupport.value.add(model)
        sessionStorage.setItem('modelsWithoutCacheControlSupport', JSON.stringify([...modelsWithoutCacheControlSupport.value]))
        const { requestBody: retryBody } = buildAnthropicRequestBody({ messages, maxTokens, model, enableContextCaching: false, reasoningEffort })
        const retryResult = await sendOpenCodeGoAnthropicRequest(retryBody, apiKey, signal)
        if (!retryResult.response.ok) {
          throw new AIError(retryResult.errorData?.error?.code ?? retryResult.response.status, retryResult.errorData?.error?.message ?? retryResult.response.statusText ?? 'Unknown error')
        }
        return await parseAnthropicTextResponse(retryResult.response, includeReasoning)
      }

      if (result.response.status === 400 && isReasoningParameterError(result.errorData)) {
        console.warn(`Model ${model} rejected reasoning settings, remembering and retrying without reasoning...`)
        modelsWithoutReasoningSupport.value.add(model)
        sessionStorage.setItem('modelsWithoutReasoningSupport', JSON.stringify([...modelsWithoutReasoningSupport.value]))
        const { requestBody: retryBody } = buildAnthropicRequestBody({ messages, maxTokens, model, enableContextCaching })
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

  const requestBody = buildOpenCodeGoChatRequestBody({
    messages,
    maxTokens,
    model,
    reasoningEffort
  })

  const result = await sendOpenCodeGoRequest(requestBody, apiKey, signal)

  if (!result.response.ok) {
    if (result.response.status === 400 && isReasoningParameterError(result.errorData)) {
      console.warn(`Model ${model} rejected reasoning settings, remembering and retrying without reasoning...`)
      modelsWithoutReasoningSupport.value.add(model)
      sessionStorage.setItem('modelsWithoutReasoningSupport', JSON.stringify([...modelsWithoutReasoningSupport.value]))
      const retryRequestBody = buildOpenCodeGoChatRequestBody({
        messages,
        maxTokens,
        model
      })
      const retryResult = await sendOpenCodeGoRequest(retryRequestBody, apiKey, signal)

      if (!retryResult.response.ok) {
        throw new AIError(retryResult.errorData?.error?.code ?? retryResult.response.status, retryResult.errorData?.error?.message ?? retryResult.response.statusText ?? 'Unknown error')
      }

      return await parseOpenAiCompatibleTextResponse(retryResult.response, includeReasoning)
    }

    throw new AIError(result.errorData?.error?.code ?? result.response.status, result.errorData?.error?.message ?? result.response.statusText ?? 'Unknown error')
  }

  return await parseOpenAiCompatibleTextResponse(result.response, includeReasoning)
}

// --- OpenRouter service tier ---

export type OpenRouterTierSupport =
  | { status: 'known'; flex: boolean; priority: boolean }
  | { status: 'unavailable' }

const openRouterFetchedModelRecords = new Map<string, any>()
const openRouterTierSupportCache = new Map<string, OpenRouterTierSupport>()
const openRouterTierSupportInflight = new Map<string, Promise<OpenRouterTierSupport>>()

// A leading slash is a catalog request path (/api/v1/chat/completions), not a provider tier tag.
const endpointTagStrings = (entries: any[]): string[] => {
  const tags: string[] = []

  for (const entry of entries) {
    const raw = typeof entry === 'string' ? entry : entry?.tag
    if (typeof raw !== 'string' || !raw || raw.startsWith('/')) continue
    tags.push(raw)
  }

  return tags
}

const carriedEndpointTags = (model: any): string[] | null => {
  if (!model || typeof model !== 'object') {

    return null
  }

  for (const source of [model.endpoints, model.tags]) {
    if (!Array.isArray(source)) continue
    const tags = endpointTagStrings(source)
    if (tags.length === 0) continue

    return tags
  }

  return null
}

// Tier tags end in /flex, /priority, or /fast. :nitro and :floor are routing shortcuts, not service tiers.
const supportFromEndpointTags = (tags: string[]) => {
  let flex = false
  let priority = false

  for (const tag of tags) {
    if (tag.endsWith('/flex')) flex = true
    if (tag.endsWith('/priority') || tag.endsWith('/fast')) priority = true
  }

  return { flex, priority }
}

const knownTierSupport = (tags: string[]): OpenRouterTierSupport => {
  return {
    status: 'known',
    ...supportFromEndpointTags(tags)
  }
}

const rememberOpenRouterModelList = (models: any[]) => {
  for (const modelRecord of models) {
    if (typeof modelRecord?.id !== 'string') continue
    openRouterFetchedModelRecords.set(modelRecord.id, modelRecord)
    const carried = carriedEndpointTags(modelRecord)
    if (!carried) continue
    openRouterTierSupportCache.set(modelRecord.id, knownTierSupport(carried))
  }
}

const loadOpenRouterTierSupport = async (modelId: string): Promise<OpenRouterTierSupport> => {
  const carried = carriedEndpointTags(openRouterFetchedModelRecords.get(modelId))
  if (carried) {

    return knownTierSupport(carried)
  }

  try {
    const response = await fetch(`https://openrouter.ai/api/v1/models/${modelId}/endpoints`)
    if (!response.ok) {

      return { status: 'unavailable' }
    }

    const payload = await response.json()
    const endpoints = Array.isArray(payload?.data?.endpoints) ? payload.data.endpoints : Array.isArray(payload?.endpoints) ? payload.endpoints : null
    if (!endpoints) {

      return { status: 'unavailable' }
    }

    return knownTierSupport(endpointTagStrings(endpoints))
  } catch {

    return { status: 'unavailable' }
  }
}

export const resolveOpenRouterTierSupport = async (modelId: string): Promise<OpenRouterTierSupport> => {
  if (!modelId) {

    return { status: 'unavailable' }
  }

  const cached = openRouterTierSupportCache.get(modelId)
  if (cached) {

    return cached
  }

  const pending = openRouterTierSupportInflight.get(modelId)
  if (pending) {

    return pending
  }

  const request = loadOpenRouterTierSupport(modelId)
  openRouterTierSupportInflight.set(modelId, request)

  try {
    const support = await request
    openRouterTierSupportCache.set(modelId, support)

    return support
  } finally {
    openRouterTierSupportInflight.delete(modelId)
  }
}

const OPENROUTER_SPEED_SERVICE_TIER: Record<OpenRouterSpeed, 'flex' | 'priority' | undefined> = {
  default: undefined,
  slow: 'flex',
  fast: 'priority'
}

const applyOpenRouterServiceTier = (requestBody: any, speed: OpenRouterSpeed | undefined, tierSupport: OpenRouterTierSupport) => {
  const tier = OPENROUTER_SPEED_SERVICE_TIER[normalizeOpenRouterSpeed(speed)]
  if (!tier || tierSupport.status !== 'known') {

    return
  }

  const supported = tier === 'flex' ? tierSupport.flex : tierSupport.priority
  if (!supported) {

    return
  }

  requestBody.service_tier = tier
}

const buildOpenRouterChatRequestBody = async (opts: {
  model: string
  messages: any[]
  maxTokens: number
  reasoningEffort?: string
  reasoningExclude?: boolean
  responseFormat?: any
  provider?: any
  plugins?: any[]
  openRouterSpeed?: OpenRouterSpeed
}) => {
  const tierSupport = await resolveOpenRouterTierSupport(opts.model)
  const requestBody: any = {
    model: opts.model,
    messages: opts.messages,
    max_tokens: opts.maxTokens
  }

  if (opts.responseFormat) requestBody.response_format = opts.responseFormat
  if (opts.provider) requestBody.provider = opts.provider
  if (opts.reasoningEffort && opts.reasoningEffort !== 'default') {
    requestBody.reasoning = {
      effort: opts.reasoningEffort,
      exclude: opts.reasoningExclude ?? false
    }
  }
  if (opts.plugins && opts.plugins.length > 0) requestBody.plugins = opts.plugins
  applyOpenRouterServiceTier(requestBody, opts.openRouterSpeed, tierSupport)

  return requestBody
}

// --- Model fetching ---

export const fetchOpenRouterModels = async () => {
  try {
    const response = await fetch('https://openrouter.ai/api/v1/models')
    const data = await response.json()
    const models = data.data
    if (Array.isArray(models)) rememberOpenRouterModelList(models)

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

    const response = await fetch(OPENCODE_GO_MODELS_URL, { headers: buildOpenCodeGoHeaders(headers) })

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

export const callOpenRouterSummarization = async (messages: any[], apiKey: string, model: string, signal?: AbortSignal, openRouterSpeed?: OpenRouterSpeed) => {
  const requestBody = await buildOpenRouterChatRequestBody({
    model,
    messages,
    maxTokens: 16384,
    openRouterSpeed
  })

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

export const callZai = async (
  messages: any[],
  opts: {
    url: string
    model?: string
    apiKey?: string
    maxTokens?: number
    modeIsGame?: boolean
    reasoningEffort?: string
    includeJsonSchema?: boolean
    includeAnimReason?: boolean
    includeReasoning?: boolean
    signal?: AbortSignal
  }
) => {
  const { model, maxTokens = 16384, apiKey, url, modeIsGame, reasoningEffort, includeJsonSchema = false, includeAnimReason = false, includeReasoning = false, signal } = opts
  const trimmedKey = apiKey?.trim()
  const requestBody = buildZaiChatRequestBody({
    messages,
    maxTokens,
    model,
    modeIsGame,
    reasoningEffort,
    includeJsonSchema,
    includeAnimReason
  })
  const response = await sendOpenAiCompatibleRequest(url, {
    requestBody,
    apiKey: trimmedKey ? trimmedKey : undefined,
    signal
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))

    return { ok: false as const, status: response.status, statusText: response.statusText, errorData }
  }

  const data = await response.json()

  return { ok: true as const, text: takeOpenAiMessageContent(data, includeReasoning) }
}

export const callOpenCodeGoSummarization = async (messages: any[], opts: { model: string; apiKey: string; maxTokens?: number; reasoningEffort?: string; enableContextCaching?: boolean; signal?: AbortSignal }) => {
  const { model, apiKey, maxTokens = 16384, reasoningEffort, enableContextCaching, signal } = opts

  return await callOpenCodeGoTextRequest({
    messages,
    model,
    apiKey,
    maxTokens,
    reasoningEffort,
    enableContextCaching,
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
    signal?: AbortSignal
  }
) => {
  const { model, apiKey, modeIsGame, maxTokens = 16384, signal, enableContextCaching = false, includeAnimReason = false, includeReasoning = false } = opts
  let { reasoningEffort } = opts

  if (reasoningEffort && reasoningEffort !== 'default' && modelsWithoutReasoningSupport.value.has(model)) {
    reasoningEffort = undefined
  }

  if (isOpenCodeGoGoogleModel(model)) {
    return await callOpenCodeGoGoogle({
      messages,
      model,
      apiKey,
      maxTokens,
      reasoningEffort,
      includeReasoning,
      jsonMime: true,
      signal
    })
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

  const requestBody = buildOpenCodeGoChatRequestBody({
    messages,
    maxTokens,
    model,
    modeIsGame,
    reasoningEffort,
    includeJsonSchema: true,
    includeAnimReason
  })

  const result = await sendOpenCodeGoRequest(requestBody, apiKey, signal)

  if (!result.response.ok) {
    if (result.response.status === 400 && (JSON.stringify(result.errorData).includes('response_format') || JSON.stringify(result.errorData).includes('json_schema') || JSON.stringify(result.errorData).includes('schema'))) {
      console.warn(`Model ${model} does not support json_schema response format, remembering and retrying without it...`)
      modelsWithoutJsonSupport.value.add(model)
      sessionStorage.setItem('modelsWithoutJsonSupport', JSON.stringify([...modelsWithoutJsonSupport.value]))
      return callWithoutJsonFormat()
    }

    if (result.response.status === 400 && isReasoningParameterError(result.errorData)) {
      console.warn(`Model ${model} rejected reasoning settings, remembering and retrying without reasoning...`)
      modelsWithoutReasoningSupport.value.add(model)
      sessionStorage.setItem('modelsWithoutReasoningSupport', JSON.stringify([...modelsWithoutReasoningSupport.value]))
      const retryRequestBody = buildOpenCodeGoChatRequestBody({
        messages,
        maxTokens,
        model,
        modeIsGame,
        includeJsonSchema: true,
        includeAnimReason
      })
      const retryResult = await sendOpenCodeGoRequest(retryRequestBody, apiKey, signal)

      if (!retryResult.response.ok) {
        if (retryResult.response.status === 400 && (JSON.stringify(retryResult.errorData).includes('response_format') || JSON.stringify(retryResult.errorData).includes('json_schema') || JSON.stringify(retryResult.errorData).includes('schema'))) {
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
    openRouterSpeed?: OpenRouterSpeed
    includeAnimReason?: boolean
    includeReasoning?: boolean
    signal?: AbortSignal
  }
) => {
  const { model, apiKey, enableContextCaching, allowWebSearchFallback, modeIsGame, enableWebSearch = false, prompts, reasoningEffort, openRouterSpeed, includeAnimReason = false, includeReasoning = false, signal } = opts

  let processedMessages = messages

  if (enableContextCaching) {
    processedMessages = messages.map((m) => ({ ...m }))

    if (processedMessages.length > 0 && processedMessages[0].role === 'system') {
      const systemContent = processedMessages[0].content
      processedMessages[0] = {
        ...processedMessages[0],
        content: [
          {
            type: 'text',
            text: systemContent,
            cache_control: { type: 'ephemeral' }
          }
        ]
      }
    }

    // OpenRouter uses only the last breakpoint for Gemini and its cache TTL never refreshes,
    // so a moving history breakpoint rewrites the cache every turn. The system block alone is written once and re-read.
    if (processedMessages.length >= 2 && !isOpenRouterGeminiModel(model)) {
      const lastHistoryIndex = processedMessages.length - 2
      if (lastHistoryIndex > 0 || (lastHistoryIndex === 0 && processedMessages[0].role !== 'system')) {
        const msg = processedMessages[lastHistoryIndex]
        if (typeof msg.content === 'string') {
          processedMessages[lastHistoryIndex] = {
            ...msg,
            content: [
              {
                type: 'text',
                text: msg.content,
                cache_control: { type: 'ephemeral' }
              }
            ]
          }
        }
      }
    }
  }

  const jsonEnforcement = includeAnimReason && prompts.systemPrompt?.debugAnimReasonInstruction
    ? `${prompts.reminders.jsonEnforcement}\n${prompts.systemPrompt.debugAnimReasonInstruction}`
    : prompts.reminders.jsonEnforcement
  const messagesWithEnforcement = [...processedMessages, { role: 'user', content: jsonEnforcement }]

  const buildWebPlugin = () => {
    if (!enableWebSearch) return undefined
    if (!allowWebSearchFallback) return undefined
    return [{ id: 'web', max_results: 10 }]
  }

  const callWithoutJsonFormat = async () => {
    const requestBody = await buildOpenRouterChatRequestBody({
      model,
      messages: messagesWithEnforcement,
      maxTokens: 16384,
      reasoningEffort,
      reasoningExclude: !includeReasoning,
      plugins: buildWebPlugin(),
      openRouterSpeed
    })

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
  const webPlugin = buildWebPlugin()
  const plugins = webPlugin ? [...webPlugin, { id: 'response-healing' }] : [{ id: 'response-healing' }]
  const requestBody = await buildOpenRouterChatRequestBody({
    model,
    messages: processedMessages,
    maxTokens: 16384,
    reasoningEffort,
    reasoningExclude: !includeReasoning,
    responseFormat: responseSchema,
    provider: { require_parameters: true },
    plugins,
    openRouterSpeed
  })

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
    prompts: any
    existingSummary?: string
    complete: (messages: { role: string; content: string }[]) => Promise<string>
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
  const summary = await opts.complete(msgs)

  if (summary && summary.trim().length > 0) {
    return summary
  }

  throw new Error('Summarization returned empty output.')
}

export const compactSummary = async (
  fullSummary: string,
  opts: {
    prompts: any
    complete: (messages: { role: string; content: string }[]) => Promise<string>
  }
) => {
  if (!fullSummary || fullSummary.trim().length === 0) return ''

  const systemMsg = { role: 'system', content: opts.prompts.compactSummary.system }
  const userContent = opts.prompts.compactSummary.user.replace('${fullSummary}', fullSummary)
  const userMsg = { role: 'user', content: userContent }
  const msgs = [systemMsg, userMsg]
  const summary = await opts.complete(msgs)

  if (summary && summary.trim().length > 0) {
    return summary
  }

  throw new Error('Summary compaction returned empty output.')
}
