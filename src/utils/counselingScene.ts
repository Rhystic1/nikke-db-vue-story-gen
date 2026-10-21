import { counselingCatalog, findCounselingSession, type CounselingCharacter, type CounselingSession } from '@/utils/counselingScript'

declare const counselingSessionIdBrand: unique symbol

export type CounselingSessionId = string & {
  readonly [counselingSessionIdBrand]: typeof counselingSessionIdBrand
}

declare const counselingSceneAnchorBrand: unique symbol

export type CounselingSceneAnchor = {
  readonly sessionId: CounselingSessionId
} & {
  readonly [counselingSceneAnchorBrand]: true
}

export type CounselingSceneTurn = {
  readonly role: 'assistant'
  readonly content: string
}

export type CounselingSceneParse =
  | { readonly status: 'absent' }
  | { readonly status: 'ready'; readonly anchor: CounselingSceneAnchor }
  | { readonly status: 'rejected' }

type Attire = 'plain' | 'swimsuit' | 'already-swimsuit'

type Framing = 'goddess-flashback' | 'little-mermaid' | 'mihara-wordless'

type ScenePerson = {
  readonly name: string
  readonly attire: Attire
}

type SceneRule = {
  readonly location: string
  readonly protagonist: string | null
  readonly leadAttire: Attire
  readonly background: readonly ScenePerson[]
  readonly framing: Framing | null
  readonly sessionLocations: Readonly<Record<string, string>>
}

type SceneInput = {
  readonly location?: string
  readonly protagonist?: string | null
  readonly leadAttire?: Attire
  readonly background?: readonly ScenePerson[]
  readonly framing?: Framing | null
  readonly sessionLocations?: Readonly<Record<string, string>>
}

const defaultLocation = 'the Command Center at the Outpost'
const defaultProtagonist = 'the Commander'

const framingSentences = {
  'goddess-flashback': 'This session is a flashback in which the player stands in as the Goddess Commander.',
  'little-mermaid': 'The player is choosing what she does to distract herself from her crushing isolation. She had not met the protagonist before her escape, so the protagonist does not appear.',
  'mihara-wordless': 'This session is a hazy flashback of a conversation with the protagonist from before the side story Wordless, distorted by memory wipes and neural damage.'
} satisfies Record<Framing, string>

const scene = (input: SceneInput = {}): SceneRule => {
  return {
    location: input.location ?? defaultLocation,
    protagonist: input.protagonist === undefined ? defaultProtagonist : input.protagonist,
    leadAttire: input.leadAttire ?? 'plain',
    background: input.background ?? [],
    framing: input.framing ?? null,
    sessionLocations: input.sessionLocations ?? {}
  }
}

const wear = (attire: Attire, ...names: string[]): ScenePerson[] => {
  return names.map((name) => ({ name, attire }))
}

const englishList = (names: readonly string[]): string => {
  if (names.length < 2) {

    return names.join('')
  }

  if (names.length === 2) {

    return names.join(' and ')
  }

  return `${names.slice(0, -1).join(', ')}, and ${names.slice(-1).join('')}`
}

const isBunnyAlternate = (name: string): boolean => {
  return name.includes(':') && /\bBunny\b/.test(name)
}

const defaultScene = scene()
const bunnyScene = scene({ location: 'Coin Rush' })
const blueWaterIsland = scene({ location: 'Blue Water Island' })
const goddessFlashback = scene({
  location: 'The Wings of Victory interior',
  protagonist: 'the Goddess Commander',
  framing: 'goddess-flashback'
})
const snowfieldHotSpring = scene({ location: 'Snowfield Hot Spring' })
const coralIsland = scene({ location: 'Coral Island' })
const reclamationSite = scene({ location: 'Reclamation Site 01' })
const springNation = scene({ location: 'The Spring Nation Simulation' })
const jungleIsland = scene({ location: 'Jungle Island' })
const utopiaCompanions = wear('swimsuit', 'Rapi: Red Hood', 'Tove', 'Centi', 'Yan', 'Frima')

const counselingSceneRegistry: Readonly<Record<string, SceneRule>> = {
  Dorothy: scene({ location: 'Eden' }),
  Nihilister: scene({
    location: 'a volcanic area',
    background: wear('plain', 'Anis', 'Rapi', 'Neon')
  }),
  'Mary: Bay Goddess': blueWaterIsland,
  'Neon: Blue Ocean': blueWaterIsland,
  'Anis: Sparkling Summer': blueWaterIsland,
  'Helm: Aquamarine': blueWaterIsland,
  'Red Hood': scene({ location: 'a wasteland area' }),
  Crown: scene({
    location: 'a wasteland area',
    background: wear('plain', 'Anis', 'Rapi', 'Neon', 'Chime')
  }),
  Chime: scene({
    location: 'a wasteland area',
    background: wear('plain', 'Anis', 'Rapi', 'Neon', 'Crown')
  }),
  'Snow White: Innocent Days': goddessFlashback,
  'Scarlet: Black Shadow': scene({
    ...goddessFlashback,
    sessionLocations: {
      d_counseling_hongryeon_blackshadow_11: 'a flower field'
    }
  }),
  'Rapunzel: Pure Grace': goddessFlashback,
  'Ludmilla: Winter Owner': snowfieldHotSpring,
  'Mica: Snow Buddy': snowfieldHotSpring,
  'Sakura: Bloom in Summer': coralIsland,
  'Rosanna: Chic Ocean': coralIsland,
  Cinderella: reclamationSite,
  Grave: reclamationSite,
  'Maiden: Ice Rose': springNation,
  'Guillotine: Winter Slayer': springNation,
  'Little Mermaid': scene({
    location: 'The Bubble Garden',
    protagonist: null,
    framing: 'little-mermaid'
  }),
  'Mihara: Bonding Chain': scene({ framing: 'mihara-wordless' }),
  'Dorothy: Serendipity': scene({
    location: 'The Utopia cruise ship',
    leadAttire: 'already-swimsuit',
    background: [
      { name: 'Elegg: Boom and Shock', attire: 'swimsuit' },
      ...utopiaCompanions
    ]
  }),
  'Elegg: Boom and Shock': scene({
    location: 'The Utopia cruise ship',
    background: [
      { name: 'Dorothy: Serendipity', attire: 'already-swimsuit' },
      ...utopiaCompanions
    ]
  }),
  Nayuta: scene({
    location: 'Aboard Whaley\'s back',
    background: wear(
      'plain',
      'Rapi: Red Hood',
      'Maxwell: Ordinary Mechanic',
      'Drake: Great Villain',
      'Laplace: Ultimate Hero'
    )
  }),
  Liberalio: scene({ location: 'The Four Beasts\' imitation Ark' }),
  'Snow White: Heavy Arms': scene({ location: 'A meadow' }),
  'E.H.': scene({ location: 'The Outer Rim' }),
  'Cinderella: Crystal Wave': jungleIsland,
  'Marciana: Marine Study': jungleIsland
}

const ruleFor = (characterName: string, sessionId: string): SceneRule => {
  const listed = counselingSceneRegistry[characterName] ?? (isBunnyAlternate(characterName) ? bunnyScene : defaultScene)
  const location = listed.sessionLocations[sessionId] ?? listed.location
  if (location === listed.location) {

    return listed
  }

  return {
    ...listed,
    location
  }
}

const renderCounselingScene = (characterName: string, sessionId: string): string => {
  const rule = ruleFor(characterName, sessionId)
  const present = [characterName]
  if (rule.protagonist !== null) {
    present.push(rule.protagonist)
  }
  for (const person of rule.background) {
    present.push(person.name)
  }

  const parts = [
    `[Location: ${rule.location}. Characters present in the scene: ${present.join(', ')}]`
  ]

  if (rule.background.length > 0) {
    const names = englishList(rule.background.map((person) => person.name))
    const sentence = rule.background.length === 1
      ? `${names} is in the background and is not participating, though that person may be spoken to later.`
      : `${names} are in the background and are not participating, though they may be spoken to later.`
    parts.push(sentence)
  }

  const swimming = [
    ...(rule.leadAttire === 'swimsuit' ? [characterName] : []),
    ...rule.background.filter((person) => person.attire === 'swimsuit').map((person) => person.name)
  ]
  if (swimming.length > 0) {
    const names = englishList(swimming)
    const sentence = swimming.length === 1
      ? `${names} is in a swimming suit.`
      : `${names} are in swimming suits.`
    parts.push(sentence)
  }

  if (rule.leadAttire === 'already-swimsuit') {
    parts.push(`${characterName}'s default skin is already a swimsuit.`)
  }
  for (const person of rule.background) {
    if (person.attire === 'already-swimsuit') {
      parts.push(`${person.name}'s default skin is already a swimsuit.`)
    }
  }

  if (rule.framing !== null) {
    parts.push(framingSentences[rule.framing])
  }

  return parts.join('\n')
}

const brandAnchor = (sessionId: string): CounselingSceneAnchor => {
  return {
    sessionId: sessionId as CounselingSessionId
  } as CounselingSceneAnchor
}

const sceneTurn = (anchor: CounselingSceneAnchor): CounselingSceneTurn => {
  const found = findCounselingSession(counselingCatalog, anchor.sessionId)
  if (found === null) {
    throw new Error('Counseling scene anchor is not in the catalog')
  }

  return {
    role: 'assistant',
    content: renderCounselingScene(found.character.name, found.session.id)
  }
}

export function counselingSceneAnchor(character: CounselingCharacter, session: CounselingSession): CounselingSceneAnchor {
  const found = findCounselingSession(counselingCatalog, session.id)
  if (found === null || found.character.name !== character.name) {
    throw new Error('Counseling session does not belong to this character')
  }

  return brandAnchor(found.session.id)
}

export function parseCounselingSceneAnchor(raw: unknown): CounselingSceneParse {
  if (raw === undefined || raw === null) {

    return { status: 'absent' }
  }

  if (typeof raw !== 'string' || raw.trim() === '') {

    return { status: 'rejected' }
  }

  const found = findCounselingSession(counselingCatalog, raw)
  if (found === null) {

    return { status: 'rejected' }
  }

  return {
    status: 'ready',
    anchor: brandAnchor(found.session.id)
  }
}

export function attachCounselingScene<T extends { role: string; content: string }>(
  messages: readonly T[],
  anchor: CounselingSceneAnchor | null
): Array<T | CounselingSceneTurn> {
  if (anchor === null) {

    return messages.slice()
  }

  const turn = sceneTurn(anchor)
  const firstSpoken = messages.findIndex((message) => message.role !== 'system')
  const index = firstSpoken === -1 ? messages.length : firstSpoken
  const existing = messages[index]
  if (existing !== undefined && existing.role === 'assistant' && existing.content === turn.content) {

    return messages.slice()
  }

  return [
    ...messages.slice(0, index),
    turn,
    ...messages.slice(index)
  ]
}
