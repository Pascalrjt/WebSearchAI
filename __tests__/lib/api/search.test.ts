import { CustomSearchClient, CustomSearchApiError } from '@/lib/api/search'
import { CustomSearchResponse, SearchContext } from '@/lib/types/api'

// Mock fetch globally
global.fetch = jest.fn()

describe('CustomSearchClient', () => {
  let client: CustomSearchClient
  const mockApiKey = 'test-api-key'
  const mockSearchEngineId = 'test-search-engine-id'

  const mockResponse: CustomSearchResponse = {
    kind: 'customsearch#search',
    url: { type: 'application/json', template: 'test' },
    queries: {
      request: [{
        title: 'Test',
        totalResults: '1000',
        searchTerms: 'test query',
        count: 10,
        startIndex: 1,
        inputEncoding: 'utf8',
        outputEncoding: 'utf8',
        safe: 'off',
        cx: mockSearchEngineId
      }]
    },
    context: { title: 'Test Context' },
    searchInformation: {
      searchTime: 0.5,
      formattedSearchTime: '0.50',
      totalResults: '1000',
      formattedTotalResults: '1,000'
    },
    items: [
      {
        kind: 'customsearch#result',
        title: 'Test Result',
        htmlTitle: '<b>Test</b> Result',
        link: 'https://example.com',
        displayLink: 'example.com',
        snippet: 'This is a test result snippet',
        htmlSnippet: 'This is a <b>test</b> result snippet',
        formattedUrl: 'https://example.com',
        htmlFormattedUrl: 'https://example.com',
        cacheId: 'test-cache-id'
      }
    ]
  }

  beforeEach(() => {
    client = new CustomSearchClient({ 
      apiKey: mockApiKey,
      searchEngineId: mockSearchEngineId
    })
    jest.clearAllMocks()
  })

  describe('constructor', () => {
    it('should initialize with required values', () => {
      const testClient = new CustomSearchClient({
        apiKey: mockApiKey,
        searchEngineId: mockSearchEngineId
      })
      expect(testClient).toBeInstanceOf(CustomSearchClient)
    })

    it('should accept custom baseUrl', () => {
      const customClient = new CustomSearchClient({
        apiKey: mockApiKey,
        searchEngineId: mockSearchEngineId,
        baseUrl: 'https://custom.api.com'
      })
      expect(customClient).toBeInstanceOf(CustomSearchClient)
    })
  })

  describe('search', () => {

    it('should perform search successfully', async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      })

      const result = await client.search('test query')

      expect(result.success).toBe(true)
      expect(result.data?.items).toHaveLength(1)
      expect(result.data?.items[0].title).toBe('Test Result')
      expect(result.data?.totalResults).toBe(1000)
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('test+query')
      )
    })

    it('should handle search options', async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      })

      await client.search('test query', {
        num: 5,
        start: 11,
        language: 'en',
        region: 'US',
        safe: 'active'
      })

      const callUrl = (fetch as jest.Mock).mock.calls[0][0]
      expect(callUrl).toContain('num=5')
      expect(callUrl).toContain('start=11')
      expect(callUrl).toContain('lr=lang_en')
      expect(callUrl).toContain('gl=US')
      expect(callUrl).toContain('safe=active')
    })

    it('should handle exclude terms', async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      })

      await client.search('test query', {
        excludeTerms: ['spam', 'ads']
      })

      const callUrl = (fetch as jest.Mock).mock.calls[0][0]
      expect(callUrl).toContain('-spam')
      expect(callUrl).toContain('-ads')
    })

    it('should handle API errors', async () => {
      const errorResponse = {
        error: {
          message: 'Invalid API key',
          code: 'INVALID_API_KEY'
        }
      }

      ;(fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        json: () => Promise.resolve(errorResponse)
      })

      const result = await client.search('test query')

      expect(result.success).toBe(false)
      expect(result.error?.message).toBe('Invalid API key')
      expect(result.error?.code).toBe('INVALID_API_KEY')
      expect(result.error?.status).toBe(403)
    })

    it('should handle network errors', async () => {
      (fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'))

      const result = await client.search('test query')

      expect(result.success).toBe(false)
      expect(result.error?.message).toBe('Network error')
      expect(result.error?.code).toBe('UNKNOWN_ERROR')
    })
  })

  describe('searchWithFocus', () => {
    const mockContext: SearchContext = {
      query: 'artificial intelligence',
      focusMode: 'academic',
      language: 'en',
      region: 'US'
    }

    it('should optimize query for academic focus', async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          ...mockResponse,
          items: []
        })
      })

      await client.searchWithFocus(mockContext)

      const callUrl = (fetch as jest.Mock).mock.calls[0][0]
      const decodedUrl = decodeURIComponent(callUrl)
      
      expect(decodedUrl).toContain('site:edu')
      expect(decodedUrl).toContain('dateRestrict=y5')
    })

    it('should optimize query for news focus', async () => {
      const newsContext: SearchContext = {
        query: 'climate change',
        focusMode: 'news'
      }

      ;(fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          ...mockResponse,
          items: []
        })
      })

      await client.searchWithFocus(newsContext)

      const callUrl = (fetch as jest.Mock).mock.calls[0][0]
      const decodedUrl = decodeURIComponent(callUrl)
      
      expect(decodedUrl).toContain('news')
      expect(decodedUrl).toContain('dateRestrict=y1')
      expect(callUrl).toContain('safe=active')
    })

    it('should optimize query for medical focus', async () => {
      const medicalContext: SearchContext = {
        query: 'diabetes treatment',
        focusMode: 'medical'
      }

      ;(fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          ...mockResponse,
          items: []
        })
      })

      await client.searchWithFocus(medicalContext)

      const callUrl = (fetch as jest.Mock).mock.calls[0][0]
      const decodedUrl = decodeURIComponent(callUrl)
      
      expect(decodedUrl).toContain('medical')
      expect(callUrl).toContain('siteSearch=pubmed')
      expect(callUrl).toContain('safe=active')
    })
  })

  describe('getSuggestions', () => {
    it('should generate query suggestions', async () => {
      const result = await client.getSuggestions('AI')

      expect(result.success).toBe(true)
      expect(result.data).toBeInstanceOf(Array)
      expect(result.data?.length).toBeGreaterThan(0)
      expect(result.data).toContain('what is AI')
      expect(result.data).toContain('how to AI')
    })

    it('should handle suggestion errors', async () => {
      // Mock internal error by mocking the private method indirectly
      const originalGenerateQuerySuggestions = (client as any).generateQuerySuggestions
      ;(client as any).generateQuerySuggestions = jest.fn().mockImplementation(() => {
        throw new Error('Suggestion error')
      })

      const result = await client.getSuggestions('test')

      expect(result.success).toBe(false)
      expect(result.error?.code).toBe('SUGGESTIONS_ERROR')

      // Restore original method
      ;(client as any).generateQuerySuggestions = originalGenerateQuerySuggestions
    })
  })

  describe('validateApiKey', () => {
    it('should validate API key successfully', async () => {
      const testResponse: CustomSearchResponse = {
        kind: 'customsearch#search',
        url: { type: 'application/json', template: 'test' },
        queries: {
          request: [{
            title: 'Test',
            totalResults: '1',
            searchTerms: 'test',
            count: 1,
            startIndex: 1,
            inputEncoding: 'utf8',
            outputEncoding: 'utf8',
            safe: 'off',
            cx: mockSearchEngineId
          }]
        },
        context: { title: 'Test Context' },
        searchInformation: {
          searchTime: 0.1,
          formattedSearchTime: '0.10',
          totalResults: '1',
          formattedTotalResults: '1'
        },
        items: [
          {
            kind: 'customsearch#result',
            title: 'Test Result',
            htmlTitle: 'Test Result',
            link: 'https://example.com',
            displayLink: 'example.com',
            snippet: 'Test snippet',
            htmlSnippet: 'Test snippet',
            formattedUrl: 'https://example.com',
            htmlFormattedUrl: 'https://example.com'
          }
        ]
      }

      ;(fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(testResponse)
      })

      const result = await client.validateApiKey()

      expect(result.success).toBe(true)
      expect(result.data).toBe(true)
    })

    it('should handle validation failure', async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        json: () => Promise.resolve({
          error: {
            message: 'Invalid API key',
            code: 'INVALID_API_KEY'
          }
        })
      })

      const result = await client.validateApiKey()

      expect(result.success).toBe(false)
      expect(result.error?.code).toBe('INVALID_API_KEY')
    })
  })

  describe('getQuotaUsage', () => {
    it('should return not implemented error', async () => {
      const result = await client.getQuotaUsage()

      expect(result.success).toBe(false)
      expect(result.error?.code).toBe('NOT_IMPLEMENTED')
    })
  })

  describe('estimateCost', () => {
    it('should calculate cost for free tier', () => {
      const cost = client.estimateCost(50)
      expect(cost).toBe(0)
    })

    it('should calculate cost for paid tier', () => {
      const cost = client.estimateCost(1100)
      // 1100 queries - 100 free = 1000 paid queries
      // 1000 / 1000 * $5 = $5
      expect(cost).toBe(5)
    })

    it('should calculate cost for partial paid tier', () => {
      const cost = client.estimateCost(600)
      // 600 queries - 100 free = 500 paid queries
      // 500 / 1000 * $5 = $2.50
      expect(cost).toBe(2.5)
    })
  })

  describe('extractContentForSynthesis', () => {
    it('should extract clean content from search results', () => {
      const searchResponse = {
        items: [
          {
            title: 'Test Title',
            htmlTitle: '<b>Test</b> Title',
            link: 'https://example.com',
            snippet: 'Clean snippet',
            htmlSnippet: '<b>Clean</b> snippet',
            displayLink: 'example.com',
            formattedUrl: 'https://example.com'
          }
        ],
        searchInformation: {
          searchTime: 0.5,
          totalResults: '1',
          formattedTotalResults: '1'
        },
        totalResults: 1,
        hasNextPage: false
      }

      const content = client.extractContentForSynthesis(searchResponse)

      expect(content).toHaveLength(1)
      expect(content[0]).toContain('Title: Test Title')
      expect(content[0]).toContain('URL: https://example.com')
      expect(content[0]).toContain('Content: Clean snippet')
      expect(content[0]).not.toContain('<b>')
    })

    it('should handle HTML cleaning', () => {
      const searchResponse = {
        items: [
          {
            title: 'Title',
            htmlTitle: 'Title &amp; Subtitle &lt;bold&gt;',
            link: 'https://example.com',
            snippet: 'Snippet',
            htmlSnippet: 'Snippet with &quot;quotes&quot; and &#39;apostrophe&#39;',
            displayLink: 'example.com',
            formattedUrl: 'https://example.com'
          }
        ],
        searchInformation: {
          searchTime: 0.5,
          totalResults: '1',
          formattedTotalResults: '1'
        },
        totalResults: 1,
        hasNextPage: false
      }

      const content = client.extractContentForSynthesis(searchResponse)

      expect(content[0]).toContain('Title & Subtitle <bold>')
      expect(content[0]).toContain('with "quotes" and \'apostrophe\'')
    })
  })

  describe('CustomSearchApiError', () => {
    it('should create error with all properties', () => {
      const error = new CustomSearchApiError('Test error', 'TEST_CODE', 400, { detail: 'test' })

      expect(error.message).toBe('Test error')
      expect(error.name).toBe('CustomSearchApiError')
      expect(error.code).toBe('TEST_CODE')
      expect(error.status).toBe(400)
      expect(error.details).toEqual({ detail: 'test' })
    })

    it('should create error with minimal properties', () => {
      const error = new CustomSearchApiError('Test error')

      expect(error.message).toBe('Test error')
      expect(error.name).toBe('CustomSearchApiError')
      expect(error.code).toBeUndefined()
      expect(error.status).toBeUndefined()
      expect(error.details).toBeUndefined()
    })
  })

  describe('private methods', () => {
    it('should clean HTML correctly', () => {
      const htmlString = '<b>Bold</b> &amp; &lt;script&gt; &quot;quoted&quot; &#39;apostrophe&#39; &nbsp;spaces'
      const cleaned = (client as any).cleanHtml(htmlString)
      
      expect(cleaned).toBe('Bold & <script> "quoted" \'apostrophe\' spaces')
    })

    it('should generate query suggestions correctly', () => {
      const suggestions = (client as any).generateQuerySuggestions('machine learning')
      
      expect(suggestions).toBeInstanceOf(Array)
      expect(suggestions.length).toBeLessThanOrEqual(8)
      expect(suggestions).toContain('machine learning tutorial')
      expect(suggestions).toContain('machine learning 2024')
    })

    it('should optimize query for different focus modes', () => {
      const academicQuery = (client as any).optimizeQueryForFocus('AI research', 'academic')
      const newsQuery = (client as any).optimizeQueryForFocus('AI news', 'news')
      const technicalQuery = (client as any).optimizeQueryForFocus('API docs', 'technical')
      
      expect(academicQuery).toContain('site:edu')
      expect(newsQuery).toContain('news')
      expect(technicalQuery).toContain('documentation')
    })
  })
})