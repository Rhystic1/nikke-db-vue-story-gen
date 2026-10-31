import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchOpenRouterModels, resolveOpenRouterTierSupport } from '@/utils/llmUtils'

const MODELS_URL = 'https://openrouter.ai/api/v1/models'

let requests: string[] = []

const jsonResponse = (body: unknown) => {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  })
}

const catalogModel = (id: string, endpoints: unknown) => {
  return {
    id,
    name: id,
    pricing: { prompt: '0.000001', completion: '0.000002' },
    endpoints
  }
}

const detailUrl = (id: string) => {
  return `${MODELS_URL}/${id}/endpoints`
}

const stubCatalog = (models: any[], details: Record<string, unknown>) => {
  requests = []
  vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL) => {
    const href = String(url)
    requests.push(href)
    if (href === MODELS_URL) {

      return jsonResponse({ data: models })
    }
    if (href in details) {

      return jsonResponse(details[href])
    }

    return new Response('missing', { status: 404 })
  }))
}

describe('OpenRouter model speed tiers', () => {
  afterEach(() => {
    requests = []
    vi.unstubAllGlobals()
  })

  it('reads flex and priority for Gemini 4 Argon from the endpoint list when the catalog only names API routes', async () => {
    const id = 'google/gemini-4-argon'
    stubCatalog([catalogModel(id, ['/api/v1/chat/completions', '/api/v1/completions', '/api/v1/messages', '/api/v1/responses'])], {
      [detailUrl(id)]: {
        data: {
          endpoints: [
            { tag: 'google-ai-studio/flex', service_tier: 'flex' },
            { tag: 'google-vertex/global', service_tier: null },
            { tag: 'google-vertex/global/priority', service_tier: 'priority' },
            { tag: 'google-ai-studio/priority', service_tier: 'priority' }
          ]
        }
      }
    })

    await fetchOpenRouterModels()
    const support = await resolveOpenRouterTierSupport(id)

    expect(support).toEqual({ status: 'known', flex: true, priority: true })
    expect(requests).toContain(detailUrl(id))
  })

  it('reads flex when the catalog endpoints array is empty', async () => {
    const id = 'example/empty-endpoints'
    stubCatalog([catalogModel(id, [])], {
      [detailUrl(id)]: {
        data: {
          endpoints: [{ tag: 'provider/flex' }]
        }
      }
    })

    await fetchOpenRouterModels()
    const support = await resolveOpenRouterTierSupport(id)

    expect(support).toEqual({ status: 'known', flex: true, priority: false })
    expect(requests).toContain(detailUrl(id))
  })

  it('keeps both speeds off when the endpoint list has no flex or priority tag', async () => {
    const id = 'example/plain'
    stubCatalog([catalogModel(id, ['/api/v1/chat/completions'])], {
      [detailUrl(id)]: {
        data: {
          endpoints: [{ tag: 'provider/standard' }]
        }
      }
    })

    await fetchOpenRouterModels()
    const support = await resolveOpenRouterTierSupport(id)

    expect(support).toEqual({ status: 'known', flex: false, priority: false })
    expect(requests).toContain(detailUrl(id))
  })

  it('keeps a catalog that already carries provider tier tags', async () => {
    const id = 'example/legacy-flex'
    stubCatalog([catalogModel(id, ['google-ai-studio/flex', 'google-vertex/global/priority'])], {})

    await fetchOpenRouterModels()
    const support = await resolveOpenRouterTierSupport(id)

    expect(support).toEqual({ status: 'known', flex: true, priority: true })
    expect(requests).not.toContain(detailUrl(id))
  })
})
