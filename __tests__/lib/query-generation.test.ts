import { SearchOrchestrator, SearchOrchestrationConfig } from '@/lib/api/orchestrator'
import { GeminiClient } from '@/lib/api/gemini'
import { CustomSearchClient } from '@/lib/api/search'
import { SearchContext } from '@/lib/types/api'

// Mock the API clients
jest.mock('@/lib/api/gemini')
jest.mock('@/lib/api/search')

const MockedGeminiClient = GeminiClient as jest.MockedClass<typeof GeminiClient>
const MockedCustomSearchClient = CustomSearchClient as jest.MockedClass<typeof CustomSearchClient>

describe('SearchOrchestrator Query Generation', () => {
  let orchestrator: SearchOrchestrator
  let mockGeminiClient: jest.Mocked<GeminiClient>
  let mockSearchClient: jest.Mocked<CustomSearchClient>

  const mockConfig: SearchOrchestrationConfig = {
    geminiApiKey: 'test-gemini-key',
    customSearchApiKey: 'test-search-key',
    searchEngineId: 'test-engine-id',
    enableQueryGeneration: true,
    maxGeneratedQueries: 3,
    maxSearchResults: 10
  }

  beforeEach(() => {
    jest.clearAllMocks()
    
    mockGeminiClient = {
      generateContent: jest.fn(),
      generateSearchAnswer: jest.fn(),
      streamContent: jest.fn(),
      validateApiKey: jest.fn()
    } as any

    mockSearchClient = {
      search: jest.fn(),
      searchWithFocus: jest.fn(),
      extractContentForSynthesis: jest.fn(),
      validateApiKey: jest.fn()
    } as any

    MockedGeminiClient.mockImplementation(() => mockGeminiClient)
    MockedCustomSearchClient.mockImplementation(() => mockSearchClient)

    orchestrator = new SearchOrchestrator(mockConfig)
  })

  describe('generateSearchQueries', () => {
    const mockContext: SearchContext = {
      query: 'How to fix car engine problems',
      focusMode: 'technical',
      language: 'en',
      region: 'US'
    }

    it('should generate optimized search queries successfully', async () => {
      const mockLLMResponse = {
        success: true,
        data: {
          candidates: [{
            content: {
              parts: [{
                text: '1. automotive engine troubleshooting common symptoms\n2. car engine repair diagnostic steps\n3. engine malfunction causes solutions'
              }]
            }
          }]
        }
      }

      mockGeminiClient.generateContent.mockResolvedValue(mockLLMResponse)

      const result = await orchestrator.generateSearchQueries(mockContext)

      expect(result.success).toBe(true)
      expect(result.data).toEqual([
        'automotive engine troubleshooting common symptoms',
        'car engine repair diagnostic steps',
        'engine malfunction causes solutions'
      ])
      expect(mockGeminiClient.generateContent).toHaveBeenCalledWith(
        expect.stringContaining('You are a search query optimization expert'),
        {
          temperature: 0.3,
          maxOutputTokens: 1024
        }
      )
    })

    it('should handle LLM response failure gracefully', async () => {
      mockGeminiClient.generateContent.mockResolvedValue({
        success: false,
        error: { message: 'API error', code: 'API_ERROR' }
      })

      const result = await orchestrator.generateSearchQueries(mockContext)

      expect(result.success).toBe(false)
      expect(result.error?.code).toBe('QUERY_GENERATION_FAILED')
    })

    it('should fallback to original query when no queries generated', async () => {
      const mockLLMResponse = {
        success: true,
        data: {
          candidates: [{
            content: {
              parts: [{
                text: 'I cannot generate queries for this request.'
              }]
            }
          }]
        }
      }

      mockGeminiClient.generateContent.mockResolvedValue(mockLLMResponse)

      const result = await orchestrator.generateSearchQueries(mockContext)

      expect(result.success).toBe(true)
      expect(result.data).toContain(mockContext.query)
    })

    it('should parse queries correctly from different formats', async () => {
      const mockLLMResponse = {
        success: true,
        data: {
          candidates: [{
            content: {
              parts: [{
                text: '1. "quoted query one"\n2. unquoted query two\n3. query three with extra spaces   '
              }]
            }
          }]
        }
      }

      mockGeminiClient.generateContent.mockResolvedValue(mockLLMResponse)

      const result = await orchestrator.generateSearchQueries(mockContext)

      expect(result.success).toBe(true)
      expect(result.data).toEqual([
        'quoted query one',
        'unquoted query two',
        'query three with extra spaces'
      ])
    })

    it('should limit queries to maxGeneratedQueries', async () => {
      const mockLLMResponse = {
        success: true,
        data: {
          candidates: [{
            content: {
              parts: [{
                text: '1. query one\n2. query two\n3. query three\n4. query four\n5. query five'
              }]
            }
          }]
        }
      }

      mockGeminiClient.generateContent.mockResolvedValue(mockLLMResponse)

      const result = await orchestrator.generateSearchQueries(mockContext)

      expect(result.success).toBe(true)
      expect(result.data).toHaveLength(3) // maxGeneratedQueries
    })
  })

  describe('searchMultipleQueries', () => {
    const mockContext: SearchContext = {
      query: 'test query',
      focusMode: 'general',
      language: 'en',
      region: 'US'
    }

    const mockQueries = ['query 1', 'query 2', 'query 3']

    it('should execute multiple searches in parallel', async () => {
      const mockSearchResponse = {
        success: true,
        data: {
          items: [{ title: 'Test', link: 'http://test.com', snippet: 'Test snippet' }],
          searchInformation: { searchTime: 0.1, totalResults: '1', formattedTotalResults: '1' },
          totalResults: 1,
          hasNextPage: false
        }
      }

      mockSearchClient.search.mockResolvedValue(mockSearchResponse)

      const results = await orchestrator.searchMultipleQueries(mockQueries, mockContext)

      expect(results).toHaveLength(3)
      expect(mockSearchClient.search).toHaveBeenCalledTimes(3)
      expect(results.every(r => r.success)).toBe(true)
    })

    it('should handle individual search failures gracefully', async () => {
      mockSearchClient.search
        .mockResolvedValueOnce({ success: true, data: { items: [], searchInformation: {}, totalResults: 0, hasNextPage: false } })
        .mockRejectedValueOnce(new Error('Search failed'))
        .mockResolvedValueOnce({ success: true, data: { items: [], searchInformation: {}, totalResults: 0, hasNextPage: false } })

      const results = await orchestrator.searchMultipleQueries(mockQueries, mockContext)

      expect(results).toHaveLength(3)
      expect(results[0].success).toBe(true)
      expect(results[1].success).toBe(false)
      expect(results[2].success).toBe(true)
    })

    it('should distribute search result limits across queries', async () => {
      const configWithLimit = {
        ...mockConfig,
        maxSearchResults: 9
      }
      orchestrator = new SearchOrchestrator(configWithLimit)

      mockSearchClient.search.mockResolvedValue({
        success: true,
        data: { items: [], searchInformation: {}, totalResults: 0, hasNextPage: false }
      })

      await orchestrator.searchMultipleQueries(mockQueries, mockContext)

      // Should distribute 9 results across 3 queries = 3 results per query
      expect(mockSearchClient.search).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ num: 3 })
      )
    })
  })

  describe('aggregateResults', () => {
    it('should combine and deduplicate search results', async () => {
      const searchResponse1 = {
        items: [
          { title: 'Result 1', link: 'http://test1.com', snippet: 'Snippet 1', displayLink: 'test1.com', formattedUrl: '', htmlTitle: '', htmlSnippet: '' },
          { title: 'Result 2', link: 'http://test2.com', snippet: 'Snippet 2', displayLink: 'test2.com', formattedUrl: '', htmlTitle: '', htmlSnippet: '' }
        ],
        searchInformation: { searchTime: 0.1, totalResults: '2', formattedTotalResults: '2' },
        totalResults: 2,
        hasNextPage: false
      }

      const searchResponse2 = {
        items: [
          { title: 'Result 2', link: 'http://test2.com', snippet: 'Snippet 2 duplicate', displayLink: 'test2.com', formattedUrl: '', htmlTitle: '', htmlSnippet: '' },
          { title: 'Result 3', link: 'http://test3.com', snippet: 'Snippet 3', displayLink: 'test3.com', formattedUrl: '', htmlTitle: '', htmlSnippet: '' }
        ],
        searchInformation: { searchTime: 0.1, totalResults: '2', formattedTotalResults: '2' },
        totalResults: 2,
        hasNextPage: false
      }

      const aggregated = orchestrator.aggregateResults([searchResponse1, searchResponse2])

      expect(aggregated.items).toHaveLength(3) // Deduplicated
      expect(aggregated.items.map(item => item.link)).toEqual([
        'http://test1.com',
        'http://test2.com',
        'http://test3.com'
      ])
    })

    it('should respect maxSearchResults limit', async () => {
      const configWithLimit = {
        ...mockConfig,
        maxSearchResults: 2
      }
      orchestrator = new SearchOrchestrator(configWithLimit)

      const searchResponse = {
        items: [
          { title: 'Result 1', link: 'http://test1.com', snippet: 'Snippet 1', displayLink: 'test1.com', formattedUrl: '', htmlTitle: '', htmlSnippet: '' },
          { title: 'Result 2', link: 'http://test2.com', snippet: 'Snippet 2', displayLink: 'test2.com', formattedUrl: '', htmlTitle: '', htmlSnippet: '' },
          { title: 'Result 3', link: 'http://test3.com', snippet: 'Snippet 3', displayLink: 'test3.com', formattedUrl: '', htmlTitle: '', htmlSnippet: '' }
        ],
        searchInformation: { searchTime: 0.1, totalResults: '3', formattedTotalResults: '3' },
        totalResults: 3,
        hasNextPage: false
      }

      const aggregated = orchestrator.aggregateResults([searchResponse])

      expect(aggregated.items).toHaveLength(2) // Limited by maxSearchResults
    })
  })

  describe('cost management', () => {
    it('should calculate query generation cost correctly', () => {
      const baseSearchCost = 0.005 // $0.005 for base search
      
      const costAnalysis = orchestrator.estimateQueryGenerationCost(baseSearchCost)

      expect(costAnalysis.queryGenerationCost).toBeGreaterThan(0)
      expect(costAnalysis.multiSearchCost).toBe(baseSearchCost * 3) // 3 queries
      expect(costAnalysis.totalCost).toBeGreaterThan(baseSearchCost)
      expect(costAnalysis.costMultiplier).toBeGreaterThan(1)
    })

    it('should return correct cost when query generation is disabled', () => {
      const configNoGen = {
        ...mockConfig,
        enableQueryGeneration: false
      }
      orchestrator = new SearchOrchestrator(configNoGen)

      const baseSearchCost = 0.005
      const costAnalysis = orchestrator.estimateQueryGenerationCost(baseSearchCost)

      expect(costAnalysis.queryGenerationCost).toBe(0)
      expect(costAnalysis.multiSearchCost).toBe(baseSearchCost)
      expect(costAnalysis.totalCost).toBe(baseSearchCost)
      expect(costAnalysis.costMultiplier).toBe(1.0)
    })

    it('should provide cost-optimized configuration options', () => {
      const configs = orchestrator.getCostOptimizedConfig()

      expect(configs.budgetFriendly.enableQueryGeneration).toBe(false)
      expect(configs.balanced.enableQueryGeneration).toBe(true)
      expect(configs.balanced.maxGeneratedQueries).toBe(2)
      expect(configs.comprehensive.maxGeneratedQueries).toBe(3)
    })
  })

  describe('focus mode integration', () => {
    it('should generate focus-specific prompts for academic mode', async () => {
      const academicContext: SearchContext = {
        query: 'climate change effects',
        focusMode: 'academic',
        language: 'en',
        region: 'US'
      }

      mockGeminiClient.generateContent.mockResolvedValue({
        success: true,
        data: {
          candidates: [{
            content: {
              parts: [{
                text: '1. climate change research peer reviewed\n2. academic studies climate effects\n3. scientific analysis global warming'
              }]
            }
          }]
        }
      })

      await orchestrator.generateSearchQueries(academicContext)

      const calledPrompt = mockGeminiClient.generateContent.mock.calls[0][0]
      expect(calledPrompt).toContain('scholarly terminology')
      expect(calledPrompt).toContain('research')
      expect(calledPrompt).toContain('academic')
    })

    it('should generate focus-specific prompts for technical mode', async () => {
      const technicalContext: SearchContext = {
        query: 'API authentication',
        focusMode: 'technical',
        language: 'en',
        region: 'US'
      }

      mockGeminiClient.generateContent.mockResolvedValue({
        success: true,
        data: {
          candidates: [{
            content: {
              parts: [{
                text: '1. API authentication implementation guide\n2. OAuth authentication tutorial\n3. API security documentation'
              }]
            }
          }]
        }
      })

      await orchestrator.generateSearchQueries(technicalContext)

      const calledPrompt = mockGeminiClient.generateContent.mock.calls[0][0]
      expect(calledPrompt).toContain('technical terminology')
      expect(calledPrompt).toContain('documentation')
      expect(calledPrompt).toContain('implementation')
    })
  })
})