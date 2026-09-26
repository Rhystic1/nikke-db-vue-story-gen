const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { sortAndAttachProfileEntry } = require('./updateBackstories')

const colors = require('./fixtures/colors.json')
const l2d = require('../src/utils/json/l2d.json')
const filteredIds = require('../src/utils/json/filteredCharacterIds.json').filteredIds
const skinOverrideIds = Object.keys(require('../src/utils/json/skinOverrides.json').overrides)

const realSources = { l2d, colors, filteredIds, skinOverrideIds }

describe('sortAndAttachProfileEntry', () => {
  it('lands a new key in English alphabetical order with the resolved id and color', () => {
    const profiles = {
      Zed: { backstory: 'old-zed' },
      Ada: { backstory: 'old-ada' },
      EVE: { backstory: 'old-eve' },
      Ein: { backstory: 'old-ein' }
    }

    const result = sortAndAttachProfileEntry(profiles, 'Mica', { backstory: 'new' }, realSources)
    const keys = Object.keys(result.profiles)

    assert.deepEqual(keys, ['Ada', 'Ein', 'EVE', 'Mica', 'Zed'])
    assert.ok(keys.indexOf('Ein') < keys.indexOf('EVE'))
    assert.equal(result.profiles.Mica.id, 'c061')
    assert.equal(result.profiles.Mica.color, colors.Mica)
    assert.equal(result.profiles.Mica.backstory, 'new')
    assert.equal(result.omittedId, null)
    assert.equal(result.omittedColor, null)
    assert.equal('id' in result.profiles.Ada, false)
    assert.equal('color' in result.profiles.Ada, false)
    assert.equal('id' in profiles.Ada, false)

    const index = keys.indexOf('Mica')
    console.log(JSON.stringify({
      key: 'Mica',
      index,
      neighbors: [keys[index - 1], keys[index], keys[index + 1]],
      id: result.profiles.Mica.id,
      color: result.profiles.Mica.color
    }))
  })

  it('uses the same insert for a variant name', () => {
    const profiles = {
      'Anchor: Innocent Maid': { backstory: 'anchor' },
      'Ade: Agent Bunny': { backstory: 'ade', id: 'c315', color: '#473f3c' }
    }

    const result = sortAndAttachProfileEntry(profiles, 'Anne:Miracle Fairy', { backstory: 'anne' }, realSources)
    const keys = Object.keys(result.profiles)

    assert.deepEqual(keys, ['Ade: Agent Bunny', 'Anne:Miracle Fairy', 'Anchor: Innocent Maid'])
    assert.equal(result.profiles['Anne:Miracle Fairy'].id, 'c121')
    assert.equal(result.profiles['Anne:Miracle Fairy'].color, '#8ad9fe')
    assert.equal(result.profiles['Ade: Agent Bunny'].id, 'c315')
    assert.equal(result.profiles['Ade: Agent Bunny'].color, '#473f3c')
  })

  it('picks the id this repo already stores when several l2d rows match', () => {
    const sources = {
      l2d: [
        { name: 'Twin', id: 'c100' },
        { name: 'Twin', id: 'c200' }
      ],
      colors: { Twin: '#112233' },
      existingProfiles: { Twin: { id: 'c200' } },
      filteredIds: [],
      skinOverrideIds: []
    }

    const result = sortAndAttachProfileEntry({}, 'Twin', { backstory: 'twin' }, sources)

    assert.equal(result.profiles.Twin.id, 'c200')
    assert.equal(result.profiles.Twin.color, '#112233')
  })

  it('resolves Kilo, Grave, and Mint the way the profile files already do', () => {
    const kilo = sortAndAttachProfileEntry({}, 'Kilo', { backstory: 'k' }, realSources)
    const grave = sortAndAttachProfileEntry({}, 'Grave', { backstory: 'g' }, realSources)
    const mint = sortAndAttachProfileEntry({}, 'Mint', { backstory: 'm' }, realSources)

    assert.equal(kilo.profiles.Kilo.id, 'c977')
    assert.equal(grave.profiles.Grave.id, 'c514')
    assert.equal(mint.profiles.Mint.id, 'c600')
  })

  it('omits color when the color list has no match and does not invent one', () => {
    const result = sortAndAttachProfileEntry({}, 'Commander', { backstory: 'cmd' }, realSources)

    assert.equal(result.profiles.Commander.id, 'commander')
    assert.equal('color' in result.profiles.Commander, false)
    assert.equal(result.omittedColor, 'Commander')
    assert.equal(result.omittedId, null)
  })

  it('omits id and color when neither source matches', () => {
    const result = sortAndAttachProfileEntry({}, 'Chatterbox', { backstory: 'box' }, realSources)

    assert.equal('id' in result.profiles.Chatterbox, false)
    assert.equal('color' in result.profiles.Chatterbox, false)
    assert.equal(result.omittedId, 'Chatterbox')
    assert.equal(result.omittedColor, 'Chatterbox')
  })

  it('does not backfill or reorder when the key already exists', () => {
    const profiles = {
      Zed: { backstory: 'z' },
      Flora: { backstory: 'flora' },
      Ada: { backstory: 'a' }
    }

    const result = sortAndAttachProfileEntry(profiles, 'Flora', { backstory: 'updated' }, realSources)

    assert.deepEqual(Object.keys(result.profiles), ['Zed', 'Flora', 'Ada'])
    assert.equal(result.profiles.Flora.backstory, 'updated')
    assert.equal('id' in result.profiles.Flora, false)
    assert.equal('color' in result.profiles.Flora, false)
    assert.equal(result.omittedId, null)
    assert.equal(result.omittedColor, null)
  })
})
