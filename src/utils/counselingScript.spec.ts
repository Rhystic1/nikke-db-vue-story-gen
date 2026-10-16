import { describe, expect, it } from 'vitest'
import { resolveAiBackgroundSelection } from '@/utils/storyBackgroundUtils'
import {
  choiceJumpTarget,
  counselingCatalog,
  counselingLineById,
  findCounselingSession,
  parseCounselingCatalog,
  traceCounselingPaths
} from '@/utils/counselingScript'

const session = (id: string) => {
  const found = findCounselingSession(counselingCatalog, id)
  if (!found) throw new Error(`missing ${id}`)

  return found.session
}

const line = (sessionId: string, lineId: string) => {
  const found = counselingLineById(session(sessionId), lineId)
  if (!found) throw new Error(`missing ${lineId}`)

  return found
}

describe('counseling catalog', () => {
  it('groups Chime sessions for the preset menu', () => {
    const chime = counselingCatalog.characters.find((character) => character.name === 'Chime')

    expect(chime?.id).toBe('c331')
    expect(chime?.selection).toBe('base::Chime')
    expect(chime?.sessions).toHaveLength(20)
  })

  it('keeps every branch reachable and every choice pointed at a real line', () => {
    const chime = counselingCatalog.characters.find((character) => character.name === 'Chime')
    const lines = chime?.sessions.flatMap((entry) => entry.lines) ?? []
    const choices = lines.flatMap((entry) => ('choices' in entry ? entry.choices : []))

    expect(lines).toHaveLength(196)
    expect(choices).toHaveLength(40)

    for (const character of counselingCatalog.characters) {
      for (const entry of character.sessions) {
        const reached = new Set(traceCounselingPaths(entry).flat())
        expect([...reached].sort()).toEqual(entry.lines.map((item) => item.id).sort())
      }
    }
  })

  it('uses the story-gen background object on the desert open and the clear', () => {
    const chime = counselingCatalog.characters.find((character) => character.name === 'Chime')
    const openings = chime?.sessions.map((entry) => counselingLineById(entry, entry.openingLineId)) ?? []
    const backgrounds = chime?.sessions.flatMap((entry) => entry.lines.map((item) => item.background?.key)) ?? []

    expect(openings.every((item) => item?.background?.key === 'Desert_02')).toBe(true)
    expect(backgrounds.filter((key) => key === 'Desert_02')).toHaveLength(20)
    expect(backgrounds.filter((key) => key === 'none')).toHaveLength(20)
    expect(line('d_counseling_chime_01', 'd_counseling_chime_01_10').background).toEqual({ key: 'none' })
    expect(line('d_counseling_chime_01', 'd_counseling_chime_01_10').character).toBe('none')
    expect(line('d_counseling_chime_01', 'd_counseling_chime_01_10').speaking).toBe(false)

    const available = ['Desert_02.png', 'Desert_02_n.png']
    expect(resolveAiBackgroundSelection({ background: { key: 'Desert_02' }, availableFilenames: available })).toMatchObject({
      action: 'apply',
      filename: 'Desert_02.png'
    })
    expect(resolveAiBackgroundSelection({ background: { key: 'none' }, availableFilenames: available }).action).toBe('clear')
  })

  it('walks session 1 and the verified Chime branches', () => {
    const paths = traceCounselingPaths(session('d_counseling_chime_01')).map((path) => path.join(','))

    expect(session('d_counseling_chime_02').blurb).toBe('Truly, the more I behold Her Highness, the more splendid she seemeth.')
    expect(paths).toEqual([
      [
        'd_counseling_chime_01_1',
        'd_counseling_chime_01_2',
        'd_counseling_chime_01_5',
        'd_counseling_chime_01_6',
        'd_counseling_chime_01_7',
        'd_counseling_chime_01_10'
      ].join(','),
      [
        'd_counseling_chime_01_1',
        'd_counseling_chime_01_2',
        'd_counseling_chime_01_8',
        'd_counseling_chime_01_9',
        'd_counseling_chime_01_10'
      ].join(',')
    ])

    const ability = line('d_counseling_chime_03', 'd_counseling_chime_03_2')
    expect(choiceJumpTarget(ability, 'Your ability to assist Crown flawlessly?')).toBe('d_counseling_chime_03_5')
    expect(choiceJumpTarget(ability, 'Your quick reflexes?')).toBe('d_counseling_chime_03_8')

    const food = line('d_counseling_chime_04', 'd_counseling_chime_04_3')
    expect(choiceJumpTarget(food, 'Hand her some Splendamin.')).toBe('d_counseling_chime_04_6')
    expect(choiceJumpTarget(food, 'Hand her a chocolate bar.')).toBe('d_counseling_chime_04_11')
    expect(line('d_counseling_chime_04', 'd_counseling_chime_04_8').speaking).toBe(false)
    expect(line('d_counseling_chime_04', 'd_counseling_chime_04_8').character).toBe('c331')
    expect(line('d_counseling_chime_04', 'd_counseling_chime_04_9').text).toBe('I hand Chime a chocolate bar.')
    expect(line('d_counseling_chime_04', 'd_counseling_chime_04_11').animation).toBe('shy')
  })

  it('rejects a choice that jumps nowhere', () => {
    expect(() =>
      parseCounselingCatalog({
        characters: [
          {
            name: 'Chime',
            id: 'c331',
            selection: 'base::Chime',
            sessions: [
              {
                id: 'broken',
                label: '01',
                blurb: 'Hello',
                openingLineId: 'a',
                lines: [
                  {
                    id: 'a',
                    text: 'Hello',
                    character: 'c331',
                    animation: 'idle',
                    speaking: true,
                    choices: [{ text: 'Go', type: 'dialogue', jumpTo: 'missing' }]
                  }
                ]
              }
            ]
          }
        ]
      })
    ).toThrow(/missing line missing/)
  })
})
