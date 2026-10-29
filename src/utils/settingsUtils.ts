import { tokenUsageOptions } from '@/utils/llmUtils'
import { parseStoryProviderId, type StoryProviderId } from '@/utils/storyProviders'

/** localStorage key for the mobile-optimizations toggle. */
export const MOBILE_OPTIMIZATIONS_STORAGE_KEY = 'nikke_story_gen_mobile_optimizations'

/** localStorage key for persisting the previous state before mobile optimizations was enabled. */
export const MOBILE_OPTIMIZATIONS_PREV_KEY = 'nikke_story_gen_mobile_optimizations_prev'

/** localStorage key for the story-gen Debug Mode toggle (dev builds only). */
export const DEBUG_MODE_STORAGE_KEY = 'nikke_debug_mode'

// --- Types ---

/** All settings that can be loaded from localStorage. */
export interface StoredSettings {
  mode?: 'roleplay' | 'story' | 'game'
  playbackMode?: 'auto' | 'manual'
  yapEnabled?: boolean
  hqAssets?: boolean
  ttsEnabled?: boolean
  ttsEndpoint?: string
  ttsProvider?: 'alltalk' | 'gptsovits' | 'chatterbox'
  gptSovitsEndpoint?: string
  gptSovitsBasePath?: string
  chatterboxEndpoint?: string
  tokenUsage?: string
  enableContextCaching?: boolean
  autoCompactSummaries?: boolean
  autoCompactFrequency?: number
  enableAnimationReplay?: boolean
  apiProvider?: StoryProviderId
  model?: string
  playerCharacterUseCustom?: boolean
  playerCharacterName?: string
  backgroundImagesEnabled?: boolean
  mobileOptimizations?: boolean
  debugMode?: boolean
}

/**
 * Reads all chat-related settings from localStorage and returns them as a
 * validated plain object.  Does NOT touch any refs or do any async work —
 * the caller is responsible for applying the returned values and fetching
 * model lists.
 */
export function loadSettingsFromStorage(): StoredSettings {
  const result: StoredSettings = {}

  const savedMode = localStorage.getItem('nikke_mode')
  if (savedMode === 'roleplay' || savedMode === 'story' || savedMode === 'game') {
    result.mode = savedMode
  }

  const savedPlayback = localStorage.getItem('nikke_playback_mode')
  if (savedPlayback === 'auto' || savedPlayback === 'manual') {
    result.playbackMode = savedPlayback
  }

  const savedYap = localStorage.getItem('nikke_yap_enabled')
  if (savedYap !== null) {
    result.yapEnabled = savedYap === 'true'
  }

  const savedHQAssets = localStorage.getItem('nikke_hq_assets')
  if (savedHQAssets !== null) {
    result.hqAssets = savedHQAssets === 'true'
  } else {
    result.hqAssets = false
  }

  const savedTts = localStorage.getItem('nikke_tts_enabled')
  if (savedTts !== null) {
    result.ttsEnabled = savedTts === 'true'
  }

  const savedTtsEndpoint = localStorage.getItem('nikke_tts_endpoint')
  if (savedTtsEndpoint) {
    result.ttsEndpoint = savedTtsEndpoint
  }

  const savedTtsProvider = localStorage.getItem('nikke_tts_provider')
  if (savedTtsProvider === 'alltalk' || savedTtsProvider === 'gptsovits' || savedTtsProvider === 'chatterbox') {
    result.ttsProvider = savedTtsProvider
  }

  const savedGptSovitsEndpoint = localStorage.getItem('nikke_gptsovits_endpoint')
  if (savedGptSovitsEndpoint) {
    result.gptSovitsEndpoint = savedGptSovitsEndpoint
  }

  const savedGptSovitsBasePath = localStorage.getItem('nikke_gptsovits_basepath')
  if (savedGptSovitsBasePath) {
    result.gptSovitsBasePath = savedGptSovitsBasePath
  }

  const savedChatterboxEndpoint = localStorage.getItem('nikke_chatterbox_endpoint')
  if (savedChatterboxEndpoint) {
    result.chatterboxEndpoint = savedChatterboxEndpoint
  }

  const savedTokenUsage = localStorage.getItem('nikke_token_usage')
  if (savedTokenUsage && tokenUsageOptions.some((t) => t.value === savedTokenUsage)) {
    result.tokenUsage = savedTokenUsage
  }

  const savedContextCaching = localStorage.getItem('nikke_enable_context_caching')
  if (savedContextCaching !== null) {
    result.enableContextCaching = savedContextCaching === 'true'
  }

  const savedAutoCompact = localStorage.getItem('nikke_auto_compact_summaries')
  if (savedAutoCompact !== null) {
    result.autoCompactSummaries = savedAutoCompact !== 'false'
  }

  const savedAutoCompactFreq = localStorage.getItem('nikke_auto_compact_frequency')
  if (savedAutoCompactFreq !== null) {
    const parsed = Number(savedAutoCompactFreq)
    if ([3, 4, 5, 10].includes(parsed)) {
      result.autoCompactFrequency = parsed
    }
  }

  const savedAnimationReplay = localStorage.getItem('nikke_enable_animation_replay')
  result.enableAnimationReplay = savedAnimationReplay !== 'false'

  const savedPlayerCharacterUseCustom = localStorage.getItem('nikke_player_character_use_custom')
  if (savedPlayerCharacterUseCustom !== null) {
    result.playerCharacterUseCustom = savedPlayerCharacterUseCustom === 'true'
  }

  const savedPlayerCharacterName = localStorage.getItem('nikke_player_character_name')
  if (savedPlayerCharacterName) {
    result.playerCharacterName = savedPlayerCharacterName
  }

  const savedProvider = localStorage.getItem('nikke_api_provider')
  const providerId = savedProvider ? parseStoryProviderId(savedProvider) : undefined
  if (providerId) {
    result.apiProvider = providerId
  }

  const savedModel = localStorage.getItem('nikke_model')
  if (savedModel) {
    result.model = savedModel
  }

  const savedBackgroundImages = localStorage.getItem('nikke_background_images_enabled')
  if (savedBackgroundImages !== null) {
    result.backgroundImagesEnabled = savedBackgroundImages === 'true'
  }

  const savedMobileOptimizations = localStorage.getItem(MOBILE_OPTIMIZATIONS_STORAGE_KEY)
  if (savedMobileOptimizations !== null) {
    result.mobileOptimizations = savedMobileOptimizations === 'true'
  }

  if (import.meta.env.DEV) {
    const savedDebugMode = localStorage.getItem(DEBUG_MODE_STORAGE_KEY)
    if (savedDebugMode !== null) {
      result.debugMode = savedDebugMode === 'true'
    }
  }

  return result
}
