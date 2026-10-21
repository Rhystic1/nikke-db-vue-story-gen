import { describe, expect, it } from 'vitest'
import { counselingCatalog, findCounselingSession } from '@/utils/counselingScript'
import { attachCounselingScene, counselingSceneAnchor, parseCounselingSceneAnchor } from '@/utils/counselingScene'
import { buildSessionExportData, type BuildSessionExportParams } from '@/utils/sessionUtils'

const rapiScene = '[Location: the Command Center at the Outpost. Characters present in the scene: Rapi, the Commander]'

const maryScene = '[Location: the Command Center at the Outpost. Characters present in the scene: Mary, the Commander]'

const maryBayGoddessScene = '[Location: Blue Water Island. Characters present in the scene: Mary: Bay Goddess, the Commander]'

const guiltyScene = '[Location: the Command Center at the Outpost. Characters present in the scene: Guilty, the Commander]'

const adeScene = '[Location: Coin Rush. Characters present in the scene: Ade: Agent Bunny, the Commander]'

const snowWhiteScene = `[Location: The Wings of Victory interior. Characters present in the scene: Snow White: Innocent Days, the Goddess Commander]
This session is a flashback in which the player stands in as the Goddess Commander.`

const scarletShipScene = `[Location: The Wings of Victory interior. Characters present in the scene: Scarlet: Black Shadow, the Goddess Commander]
This session is a flashback in which the player stands in as the Goddess Commander.`

const scarletFieldScene = `[Location: a flower field. Characters present in the scene: Scarlet: Black Shadow, the Goddess Commander]
This session is a flashback in which the player stands in as the Goddess Commander.`

const nihilisterScene = `[Location: a volcanic area. Characters present in the scene: Nihilister, the Commander, Anis, Rapi, Neon]
Anis, Rapi, and Neon are in the background and are not participating, though they may be spoken to later.`

const crownScene = `[Location: a wasteland area. Characters present in the scene: Crown, the Commander, Anis, Rapi, Neon, Chime]
Anis, Rapi, Neon, and Chime are in the background and are not participating, though they may be spoken to later.`

const chimeScene = `[Location: a wasteland area. Characters present in the scene: Chime, the Commander, Anis, Rapi, Neon, Crown]
Anis, Rapi, Neon, and Crown are in the background and are not participating, though they may be spoken to later.`

const redHoodScene = '[Location: a wasteland area. Characters present in the scene: Red Hood, the Commander]'

const littleMermaidScene = `[Location: The Bubble Garden. Characters present in the scene: Little Mermaid]
The player is choosing what she does to distract herself from her crushing isolation. She had not met the protagonist before her escape, so the protagonist does not appear.`

const miharaScene = `[Location: the Command Center at the Outpost. Characters present in the scene: Mihara: Bonding Chain, the Commander]
This session is a hazy flashback of a conversation with the protagonist from before the side story Wordless, distorted by memory wipes and neural damage.`

const dorothyScene = `[Location: The Utopia cruise ship. Characters present in the scene: Dorothy: Serendipity, the Commander, Elegg: Boom and Shock, Rapi: Red Hood, Tove, Centi, Yan, Frima]
Elegg: Boom and Shock, Rapi: Red Hood, Tove, Centi, Yan, and Frima are in the background and are not participating, though they may be spoken to later.
Elegg: Boom and Shock, Rapi: Red Hood, Tove, Centi, Yan, and Frima are in swimming suits.
Dorothy: Serendipity's default skin is already a swimsuit.`

const eleggScene = `[Location: The Utopia cruise ship. Characters present in the scene: Elegg: Boom and Shock, the Commander, Dorothy: Serendipity, Rapi: Red Hood, Tove, Centi, Yan, Frima]
Dorothy: Serendipity, Rapi: Red Hood, Tove, Centi, Yan, and Frima are in the background and are not participating, though they may be spoken to later.
Rapi: Red Hood, Tove, Centi, Yan, and Frima are in swimming suits.
Dorothy: Serendipity's default skin is already a swimsuit.`

const nayutaScene = `[Location: Aboard Whaley's back. Characters present in the scene: Nayuta, the Commander, Rapi: Red Hood, Maxwell: Ordinary Mechanic, Drake: Great Villain, Laplace: Ultimate Hero]
Rapi: Red Hood, Maxwell: Ordinary Mechanic, Drake: Great Villain, and Laplace: Ultimate Hero are in the background and are not participating, though they may be spoken to later.`

const scenes: Array<[string, string]> = [
  ['d_counseling_rapi_01', rapiScene],
  ['d_counseling_mary_01', maryScene],
  ['d_counseling_mary_baygoddess_01', maryBayGoddessScene],
  ['d_counseling_guilty_01', guiltyScene],
  ['d_counseling_ade_agentbunny_01', adeScene],
  ['d_counseling_snowwhite_young_01', snowWhiteScene],
  ['d_counseling_hongryeon_blackshadow_01', scarletShipScene],
  ['d_counseling_hongryeon_blackshadow_11', scarletFieldScene],
  ['d_counseling_nihilister_01', nihilisterScene],
  ['d_counseling_crown_01', crownScene],
  ['d_counseling_chime_01', chimeScene],
  ['d_counseling_redhood_01', redHoodScene],
  ['d_counseling_littlemermaid_01', littleMermaidScene],
  ['d_counseling_mihara_bondingchain_01', miharaScene],
  ['d_counseling_dorothy_serendipity_01', dorothyScene],
  ['d_Counseling_elegg_boomandshock_01', eleggScene],
  ['d_counseling_nayuta_01', nayutaScene]
]

const promptMessages = () => [
  { role: 'system', content: 'prompt' },
  { role: 'assistant', content: 'line' }
]

const sceneFor = (sessionId: string) => {
  const found = findCounselingSession(counselingCatalog, sessionId)
  if (found === null) {
    throw new Error(`Missing counseling session ${sessionId}`)
  }

  return counselingSceneAnchor(found.character, found.session)
}

const exportParams = (counselingSessionId?: string): BuildSessionExportParams => {
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
    apiProvider: 'gemini',
    model: 'test',
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
  if (counselingSessionId !== undefined) {
    params.counselingSessionId = counselingSessionId
  }

  return params
}

describe('counseling scene', () => {
  it.each(scenes)('inserts the scene for %s', (sessionId, content) => {
    const attached = attachCounselingScene(promptMessages(), sceneFor(sessionId))
    expect(attached).toEqual([
      { role: 'system', content: 'prompt' },
      { role: 'assistant', content },
      { role: 'assistant', content: 'line' }
    ])
  })

  it('leaves the input array unchanged', () => {
    const input = promptMessages()
    const before = input.map((message) => ({ role: message.role, content: message.content }))
    const attached = attachCounselingScene(input, sceneFor('d_counseling_rapi_01'))
    expect(input).toHaveLength(2)
    expect(input).toEqual(before)
    expect(attached).toHaveLength(3)
  })

  it('does not insert the scene twice', () => {
    const once = attachCounselingScene(promptMessages(), sceneFor('d_counseling_rapi_01'))
    const twice = attachCounselingScene(once, sceneFor('d_counseling_rapi_01'))
    expect(twice).toEqual(once)
    expect(twice.filter((message) => message.content === rapiScene)).toHaveLength(1)
  })

  it('adds no turn when the anchor is null', () => {
    const input = promptMessages()
    const attached = attachCounselingScene(input, null)
    expect(attached).toEqual([
      { role: 'system', content: 'prompt' },
      { role: 'assistant', content: 'line' }
    ])
    attached.push({ role: 'user', content: 'later' })
    expect(input).toHaveLength(2)
    expect(input).toEqual([
      { role: 'system', content: 'prompt' },
      { role: 'assistant', content: 'line' }
    ])
  })

  it('treats a missing save field as absent', () => {
    expect(parseCounselingSceneAnchor(undefined)).toEqual({ status: 'absent' })
    expect(parseCounselingSceneAnchor(null)).toEqual({ status: 'absent' })
  })

  it('rejects an id that is not a catalog session', () => {
    expect(parseCounselingSceneAnchor(' d_counseling_rapi_01')).toEqual({ status: 'rejected' })
    expect(parseCounselingSceneAnchor('nope')).toEqual({ status: 'rejected' })
    expect(parseCounselingSceneAnchor('')).toEqual({ status: 'rejected' })
    expect(parseCounselingSceneAnchor('   ')).toEqual({ status: 'rejected' })
    expect(parseCounselingSceneAnchor(12)).toEqual({ status: 'rejected' })
  })

  it('restores a catalog id into the Rapi scene', () => {
    const parsed = parseCounselingSceneAnchor('d_counseling_rapi_01')
    expect(parsed.status).toBe('ready')
    if (parsed.status !== 'ready') {
      throw new Error('expected a ready counseling scene')
    }
    expect(parsed.anchor.sessionId).toBe('d_counseling_rapi_01')
    const attached = attachCounselingScene(promptMessages(), parsed.anchor)
    expect(attached[1]).toEqual({ role: 'assistant', content: rapiScene })
  })

  it('saves the session id without the scene sentence', () => {
    const saved = buildSessionExportData(exportParams('d_counseling_rapi_01'))
    expect(saved.counselingSessionId).toBe('d_counseling_rapi_01')
    expect(JSON.stringify(saved)).not.toContain('Characters present')
    const omitted = buildSessionExportData(exportParams())
    expect(Object.prototype.hasOwnProperty.call(omitted, 'counselingSessionId')).toBe(false)
  })
})
