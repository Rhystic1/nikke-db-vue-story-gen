const test = require('node:test')
const assert = require('node:assert/strict')
const { Readable, Writable } = require('stream')

let chain = Promise.resolve()
function serial(name, fn) {
  const run = chain.then(fn, fn)
  chain = run.then(
    () => {},
    () => {}
  )
  test(name, () => run)
}

if (!process.env.GEMINI_API_KEY && !process.env.OPENROUTER_API_KEY && !process.env.POLLINATIONS_API_KEY) {
  process.env.OPENROUTER_API_KEY = 'test-key'
}

const script = require('./updateBackstories.js')

function jsonResponse(body) {
  return {
    ok: true,
    json: async () => body
  }
}

function stubWiki(pages) {
  const seen = []
  const originalFetch = global.fetch
  global.fetch = async (url) => {
    const page = new URL(url).searchParams.get('page')
    seen.push(page)
    if (Object.prototype.hasOwnProperty.call(pages, page)) {
      return jsonResponse(pages[page])
    }
    throw new Error(`unexpected page ${page}`)
  }

  return {
    seen,
    restore() {
      global.fetch = originalFetch
    }
  }
}

function scriptedPrompt(lines) {
  let text = ''
  const input = Readable.from(lines.map((line) => `${line}\n`))
  const output = new Writable({
    write(chunk, encoding, callback) {
      text += chunk.toString()
      callback()
    }
  })
  script.setPromptIO(input, output)

  return {
    text: () => text
  }
}

const missing = { error: { code: 'missingtitle', info: "The page you specified doesn't exist." } }

serial('parent page retry requests Character after Character/Variant misses', async () => {
  const wiki = stubWiki({
    'Character/Variant': missing,
    Character: { parse: { wikitext: { '*': 'Parent backstory.' } } }
  })
  try {
    const content = await script.fetchWikiPageContent('Character/Variant', { retryParent: true })

    assert.deepEqual(wiki.seen, ['Character/Variant', 'Character'])
    assert.equal(content, 'Parent backstory.')
  } finally {
    wiki.restore()
  }
})

serial('parent page retry stops after one level', async () => {
  const wiki = stubWiki({
    'Character/Variant/Story': missing,
    'Character/Variant': missing
  })
  try {
    const content = await script.fetchWikiPageContent('Character/Variant/Story', { retryParent: true })

    assert.deepEqual(wiki.seen, ['Character/Variant/Story', 'Character/Variant'])
    assert.equal(content, null)
  } finally {
    wiki.restore()
  }
})

serial('a found wiki page is not followed by a parent request', async () => {
  const wiki = stubWiki({
    'Character/Variant': { parse: { wikitext: { '*': 'Variant story.' } } }
  })
  try {
    const content = await script.fetchWikiPageContent('Character/Variant', { retryParent: true })

    assert.deepEqual(wiki.seen, ['Character/Variant'])
    assert.equal(content, 'Variant story.')
  } finally {
    wiki.restore()
  }
})

serial('create mode retries one level above the Story page', async () => {
  const wiki = stubWiki({
    'New_Nikke/Story': missing,
    New_Nikke: { parse: { wikitext: { '*': 'Parent page story.' } } }
  })
  try {
    script.setMode('create')
    const content = await script.fetchWikiContent('New Nikke')

    assert.deepEqual(wiki.seen, ['New_Nikke/Story', 'New_Nikke'])
    assert.equal(content, 'Parent page story.')
  } finally {
    wiki.restore()
    script.setMode('base')
  }
})

serial('other modes do not retry a missing wiki page', async () => {
  const wiki = stubWiki({
    'Rapi/Story': missing
  })
  try {
    script.setMode('base')
    const content = await script.fetchWikiContent('Rapi')

    assert.deepEqual(wiki.seen, ['Rapi/Story'])
    assert.equal(content, null)
  } finally {
    wiki.restore()
    script.setMode('base')
  }
})

function useTextModel() {
  script.setApiProvider('openrouter')
  script.setOpenRouterModel('z-ai/glm-5.2')
  script.setNonInteractive(false)
  script.resetVisualModelDecision()
}

serial('a text model waits for no and skips visual analysis', async () => {
  useTextModel()
  const prompt = scriptedPrompt(['n'])
  const originalFetch = global.fetch
  let called = false
  global.fetch = async () => {
    called = true
    throw new Error('visual fetch should not run')
  }
  try {
    const decision = await script.prepareVisualModel()
    const result = await script.extractVisualData('Rapi', 'https://example.test/rapi.png')

    assert.equal(decision.skip, true)
    assert.equal(result.skipped, true)
    assert.equal(result.data, null)
    assert.equal(called, false)
    assert.equal(script.getOpenRouterModel(), 'z-ai/glm-5.2')
    assert.match(prompt.text(), /Switch to a model that can take images/)
  } finally {
    global.fetch = originalFetch
    script.resetVisualModelDecision()
  }
})

serial('a text model yes retries only visual analysis with the chosen model', async () => {
  useTextModel()
  const prompt = scriptedPrompt(['y', '1'])
  const logs = []
  const originalLog = console.log
  console.log = (...args) => {
    logs.push(args.join(' '))
  }
  const seen = []
  const originalFetch = global.fetch
  global.fetch = async (url, options) => {
    const body = JSON.parse(options.body)
    seen.push(body.model)
    assert.equal(String(url), 'https://openrouter.ai/api/v1/chat/completions')
    const content = body.messages[0].content
    assert.equal(Array.isArray(content), true)
    assert.equal(content.some((part) => part.type === 'image_url'), true)

    return {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"appearance":"blue eyes","defaultSkin":"red coat"}' } }]
      }),
      text: async () => ''
    }
  }
  try {
    const result = await script.extractVisualData('Rapi', 'https://example.test/rapi.png')

    assert.equal(result.skipped, false)
    assert.equal(result.data.appearance, 'blue eyes')
    assert.equal(result.data.defaultSkin, 'red coat')
    assert.deepEqual(seen, ['deepseek/deepseek-v4.1-flash'])
    assert.equal(script.getOpenRouterModel(), 'z-ai/glm-5.2')
    assert.match(prompt.text(), /Switch to a model that can take images/)
    const menu = logs.join('\n')
    assert.match(menu, /deepseek\/deepseek-v4\.1-flash \(example\)/)
    assert.match(menu, /x-ai\/grok-4\.3/)
    assert.match(menu, /Type a model id/)
  } finally {
    console.log = originalLog
    global.fetch = originalFetch
    script.resetVisualModelDecision()
  }
})

serial('an image model runs visual analysis without a switch prompt', async () => {
  script.setApiProvider('openrouter')
  script.setOpenRouterModel('x-ai/grok-4.3')
  script.setNonInteractive(false)
  script.resetVisualModelDecision()
  const seen = []
  const originalFetch = global.fetch
  global.fetch = async (url, options) => {
    seen.push(JSON.parse(options.body).model)

    return {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"appearance":"green eyes"}' } }]
      }),
      text: async () => ''
    }
  }
  try {
    assert.equal(script.getModelCapability(), 'image')
    const result = await script.extractVisualData('Rapi', 'https://example.test/rapi.png')

    assert.equal(result.skipped, false)
    assert.equal(result.data.appearance, 'green eyes')
    assert.deepEqual(seen, ['x-ai/grok-4.3'])
  } finally {
    global.fetch = originalFetch
    script.resetVisualModelDecision()
  }
})

serial('non-interactive text model skips visual analysis and does not switch', async () => {
  script.setApiProvider('openrouter')
  script.setOpenRouterModel('z-ai/glm-5.2')
  script.setNonInteractive(true)
  script.resetVisualModelDecision()
  try {
    const decision = await script.prepareVisualModel()

    assert.equal(script.getModelCapability(), 'text')
    assert.equal(decision.skip, true)
    assert.equal(decision.modelId, null)
    assert.equal(script.getOpenRouterModel(), 'z-ai/glm-5.2')
  } finally {
    script.setNonInteractive(false)
    script.resetVisualModelDecision()
  }
})

serial('OpenRouter startup accepts a typed model id and chat reads that id', async () => {
  script.setApiProvider('openrouter')
  script.setNonInteractive(false)
  script.resetVisualModelDecision()
  const logs = []
  const originalLog = console.log
  console.log = (...args) => {
    logs.push(args.join(' '))
  }
  const prompt = scriptedPrompt(['4', 'custom/org-model'])
  const seen = []
  const originalFetch = global.fetch
  global.fetch = async (url, options) => {
    seen.push(JSON.parse(options.body).model)

    return {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"backstory":"Typed model backstory text."}' } }]
      }),
      text: async () => ''
    }
  }
  try {
    await script.promptOpenRouterModelChoice()
    const data = await script.extractData('Rapi', 'Wiki text about Rapi.', null, 'base')

    assert.equal(script.getOpenRouterModel(), 'custom/org-model')
    assert.deepEqual(seen, ['custom/org-model'])
    assert.equal(data.backstory, 'Typed model backstory text.')
    assert.match(prompt.text(), /Enter OpenRouter model id/)
    assert.match(logs.join('\n'), /4\) Type a custom model id/)
  } finally {
    console.log = originalLog
    global.fetch = originalFetch
  }
})

serial('OpenRouter menu choices still select the listed model ids', async () => {
  script.setApiProvider('openrouter')
  script.setNonInteractive(false)
  const originalLog = console.log
  console.log = () => {}
  try {
    scriptedPrompt(['2'])
    await script.promptOpenRouterModelChoice()
    assert.equal(script.getOpenRouterModel(), 'z-ai/glm-5.2')

    scriptedPrompt(['3'])
    await script.promptOpenRouterModelChoice()
    assert.equal(script.getOpenRouterModel(), 'deepseek/deepseek-v4.1-flash')

    scriptedPrompt(['1'])
    await script.promptOpenRouterModelChoice()
    assert.equal(script.getOpenRouterModel(), 'x-ai/grok-4.3')
  } finally {
    console.log = originalLog
  }
})
