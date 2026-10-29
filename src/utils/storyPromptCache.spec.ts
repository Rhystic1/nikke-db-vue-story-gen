import { describe, expect, it } from 'vitest'
import { attachTurnContext } from '@/utils/chatAiCaller'
import { generateSystemPrompt, getHonorific, type SystemPromptParams } from '@/utils/chatUtils'
import characterProfiles from '@/utils/json/characterProfiles.json'
import prompts from '@/utils/json/prompts.json'
import type { CharacterCatalog } from '@/utils/storyCharacterUtils'

const catalog: CharacterCatalog = {
  baseMap: {},
  variants: [],
  idToName: {},
  nameToId: {},
  baseNames: []
}

const baseParams = (): SystemPromptParams => ({
  enableWebSearch: false,
  effectiveCharacterProfiles: {},
  rosterRows: [],
  currentLive2dId: '',
  mode: 'roleplay',
  godModeEnabled: false,
  realisticModeEnabled: false,
  lowContextMode: false,
  characterCatalog: catalog,
  currentUserPrompt: '',
  chatHistory: []
})

const promptFor = (overrides: Partial<SystemPromptParams> = {}) => {
  const params = {
    ...baseParams(),
    ...overrides
  }

  return generateSystemPrompt(params)
}

const sceneHeader = '[SCENE CONTEXT FOR THIS TURN — provided by the system, not written by the player]'

describe('generateSystemPrompt cache layout', () => {
  it('keeps system byte-identical when only the on-screen character changes', () => {
    const profiles = { Rapi: characterProfiles.Rapi }
    const onRapi = promptFor({
      effectiveCharacterProfiles: profiles,
      currentLive2dId: 'c010'
    })
    const onNeon = promptFor({
      effectiveCharacterProfiles: profiles,
      currentLive2dId: 'c011'
    })

    expect(onRapi.system).toBe(onNeon.system)
    expect(onNeon.turnContext).not.toBe(onRapi.turnContext)
    expect(onRapi.system).toContain('Rapi = c010')
    expect(onRapi.system).not.toContain('Neon = c011')
    expect(onNeon.turnContext).toContain('Neon = c011')
    expect(onNeon.turnContext).toContain(JSON.stringify({ Neon: getHonorific('Neon') }, null, 2))
    expect(onRapi.turnContext).not.toContain('Neon = c011')
  })

  it('keeps system byte-identical when the user prompt makes a different location relevant', () => {
    const outpost = promptFor({ currentUserPrompt: 'We reached the Outpost.' })
    const ark = promptFor({ currentUserPrompt: 'We returned to the Ark.' })

    expect(outpost.system).toBe(ark.system)
    expect(outpost.system).not.toContain(prompts.systemPrompt.knownLocations)
    expect(outpost.turnContext).toContain(prompts.systemPrompt.knownLocations)
    expect(outpost.turnContext).toContain('"The Outpost"')
    expect(ark.turnContext).toContain('"The Ark"')
    expect(outpost.turnContext).not.toContain('"The Ark"')
    expect(ark.turnContext).not.toContain('"The Outpost"')
  })

  it('keeps system byte-identical when recent chat makes a different location relevant', () => {
    const outpost = promptFor({
      currentUserPrompt: 'What happens next?',
      chatHistory: [{ role: 'user', content: 'We reached the Outpost.' }]
    })
    const ark = promptFor({
      currentUserPrompt: 'What happens next?',
      chatHistory: [{ role: 'user', content: 'We returned to the Ark.' }]
    })

    expect(outpost.system).toBe(ark.system)
    expect(outpost.turnContext).not.toBe(ark.turnContext)
    expect(outpost.turnContext).toContain('"The Outpost"')
    expect(ark.turnContext).toContain('"The Ark"')
  })

  it('places stable instructions before the profiles JSON', () => {
    const { system } = promptFor({
      effectiveCharacterProfiles: { Rapi: characterProfiles.Rapi },
      currentLive2dId: 'c010'
    })
    const instructionsAt = system.indexOf(prompts.systemPrompt.instructions.base)
    const profilesHeaderAt = system.indexOf(prompts.systemPrompt.knownProfiles)
    const profileBodyAt = system.indexOf(characterProfiles.Rapi.personality)

    expect(instructionsAt).toBeGreaterThanOrEqual(0)
    expect(profilesHeaderAt).toBeGreaterThan(instructionsAt)
    expect(profileBodyAt).toBeGreaterThan(profilesHeaderAt)
    expect(system).toContain('from the CHARACTER HONORIFICS list')
    expect(system).toContain('from the CHARACTER ID REFERENCE,')
    expect(system).not.toContain('from the list above')
    expect(system).not.toContain('CHARACTER ID REFERENCE above')
  })

  it('keeps the background scene list out of system when the current background changes', () => {
    const backgroundImageMap = new Map<string, File>([
      ['Ark.png', new File([], 'Ark.png')],
      ['AmusementPark.png', new File([], 'AmusementPark.png')]
    ])
    const ark = promptFor({
      backgroundImagesEnabled: true,
      backgroundImageMap,
      currentBackgroundFilename: 'Ark.png'
    })
    const park = promptFor({
      backgroundImagesEnabled: true,
      backgroundImageMap,
      currentBackgroundFilename: 'AmusementPark.png'
    })

    expect(ark.system).toBe(park.system)
    expect(ark.system).toContain('BACKGROUND IMAGES ACTIVE:')
    expect(ark.system).not.toContain('Available Background Scene Keys:')
    expect(ark.turnContext).toContain('Available Background Scene Keys:')
    expect(ark.turnContext).toContain('Current Background Scene:')
    expect(ark.turnContext).not.toBe(park.turnContext)
  })
})

describe('attachTurnContext', () => {
  it('appends the scene block to the last user message without mutating the input', () => {
    const input = [
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'hello' }
    ]
    const attached = attachTurnContext(input, 'Current Character: c010.')

    expect(input.map((message) => message.content)).toEqual(['sys', 'hello'])
    expect(attached).toHaveLength(2)
    expect(attached[0].content).toBe('sys')
    expect(attached[1].role).toBe('user')
    expect(attached[1].content).toBe(`hello\n\n${sceneHeader}\nCurrent Character: c010.`)
  })

  it('pushes a user message when the last message is not a user message', () => {
    const input = [
      { role: 'system', content: 'sys' },
      { role: 'assistant', content: 'done' }
    ]
    const attached = attachTurnContext(input, 'scene')

    expect(input).toHaveLength(2)
    expect(input[1].content).toBe('done')
    expect(attached).toHaveLength(3)
    expect(attached[2]).toEqual({
      role: 'user',
      content: `${sceneHeader}\nscene`
    })
  })
})
