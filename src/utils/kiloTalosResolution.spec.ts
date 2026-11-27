import { describe, expect, it } from 'vitest'
import characterProfiles from '@/utils/json/characterProfiles.json'
import {
  findCharacterByIdOrName,
  findCharacterByName,
  findCharacterIdByName,
  KILO_CHARACTER_ID,
  TALOS_CHARACTER_ID,
  TALOS_DISPLAY_NAME
} from '@/utils/characterLookupUtils'
import { generateSystemPrompt, sanitizeActions, splitNarration } from '@/utils/chatUtils'
import {
  buildCharacterCatalog,
  getBaseCharacterDisplayName,
  getCharacterDisplayName,
  getSelectionValueForBase,
  resolveCharacterIdFromInput,
  type StoryCharacterEntry
} from '@/utils/storyCharacterUtils'

const catalog = buildCharacterCatalog()

const kiloRoster: StoryCharacterEntry[] = [
  {
    key: 'kilo-1',
    selection: getSelectionValueForBase('Kilo'),
    source: 'user'
  }
]

describe('Kilo and T.A.L.O.S. character resolution', () => {
  it('resolves Kilo to c977 and T.A.L.O.S. aliases to c361', () => {
    expect(findCharacterIdByName('Kilo')).toBe(KILO_CHARACTER_ID)
    expect(findCharacterByName('Kilo')?.id).toBe(KILO_CHARACTER_ID)
    expect(findCharacterByIdOrName('Kilo')?.id).toBe(KILO_CHARACTER_ID)

    for (const alias of ['T.A.L.O.S.', 'T.A.L.O.S', 'Talos', 'talos']) {
      expect(findCharacterIdByName(alias)).toBe(TALOS_CHARACTER_ID)
      expect(findCharacterByName(alias)?.name).toBe(TALOS_DISPLAY_NAME)
      expect(resolveCharacterIdFromInput(alias, kiloRoster, catalog)).toBe(TALOS_CHARACTER_ID)
    }

    expect(findCharacterByIdOrName(TALOS_CHARACTER_ID)?.id).toBe(TALOS_CHARACTER_ID)
    expect(findCharacterByIdOrName(TALOS_CHARACTER_ID)?.name).toBe(TALOS_DISPLAY_NAME)
    expect(resolveCharacterIdFromInput('Kilo', kiloRoster, catalog)).toBe(KILO_CHARACTER_ID)
    expect(resolveCharacterIdFromInput(KILO_CHARACTER_ID, kiloRoster, catalog)).toBe(KILO_CHARACTER_ID)
    expect(resolveCharacterIdFromInput(TALOS_CHARACTER_ID, kiloRoster, catalog)).toBe(TALOS_CHARACTER_ID)
  })

  it('prefers non-filtered and non-override IDs for other duplicate character names', () => {
    expect(findCharacterIdByName('Grave')).toBe('c514')
    expect(findCharacterIdByName('Mustang')).toBe('c9022')
    expect(findCharacterIdByName('Andersen')).toBe('c942_01')
    expect(findCharacterIdByName('Oswald')).toBe('c961_01')
  })

  it('displays Kilo for c977 and T.A.L.O.S. for c361', () => {
    expect(getCharacterDisplayName(KILO_CHARACTER_ID, KILO_CHARACTER_ID, kiloRoster, catalog)).toBe('Kilo')
    expect(getBaseCharacterDisplayName(KILO_CHARACTER_ID, KILO_CHARACTER_ID, kiloRoster, catalog)).toBe('Kilo')

    expect(getCharacterDisplayName(TALOS_CHARACTER_ID, TALOS_CHARACTER_ID, kiloRoster, catalog)).toBe(TALOS_DISPLAY_NAME)
    expect(getBaseCharacterDisplayName(TALOS_CHARACTER_ID, TALOS_CHARACTER_ID, kiloRoster, catalog)).toBe(TALOS_DISPLAY_NAME)
    expect(getCharacterDisplayName('current', TALOS_CHARACTER_ID, kiloRoster, catalog)).toBe(TALOS_DISPLAY_NAME)
  })

  it('maps Kilo to c977 and T.A.L.O.S. to c361 with explicit switching guidance in generateSystemPrompt', () => {
    const onKilo = generateSystemPrompt({
      enableWebSearch: false,
      effectiveCharacterProfiles: { Kilo: characterProfiles.Kilo },
      rosterRows: kiloRoster,
      currentLive2dId: KILO_CHARACTER_ID,
      mode: 'roleplay',
      godModeEnabled: false,
      realisticModeEnabled: false,
      lowContextMode: false,
      characterCatalog: catalog
    })

    const onTalos = generateSystemPrompt({
      enableWebSearch: false,
      effectiveCharacterProfiles: { Kilo: characterProfiles.Kilo },
      rosterRows: kiloRoster,
      currentLive2dId: TALOS_CHARACTER_ID,
      mode: 'roleplay',
      godModeEnabled: false,
      realisticModeEnabled: false,
      lowContextMode: false,
      characterCatalog: catalog
    })

    expect(onKilo.system).toContain(`Kilo = ${KILO_CHARACTER_ID}`)
    expect(onKilo.system).toContain(`${TALOS_DISPLAY_NAME} = ${TALOS_CHARACTER_ID}`)
    expect(onKilo.system).not.toContain(`Kilo = ${TALOS_CHARACTER_ID}`)
    expect(onKilo.system).toContain('KILO & T.A.L.O.S.:')
    expect(onKilo.system).toBe(onTalos.system)
    expect(onTalos.turnContext).not.toContain(`Kilo = ${TALOS_CHARACTER_ID}`)
  })

  it('omits T.A.L.O.S. ID and guidance when Kilo is not in the cast', () => {
    const rapiOnly = generateSystemPrompt({
      enableWebSearch: false,
      effectiveCharacterProfiles: { Rapi: characterProfiles.Rapi },
      rosterRows: [{ key: 'rapi-1', selection: getSelectionValueForBase('Rapi'), source: 'user' }],
      currentLive2dId: 'c010',
      mode: 'roleplay',
      godModeEnabled: false,
      realisticModeEnabled: false,
      lowContextMode: false,
      characterCatalog: catalog
    })

    expect(rapiOnly.system).not.toContain(`${TALOS_DISPLAY_NAME} = ${TALOS_CHARACTER_ID}`)
    expect(rapiOnly.system).not.toContain('KILO & T.A.L.O.S.:')
  })

  it('resolves leading narration names to c977 for Kilo and c361 for T.A.L.O.S.', () => {
    const kiloNarration = splitNarration('Kilo adjusts her tablet nervously.')
    expect(kiloNarration[0]?.character).toBe(KILO_CHARACTER_ID)

    const talosNarration = splitNarration('T.A.L.O.S. steps forward and raises its shield.')
    expect(talosNarration[0]?.character).toBe(TALOS_CHARACTER_ID)

    const sanitized = sanitizeActions([
      { text: 'Kilo nods quietly.', character: 'none', animation: 'idle', speaking: false },
      { text: 'T.A.L.O.S. emits a low mechanical hum.', character: 'none', animation: 'idle', speaking: false }
    ])
    expect(sanitized[0]?.character).toBe(KILO_CHARACTER_ID)
    expect(sanitized[1]?.character).toBe(TALOS_CHARACTER_ID)
  })
})
