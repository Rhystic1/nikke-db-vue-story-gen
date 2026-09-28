const test = require('node:test')
const assert = require('node:assert/strict')

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

const missing = { error: { code: 'missingtitle', info: "The page you specified doesn't exist." } }

test('parent page retry requests Character after Character/Variant misses', async (t) => {
  const wiki = stubWiki({
    'Character/Variant': missing,
    Character: { parse: { wikitext: { '*': 'Parent backstory.' } } }
  })
  t.after(() => wiki.restore())

  const content = await script.fetchWikiPageContent('Character/Variant', { retryParent: true })

  assert.deepEqual(wiki.seen, ['Character/Variant', 'Character'])
  assert.equal(content, 'Parent backstory.')
})

test('parent page retry stops after one level', async (t) => {
  const wiki = stubWiki({
    'Character/Variant/Story': missing,
    'Character/Variant': missing
  })
  t.after(() => wiki.restore())

  const content = await script.fetchWikiPageContent('Character/Variant/Story', { retryParent: true })

  assert.deepEqual(wiki.seen, ['Character/Variant/Story', 'Character/Variant'])
  assert.equal(content, null)
})

test('a found wiki page is not followed by a parent request', async (t) => {
  const wiki = stubWiki({
    'Character/Variant': { parse: { wikitext: { '*': 'Variant story.' } } }
  })
  t.after(() => wiki.restore())

  const content = await script.fetchWikiPageContent('Character/Variant', { retryParent: true })

  assert.deepEqual(wiki.seen, ['Character/Variant'])
  assert.equal(content, 'Variant story.')
})

test('create mode retries one level above the Story page', async (t) => {
  const wiki = stubWiki({
    'New_Nikke/Story': missing,
    New_Nikke: { parse: { wikitext: { '*': 'Parent page story.' } } }
  })
  t.after(() => {
    wiki.restore()
    script.setMode('base')
  })

  script.setMode('create')
  const content = await script.fetchWikiContent('New Nikke')

  assert.deepEqual(wiki.seen, ['New_Nikke/Story', 'New_Nikke'])
  assert.equal(content, 'Parent page story.')
})

test('other modes do not retry a missing wiki page', async (t) => {
  const wiki = stubWiki({
    'Rapi/Story': missing
  })
  t.after(() => {
    wiki.restore()
    script.setMode('base')
  })

  script.setMode('base')
  const content = await script.fetchWikiContent('Rapi')

  assert.deepEqual(wiki.seen, ['Rapi/Story'])
  assert.equal(content, null)
})
