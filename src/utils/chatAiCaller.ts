export function buildFirstTurnHonorificsReminder(
  isFirstTurn: boolean,
  isCustomPlayerCharacterActive: boolean,
  activePlayerCharacterName: string,
  knownProfileNames: string[],
  getHonorificFn: (name: string) => string | undefined,
  promptsReminders: Record<string, string>
): string {
  if (!isFirstTurn) return ''

  if (isCustomPlayerCharacterActive) {
    return promptsReminders.playerCharacterReminder.replaceAll('{playerCharacter}', activePlayerCharacterName)
  }

  if (knownProfileNames.length === 0) return ''

  const honorificExamples: string[] = []
  for (const name of knownProfileNames) {
    const honorific = getHonorificFn(name)
    if (honorific && honorific !== 'Commander') {
      honorificExamples.push(`${name} calls the Commander "${honorific}"`)
    }
  }

  if (honorificExamples.length === 0) return ''
  return promptsReminders.honorifics.replace('{examples}', honorificExamples.join('. '))
}

export function injectFirstTurnReminder(messages: any[], reminder: string): any[] {
  if (!reminder) return messages

  const result = [...messages]
  for (let i = result.length - 1; i >= 0; i--) {
    if (result[i].role === 'user') {
      result[i] = { ...result[i], content: result[i].content + reminder }
      break
    }
  }

  return result
}
