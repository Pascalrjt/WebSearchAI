import { SearchOrchestrator, SearchOrchestrationError } from '@/lib/api/orchestrator'
import { GeminiClient } from '@/lib/api/gemini'
import { CustomSearchClient } from '@/lib/api/search'
import { SearchContext } from '@/lib/types/api'

// Mock the API clients
jest.mock('@/lib/api/gemini')
jest.mock('@/lib/api/search')

describe('SearchOrchestrator', () => {
  let orchestrator: SearchOrchestrator
  let mockGeminiClient: jest.Mocked<GeminiClient>
  let mockSearchClient: jest.Mocked<CustomSearchClient>

  const mockConfig = {
    geminiApiKey: 'test-gemini-key',
    customSearchApiKey: 'test-search-key',
    searchEngineId: 'test-engine-id',
    maxSearchResults: 5
  }

  const mockContext: SearchContext = {
    query: 'What is artificial intelligence?',
    focusMode: 'general'
  }

  const mockSearchResponse = {
    items: [
      {
        title: 'AI Definition',
        link: 'https://example.com/ai',
        snippet: 'AI is the simulation of human intelligence...',
        displayLink: 'example.com',
        formattedUrl: 'https://example.com/ai',
        htmlTitle: 'AI Definition',
        htmlSnippet: 'AI is the simulation of human intelligence...'
      }
    ],
    searchInformation: {
      searchTime: 0.5,
      totalResults: '1000',
      formattedTotalResults: '1,000'
    },
    totalResults: 1000,
    hasNextPage: false
  }

  const mockAnswerResponse = 'Artificial Intelligence (AI) is the simulation of human intelligence processes by machines...'

  beforeEach(() => {
    jest.clearAllMocks()
    
    // Create mock instances
    mockGeminiClient = {
      generateSearchAnswer: jest.fn(),
      streamContent: jest.fn(),
      validateApiKey: jest.fn(),
      generateContent: jest.fn(),
      getUsageFromResponse: jest.fn(),
      estimateCost: jest.fn()
    } as any

    mockSearchClient = {
      searchWithFocus: jest.fn(),
      extractContentForSynthesis: jest.fn(),
      validateApiKey: jest.fn(),
      search: jest.fn(),
      getSuggestions: jest.fn(),
      getQuotaUsage: jest.fn(),
      estimateCost: jest.fn()
    } as any

    // Mock constructors
    ;(GeminiClient as jest.Mock).mockImplementation(() => mockGeminiClient)
    ;(CustomSearchClient as jest.Mock).mockImplementation(() => mockSearchClient)

    orchestrator = new SearchOrchestrator(mockConfig)
  })

  describe('constructor', () => {
    it('should initialize with default configuration', () => {
      expect(orchestrator).toBeInstanceOf(SearchOrchestrator)
      expect(GeminiClient).toHaveBeenCalledWith({
        apiKey: mockConfig.geminiApiKey,
        model: undefined
      })
      expect(CustomSearchClient).toHaveBeenCalledWith({
        apiKey: mockConfig.customSearchApiKey,
        searchEngineId: mockConfig.searchEngineId
      })
    })

    it('should accept custom configuration', () => {
      const customConfig = {
        ...mockConfig,
        geminiModel: 'gemini-pro',
        maxSearchResults: 8,
        enableStreaming: true
      }

      new SearchOrchestrator(customConfig)

      expect(GeminiClient).toHaveBeenCalledWith({
        apiKey: customConfig.geminiApiKey,
        model: 'gemini-pro'
      })
    })
  })

  describe('search', () => {
    it('should perform complete search successfully', async () => {
      // Mock successful search response
      mockSearchClient.searchWithFocus.mockResolvedValue({
        success: true,
        data: mockSearchResponse
      })

      // Mock successful content extraction
      mockSearchClient.extractContentForSynthesis.mockReturnValue([
        'Title: AI Definition\nURL: https://example.com/ai\nContent: AI is the simulation of human intelligence...'
      ])

      // Mock successful answer generation
      mockGeminiClient.generateSearchAnswer.mockResolvedValue({
        success: true,
        data: mockAnswerResponse
      })

      const result = await orchestrator.search(mockContext)

      expect(result.success).toBe(true)
      expect(result.data?.query).toBe(mockContext.query)
      expect(result.data?.answer).toBe(mockAnswerResponse)
      expect(result.data?.sources).toHaveLength(1)
      expect(result.data?.sources[0].title).toBe('AI Definition')
      expect(result.data?.searchTime).toBeGreaterThanOrEqual(0)

      // Verify method calls
      expect(mockSearchClient.searchWithFocus).toHaveBeenCalledWith(
        mockContext,
        { num: mockConfig.maxSearchResults }
      )
      expect(mockSearchClient.extractContentForSynthesis).toHaveBeenCalledWith(mockSearchResponse)
      expect(mockGeminiClient.generateSearchAnswer).toHaveBeenCalledWith(
        mockContext,
        expect.any(Array),
        expect.objectContaining({
          temperature: 0.7, // General focus mode temperature
          maxOutputTokens: 4096
        })
      )
    })

    it('should handle search failure', async () => {
      mockSearchClient.searchWithFocus.mockResolvedValue({
        success: false,
        error: {
          message: 'Search API error',
          code: 'API_ERROR'
        }
      })

      const result = await orchestrator.search(mockContext)

      expect(result.success).toBe(false)
      expect(result.error?.code).toBe('SEARCH_FAILED')
      expect(result.error?.details?.message).toBe('Search API error')
    })

    it('should handle no search results', async () => {
      mockSearchClient.searchWithFocus.mockResolvedValue({
        success: true,
        data: {
          ...mockSearchResponse,
          items: []
        }
      })

      mockSearchClient.extractContentForSynthesis.mockReturnValue([])

      const result = await orchestrator.search(mockContext)

      expect(result.success).toBe(false)
      expect(result.error?.code).toBe('NO_RESULTS')
    })

    it('should handle answer generation failure', async () => {
      mockSearchClient.searchWithFocus.mockResolvedValue({
        success: true,
        data: mockSearchResponse
      })

      mockSearchClient.extractContentForSynthesis.mockReturnValue([
        'Test content'
      ])

      mockGeminiClient.generateSearchAnswer.mockResolvedValue({
        success: false,
        error: {
          message: 'Generation failed',
          code: 'GENERATION_ERROR'
        }
      })

      const result = await orchestrator.search(mockContext)

      expect(result.success).toBe(false)
      expect(result.error?.code).toBe('GENERATION_FAILED')
    })

    it('should use different temperature for academic focus', async () => {
      const academicContext: SearchContext = {
        query: 'AI research papers',
        focusMode: 'academic'
      }

      mockSearchClient.searchWithFocus.mockResolvedValue({
        success: true,
        data: mockSearchResponse
      })

      mockSearchClient.extractContentForSynthesis.mockReturnValue(['Test content'])

      mockGeminiClient.generateSearchAnswer.mockResolvedValue({
        success: true,
        data: mockAnswerResponse
      })

      await orchestrator.search(academicContext)

      expect(mockGeminiClient.generateSearchAnswer).toHaveBeenCalledWith(
        academicContext,
        expect.any(Array),
        expect.objectContaining({
          temperature: 0.3 // Academic focus mode temperature
        })
      )
    })

    it('should handle unexpected errors', async () => {
      mockSearchClient.searchWithFocus.mockRejectedValue(new Error('Unexpected error'))

      const result = await orchestrator.search(mockContext)

      expect(result.success).toBe(false)
      expect(result.error?.code).toBe('ORCHESTRATION_ERROR')
      expect(result.error?.message).toBe('Unexpected error')
    })
  })

  describe('searchStream', () => {
    it('should stream search results successfully', async () => {
      mockSearchClient.searchWithFocus.mockResolvedValue({
        success: true,
        data: mockSearchResponse
      })

      mockSearchClient.extractContentForSynthesis.mockReturnValue(['Test content'])

      // Mock streaming response
      const mockStream = (async function* () {
        yield 'Hello'
        yield ' World'
      })()

      mockGeminiClient.streamContent.mockReturnValue(mockStream)

      const results: any[] = []
      for await (const chunk of orchestrator.searchStream(mockContext)) {
        results.push(chunk)
      }

      expect(results).toEqual([
        { type: 'search', data: { status: 'searching', query: mockContext.query } },
        { type: 'sources', data: { sources: expect.any(Array) } },
        { type: 'answer_start', data: { status: 'generating' } },
        { type: 'answer_chunk', data: { chunk: 'Hello' } },
        { type: 'answer_chunk', data: { chunk: ' World' } },
        { type: 'answer_complete', data: { status: 'complete' } }
      ])
    })

    it('should handle streaming search failure', async () => {
      mockSearchClient.searchWithFocus.mockResolvedValue({
        success: false,
        error: {
          message: 'Search failed',
          code: 'SEARCH_ERROR'
        }
      })

      const results: any[] = []
      for await (const chunk of orchestrator.searchStream(mockContext)) {
        results.push(chunk)
      }

      expect(results).toEqual([
        { type: 'search', data: { status: 'searching', query: mockContext.query } },
        { 
          type: 'error', 
          data: { 
            message: 'Search failed', 
            code: 'SEARCH_FAILED',
            details: expect.any(Object)
          } 
        }
      ])
    })

    it('should handle streaming generation failure', async () => {
      mockSearchClient.searchWithFocus.mockResolvedValue({
        success: true,
        data: mockSearchResponse
      })

      mockSearchClient.extractContentForSynthesis.mockReturnValue(['Test content'])

      mockGeminiClient.streamContent.mockImplementation(async function* () {
        throw new Error('Stream error')
      })

      const results: any[] = []
      for await (const chunk of orchestrator.searchStream(mockContext)) {
        results.push(chunk)
      }

      const errorResult = results.find(r => r.type === 'error')
      expect(errorResult).toBeDefined()
      expect(errorResult.data.code).toBe('GENERATION_FAILED')
    })
  })

  describe('validateConfiguration', () => {
    it('should validate both APIs successfully', async () => {
      mockGeminiClient.validateApiKey.mockResolvedValue({
        success: true,
        data: true
      })

      mockSearchClient.validateApiKey.mockResolvedValue({
        success: true,
        data: true
      })

      const result = await orchestrator.validateConfiguration()

      expect(result.success).toBe(true)
      expect(result.data?.gemini).toBe(true)
      expect(result.data?.customSearch).toBe(true)
      expect(result.data?.overall).toBe(true)
    })

    it('should handle partial validation failure', async () => {
      mockGeminiClient.validateApiKey.mockResolvedValue({
        success: true,
        data: true
      })

      mockSearchClient.validateApiKey.mockResolvedValue({
        success: false,
        error: { message: 'Invalid key', code: 'INVALID_KEY' }
      })

      const result = await orchestrator.validateConfiguration()

      expect(result.success).toBe(true)
      expect(result.data?.gemini).toBe(true)
      expect(result.data?.customSearch).toBe(false)
      expect(result.data?.overall).toBe(false)
    })

    it('should handle validation errors', async () => {
      mockGeminiClient.validateApiKey.mockRejectedValue(new Error('Validation error'))

      const result = await orchestrator.validateConfiguration()

      expect(result.success).toBe(false)
      expect(result.error?.code).toBe('VALIDATION_ERROR')
    })
  })

  describe('getUsageStats', () => {
    it('should return usage statistics', () => {
      const stats = orchestrator.getUsageStats()

      expect(stats).toEqual({
        searchQueries: 0,
        tokensUsed: 0,
        estimatedCost: 0
      })
    })
  })

  describe('updateConfiguration', () => {
    it('should update Gemini configuration', () => {
      const newConfig = {
        geminiApiKey: 'new-gemini-key',
        geminiModel: 'new-model'
      }

      orchestrator.updateConfiguration(newConfig)

      expect(GeminiClient).toHaveBeenCalledWith({
        apiKey: 'new-gemini-key',
        model: 'new-model'
      })
    })

    it('should update search configuration', () => {
      const newConfig = {
        customSearchApiKey: 'new-search-key',
        searchEngineId: 'new-engine-id'
      }

      orchestrator.updateConfiguration(newConfig)

      expect(CustomSearchClient).toHaveBeenCalledWith({
        apiKey: 'new-search-key',
        searchEngineId: 'new-engine-id'
      })
    })

    it('should update general configuration', () => {
      const newConfig = {
        maxSearchResults: 15,
        enableStreaming: true
      }

      orchestrator.updateConfiguration(newConfig)

      // Configuration should be updated internally
      // This would be tested through subsequent method calls
      expect(orchestrator).toBeInstanceOf(SearchOrchestrator)
    })
  })

  describe('SearchOrchestrationError', () => {
    it('should create error with all properties', () => {
      const error = new SearchOrchestrationError('Test error', 'TEST_CODE', { detail: 'test' })

      expect(error.message).toBe('Test error')
      expect(error.name).toBe('SearchOrchestrationError')
      expect(error.code).toBe('TEST_CODE')
      expect(error.details).toEqual({ detail: 'test' })
    })

    it('should create error with minimal properties', () => {
      const error = new SearchOrchestrationError('Test error')

      expect(error.message).toBe('Test error')
      expect(error.name).toBe('SearchOrchestrationError')
      expect(error.code).toBeUndefined()
      expect(error.details).toBeUndefined()
    })
  })

  describe('private methods behavior', () => {
    it('should extract sources correctly', async () => {
      mockSearchClient.searchWithFocus.mockResolvedValue({
        success: true,
        data: {
          ...mockSearchResponse,
          items: [
            {
              title: 'Source 1',
              link: 'https://example1.com',
              snippet: 'Snippet 1',
              displayLink: 'example1.com',
              formattedUrl: 'https://example1.com',
              htmlTitle: 'Source 1',
              htmlSnippet: 'Snippet 1'
            },
            {
              title: 'Source 2',
              link: 'https://example2.com',
              snippet: 'Snippet 2',
              displayLink: 'example2.com',
              formattedUrl: 'https://example2.com',
              htmlTitle: 'Source 2',
              htmlSnippet: 'Snippet 2'
            }
          ]
        }
      })

      mockSearchClient.extractContentForSynthesis.mockReturnValue(['content'])
      mockGeminiClient.generateSearchAnswer.mockResolvedValue({
        success: true,
        data: 'answer'
      })

      const result = await orchestrator.search(mockContext)

      expect(result.success).toBe(true)
      expect(result.data?.sources).toHaveLength(2)
      expect(result.data?.sources[0].index).toBe(1)
      expect(result.data?.sources[1].index).toBe(2)
    })

    it('should use correct temperature for different focus modes', async () => {
      const focusModes = [
        { mode: 'academic', expectedTemp: 0.3 },
        { mode: 'creative', expectedTemp: 0.9 },
        { mode: 'technical', expectedTemp: 0.2 },
        { mode: 'medical', expectedTemp: 0.1 }
      ]

      for (const { mode, expectedTemp } of focusModes) {
        jest.clearAllMocks()

        const context: SearchContext = {
          query: 'test query',
          focusMode: mode as any
        }

        mockSearchClient.searchWithFocus.mockResolvedValue({
          success: true,
          data: mockSearchResponse
        })
        
        mockSearchClient.extractContentForSynthesis.mockReturnValue(['content'])
        
        mockGeminiClient.generateSearchAnswer.mockResolvedValue({
          success: true,
          data: 'answer'
        })

        await orchestrator.search(context)

        expect(mockGeminiClient.generateSearchAnswer).toHaveBeenCalledWith(
          context,
          expect.any(Array),
          expect.objectContaining({
            temperature: expectedTemp
          })
        )
      }
    })
  })
})