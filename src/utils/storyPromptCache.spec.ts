import { describe, expect, it } from 'vitest'
import { fingerprintText } from '@/utils/aiReasoningUtils'
import { attachStorySummary, attachTurnContext } from '@/utils/chatAiCaller'
import { generateSystemPrompt, getHonorific, type SystemPromptParams } from '@/utils/chatUtils'
import { handleTumblingWindowSummarization } from '@/utils/tumblingWindowUtils'
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

const summaryHeader = '[PREVIOUS STORY SUMMARY - provided by the system, not written by the player]'
const summaryEnd = '[END OF SUMMARY]'

const summaryBlock = (summary: string) => `${summaryHeader}\n${summary}\n${summaryEnd}`

const assembleStoryRequest = (
  history: { role: string; content: string }[],
  summary: string,
  overrides: Partial<SystemPromptParams> = {}
) => {
  const currentUserPrompt = [...history].reverse().find((message) => message.role === 'user')?.content ?? ''
  const parts = promptFor({
    effectiveCharacterProfiles: { Rapi: characterProfiles.Rapi },
    currentLive2dId: 'c010',
    currentUserPrompt,
    ...overrides,
    chatHistory: history
  })
  const dialogueHistory = history.filter((message) => message.role !== 'system')
  let messages = [
    { role: 'system', content: parts.system },
    ...dialogueHistory.map((message) => ({ role: message.role, content: message.content }))
  ]
  messages = attachTurnContext(messages, parts.turnContext)
  messages = attachStorySummary(messages, summary)

  return messages
}

describe('attachStorySummary', () => {
  it('prepends the summary to the first user message and leaves the input untouched', () => {
    const input = [
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi' },
      { role: 'user', content: 'again' }
    ]
    const attached = attachStorySummary(input, 'The wall held.')

    expect(input.map((message) => message.content)).toEqual(['sys', 'hello', 'hi', 'again'])
    expect(attached[0]).toEqual({ role: 'system', content: 'sys' })
    expect(attached[1]).toEqual({
      role: 'user',
      content: `${summaryBlock('The wall held.')}\n\nhello`
    })
    expect(attached[2]).toEqual({ role: 'assistant', content: 'hi' })
    expect(attached[3]).toEqual({ role: 'user', content: 'again' })
  })

  it('inserts a user message when the first non-system message is an assistant message', () => {
    const input = [
      { role: 'system', content: 'sys-a' },
      { role: 'system', content: 'sys-b' },
      { role: 'assistant', content: 'done' }
    ]
    const attached = attachStorySummary(input, 'Earlier.')

    expect(input).toHaveLength(3)
    expect(input[2].content).toBe('done')
    expect(attached).toEqual([
      { role: 'system', content: 'sys-a' },
      { role: 'system', content: 'sys-b' },
      { role: 'user', content: summaryBlock('Earlier.') },
      { role: 'assistant', content: 'done' }
    ])
  })

  it('returns a copy unchanged when the summary is empty', () => {
    const input = [
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'hello' }
    ]
    const attached = attachStorySummary(input, '')

    expect(attached).not.toBe(input)
    expect(attached).toEqual(input)
  })

  it('inserts a user message after the system messages when the dialogue is empty', () => {
    const input = [{ role: 'system', content: 'sys' }]
    const attached = attachStorySummary(input, 'Earlier.')

    expect(input).toEqual([{ role: 'system', content: 'sys' }])
    expect(attached).toEqual([
      { role: 'system', content: 'sys' },
      { role: 'user', content: summaryBlock('Earlier.') }
    ])
  })
})

describe('story summary request layout', () => {
  it('keeps the system message byte-identical when the next turn gains a summary', () => {
    const open = assembleStoryRequest([{ role: 'user', content: 'Hold the line.' }], '')
    const continued = assembleStoryRequest(
      [
        { role: 'user', content: 'Hold the line.' },
        { role: 'assistant', content: 'Rapi nods.' },
        { role: 'user', content: 'What now?' }
      ],
      'The squad held the line.'
    )

    expect(continued[0].role).toBe('system')
    expect(continued[0].content).toBe(open[0].content)
    expect(continued[0].content).toContain(prompts.systemPrompt.instructions.base)
    expect(continued[0].content).not.toContain('The squad held the line.')
    expect(continued[0].content).not.toContain(summaryHeader)
    expect(open.some((message) => message.content.includes(summaryHeader))).toBe(false)
    expect(continued[1].content).toBe(`${summaryBlock('The squad held the line.')}\n\nHold the line.`)
    expect(continued[3].content).toContain('What now?')
    expect(continued[3].content).toContain(sceneHeader)
  })

  it('sends the summary written during the tumbling window, not the pre-call snapshot', async () => {
    const chatHistory: { role: string; content: string }[] = []
    for (let turn = 0; turn < 11; turn++) {
      chatHistory.push({ role: 'user', content: `User ${turn}` })
      if (turn < 10) chatHistory.push({ role: 'assistant', content: `Reply ${turn}` })
    }

    let liveSummary = ''
    const tw = await handleTumblingWindowSummarization(
      {
        tokenUsage: 'low',
        chatHistory,
        lastSummarizedIndex: 0,
        isLoadedSession: false,
        summarizationRetryPending: false,
        summarizationAttemptCount: 0,
        summarizationSuccessCount: 0,
        summaryJustCompacted: false,
        autoCompactSummaries: false,
        autoCompactFrequency: 4,
        storySummary: liveSummary,
        isStopped: false,
        compactMinLength: 1500
      },
      {
        summarizeChunk: async () => {
          liveSummary = 'Fresh summary of the sliced chunk.'

          return true
        },
        performCompaction: async () => false,
        getOverlapMessageCount: () => 0,
        setRandomLoadingMessage: () => {}
      },
      '[test]'
    )
    const summaryForRequest = liveSummary
    const messages = assembleStoryRequest(tw.historyToSend, summaryForRequest, {
      effectiveCharacterProfiles: { Rapi: characterProfiles.Rapi },
      currentLive2dId: 'c010'
    })

    expect(tw.historyToSend.map((message) => message.content)).toEqual(['User 10'])
    expect(messages[0].content).not.toContain('Fresh summary of the sliced chunk.')
    expect(messages[1].role).toBe('user')
    expect(messages[1].content.startsWith(`${summaryBlock('Fresh summary of the sliced chunk.')}\n\nUser 10`)).toBe(true)
    expect(messages.some((message) => message.content.includes('User 0'))).toBe(false)
  })
})

describe('fingerprintText', () => {
  it('is a stable 32-bit fingerprint and changes when the text changes', () => {
    expect(fingerprintText('')).toBe('811c9dc5')
    expect(fingerprintText('a')).toBe('e40c292c')
    expect(fingerprintText('foobar')).toBe('bf9cf968')
    expect(fingerprintText('a')).toBe(fingerprintText('a'))
    expect(fingerprintText('summary one')).not.toBe(fingerprintText('summary two'))
  })
})
