import counselingSessionsJson from '@/utils/json/counselingSessions.json'
import { formatChoiceAsUserTurn } from '@/utils/chatUtils'

export type CounselingBackground = {
  key: string
  variant?: string
}

export type CounselingChoice = {
  text: string
  type: 'dialogue' | 'action'
  jumpTo: string
}

type CounselingLineBase = {
  id: string
  text: string
  character: string
  animation: string
  speaking: boolean
  background?: CounselingBackground
}

export type CounselingPromptLine = CounselingLineBase & {
  next?: string
}

export type CounselingChoiceLine = CounselingLineBase & {
  choices: CounselingChoice[]
}

export type CounselingLine = CounselingPromptLine | CounselingChoiceLine

export type CounselingSession = {
  id: string
  label: string
  blurb: string
  openingLineId: string
  lines: CounselingLine[]
}

export type CounselingCharacter = {
  name: string
  id: string
  selection: string
  sessions: CounselingSession[]
}

export type CounselingCatalog = {
  characters: CounselingCharacter[]
}

export type CounselingMenuSession = {
  id: string
  label: string
  blurb: string
}

export type CounselingMenuCharacter = {
  name: string
  id: string
  selection: string
  sessions: CounselingMenuSession[]
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const requiredString = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Counseling catalog ${label} must be a non-empty string`)
  }

  return value
}

const parseBackground = (value: unknown, label: string): CounselingBackground | undefined => {
  if (value === undefined) return undefined

  if (!isRecord(value)) {
    throw new Error(`Counseling catalog ${label} background must be { key }`)
  }

  const key = requiredString(value.key, `${label} background key`)
  const background: CounselingBackground = { key }

  if (value.variant !== undefined) {
    background.variant = requiredString(value.variant, `${label} background variant`)
  }

  return background
}

const parseChoice = (value: unknown, label: string): CounselingChoice => {
  if (!isRecord(value)) {
    throw new Error(`Counseling catalog ${label} choice must be an object`)
  }

  const type = value.type
  if (type !== 'dialogue' && type !== 'action') {
    throw new Error(`Counseling catalog ${label} choice type must be dialogue or action`)
  }

  return {
    text: requiredString(value.text, `${label} choice text`),
    type,
    jumpTo: requiredString(value.jumpTo, `${label} choice jumpTo`)
  }
}

const parseLine = (value: unknown, sessionId: string): CounselingLine => {
  if (!isRecord(value)) {
    throw new Error(`Counseling catalog ${sessionId} line must be an object`)
  }

  const id = requiredString(value.id, `${sessionId} line id`)
  const base: CounselingLineBase = {
    id,
    text: requiredString(value.text, `${id} text`),
    character: requiredString(value.character, `${id} character`),
    animation: requiredString(value.animation, `${id} animation`),
    speaking: value.speaking === true
  }

  if (value.speaking !== true && value.speaking !== false) {
    throw new Error(`Counseling catalog ${id} speaking must be boolean`)
  }

  const background = parseBackground(value.background, id)
  if (background) base.background = background

  const hasChoices = value.choices !== undefined
  const hasNext = value.next !== undefined

  if (hasChoices && hasNext) {
    throw new Error(`Counseling catalog ${id} cannot both offer choices and a next line`)
  }

  if (hasChoices) {
    if (!Array.isArray(value.choices) || value.choices.length === 0) {
      throw new Error(`Counseling catalog ${id} choices must be a non-empty array`)
    }

    return {
      ...base,
      choices: value.choices.map((choice, index) => parseChoice(choice, `${id} choice ${index}`))
    }
  }

  const line: CounselingPromptLine = { ...base }
  if (hasNext) line.next = requiredString(value.next, `${id} next`)

  return line
}

const assertLinks = (session: CounselingSession) => {
  const byId = new Map(session.lines.map((line) => [line.id, line]))

  if (!byId.has(session.openingLineId)) {
    throw new Error(`Counseling catalog ${session.id} opening line is missing`)
  }

  for (const line of session.lines) {
    if ('choices' in line) {
      for (const choice of line.choices) {
        if (!byId.has(choice.jumpTo)) {
          throw new Error(`Counseling catalog ${line.id} jumps to missing line ${choice.jumpTo}`)
        }
      }
      continue
    }

    if (line.next && !byId.has(line.next)) {
      throw new Error(`Counseling catalog ${line.id} next line ${line.next} is missing`)
    }
  }

  const reached = new Set<string>()

  const visit = (id: string, stack: string[]) => {
    if (reached.has(id)) return

    if (stack.includes(id)) {
      throw new Error(`Counseling catalog ${session.id} cycles at ${id}`)
    }

    const line = byId.get(id)
    if (!line) {
      throw new Error(`Counseling catalog ${session.id} missing line ${id}`)
    }

    reached.add(id)
    const nextStack = stack.concat(id)

    if ('choices' in line) {
      for (const choice of line.choices) visit(choice.jumpTo, nextStack)
      return
    }

    if (line.next) visit(line.next, nextStack)
  }

  visit(session.openingLineId, [])

  for (const line of session.lines) {
    if (!reached.has(line.id)) {
      throw new Error(`Counseling catalog ${session.id} never reaches ${line.id}`)
    }
  }
}

const parseSession = (value: unknown): CounselingSession => {
  if (!isRecord(value)) {
    throw new Error('Counseling catalog session must be an object')
  }

  const id = requiredString(value.id, 'session id')
  if (!Array.isArray(value.lines) || value.lines.length === 0) {
    throw new Error(`Counseling catalog ${id} has no lines`)
  }

  const lines = value.lines.map((line) => parseLine(line, id))
  const ids = new Set<string>()
  for (const line of lines) {
    if (ids.has(line.id)) {
      throw new Error(`Counseling catalog ${id} repeats line ${line.id}`)
    }
    ids.add(line.id)
  }

  const session: CounselingSession = {
    id,
    label: requiredString(value.label, `${id} label`),
    blurb: requiredString(value.blurb, `${id} blurb`),
    openingLineId: requiredString(value.openingLineId, `${id} openingLineId`),
    lines
  }

  assertLinks(session)

  return session
}

const parseCharacter = (value: unknown): CounselingCharacter => {
  if (!isRecord(value)) {
    throw new Error('Counseling catalog character must be an object')
  }

  const name = requiredString(value.name, 'character name')
  if (!Array.isArray(value.sessions) || value.sessions.length === 0) {
    throw new Error(`Counseling catalog ${name} has no sessions`)
  }

  const sessions = value.sessions.map((session) => parseSession(session))
  const ids = new Set<string>()
  for (const session of sessions) {
    if (ids.has(session.id)) {
      throw new Error(`Counseling catalog ${name} repeats session ${session.id}`)
    }
    ids.add(session.id)
  }

  return {
    name,
    id: requiredString(value.id, `${name} id`),
    selection: requiredString(value.selection, `${name} selection`),
    sessions
  }
}

export const parseCounselingCatalog = (input: unknown): CounselingCatalog => {
  if (!isRecord(input) || !Array.isArray(input.characters) || input.characters.length === 0) {
    throw new Error('Counseling catalog needs a characters array')
  }

  const characters = input.characters.map((character) => parseCharacter(character))
  const names = new Set<string>()
  for (const character of characters) {
    const key = character.name.toLowerCase()
    if (names.has(key)) {
      throw new Error(`Counseling catalog repeats character ${character.name}`)
    }
    names.add(key)
  }

  return { characters }
}

export const counselingCatalog = parseCounselingCatalog(counselingSessionsJson)

export const counselingMenu = (catalog: CounselingCatalog): CounselingMenuCharacter[] => {
  return catalog.characters.map((character) => ({
    name: character.name,
    id: character.id,
    selection: character.selection,
    sessions: character.sessions.map((session) => ({
      id: session.id,
      label: session.label,
      blurb: session.blurb
    }))
  }))
}

export const findCounselingSession = (
  catalog: CounselingCatalog,
  sessionId: string
): { character: CounselingCharacter; session: CounselingSession } | null => {
  for (const character of catalog.characters) {
    const session = character.sessions.find((entry) => entry.id === sessionId)
    if (session) return { character, session }
  }

  return null
}

export const counselingLineById = (session: CounselingSession, lineId: string): CounselingLine | null => {
  return session.lines.find((line) => line.id === lineId) ?? null
}

export const choiceJumpTarget = (line: CounselingLine, formattedChoice: string): string | null => {
  if (!('choices' in line)) return null

  const match = line.choices.find((choice) => formatChoiceAsUserTurn(choice) === formattedChoice)

  return match?.jumpTo ?? null
}

export const counselingLineToAction = (line: CounselingLine) => {
  const action: {
    text: string
    character: string
    animation: string
    speaking: boolean
    background?: CounselingBackground
    choices?: CounselingChoice[]
  } = {
    text: line.text,
    character: line.character,
    animation: line.animation,
    speaking: line.speaking
  }

  const closingBackgroundClear = !('choices' in line) && !line.next && line.background?.key === 'none'
  if (line.background && !closingBackgroundClear) action.background = line.background
  if ('choices' in line) action.choices = line.choices

  return action
}
