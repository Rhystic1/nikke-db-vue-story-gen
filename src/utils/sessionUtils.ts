import { tokenUsageOptions } from '@/utils/llmUtils'
import { normalizeOpenRouterSpeed, type OpenRouterSpeed } from '@/utils/providerConfigUtils'
import { parseStoryProviderId, restoredModel, type ModelChoice, type StoryProviderId } from '@/utils/storyProviders'
import { type StoryCharacterEntry } from '@/utils/storyCharacterUtils'

export interface ChatMessage {
  role: string
  content: string
  animation?: string
  character?: string
  speaking?: boolean
  text?: string
  background?: string | { key: string; variant?: string }
}

export interface SessionSettings {
  apiProvider: string
  model: string
  playbackMode: string
  yapEnabled: boolean
  ttsEnabled: boolean
  ttsEndpoint: string
  ttsProvider: string
  gptSovitsEndpoint: string
  gptSovitsBasePath: string
  tokenUsage: string
  enableContextCaching: boolean
  allowWebSearchFallback: boolean
  reasoningEffort: string
  openRouterSpeed: OpenRouterSpeed
  autoCompactSummaries: boolean
  autoCompactFrequency: number
}

export interface SessionData {
  chatHistory: any[]
  characterProfiles: Record<string, string>
  characterProgression: any
  storySummary: string
  lastSummarizedIndex: number
  summarizationSuccessCount: number
  summaryJustCompacted: boolean
  mode: string
  timestamp: string
  rosterRows: StoryCharacterEntry[]
  playerCharacter?: PlayerCharacterSessionState
  settings: SessionSettings
  counselingSessionId?: string
}

export interface PlayerCharacterSessionState {
  useCustomCharacter: boolean
  characterName?: string
}

/** Parameters for building the session export data. */
export interface BuildSessionExportParams {
  chatHistory: ChatMessage[]
  characterProfiles: Record<string, string>
  characterProgression: any
  storySummary: string
  lastSummarizedIndex: number
  summarizationSuccessCount: number
  summaryJustCompacted: boolean
  mode: string
  rosterRows: StoryCharacterEntry[]
  playerCharacter: PlayerCharacterSessionState
  enableAnimationReplay: boolean
  apiProvider: string
  model: string
  playbackMode: string
  yapEnabled: boolean
  ttsEnabled: boolean
  ttsEndpoint: string
  ttsProvider: string
  gptSovitsEndpoint: string
  gptSovitsBasePath: string
  tokenUsage: string
  enableContextCaching: boolean
  allowWebSearchFallback: boolean
  reasoningEffort: string
  openRouterSpeed: OpenRouterSpeed
  autoCompactSummaries: boolean
  autoCompactFrequency: number
  counselingSessionId?: string
}

// --- Export (save) helpers ---

/**
 * Returns true if a system message should be excluded from exported session files
 * (e.g. "Session restored successfully." or model-unavailable warnings).
 */
export function shouldExcludeFromExport(msg: any): boolean {
  if (msg?.role !== 'system' || typeof msg?.content !== 'string') return false

  const content = msg.content

  if (content === 'Session restored successfully.') return true
  if (content.startsWith('Warning: Saved model \'') && content.endsWith('Using default.')) return true

  return false
}

/**
 * Builds the plain JSON-serialisable session data object from the supplied
 * component state.  This is a pure function with no side-effects.
 */
export function buildSessionExportData(params: BuildSessionExportParams): SessionData {
  const exportedChatHistory = params.chatHistory
    .filter((msg) => !shouldExcludeFromExport(msg))
    .map((msg) => {
      if (!params.enableAnimationReplay) {
        // Old format: just role and content
        return { role: msg.role, content: msg.content }
      } else {
        // New format: remove content if text is present to save space
        if (msg.role === 'assistant' && msg.text) {
          const rest = { ...msg }
          delete (rest as any).content
          return rest
        }
        return msg
      }
    })

  const sessionData: SessionData = {
    chatHistory: exportedChatHistory,
    characterProfiles: params.characterProfiles,
    characterProgression: params.characterProgression,
    storySummary: params.storySummary,
    lastSummarizedIndex: params.lastSummarizedIndex,
    summarizationSuccessCount: params.summarizationSuccessCount,
    summaryJustCompacted: params.summaryJustCompacted,
    mode: params.mode,
    timestamp: new Date().toISOString(),
    rosterRows: params.rosterRows,
    playerCharacter: params.playerCharacter,
    settings: {
      apiProvider: params.apiProvider,
      model: params.model,
      playbackMode: params.playbackMode,
      yapEnabled: params.yapEnabled,
      ttsEnabled: params.ttsEnabled,
      ttsEndpoint: params.ttsEndpoint,
      ttsProvider: params.ttsProvider,
      gptSovitsEndpoint: params.gptSovitsEndpoint,
      gptSovitsBasePath: params.gptSovitsBasePath,
      tokenUsage: params.tokenUsage,
      enableContextCaching: params.enableContextCaching,
      allowWebSearchFallback: params.allowWebSearchFallback,
      reasoningEffort: params.reasoningEffort,
      openRouterSpeed: params.openRouterSpeed,
      autoCompactSummaries: params.autoCompactSummaries,
      autoCompactFrequency: params.autoCompactFrequency
    }
  }

  if (typeof params.counselingSessionId === 'string' && params.counselingSessionId !== '') {
    sessionData.counselingSessionId = params.counselingSessionId
  }

  return sessionData
}

/**
 * Triggers a browser download of the given session data as a JSON file.
 */
export function downloadSessionFile(sessionData: SessionData): void {
  const blob = new Blob([JSON.stringify(sessionData, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const now = new Date()
  const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}`
  a.download = `nikke-session-${timestamp}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// --- Import (restore) helpers ---

/**
 * Reconstructs chat messages from stored format.  When animation replay data
 * is present (`text` field without `content`), we rebuild `content` from the
 * character name and the stored text.
 *
 * @param messages   Raw chat messages from the JSON file.
 * @param getCharName  Function to resolve a character ID to its display name.
 */
export function reconstructChatHistory(messages: any[], getCharName: (id: string) => string | null): ChatMessage[] {
  return messages.map((msg: any) => {
    if (!msg.content && msg.text) {
      // Reconstruct content
      let reconstructedContent = msg.text
      if (msg.speaking && msg.character && msg.character !== 'none') {
        const name = getCharName(msg.character)
        if (name) {
          // Check if the text already starts with the name to avoid duplication
          const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          const namePattern = new RegExp(`^\\**${escapedName}\\**\\s*:`, 'i')
          const anyNamePattern = /^\*\*\s*[^*]+\s*\*\*:/

          if (!namePattern.test(reconstructedContent) && !anyNamePattern.test(reconstructedContent)) {
            reconstructedContent = `**${name}:** ${reconstructedContent}`
          }
        }
      }
      return { ...msg, content: reconstructedContent }
    }
    return msg
  })
}

/** The validated settings that should be applied after restoring a session. */
export interface ValidatedSessionSettings {
  playbackMode?: 'auto' | 'manual'
  yapEnabled?: boolean
  ttsEnabled?: boolean
  ttsEndpoint?: string
  ttsProvider?: 'alltalk' | 'gptsovits'
  gptSovitsEndpoint?: string
  gptSovitsBasePath?: string
  tokenUsage?: string
  enableContextCaching?: boolean
  allowWebSearchFallback?: boolean
  reasoningEffort?: string
  openRouterSpeed?: OpenRouterSpeed
  autoCompactSummaries?: boolean
  autoCompactFrequency?: number
  apiProvider?: StoryProviderId
  model?: string
  backgroundImagesEnabled?: boolean
  modelWarning?: string
}

export type ApplyValidatedSessionSettingsParams = {
  validated: ValidatedSessionSettings
  playbackMode: { value: string }
  setYapEnabled: (value: boolean) => void
  ttsEnabled: { value: boolean }
  ttsEndpoint: { value: string }
  ttsProvider: { value: 'alltalk' | 'gptsovits' | 'chatterbox' }
  gptSovitsEndpoint: { value: string }
  gptSovitsBasePath: { value: string }
  tokenUsage: { value: string }
  enableContextCaching: { value: boolean }
  allowWebSearchFallback: { value: boolean }
  reasoningEffort: { value: string }
  openRouterSpeed: { value: OpenRouterSpeed }
  autoCompactSummaries: { value: boolean }
  autoCompactFrequency: { value: number }
  apiProvider: { value: StoryProviderId }
  model: { value: string }
}

export function applyValidatedSessionSettings(params: ApplyValidatedSessionSettingsParams): string | undefined {
  const { validated } = params

  if (validated.playbackMode !== undefined) params.playbackMode.value = validated.playbackMode
  if (validated.yapEnabled !== undefined) params.setYapEnabled(validated.yapEnabled)
  if (validated.ttsEnabled !== undefined) params.ttsEnabled.value = validated.ttsEnabled
  if (validated.ttsEndpoint !== undefined) params.ttsEndpoint.value = validated.ttsEndpoint
  if (validated.ttsProvider !== undefined) params.ttsProvider.value = validated.ttsProvider as 'alltalk' | 'gptsovits' | 'chatterbox'
  if (validated.gptSovitsEndpoint !== undefined) params.gptSovitsEndpoint.value = validated.gptSovitsEndpoint
  if (validated.gptSovitsBasePath !== undefined) params.gptSovitsBasePath.value = validated.gptSovitsBasePath
  if (validated.tokenUsage !== undefined) params.tokenUsage.value = validated.tokenUsage
  if (validated.enableContextCaching !== undefined) params.enableContextCaching.value = validated.enableContextCaching
  if (validated.allowWebSearchFallback !== undefined) params.allowWebSearchFallback.value = validated.allowWebSearchFallback
  if (validated.reasoningEffort !== undefined) params.reasoningEffort.value = validated.reasoningEffort
  if (validated.openRouterSpeed !== undefined) params.openRouterSpeed.value = validated.openRouterSpeed
  if (validated.autoCompactSummaries !== undefined) params.autoCompactSummaries.value = validated.autoCompactSummaries
  if (validated.autoCompactFrequency !== undefined) params.autoCompactFrequency.value = validated.autoCompactFrequency
  if (validated.apiProvider !== undefined) params.apiProvider.value = validated.apiProvider
  if (validated.model !== undefined) params.model.value = validated.model

  return validated.modelWarning
}

export function validatePlayerCharacterState(value: any): PlayerCharacterSessionState {
  const fallback: PlayerCharacterSessionState = {
    useCustomCharacter: false
  }

  if (!value || typeof value !== 'object') return fallback

  const useCustomCharacter = value.useCustomCharacter === true
  const characterName = typeof value.characterName === 'string' && value.characterName.trim() ? value.characterName.trim() : undefined

  if (!useCustomCharacter) return fallback
  if (!characterName) return fallback

  return {
    useCustomCharacter: true,
    characterName
  }
}

export type SessionFileSettings = {
  playbackMode?: string
  yapEnabled?: boolean
  ttsEnabled?: boolean
  ttsEndpoint?: string
  ttsProvider?: string
  gptSovitsEndpoint?: string
  gptSovitsBasePath?: string
  tokenUsage?: string
  enableContextCaching?: boolean
  allowWebSearchFallback?: boolean
  reasoningEffort?: string
  openRouterSpeed?: unknown
  autoCompactSummaries?: boolean
  autoCompactFrequency?: number
  backgroundImagesEnabled?: boolean
  apiProvider?: string
  model?: string
}

export function validateSessionSettings(settings: SessionFileSettings | null | undefined, catalog: readonly ModelChoice[]): ValidatedSessionSettings {
  const result: ValidatedSessionSettings = {}

  if (!settings) return result

  // Simple settings
  if (settings.playbackMode === 'auto' || settings.playbackMode === 'manual') {
    result.playbackMode = settings.playbackMode
  }
  if (typeof settings.yapEnabled === 'boolean') {
    result.yapEnabled = settings.yapEnabled
  }
  if (typeof settings.ttsEnabled === 'boolean') {
    result.ttsEnabled = settings.ttsEnabled
  }
  if (settings.ttsEndpoint) {
    result.ttsEndpoint = settings.ttsEndpoint
  }
  if (settings.ttsProvider === 'alltalk' || settings.ttsProvider === 'gptsovits') {
    result.ttsProvider = settings.ttsProvider
  }
  if (settings.gptSovitsEndpoint) {
    result.gptSovitsEndpoint = settings.gptSovitsEndpoint
  }
  if (settings.gptSovitsBasePath) {
    result.gptSovitsBasePath = settings.gptSovitsBasePath
  }
  if (settings.tokenUsage && tokenUsageOptions.some((t) => t.value === settings.tokenUsage)) {
    result.tokenUsage = settings.tokenUsage
  }
  if (typeof settings.enableContextCaching === 'boolean') {
    result.enableContextCaching = settings.enableContextCaching
  }
  if (typeof settings.allowWebSearchFallback === 'boolean') {
    result.allowWebSearchFallback = settings.allowWebSearchFallback
  }
  if (settings.reasoningEffort) {
    result.reasoningEffort = settings.reasoningEffort
  }
  result.openRouterSpeed = normalizeOpenRouterSpeed(settings.openRouterSpeed)
  if (typeof settings.autoCompactSummaries === 'boolean') {
    result.autoCompactSummaries = settings.autoCompactSummaries
  }
  if (typeof settings.autoCompactFrequency === 'number' && [3, 4, 5, 10].includes(settings.autoCompactFrequency)) {
    result.autoCompactFrequency = settings.autoCompactFrequency
  }
  if (typeof settings.backgroundImagesEnabled === 'boolean') {
    result.backgroundImagesEnabled = settings.backgroundImagesEnabled
  }

  const id = parseStoryProviderId(String(settings?.apiProvider ?? ''))
  if (id) {
    result.apiProvider = id
    const savedModel = typeof settings.model === 'string' ? settings.model : undefined
    const decision = restoredModel(id, savedModel, catalog)
    if (decision.model) {
      result.model = decision.model
    }
    if (decision.warning) {
      result.modelWarning = `Warning: ${decision.warning}`
    }
  }

  return result
}

/**
 * Adjusts `lastSummarizedIndex` after a restore to ensure a minimum context
 * window of messages is available.
 */
export function adjustLastSummarizedIndex(chatHistoryLength: number, lastSummarizedIndex: number, tokenUsage: string, safeBuffer: number = 10): number {
  if (tokenUsage === 'goddess' || chatHistoryLength === 0) {
    return lastSummarizedIndex
  }
  if (chatHistoryLength - lastSummarizedIndex < safeBuffer) {
    const adjusted = Math.max(0, chatHistoryLength - safeBuffer)
    console.log(`[Restore] Adjusted lastSummarizedIndex to ${adjusted} to ensure context buffer`)
    return adjusted
  }
  return lastSummarizedIndex
}
