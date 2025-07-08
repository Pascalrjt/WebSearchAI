import { SearchOrchestrator } from '@/lib/api/orchestrator'
import { GeminiClient } from '@/lib/api/gemini'
import { CustomSearchClient } from '@/lib/api/search'
import { SearchContext, SearchFocusMode, ResultAnalysis } from '@/lib/types/api'

// Mock the API clients
jest.mock('@/lib/api/gemini')
jest.mock('@/lib/api/search')

const MockedGeminiClient = GeminiClient as jest.MockedClass<typeof GeminiClient>
const MockedCustomSearchClient = CustomSearchClient as jest.MockedClass<typeof CustomSearchClient>

describe('SearchOrchestrator - Iterative Search Logic', () => {
  let orchestrator: SearchOrchestrator
  let mockGeminiClient: jest.Mocked<GeminiClient>
  let mockSearchClient: jest.Mocked<CustomSearchClient>

  const mockIterativeConfig = {
    geminiApiKey: 'test-gemini-key',
    customSearchApiKey: 'test-search-key',
    searchEngineId: 'test-engine-id',
    enableIterativeSearch: true,
    maxSearchIterations: 3,
    completenessThreshold: 80,
    maxFollowupQueries: 3,
    enableQueryGeneration: true,
    maxGeneratedQueries: 3
  }

  const mockNonIterativeConfig = {
    ...mockIterativeConfig,
    enableIterativeSearch: false,
    maxSearchIterations: 1
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
  })

  describe('Non-iterative search (baseline)', () => {
    beforeEach(() => {
      orchestrator = new SearchOrchestrator(mockNonIterativeConfig)
    })

    const testContext: SearchContext = {
      query: 'What is artificial intelligence?',
      focusMode: 'general' as SearchFocusMode,
      language: 'en',
      region: 'US'
    }

    it('should perform standard search when iterative search is disabled', async () => {
      // Mock query generation
      mockGeminiClient.generateContent.mockResolvedValueOnce({
        success: true,
        data: {
          candidates: [{
            content: {
              parts: [{ text: '1. artificial intelligence definition\n2. AI applications examples\n3. machine learning basics' }]
            }
          }]
        }
      } as any)

      // Mock answer generation
      mockGeminiClient.generateSearchAnswer.mockResolvedValueOnce({
        success: true,
        data: 'AI is a comprehensive field of computer science...'
      } as any)

      // Mock search responses
      mockSearchClient.search.mockResolvedValue({
        success: true,
        data: {
          items: [
            { title: 'AI Overview', link: 'http://example1.com', snippet: 'AI definition', displayLink: 'example1.com' },
            { title: 'AI Applications', link: 'http://example2.com', snippet: 'AI uses', displayLink: 'example2.com' }
          ],
          totalResults: 2,
          hasNextPage: false
        }
      } as any)

      mockSearchClient.extractContentForSynthesis.mockReturnValue([
        'Artificial intelligence (AI) is the simulation of human intelligence...',
        'AI applications include machine learning, natural language processing...'
      ])

      const result = await orchestrator.search(testContext)

      expect(result.success).toBe(true)
      expect(result.data?.answer).toBe('AI is a comprehensive field of computer science...')
      expect(result.data?.sources).toHaveLength(2)
      
      // Should not call analysis or follow-up methods
      expect(mockGeminiClient.generateContent).toHaveBeenCalledTimes(1) // Only query generation
      expect(mockGeminiClient.generateSearchAnswer).toHaveBeenCalledTimes(1) // Answer generation
    })
  })

  describe('Iterative search with high completeness', () => {
    beforeEach(() => {
      orchestrator = new SearchOrchestrator(mockIterativeConfig)
    })

    const testContext: SearchContext = {
      query: 'Explain quantum computing principles',
      focusMode: 'academic' as SearchFocusMode,
      language: 'en',
      region: 'US'
    }

    it('should stop after first iteration when completeness threshold is met', async () => {
      // Mock query generation
      mockGeminiClient.generateContent
        .mockResolvedValueOnce({
          success: true,
          data: {
            candidates: [{
              content: {
                parts: [{ text: '1. quantum computing principles\n2. quantum algorithms overview\n3. quantum vs classical computing' }]
              }
            }]
          }
        } as any)
        // Mock analysis (high completeness)
        .mockResolvedValueOnce({
          success: true,
          data: {
            candidates: [{
              content: {
                parts: [{ text: JSON.stringify({
                  completeness: 95,
                  informationGaps: [],
                  gapCategories: { factual: [], contextual: [], verification: [], depth: [] },
                  followupTopics: [],
                  confidenceLevel: 95,
                  needsMoreSearch: false,
                  reasoning: 'Comprehensive coverage achieved'
                }) }]
              }
            }]
          }
        } as any)
      
      // Mock final answer generation
      mockGeminiClient.generateSearchAnswer.mockResolvedValueOnce({
        success: true,
        data: 'Quantum computing is a revolutionary approach...'
      } as any)

      // Mock search responses for initial queries
      mockSearchClient.search.mockResolvedValue({
        success: true,
        data: {
          items: [
            { title: 'Quantum Computing Basics', link: 'http://quantum1.com', snippet: 'Quantum principles', displayLink: 'quantum1.com' },
            { title: 'Quantum Algorithms', link: 'http://quantum2.com', snippet: 'Quantum algorithms', displayLink: 'quantum2.com' }
          ],
          totalResults: 2,
          hasNextPage: false
        }
      } as any)

      mockSearchClient.extractContentForSynthesis.mockReturnValue([
        'Quantum computing leverages quantum mechanical phenomena...',
        'Quantum algorithms like Shor\'s algorithm provide exponential speedup...'
      ])

      const result = await orchestrator.search(testContext)

      expect(result.success).toBe(true)
      expect(result.data?.answer).toBe('Quantum computing is a revolutionary approach...')
      
      // Should call: query generation, analysis (no follow-up needed)
      expect(mockGeminiClient.generateContent).toHaveBeenCalledTimes(2)
      expect(mockGeminiClient.generateSearchAnswer).toHaveBeenCalledTimes(1)
    })
  })

  describe('Iterative search with multiple iterations', () => {
    beforeEach(() => {
      orchestrator = new SearchOrchestrator(mockIterativeConfig)
    })

    const testContext: SearchContext = {
      query: 'How does climate change affect marine ecosystems?',
      focusMode: 'academic' as SearchFocusMode,
      language: 'en',
      region: 'US'
    }

    it('should perform multiple iterations until completeness threshold is met', async () => {
      // Mock query generation
      mockGeminiClient.generateContent
        .mockResolvedValueOnce({
          success: true,
          data: {
            candidates: [{
              content: {
                parts: [{ text: '1. climate change marine ecosystems\n2. ocean warming effects\n3. marine biodiversity impacts' }]
              }
            }]
          }
        } as any)
        // Mock first analysis (low completeness)
        .mockResolvedValueOnce({
          success: true,
          data: {
            candidates: [{
              content: {
                parts: [{ text: JSON.stringify({
                  completeness: 60,
                  informationGaps: ['Missing acidification data', 'No coral reef impacts'],
                  gapCategories: {
                    factual: ['Ocean acidification statistics'],
                    contextual: [],
                    verification: [],
                    depth: ['Coral reef damage details']
                  },
                  followupTopics: ['ocean acidification', 'coral bleaching'],
                  confidenceLevel: 70,
                  needsMoreSearch: true,
                  reasoning: 'More specific data needed'
                }) }]
              }
            }]
          }
        } as any)
        // Mock follow-up query generation
        .mockResolvedValueOnce({
          success: true,
          data: {
            candidates: [{
              content: {
                parts: [{ text: '1. ocean acidification statistics data\n2. coral reef bleaching climate change\n3. marine ecosystem damage research' }]
              }
            }]
          }
        } as any)
        // Mock second analysis (higher completeness)
        .mockResolvedValueOnce({
          success: true,
          data: {
            candidates: [{
              content: {
                parts: [{ text: JSON.stringify({
                  completeness: 85,
                  informationGaps: [],
                  gapCategories: { factual: [], contextual: [], verification: [], depth: [] },
                  followupTopics: [],
                  confidenceLevel: 85,
                  needsMoreSearch: false,
                  reasoning: 'Sufficient information gathered'
                }) }]
              }
            }]
          }
        } as any)
      
      // Mock final answer generation
      mockGeminiClient.generateSearchAnswer.mockResolvedValueOnce({
        success: true,
        data: 'Climate change significantly impacts marine ecosystems through ocean warming, acidification, and rising sea levels...'
      } as any)

      // Mock initial search responses
      mockSearchClient.search
        .mockResolvedValueOnce({
          success: true,
          data: {
            items: [
              { title: 'Climate Change Overview', link: 'http://climate1.com', snippet: 'Climate impacts', displayLink: 'climate1.com' }
            ],
            totalResults: 1,
            hasNextPage: false
          }
        } as any)
        .mockResolvedValueOnce({
          success: true,
          data: {
            items: [
              { title: 'Ocean Warming', link: 'http://ocean1.com', snippet: 'Ocean temperature rise', displayLink: 'ocean1.com' }
            ],
            totalResults: 1,
            hasNextPage: false
          }
        } as any)
        .mockResolvedValueOnce({
          success: true,
          data: {
            items: [
              { title: 'Marine Biodiversity', link: 'http://marine1.com', snippet: 'Species impacts', displayLink: 'marine1.com' }
            ],
            totalResults: 1,
            hasNextPage: false
          }
        } as any)
        // Mock follow-up search responses
        .mockResolvedValueOnce({
          success: true,
          data: {
            items: [
              { title: 'Ocean Acidification Data', link: 'http://acid1.com', snippet: 'pH level changes', displayLink: 'acid1.com' }
            ],
            totalResults: 1,
            hasNextPage: false
          }
        } as any)
        .mockResolvedValueOnce({
          success: true,
          data: {
            items: [
              { title: 'Coral Bleaching', link: 'http://coral1.com', snippet: 'Coral reef damage', displayLink: 'coral1.com' }
            ],
            totalResults: 1,
            hasNextPage: false
          }
        } as any)
        .mockResolvedValueOnce({
          success: true,
          data: {
            items: [
              { title: 'Marine Research', link: 'http://research1.com', snippet: 'Ecosystem studies', displayLink: 'research1.com' }
            ],
            totalResults: 1,
            hasNextPage: false
          }
        } as any)

      mockSearchClient.extractContentForSynthesis.mockReturnValue([
        'Climate change affects marine ecosystems through multiple pathways...',
        'Ocean acidification reduces pH levels significantly...',
        'Coral reefs are experiencing widespread bleaching events...'
      ])

      const result = await orchestrator.search(testContext)

      expect(result.success).toBe(true)
      expect(result.data?.answer).toContain('Climate change significantly impacts marine ecosystems')
      expect(result.data?.sources.length).toBeGreaterThan(3) // Should have results from multiple iterations
      
      // Should call: query generation, first analysis, follow-up generation, second analysis
      expect(mockGeminiClient.generateContent).toHaveBeenCalledTimes(4)
      expect(mockGeminiClient.generateSearchAnswer).toHaveBeenCalledTimes(1)
    })
  })

  describe('Diminishing returns detection', () => {
    beforeEach(() => {
      orchestrator = new SearchOrchestrator(mockIterativeConfig)
    })

    const testContext: SearchContext = {
      query: 'Machine learning algorithms overview',
      focusMode: 'technical' as SearchFocusMode,
      language: 'en',
      region: 'US'
    }

    it('should stop iterations when no new unique results are found', async () => {
      // Mock query generation
      mockGeminiClient.generateContent
        .mockResolvedValueOnce({
          success: true,
          data: {
            candidates: [{
              content: {
                parts: [{ text: '1. machine learning algorithms\n2. supervised learning methods\n3. neural networks overview' }]
              }
            }]
          }
        } as any)
        // Mock analysis (low completeness to trigger iteration)
        .mockResolvedValueOnce({
          success: true,
          data: {
            candidates: [{
              content: {
                parts: [{ text: JSON.stringify({
                  completeness: 65,
                  informationGaps: ['Missing deep learning details'],
                  gapCategories: {
                    factual: [],
                    contextual: [],
                    verification: [],
                    depth: ['Deep learning architectures']
                  },
                  followupTopics: ['deep learning'],
                  confidenceLevel: 70,
                  needsMoreSearch: true,
                  reasoning: 'Need more depth on deep learning'
                }) }]
              }
            }]
          }
        } as any)
        // Mock follow-up query generation
        .mockResolvedValueOnce({
          success: true,
          data: {
            candidates: [{
              content: {
                parts: [{ text: '1. deep learning architectures detailed\n2. neural network types comprehensive' }]
              }
            }]
          }
        } as any)
      
      // Mock final answer generation
      mockGeminiClient.generateSearchAnswer.mockResolvedValueOnce({
        success: true,
        data: 'Machine learning encompasses various algorithmic approaches...'
      } as any)

      // Mock initial search responses
      const baseItem = { title: 'ML Overview', link: 'http://ml1.com', snippet: 'ML basics', displayLink: 'ml1.com' }
      mockSearchClient.search
        .mockResolvedValueOnce({
          success: true,
          data: {
            items: [baseItem],
            totalResults: 1,
            hasNextPage: false
          }
        } as any)
        .mockResolvedValueOnce({
          success: true,
          data: {
            items: [baseItem], // Same item
            totalResults: 1,
            hasNextPage: false
          }
        } as any)
        .mockResolvedValueOnce({
          success: true,
          data: {
            items: [baseItem], // Same item again
            totalResults: 1,
            hasNextPage: false
          }
        } as any)
        // Follow-up searches return duplicate items
        .mockResolvedValueOnce({
          success: true,
          data: {
            items: [baseItem], // Same item
            totalResults: 1,
            hasNextPage: false
          }
        } as any)
        .mockResolvedValueOnce({
          success: true,
          data: {
            items: [baseItem], // Same item
            totalResults: 1,
            hasNextPage: false
          }
        } as any)

      mockSearchClient.extractContentForSynthesis.mockReturnValue([
        'Machine learning algorithms can be categorized into several types...'
      ])

      const result = await orchestrator.search(testContext)

      expect(result.success).toBe(true)
      expect(result.data?.sources).toHaveLength(1) // Should deduplicate to single source
      
      // Should stop early due to diminishing returns
      expect(mockGeminiClient.generateContent).toHaveBeenCalledTimes(3) // Query gen, analysis, follow-up gen
      expect(mockGeminiClient.generateSearchAnswer).toHaveBeenCalledTimes(1)
    })
  })

  describe('Maximum iterations limit', () => {
    beforeEach(() => {
      const limitedConfig = { ...mockIterativeConfig, maxSearchIterations: 2 }
      orchestrator = new SearchOrchestrator(limitedConfig)
    })

    const testContext: SearchContext = {
      query: 'Complex scientific topic requiring multiple iterations',
      focusMode: 'academic' as SearchFocusMode,
      language: 'en',
      region: 'US'
    }

    it('should stop at maximum iterations even if completeness is low', async () => {
      // Mock query generation
      mockGeminiClient.generateContent
        .mockResolvedValueOnce({
          success: true,
          data: {
            candidates: [{
              content: {
                parts: [{ text: '1. scientific topic overview\n2. research methodologies\n3. current findings' }]
              }
            }]
          }
        } as any)
        // Mock first analysis (low completeness)
        .mockResolvedValueOnce({
          success: true,
          data: {
            candidates: [{
              content: {
                parts: [{ text: JSON.stringify({
                  completeness: 50,
                  informationGaps: ['Missing recent studies'],
                  gapCategories: { factual: ['Recent research data'], contextual: [], verification: [], depth: [] },
                  followupTopics: ['recent studies'],
                  confidenceLevel: 60,
                  needsMoreSearch: true,
                  reasoning: 'Need more recent research'
                }) }]
              }
            }]
          }
        } as any)
        // Mock follow-up query generation
        .mockResolvedValueOnce({
          success: true,
          data: {
            candidates: [{
              content: {
                parts: [{ text: '1. recent scientific studies 2023\n2. latest research findings' }]
              }
            }]
          }
        } as any)
      
      // Mock final answer generation
      mockGeminiClient.generateSearchAnswer.mockResolvedValueOnce({
        success: true,
        data: 'Based on available research, this complex scientific topic...'
      } as any)

      // Mock search responses
      mockSearchClient.search.mockResolvedValue({
        success: true,
        data: {
          items: [
            { title: 'Research Paper', link: 'http://research.com', snippet: 'Scientific findings', displayLink: 'research.com' }
          ],
          totalResults: 1,
          hasNextPage: false
        }
      } as any)

      mockSearchClient.extractContentForSynthesis.mockReturnValue([
        'This scientific topic involves complex interactions...'
      ])

      const result = await orchestrator.search(testContext)

      expect(result.success).toBe(true)
      
      // Should stop at max iterations (2), so: query gen, first analysis, follow-up gen
      expect(mockGeminiClient.generateContent).toHaveBeenCalledTimes(3)
      expect(mockGeminiClient.generateSearchAnswer).toHaveBeenCalledTimes(1)
    })
  })

  describe('Error handling during iterations', () => {
    beforeEach(() => {
      orchestrator = new SearchOrchestrator(mockIterativeConfig)
    })

    const testContext: SearchContext = {
      query: 'Test query for error handling',
      focusMode: 'general' as SearchFocusMode,
      language: 'en',
      region: 'US'
    }

    it('should handle analysis failure gracefully and continue with available results', async () => {
      // Mock query generation
      mockGeminiClient.generateContent
        .mockResolvedValueOnce({
          success: true,
          data: {
            candidates: [{
              content: {
                parts: [{ text: '1. test query information\n2. related topics\n3. additional context' }]
              }
            }]
          }
        } as any)
        // Mock analysis failure
        .mockResolvedValueOnce({
          success: false,
          error: { message: 'Analysis API rate limit exceeded', code: 'RATE_LIMIT' }
        } as any)
      
      // Mock final answer generation
      mockGeminiClient.generateSearchAnswer.mockResolvedValueOnce({
        success: true,
        data: 'Based on initial search results...'
      } as any)

      // Mock search responses
      mockSearchClient.search.mockResolvedValue({
        success: true,
        data: {
          items: [
            { title: 'Test Result', link: 'http://test.com', snippet: 'Test information', displayLink: 'test.com' }
          ],
          totalResults: 1,
          hasNextPage: false
        }
      } as any)

      mockSearchClient.extractContentForSynthesis.mockReturnValue([
        'Test information about the query topic...'
      ])

      const result = await orchestrator.search(testContext)

      expect(result.success).toBe(true)
      expect(result.data?.answer).toBe('Based on initial search results...')
      
      // Should continue with final answer generation despite analysis failure
      expect(mockGeminiClient.generateContent).toHaveBeenCalledTimes(2) // Query gen, failed analysis
      expect(mockGeminiClient.generateSearchAnswer).toHaveBeenCalledTimes(1)
    })

    it('should handle follow-up query generation failure and proceed with current results', async () => {
      // Mock query generation
      mockGeminiClient.generateContent
        .mockResolvedValueOnce({
          success: true,
          data: {
            candidates: [{
              content: {
                parts: [{ text: '1. initial query results\n2. basic information\n3. surface level data' }]
              }
            }]
          }
        } as any)
        // Mock analysis (low completeness)
        .mockResolvedValueOnce({
          success: true,
          data: {
            candidates: [{
              content: {
                parts: [{ text: JSON.stringify({
                  completeness: 60,
                  informationGaps: ['Missing detailed analysis'],
                  gapCategories: { factual: [], contextual: [], verification: [], depth: ['Need more detail'] },
                  followupTopics: ['detailed analysis'],
                  confidenceLevel: 70,
                  needsMoreSearch: true,
                  reasoning: 'Requires more detailed information'
                }) }]
              }
            }]
          }
        } as any)
        // Mock follow-up generation failure
        .mockResolvedValueOnce({
          success: false,
          error: { message: 'Follow-up generation failed', code: 'GENERATION_ERROR' }
        } as any)
      
      // Mock final answer generation
      mockGeminiClient.generateSearchAnswer.mockResolvedValueOnce({
        success: true,
        data: 'Based on available initial results...'
      } as any)

      // Mock search responses
      mockSearchClient.search.mockResolvedValue({
        success: true,
        data: {
          items: [
            { title: 'Initial Result', link: 'http://initial.com', snippet: 'Initial info', displayLink: 'initial.com' }
          ],
          totalResults: 1,
          hasNextPage: false
        }
      } as any)

      mockSearchClient.extractContentForSynthesis.mockReturnValue([
        'Initial information about the topic...'
      ])

      const result = await orchestrator.search(testContext)

      expect(result.success).toBe(true)
      expect(result.data?.answer).toBe('Based on available initial results...')
    })
  })
})