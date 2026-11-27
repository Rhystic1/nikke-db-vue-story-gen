import l2d from '@/utils/json/l2d.json'
import characterHonorifics from '@/utils/json/honorifics.json'
import filteredIdsJson from '@/utils/json/filteredCharacterIds.json'
import skinOverridesJson from '@/utils/json/skinOverrides.json'

export const KILO_CHARACTER_ID = 'c977'
export const TALOS_CHARACTER_ID = 'c361'
export const TALOS_DISPLAY_NAME = 'T.A.L.O.S.'

const TALOS_ALIAS_NAMES = ['t.a.l.o.s.', 't.a.l.o.s', 'talos'] as const
const TALOS_ALIAS_SET = new Set<string>(TALOS_ALIAS_NAMES)

const filteredIds = new Set<string>((filteredIdsJson as any).filteredIds || [])
const skinOverrideIds = new Set<string>(Object.keys((skinOverridesJson as any).overrides || {}))

const L2D_CHAR_FIELDS = (c: any): string => typeof c?.name === 'string' ? c.name : ''

// Prefer active story-gen entries (neither filtered nor skin-overridden) over
// overridden or filtered duplicates (e.g., Kilo c977 over filtered c361,
// Grave c514 over overridden c510, Mustang c9022 over filtered c902).
const prioritizedL2d = [
  ...(l2d as any[]).filter((c) => c?.id && !filteredIds.has(c.id) && !skinOverrideIds.has(c.id)),
  ...(l2d as any[]).filter((c) => c?.id && !filteredIds.has(c.id) && skinOverrideIds.has(c.id)),
  ...(l2d as any[]).filter((c) => c?.id && filteredIds.has(c.id))
]

const rawTalosEntry = (l2d as any[]).find((c) => c?.id === TALOS_CHARACTER_ID)

const getTalosCharacterRecord = (): { id: string; name: string; [key: string]: any } => {
  return rawTalosEntry
    ? { ...rawTalosEntry, name: TALOS_DISPLAY_NAME }
    : { id: TALOS_CHARACTER_ID, name: TALOS_DISPLAY_NAME }
}

export const isTalosAlias = (name: string): boolean => {
  if (!name) return false
  return TALOS_ALIAS_SET.has(name.trim().toLowerCase())
}

export const getStoryCharacterAliasDisplayName = (id: string): string | null => {
  if (!id) return null
  if (id.trim().toLowerCase() === TALOS_CHARACTER_ID) return TALOS_DISPLAY_NAME
  return null
}

export const findCharacterByName = (name: string): { id: string; name: string; [key: string]: any } | undefined => {
  if (!name) return undefined
  const lower = name.trim().toLowerCase()
  if (lower === 'commander') return { id: 'commander', name: 'Commander' }
  if (TALOS_ALIAS_SET.has(lower)) return getTalosCharacterRecord()
  return prioritizedL2d.find((c) => L2D_CHAR_FIELDS(c).toLowerCase() === lower) as { id: string; name: string } | undefined
}

export const findCharacterIdByName = (name: string): string | undefined => {
  const char = findCharacterByName(name)
  return char ? char.id : undefined
}

export const findCharacterByIdOrName = (idOrName: string): { id: string; name: string; [key: string]: any } | undefined => {
  if (!idOrName) return undefined
  const lower = idOrName.trim().toLowerCase()
  if (lower === TALOS_CHARACTER_ID) return getTalosCharacterRecord()
  const byId = (l2d as any[]).find((c) => typeof c?.id === 'string' && c.id.toLowerCase() === lower)
  if (byId) return byId as { id: string; name: string }
  return findCharacterByName(idOrName)
}

export const findLeadingCharacterId = (rawText: string, boundaryPattern: RegExp = /[\s,.:;!?\-—–'’]/): string | undefined => {
  const t = (rawText || '').replace(/\u00A0/g, ' ').trimStart()
  if (!t) return undefined
  const lower = t.toLowerCase()

  if (lower.startsWith('commander')) {
    const next = t.charAt('commander'.length)
    if (!next || boundaryPattern.test(next)) return 'commander'
  }

  for (const alias of TALOS_ALIAS_NAMES) {
    if (!lower.startsWith(alias)) continue
    const next = t.charAt(alias.length)
    if (!next || boundaryPattern.test(next)) return TALOS_CHARACTER_ID
  }

  for (const char of prioritizedL2d) {
    const name = typeof char?.name === 'string' ? (char.name as string) : ''
    const id = typeof char?.id === 'string' ? (char.id as string) : ''
    if (!name || !id) continue

    if (!lower.startsWith(name.toLowerCase())) continue
    const next = t.charAt(name.length)
    if (!next || boundaryPattern.test(next)) return id
  }

  return undefined
}

export const hasMeaningfulAnimation = (anim: any): boolean => {
  if (typeof anim !== 'string') return false
  const t = anim.trim().toLowerCase()
  return t !== '' && t !== 'idle' && t !== 'none'
}

export const NON_DUPLICATED_FIELDS = new Set(['needs_search', 'memory', 'characterProgression', 'characterProfile', 'characterProfiles', 'debug_info', 'choices'])

// Helper to get honorific with fallback to "Commander"
export const getHonorific = (characterName: string): string => {
  return (characterHonorifics as Record<string, string>)[characterName] || 'Commander'
}

// Helper to merge base profiles with progression overlays (personality + relationships only)
export const getEffectiveCharacterProfiles = (base: Record<string, any>, progression: Record<string, any>): Record<string, any> => {
  const merged: Record<string, any> = {}
  const progressionKeys = Object.keys(progression || {})

  for (const [name, profile] of Object.entries(base || {})) {
    const outProfile = profile && typeof profile === 'object' && !Array.isArray(profile) ? { ...(profile as any) } : profile
    const progKey = progressionKeys.find((k) => k.toLowerCase() === name.toLowerCase())
    const update = progKey ? (progression as any)[progKey] : undefined

    if (outProfile && typeof outProfile === 'object' && !Array.isArray(outProfile) && update && typeof update === 'object') {
      if ((update as any).personality) {
        // Store progression as a separate field so the AI always sees the original personality alongside the evolution.
        ;(outProfile as any).characterProgression = (update as any).personality
      }

      if ((update as any).relationships && typeof (update as any).relationships === 'object') {
        ;(outProfile as any).relationships = {
          ...((outProfile as any).relationships || {}),
          ...((update as any).relationships || {})
        }
      }
    }

    merged[name] = outProfile
  }

  return merged
}
