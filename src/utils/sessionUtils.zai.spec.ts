import { describe, expect, it } from 'vitest'
import { buildSessionExportData, validateSessionSettings, type BuildSessionExportParams, type SessionFileSettings } from '@/utils/sessionUtils'

const exportParams = (zaiKeyPlan?: BuildSessionExportParams['zaiKeyPlan']): BuildSessionExportParams => {
  const params: BuildSessionExportParams = {
    chatHistory: [],
    characterProfiles: {},
    characterProgression: {},
    storySummary: '',
    lastSummarizedIndex: 0,
    summarizationSuccessCount: 0,
    summaryJustCompacted: false,
    mode: 'game',
    rosterRows: [],
    playerCharacter: { useCustomCharacter: false },
    enableAnimationReplay: false,
    apiProvider: 'zai',
    model: 'glm-5.3',
    playbackMode: 'manual',
    yapEnabled: false,
    ttsEnabled: false,
    ttsEndpoint: '',
    ttsProvider: '',
    gptSovitsEndpoint: '',
    gptSovitsBasePath: '',
    tokenUsage: 'normal',
    enableContextCaching: false,
    allowWebSearchFallback: false,
    reasoningEffort: 'none',
    openRouterSpeed: 'default',
    autoCompactSummaries: false,
    autoCompactFrequency: 1
  }
  if (zaiKeyPlan !== undefined) {
    params.zaiKeyPlan = zaiKeyPlan
  }

  return params
}

describe('Z.AI key plan in session files', () => {
  it('writes coding into the exported settings', () => {
    const saved = buildSessionExportData(exportParams('coding'))

    expect(saved.settings.zaiKeyPlan).toBe('coding')
  })

  it('keeps coding when that session file is validated', () => {
    const saved = buildSessionExportData(exportParams('coding'))

    expect(validateSessionSettings(saved.settings, []).zaiKeyPlan).toBe('coding')
  })

  it('drops a garbage key plan', () => {
    const saved = buildSessionExportData(exportParams('coding'))
    const garbage: SessionFileSettings = { ...saved.settings, zaiKeyPlan: 'nope' }

    expect(validateSessionSettings(garbage, []).zaiKeyPlan).toBeUndefined()
  })

  it('leaves the key plan unset when the file omits it', () => {
    const saved = buildSessionExportData(exportParams())

    expect(saved.settings.zaiKeyPlan).toBeUndefined()
    expect(validateSessionSettings(saved.settings, []).zaiKeyPlan).toBeUndefined()
  })
})
