import type { OpenRouterSpeed } from '@/utils/providerConfigUtils'
import { buildOpenCodeGoHeaders } from '@/utils/providerConfigUtils'
import { buildOpenCodeGoChatRequestBody, callLocal, callLocalSummarization, callOpenCodeGo, callOpenCodeGoSummarization, callOpenRouter, callOpenRouterSummarization, fetchOpenCodeGoModels, fetchOpenRouterModels } from '@/utils/llmUtils'
import { GEMINI_DEFAULT_MODEL, GEMINI_FALLBACK_MODEL_OPTIONS, callGemini, callGeminiSummarization, fetchGeminiModels } from '@/utils/geminiUtils'
import { callPollinations, callPollinationsSummarization, fetchPollinationsModels } from '@/utils/pollinationsUtils'
import { takeOpenAiMessageContent } from '@/utils/aiReasoningUtils'
import { AIError } from '@/utils/errorUtils'

export type ChatMessage = { role: string; content: string }

export type StoryTask = 'story' | 'summarize' | 'compact' | 'wiki' | 'enrich' | 'native'

export type ModelChoice = {
  label: string
  value: string
  isFree?: boolean
  style?: { color: string; fontWeight: string }
}

export type ModelListResult = { ok: true; choices: ModelChoice[] } | { ok: false }

export type StoryRun = {
  messages: ChatMessage[]
  apiKey: string
  model?: string
  modeIsGame: boolean
  maxTokens?: number
  reasoningEffort?: string
  enableContextCaching?: boolean
  includeAnimReason?: boolean
  includeReasoning?: boolean
  allowWebSearchFallback?: boolean
  signal?: AbortSignal
  enableWebSearch?: boolean
  openRouterSpeed?: OpenRouterSpeed
  localUrl?: string
  prompts?: any
}

export type RestoredModel = {
  model?: string
  warning?: string
}

export type CharacterSearchMode = 'native' | 'wiki' | 'none'

type ReasoningFamily = 'chat' | 'gemini'
type EmptyCatalog = 'quiet' | 'warn'
type FallbackKind = 'first' | 'gemini-default' | 'none'
type SearchKind = 'always-native' | 'always-wiki' | 'none' | 'openrouter' | 'pollinations'
type WikiHelp = 'same-as-wiki-mode' | 'never'

type ProviderPolicy = {
  label: string
  reasoning: ReasoningFamily
  refetchOnKeyChange: boolean
  emptyCatalog: EmptyCatalog
  fallback: FallbackKind
  search: SearchKind
  wikiHelp: WikiHelp
  listModels: (apiKey: string | undefined) => Promise<ModelListResult>
  run: (task: StoryTask, req: StoryRun) => Promise<string>
}

const OPENROUTER_NATIVE_PREFIXES = ['openai/', 'anthropic/', 'perplexity/', 'x-ai/']
const POLLINATIONS_NATIVE_MODELS = ['gemini-search', 'perplexity-fast', 'perplexity-reasoning']

const CHAT_REASONING_OPTIONS = [
  { label: 'Default', value: 'default' },
  { label: 'None', value: 'none' },
  { label: 'Minimal', value: 'minimal' },
  { label: 'Low', value: 'low' },
  { label: 'Medium', value: 'medium' },
  { label: 'High', value: 'high' },
  { label: 'Extra High', value: 'xhigh' }
]

const GEMINI_REASONING_OPTIONS = CHAT_REASONING_OPTIONS.filter((option) => option.value !== 'none')

const SAVED_MODEL_WARNING = (modelId: string) => `Saved model '${modelId}' is invalid or unavailable. Using default.`

const geminiRow = {
  id: 'gemini' as const,
  label: 'Gemini',
  reasoning: 'gemini',
  refetchOnKeyChange: true,
  emptyCatalog: 'warn',
  fallback: 'gemini-default',
  search: 'always-native',
  wikiHelp: 'same-as-wiki-mode',
  listModels: listGeminiModels,
  run: runGemini
} satisfies ProviderPolicy & { id: string }

const openCodeGoRow = {
  id: 'opencode-go' as const,
  label: 'OpenCode Go',
  reasoning: 'chat',
  refetchOnKeyChange: true,
  emptyCatalog: 'quiet',
  fallback: 'first',
  search: 'always-wiki',
  wikiHelp: 'same-as-wiki-mode',
  listModels: listGoModels,
  run: runGo
} satisfies ProviderPolicy & { id: string }

const openCodeRow = {
  id: 'opencode' as const,
  label: 'OpenCode',
  reasoning: 'chat',
  refetchOnKeyChange: true,
  emptyCatalog: 'quiet',
  fallback: 'first',
  search: 'always-wiki',
  wikiHelp: 'same-as-wiki-mode',
  listModels: listPaidModels,
  run: runPaid
} satisfies ProviderPolicy & { id: string }

const openRouterRow = {
  id: 'openrouter' as const,
  label: 'OpenRouter',
  reasoning: 'chat',
  refetchOnKeyChange: false,
  emptyCatalog: 'warn',
  fallback: 'first',
  search: 'openrouter',
  wikiHelp: 'same-as-wiki-mode',
  listModels: listOpenRouterModels,
  run: runOpenRouter
} satisfies ProviderPolicy & { id: string }

const pollinationsRow = {
  id: 'pollinations' as const,
  label: 'Pollinations',
  reasoning: 'chat',
  refetchOnKeyChange: true,
  emptyCatalog: 'quiet',
  fallback: 'first',
  search: 'pollinations',
  wikiHelp: 'never',
  listModels: listPollinationsModels,
  run: runPollinations
} satisfies ProviderPolicy & { id: string }

const localRow = {
  id: 'local' as const,
  label: 'Local (OpenAI-compatible API)',
  reasoning: 'chat',
  refetchOnKeyChange: false,
  emptyCatalog: 'warn',
  fallback: 'none',
  search: 'none',
  wikiHelp: 'same-as-wiki-mode',
  listModels: listLocalModels,
  run: runLocal
} satisfies ProviderPolicy & { id: string }

const storyProviderList = [geminiRow, openCodeGoRow, openCodeRow, openRouterRow, pollinationsRow, localRow] as const

export type StoryProviderId = (typeof storyProviderList)[number]['id']

const providerIdSet = new Set<string>()
for (const provider of storyProviderList) {
  if (providerIdSet.has(provider.id)) {
    throw new Error(`Duplicate story provider: ${provider.id}`)
  }
  providerIdSet.add(provider.id)
}

export const storyProviderOptions: { label: string; value: StoryProviderId }[] = storyProviderList.map((provider) => ({
  label: provider.label,
  value: provider.id
}))

function providerRow(id: StoryProviderId): (typeof storyProviderList)[number] {
  const row = storyProviderList.find((provider) => provider.id === id)
  if (!row) {
    throw new Error(`Unknown story provider: ${id}`)
  }

  return row
}

export function parseStoryProviderId(raw: string): StoryProviderId | undefined {
  const row = storyProviderList.find((provider) => provider.id === raw)

  return row?.id
}

export function listStoryModels(provider: StoryProviderId, apiKey: string | undefined): Promise<ModelListResult> {
  return providerRow(provider).listModels(apiKey)
}

export function runStoryProvider(provider: StoryProviderId, task: StoryTask, req: StoryRun): Promise<string> {
  return providerRow(provider).run(task, req)
}

export function refetchesModelsWhenKeyChanges(provider: StoryProviderId): boolean {
  return providerRow(provider).refetchOnKeyChange
}

export function characterSearchMode(provider: StoryProviderId, modelId: string): CharacterSearchMode {
  const search = providerRow(provider).search
  if (search === 'always-native') {

    return 'native'
  }
  if (search === 'always-wiki') {

    return 'wiki'
  }
  if (search === 'none') {

    return 'none'
  }
  if (search === 'openrouter') {
    if (OPENROUTER_NATIVE_PREFIXES.some((prefix) => modelId.startsWith(prefix))) {

      return 'native'
    }

    return 'wiki'
  }
  if (POLLINATIONS_NATIVE_MODELS.includes(modelId)) {

    return 'native'
  }

  return 'wiki'
}

export function providerUsesWiki(provider: StoryProviderId, modelId: string): boolean {
  if (providerRow(provider).wikiHelp === 'never') {

    return false
  }

  return characterSearchMode(provider, modelId) === 'wiki'
}

export function getReasoningEffortOptions(provider: StoryProviderId): { label: string; value: string }[] {
  const options = providerRow(provider).reasoning === 'chat' ? CHAT_REASONING_OPTIONS : GEMINI_REASONING_OPTIONS
  if (import.meta.env.DEV) {

    return options
  }

  const allowedValues = ['default', 'none', 'minimal', 'low', 'medium']

  return options.filter((option) => allowedValues.includes(option.value))
}

export function restoredModel(provider: StoryProviderId, savedModel: string | undefined, listed: readonly ModelChoice[]): RestoredModel {
  const saved = savedModel ? savedModel : undefined
  if (saved && listed.some((choice) => choice.value === saved)) {

    return { model: saved }
  }

  const row = providerRow(provider)
  if (listed.length === 0 && row.emptyCatalog === 'quiet') {

    return {}
  }
  if (listed.length === 0 && row.fallback === 'none') {
    if (saved) {

      return { warning: SAVED_MODEL_WARNING(saved) }
    }

    return {}
  }

  const model = fallbackModel(provider, listed)
  if (saved && saved !== model) {

    return { model, warning: SAVED_MODEL_WARNING(saved) }
  }
  if (model) {

    return { model }
  }

  return {}
}

export function modelAfterRefresh(provider: StoryProviderId, current: string | undefined, listed: readonly ModelChoice[]): string {
  if (current && listed.some((choice) => choice.value === current)) {

    return current
  }

  return fallbackModel(provider, listed) ?? ''
}

function fallbackModel(provider: StoryProviderId, listed: readonly ModelChoice[]): string | undefined {
  const row = providerRow(provider)
  if (row.fallback === 'none') {

    return undefined
  }
  if (row.fallback === 'gemini-default') {
    const preferred = listed.find((choice) => choice.value === GEMINI_DEFAULT_MODEL)
    if (preferred) {

      return preferred.value
    }
    if (listed[0]) {

      return listed[0].value
    }

    return GEMINI_DEFAULT_MODEL
  }

  return listed[0]?.value
}

function openCodeHost(): string {
  if (import.meta.env.DEV) {

    return '/opencode-go'
  }

  return 'https://opencode.ai'
}

function paidModelsUrl(): string {
  return `${openCodeHost()}/inference/v1/models`
}

function paidChatUrl(): string {
  return `${openCodeHost()}/inference/openai/v1/chat/completions`
}

function parseCatalogIds(payload: unknown): string[] {
  if (!payload || typeof payload !== 'object') {

    return []
  }

  const data = (payload as { data?: unknown }).data
  if (!Array.isArray(data)) {

    return []
  }

  const ids: string[] = []
  for (const entry of data) {
    if (!entry || typeof entry !== 'object') {
      continue
    }
    const id = (entry as { id?: unknown }).id
    if (typeof id === 'string') {
      ids.push(id)
    }
  }

  return ids
}

function blockedFromPaidStoryList(modelId: string): boolean {
  return modelId === 'big-pickle' || modelId === 'jev-1.13' || modelId.endsWith('-free')
}

function paidHeaders(apiKey: string | undefined, json: boolean): Record<string, string> {
  const headers: Record<string, string> = {}
  if (json) {
    headers['Content-Type'] = 'application/json'
  }
  const trimmed = apiKey?.trim()
  if (trimmed) {
    headers.Authorization = `Bearer ${trimmed}`
  }

  return buildOpenCodeGoHeaders(headers)
}

async function listPaidModels(apiKey: string | undefined): Promise<ModelListResult> {
  try {
    const response = await fetch(paidModelsUrl(), { headers: paidHeaders(apiKey, false) })
    if (!response.ok) {

      return { ok: false }
    }

    const ids = parseCatalogIds(await response.json()).filter((modelId) => !blockedFromPaidStoryList(modelId))
    const choices = ids
      .map((modelId) => ({ label: modelId, value: modelId }))
      .sort((a, b) => a.label.localeCompare(b.label))

    return { ok: true, choices }
  } catch {

    return { ok: false }
  }
}

// A shared model id can fail schema or reasoning on this host and still succeed on Go.
const PAID_NO_JSON_SCHEMA_KEY = 'nikke_opencode_no_json_schema'
const PAID_NO_REASONING_KEY = 'nikke_opencode_no_reasoning'

function readPaidBlockList(storageKey: string): Set<string> {
  try {
    const raw = sessionStorage.getItem(storageKey)
    const parsed = raw ? JSON.parse(raw) : []
    if (!Array.isArray(parsed)) {

      return new Set()
    }

    return new Set(parsed.filter((id) => typeof id === 'string'))
  } catch {

    return new Set()
  }
}

function rememberPaidBlock(storageKey: string, modelId: string): void {
  if (!modelId) {

    return
  }

  const blocked = readPaidBlockList(storageKey)
  if (blocked.has(modelId)) {

    return
  }

  blocked.add(modelId)
  sessionStorage.setItem(storageKey, JSON.stringify([...blocked]))
}

type PaidPostResult = { ok: true; text: string } | { ok: false; status: number; errorData: any }

function paidReasoningEffort(req: StoryRun, useReasoning: boolean): string | undefined {
  if (!useReasoning || !req.reasoningEffort || req.reasoningEffort === 'default') {

    return undefined
  }

  return req.reasoningEffort
}

function isPaidSchemaError(errorData: unknown): boolean {
  const text = JSON.stringify(errorData)

  return text.includes('response_format') || text.includes('json_schema') || text.includes('schema')
}

function isPaidReasoningError(errorData: any): boolean {
  const msg = `${errorData?.error?.message || ''} ${errorData?.error?.code || ''}`

  return msg.toLowerCase().includes('reasoning') || (typeof errorData?.message === 'string' && errorData.message.toLowerCase().includes('reasoning'))
}

async function postPaid(req: StoryRun, useSchema: boolean, useReasoning: boolean): Promise<PaidPostResult> {
  const requestBody = buildOpenCodeGoChatRequestBody({
    messages: req.messages,
    maxTokens: req.maxTokens ?? 16384,
    model: req.model,
    modeIsGame: req.modeIsGame,
    reasoningEffort: paidReasoningEffort(req, useReasoning),
    includeJsonSchema: useSchema,
    reasoningExclude: false,
    includeAnimReason: req.includeAnimReason
  })
  const response = await fetch(paidChatUrl(), {
    method: 'POST',
    headers: paidHeaders(req.apiKey, true),
    body: JSON.stringify(requestBody),
    signal: req.signal
  })

  if (response.status === 429) {
    throw new Error('RATE_LIMITED')
  }
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))

    return { ok: false, status: response.status, errorData }
  }

  const data = await response.json()
  const text = takeOpenAiMessageContent(data, Boolean(req.includeReasoning))

  return { ok: true, text: typeof text === 'string' ? text : '' }
}

async function paidChat(req: StoryRun, schema: boolean): Promise<string> {
  const modelId = req.model || ''
  const blockedSchema = readPaidBlockList(PAID_NO_JSON_SCHEMA_KEY)
  const blockedReasoning = readPaidBlockList(PAID_NO_REASONING_KEY)
  let useSchema = schema && !blockedSchema.has(modelId)
  let useReasoning = !blockedReasoning.has(modelId)
  let result = await postPaid(req, useSchema, useReasoning)

  for (let attempt = 0; attempt < 2 && !result.ok && result.status === 400; attempt += 1) {
    const schemaRejected = useSchema && isPaidSchemaError(result.errorData)
    const reasoningRejected = useReasoning && Boolean(paidReasoningEffort(req, true)) && isPaidReasoningError(result.errorData)
    if (schemaRejected) {
      rememberPaidBlock(PAID_NO_JSON_SCHEMA_KEY, modelId)
      useSchema = false
    } else if (reasoningRejected) {
      rememberPaidBlock(PAID_NO_REASONING_KEY, modelId)
      useReasoning = false
    } else {
      break
    }
    result = await postPaid(req, useSchema, useReasoning)
  }

  if (!result.ok) {
    throw new AIError(result.errorData?.error?.code ?? result.status, result.errorData?.error?.message ?? 'Unknown error')
  }

  return result.text
}

async function runPaid(task: StoryTask, req: StoryRun): Promise<string> {
  if (task === 'native') {
    throw new Error('Native search is not available for this provider')
  }
  if (task === 'story') {

    return paidChat(req, true)
  }

  return paidChat(req, false)
}

async function listGoModels(apiKey: string | undefined): Promise<ModelListResult> {
  try {
    const choices = await fetchOpenCodeGoModels(apiKey)

    return { ok: true, choices }
  } catch {

    return { ok: false }
  }
}

async function runGo(task: StoryTask, req: StoryRun): Promise<string> {
  if (task === 'native') {
    throw new Error('Native search is not available for this provider')
  }
  if (task === 'summarize' || task === 'compact') {

    return callOpenCodeGoSummarization(req.messages, {
      model: req.model ?? '',
      apiKey: req.apiKey,
      maxTokens: req.maxTokens,
      reasoningEffort: req.reasoningEffort,
      enableContextCaching: req.enableContextCaching,
      signal: req.signal
    })
  }

  return callOpenCodeGo(req.messages, {
    model: req.model ?? '',
    apiKey: req.apiKey,
    modeIsGame: req.modeIsGame,
    maxTokens: req.maxTokens,
    reasoningEffort: req.reasoningEffort,
    enableContextCaching: req.enableContextCaching,
    includeAnimReason: req.includeAnimReason,
    includeReasoning: req.includeReasoning,
    signal: req.signal
  })
}

async function listGeminiModels(apiKey: string | undefined): Promise<ModelListResult> {
  try {
    const fetched = await fetchGeminiModels(apiKey)
    const choices = fetched.length > 0 ? fetched : GEMINI_FALLBACK_MODEL_OPTIONS

    return { ok: true, choices }
  } catch {

    return { ok: false }
  }
}

async function runGemini(task: StoryTask, req: StoryRun): Promise<string> {
  if (task === 'summarize' || task === 'compact') {

    return callGeminiSummarization(req.messages, req.apiKey, req.model ?? '', req.signal)
  }

  const enableWebSearch = task === 'story' || task === 'native' ? Boolean(req.enableWebSearch) : false
  const allowWebSearchFallback = task === 'enrich' ? false : Boolean(req.allowWebSearchFallback)

  return callGemini(req.messages, {
    model: req.model ?? '',
    apiKey: req.apiKey,
    allowWebSearchFallback,
    enableWebSearch,
    reasoningEffort: req.reasoningEffort,
    includeReasoning: req.includeReasoning,
    signal: req.signal
  })
}

async function listOpenRouterModels(): Promise<ModelListResult> {
  try {
    const choices = await fetchOpenRouterModels()

    return { ok: true, choices }
  } catch {

    return { ok: false }
  }
}

async function runOpenRouter(task: StoryTask, req: StoryRun): Promise<string> {
  if (task === 'summarize' || task === 'compact') {

    return callOpenRouterSummarization(req.messages, req.apiKey, req.model ?? '', req.signal, req.openRouterSpeed)
  }

  const enableWebSearch = task === 'native' ? true : task === 'story' ? Boolean(req.enableWebSearch) : false
  const allowWebSearchFallback = task === 'enrich' ? false : Boolean(req.allowWebSearchFallback)
  const prompts = task === 'enrich' ? {} : req.prompts
  const enableContextCaching = task === 'enrich' ? false : Boolean(req.enableContextCaching)

  return callOpenRouter(req.messages, {
    model: req.model ?? '',
    apiKey: req.apiKey,
    enableContextCaching,
    allowWebSearchFallback,
    modeIsGame: req.modeIsGame,
    enableWebSearch,
    prompts,
    reasoningEffort: req.reasoningEffort,
    openRouterSpeed: req.openRouterSpeed,
    includeAnimReason: req.includeAnimReason,
    includeReasoning: req.includeReasoning,
    signal: req.signal
  })
}

async function listPollinationsModels(apiKey: string | undefined): Promise<ModelListResult> {
  try {
    const choices = await fetchPollinationsModels(apiKey)

    return { ok: true, choices }
  } catch {

    return { ok: false }
  }
}

async function runPollinations(task: StoryTask, req: StoryRun): Promise<string> {
  if (task === 'summarize' || task === 'compact') {

    return callPollinationsSummarization(req.messages, req.apiKey, req.model ?? '', req.enableContextCaching, req.signal)
  }

  return callPollinations(req.messages, {
    model: req.model ?? '',
    apiKey: req.apiKey,
    allowWebSearchFallback: task === 'enrich' ? false : Boolean(req.allowWebSearchFallback),
    modeIsGame: req.modeIsGame,
    enableWebSearch: req.enableWebSearch,
    reasoningEffort: req.reasoningEffort,
    enableContextCaching: req.enableContextCaching,
    includeAnimReason: req.includeAnimReason,
    includeReasoning: req.includeReasoning,
    signal: req.signal
  })
}

async function listLocalModels(): Promise<ModelListResult> {
  return { ok: true, choices: [] }
}

async function runLocal(task: StoryTask, req: StoryRun): Promise<string> {
  if (task === 'native') {
    throw new Error('Native search is not available for this provider')
  }
  if (!req.localUrl) {
    throw new Error('Local URL is required')
  }
  if (task === 'summarize' || task === 'compact') {

    return callLocalSummarization(req.messages, {
      apiKey: req.apiKey,
      localUrl: req.localUrl,
      signal: req.signal,
      reasoningEffort: req.reasoningEffort
    })
  }

  return callLocal(req.messages, {
    model: req.model,
    apiKey: req.apiKey,
    localUrl: req.localUrl,
    modeIsGame: req.modeIsGame,
    reasoningEffort: req.reasoningEffort,
    includeAnimReason: req.includeAnimReason,
    includeReasoning: req.includeReasoning,
    signal: req.signal
  })
}
