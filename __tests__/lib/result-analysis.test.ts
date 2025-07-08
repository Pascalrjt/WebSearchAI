import { SearchOrchestrator } from '@/lib/api/orchestrator'
import { GeminiClient } from '@/lib/api/gemini'
import { CustomSearchClient } from '@/lib/api/search'
import { SearchContext, SearchFocusMode, ResultAnalysis } from '@/lib/types/api'

// Mock the API clients
jest.mock('@/lib/api/gemini')
jest.mock('@/lib/api/search')

const MockedGeminiClient = GeminiClient as jest.MockedClass<typeof GeminiClient>
const MockedCustomSearchClient = CustomSearchClient as jest.MockedClass<typeof CustomSearchClient>

describe('SearchOrchestrator - Result Analysis', () => {
  let orchestrator: SearchOrchestrator
  let mockGeminiClient: jest.Mocked<GeminiClient>
  let mockSearchClient: jest.Mocked<CustomSearchClient>

  const mockConfig = {
    geminiApiKey: 'test-gemini-key',
    customSearchApiKey: 'test-search-key',
    searchEngineId: 'test-engine-id',
    enableIterativeSearch: true,
    maxSearchIterations: 3,
    completenessThreshold: 80,
    maxFollowupQueries: 5
  }

  beforeEach(() => {
    jest.clearAllMocks()
    
    // Create mock instances
    mockGeminiClient = {
      generateContent: jest.fn(),
      validateApiKey: jest.fn(),
      streamContent: jest.fn(),
      generateSearchAnswer: jest.fn()
    } as any

    mockSearchClient = {
      search: jest.fn(),
      searchWithFocus: jest.fn(),
      validateApiKey: jest.fn(),
      extractContentForSynthesis: jest.fn()
    } as any

    // Mock constructors
    MockedGeminiClient.mockImplementation(() => mockGeminiClient)
    MockedCustomSearchClient.mockImplementation(() => mockSearchClient)

    orchestrator = new SearchOrchestrator(mockConfig)
  })

  describe('analyzeSearchResults', () => {
    const testContext: SearchContext = {
      query: 'How does photosynthesis work?',
      focusMode: 'academic' as SearchFocusMode,
      language: 'en',
      region: 'US'
    }

    it('should return low completeness for empty search results', async () => {
      const result = await orchestrator.analyzeSearchResults(testContext, [])

      expect(result.success).toBe(true)
      expect(result.data?.completeness).toBe(0)
      expect(result.data?.needsMoreSearch).toBe(true)
      expect(result.data?.informationGaps).toContain('No search results available')
    })

    it('should return low completeness when no content can be extracted', async () => {
      const mockSearchResults = [
        {
          items: [{ title: 'Test', link: 'http://test.com', snippet: 'Test snippet', displayLink: 'test.com' }],
          totalResults: 1,
          hasNextPage: false
        }
      ] as any

      mockSearchClient.extractContentForSynthesis.mockReturnValue([])

      const result = await orchestrator.analyzeSearchResults(testContext, mockSearchResults)

      expect(result.success).toBe(true)
      expect(result.data?.completeness).toBe(10)
      expect(result.data?.needsMoreSearch).toBe(true)
      expect(result.data?.gapCategories.factual).toContain('Limited factual data available')
    })

    it('should analyze search results using LLM when content is available', async () => {
      const mockSearchResults = [
        {
          items: [
            { title: 'Photosynthesis Overview', link: 'http://example.com', snippet: 'Basic info about photosynthesis', displayLink: 'example.com' },
            { title: 'Plant Biology', link: 'http://test.com', snippet: 'More plant details', displayLink: 'test.com' }
          ],
          totalResults: 2,
          hasNextPage: false
        }
      ] as any

      const mockContent = [
        'Photosynthesis is the process by which plants convert light energy into chemical energy',
        'Plants use chlorophyll to capture sunlight and convert CO2 and water into glucose'
      ]

      const mockAnalysisResponse = {
        completeness: 75,
        informationGaps: ['Missing details about chemical equations', 'No information about different types of photosynthesis'],
        gapCategories: {
          factual: ['Chemical equation for photosynthesis'],
          contextual: ['Evolutionary history of photosynthesis'],
          verification: [],
          depth: ['Detailed molecular mechanisms']
        },
        followupTopics: ['photosynthesis chemical equation', 'chloroplast structure'],
        confidenceLevel: 85,
        needsMoreSearch: true,
        reasoning: 'Good basic coverage but missing important chemical and molecular details'
      }

      mockSearchClient.extractContentForSynthesis.mockReturnValue(mockContent)
      mockGeminiClient.generateContent.mockResolvedValue({
        success: true,
        data: {
          candidates: [{
            content: {
              parts: [{ text: JSON.stringify(mockAnalysisResponse) }]
            }
          }]
        }
      } as any)

      const result = await orchestrator.analyzeSearchResults(testContext, mockSearchResults)

      expect(result.success).toBe(true)
      expect(result.data?.completeness).toBe(75)
      expect(result.data?.needsMoreSearch).toBe(true)
      expect(result.data?.informationGaps).toHaveLength(2)
      expect(result.data?.gapCategories.factual).toContain('Chemical equation for photosynthesis')
      expect(result.data?.followupTopics).toContain('photosynthesis chemical equation')
      expect(result.data?.confidenceLevel).toBe(85)
      expect(result.data?.reasoning).toBe('Good basic coverage but missing important chemical and molecular details')
    })

    it('should handle high completeness scores correctly', async () => {
      const mockSearchResults = [
        {
          items: [{ title: 'Complete Guide', link: 'http://complete.com', snippet: 'Comprehensive info', displayLink: 'complete.com' }],
          totalResults: 1,
          hasNextPage: false
        }
      ] as any

      const mockContent = ['Very comprehensive information about photosynthesis including all mechanisms']

      const mockAnalysisResponse = {
        completeness: 95,
        informationGaps: [],
        gapCategories: { factual: [], contextual: [], verification: [], depth: [] },
        followupTopics: [],
        confidenceLevel: 95,
        needsMoreSearch: false,
        reasoning: 'Comprehensive coverage of the topic with all major aspects addressed'
      }

      mockSearchClient.extractContentForSynthesis.mockReturnValue(mockContent)
      mockGeminiClient.generateContent.mockResolvedValue({
        success: true,
        data: {
          candidates: [{
            content: {
              parts: [{ text: JSON.stringify(mockAnalysisResponse) }]
            }
          }]
        }
      } as any)

      const result = await orchestrator.analyzeSearchResults(testContext, mockSearchResults)

      expect(result.success).toBe(true)
      expect(result.data?.completeness).toBe(95)
      expect(result.data?.needsMoreSearch).toBe(false)
      expect(result.data?.informationGaps).toHaveLength(0)
    })

    it('should handle LLM analysis failure gracefully', async () => {
      const mockSearchResults = [
        {
          items: [{ title: 'Test', link: 'http://test.com', snippet: 'Test snippet', displayLink: 'test.com' }],
          totalResults: 1,
          hasNextPage: false
        }
      ] as any

      mockSearchClient.extractContentForSynthesis.mockReturnValue(['Some content'])
      mockGeminiClient.generateContent.mockResolvedValue({
        success: false,
        error: { message: 'API rate limit exceeded', code: 'RATE_LIMIT' }
      } as any)

      const result = await orchestrator.analyzeSearchResults(testContext, mockSearchResults)

      expect(result.success).toBe(false)
      expect(result.error?.message).toBe('Analysis generation failed')
      expect(result.error?.code).toBe('ANALYSIS_FAILED')
    })

    it('should handle malformed LLM response with fallback analysis', async () => {
      const mockSearchResults = [
        {
          items: [{ title: 'Test', link: 'http://test.com', snippet: 'Test snippet', displayLink: 'test.com' }],
          totalResults: 1,
          hasNextPage: false
        }
      ] as any

      mockSearchClient.extractContentForSynthesis.mockReturnValue(['Some content'])
      mockGeminiClient.generateContent.mockResolvedValue({
        success: true,
        data: {
          candidates: [{
            content: {
              parts: [{ text: 'This is not valid JSON response' }]
            }
          }]
        }
      } as any)

      const result = await orchestrator.analyzeSearchResults(testContext, mockSearchResults)

      expect(result.success).toBe(true)
      expect(result.data?.completeness).toBe(50)
      expect(result.data?.needsMoreSearch).toBe(true)
      expect(result.data?.informationGaps).toContain('Unable to properly analyze search results')
      expect(result.data?.confidenceLevel).toBe(30)
      expect(result.data?.reasoning).toContain('Analysis parsing failed')
    })

    it('should validate and sanitize analysis data correctly', async () => {
      const mockSearchResults = [
        {
          items: [{ title: 'Test', link: 'http://test.com', snippet: 'Test snippet', displayLink: 'test.com' }],
          totalResults: 1,
          hasNextPage: false
        }
      ] as any

      const mockAnalysisResponse = {
        completeness: 150, // Should be clamped to 100
        informationGaps: 'not an array', // Should be converted to empty array
        gapCategories: {
          factual: ['valid fact'],
          contextual: 'not an array', // Should be converted to empty array
          verification: null,
          depth: ['valid depth issue']
        },
        followupTopics: ['valid topic'],
        confidenceLevel: -10, // Should be clamped to 0
        needsMoreSearch: 'yes', // Should be converted to boolean true
        reasoning: 12345 // Should be converted to string
      }

      mockSearchClient.extractContentForSynthesis.mockReturnValue(['Some content'])
      mockGeminiClient.generateContent.mockResolvedValue({
        success: true,
        data: {
          candidates: [{
            content: {
              parts: [{ text: JSON.stringify(mockAnalysisResponse) }]
            }
          }]
        }
      } as any)

      const result = await orchestrator.analyzeSearchResults(testContext, mockSearchResults)

      expect(result.success).toBe(true)
      expect(result.data?.completeness).toBe(100) // Clamped from 150
      expect(result.data?.informationGaps).toEqual([]) // Converted from invalid type
      expect(result.data?.gapCategories.factual).toEqual(['valid fact'])
      expect(result.data?.gapCategories.contextual).toEqual([]) // Converted from invalid type
      expect(result.data?.gapCategories.verification).toEqual([]) // Converted from null
      expect(result.data?.gapCategories.depth).toEqual(['valid depth issue'])
      expect(result.data?.confidenceLevel).toBe(0) // Clamped from -10
      expect(result.data?.needsMoreSearch).toBe(true) // Converted from string
      expect(result.data?.reasoning).toBe('12345') // Converted to string
    })

    it('should use focus mode-specific analysis instructions', async () => {
      const technicalContext: SearchContext = {
        query: 'How to implement OAuth2',
        focusMode: 'technical' as SearchFocusMode,
        language: 'en',
        region: 'US'
      }

      const mockSearchResults = [
        {
          items: [{ title: 'OAuth Guide', link: 'http://oauth.com', snippet: 'OAuth basics', displayLink: 'oauth.com' }],
          totalResults: 1,
          hasNextPage: false
        }
      ] as any

      mockSearchClient.extractContentForSynthesis.mockReturnValue(['OAuth implementation guide'])
      mockGeminiClient.generateContent.mockResolvedValue({
        success: true,
        data: {
          candidates: [{
            content: {
              parts: [{ text: JSON.stringify({
                completeness: 60,
                informationGaps: ['Missing code examples'],
                gapCategories: { factual: [], contextual: [], verification: [], depth: ['Need implementation details'] },
                followupTopics: ['OAuth2 code examples'],
                confidenceLevel: 70,
                needsMoreSearch: true,
                reasoning: 'Technical focus requires more implementation details'
              }) }]
            }
          }]
        }
      } as any)

      const result = await orchestrator.analyzeSearchResults(technicalContext, mockSearchResults)

      expect(result.success).toBe(true)
      expect(mockGeminiClient.generateContent).toHaveBeenCalledWith(
        expect.stringContaining('Focus on implementation completeness and technical accuracy'),
        expect.any(Object)
      )
    })

    it('should handle unexpected errors during analysis', async () => {
      const mockSearchResults = [
        {
          items: [{ title: 'Test', link: 'http://test.com', snippet: 'Test snippet', displayLink: 'test.com' }],
          totalResults: 1,
          hasNextPage: false
        }
      ] as any

      mockSearchClient.extractContentForSynthesis.mockReturnValue(['Some content'])
      mockGeminiClient.generateContent.mockRejectedValue(new Error('Network timeout'))

      const result = await orchestrator.analyzeSearchResults(testContext, mockSearchResults)

      expect(result.success).toBe(false)
      expect(result.error?.message).toBe('Result analysis error')
      expect(result.error?.code).toBe('ANALYSIS_ERROR')
      expect(result.error?.details).toBeInstanceOf(Error)
    })
  })

  describe('Analysis prompt building', () => {
    it('should include completeness threshold in prompt', async () => {
      const mockSearchResults = [
        {
          items: [{ title: 'Test', link: 'http://test.com', snippet: 'Test snippet', displayLink: 'test.com' }],
          totalResults: 1,
          hasNextPage: false
        }
      ] as any

      mockSearchClient.extractContentForSynthesis.mockReturnValue(['Some content'])
      mockGeminiClient.generateContent.mockResolvedValue({
        success: true,
        data: {
          candidates: [{
            content: {
              parts: [{ text: JSON.stringify({
                completeness: 50,
                informationGaps: [],
                gapCategories: { factual: [], contextual: [], verification: [], depth: [] },
                followupTopics: [],
                confidenceLevel: 50,
                needsMoreSearch: true,
                reasoning: 'Test reasoning'
              }) }]
            }
          }]
        }
      } as any)

      const testContext: SearchContext = {
        query: 'test query',
        focusMode: 'general',
        language: 'en',
        region: 'US'
      }

      await orchestrator.analyzeSearchResults(testContext, mockSearchResults)

      expect(mockGeminiClient.generateContent).toHaveBeenCalledWith(
        expect.stringContaining(`completeness < ${mockConfig.completenessThreshold}%`),
        expect.any(Object)
      )
    })
  })
})