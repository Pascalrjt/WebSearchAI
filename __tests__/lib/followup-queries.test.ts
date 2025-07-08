import { SearchOrchestrator } from '@/lib/api/orchestrator'
import { GeminiClient } from '@/lib/api/gemini'
import { CustomSearchClient } from '@/lib/api/search'
import { SearchContext, SearchFocusMode, ResultAnalysis } from '@/lib/types/api'

// Mock the API clients
jest.mock('@/lib/api/gemini')
jest.mock('@/lib/api/search')

const MockedGeminiClient = GeminiClient as jest.MockedClass<typeof GeminiClient>
const MockedCustomSearchClient = CustomSearchClient as jest.MockedClass<typeof CustomSearchClient>

describe('SearchOrchestrator - Follow-up Query Generation', () => {
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

  describe('generateFollowupQueries', () => {
    const testContext: SearchContext = {
      query: 'How does climate change affect ocean ecosystems?',
      focusMode: 'academic' as SearchFocusMode,
      language: 'en',
      region: 'US'
    }

    const mockAnalysisWithGaps: ResultAnalysis = {
      completeness: 65,
      informationGaps: ['Missing specific temperature data', 'No information about coral reef impacts'],
      gapCategories: {
        factual: ['Temperature rise statistics', 'Acidification measurements'],
        contextual: ['Historical baseline data'],
        verification: ['Contradictory claims about warming rates'],
        depth: ['Detailed mechanisms of ecosystem disruption']
      },
      followupTopics: ['ocean acidification', 'coral bleaching', 'marine biodiversity'],
      confidenceLevel: 75,
      needsMoreSearch: true,
      reasoning: 'Several key aspects need more detailed information'
    }

    const mockAnalysisComplete: ResultAnalysis = {
      completeness: 95,
      informationGaps: [],
      gapCategories: {
        factual: [],
        contextual: [],
        verification: [],
        depth: []
      },
      followupTopics: [],
      confidenceLevel: 95,
      needsMoreSearch: false,
      reasoning: 'Comprehensive coverage achieved'
    }

    it('should return empty array when no more search is needed', async () => {
      const result = await orchestrator.generateFollowupQueries(testContext, mockAnalysisComplete)

      expect(result.success).toBe(true)
      expect(result.data).toEqual([])
      expect(mockGeminiClient.generateContent).not.toHaveBeenCalled()
    })

    it('should return empty array when no information gaps exist', async () => {
      const analysisNoGaps: ResultAnalysis = {
        ...mockAnalysisWithGaps,
        informationGaps: [],
        needsMoreSearch: false
      }

      const result = await orchestrator.generateFollowupQueries(testContext, analysisNoGaps)

      expect(result.success).toBe(true)
      expect(result.data).toEqual([])
      expect(mockGeminiClient.generateContent).not.toHaveBeenCalled()
    })

    it('should generate follow-up queries when gaps exist', async () => {
      const mockFollowupResponse = `1. Ocean temperature rise statistics global warming
2. Coral reef bleaching impacts climate change
3. Marine ecosystem acidification research data
4. Ocean pH levels historical measurements
5. Biodiversity loss marine species climate`

      mockGeminiClient.generateContent.mockResolvedValue({
        success: true,
        data: {
          candidates: [{
            content: {
              parts: [{ text: mockFollowupResponse }]
            }
          }]
        }
      } as any)

      const result = await orchestrator.generateFollowupQueries(testContext, mockAnalysisWithGaps)

      expect(result.success).toBe(true)
      expect(result.data).toHaveLength(5)
      expect(result.data).toContain('Ocean temperature rise statistics global warming')
      expect(result.data).toContain('Coral reef bleaching impacts climate change')
      expect(mockGeminiClient.generateContent).toHaveBeenCalledWith(
        expect.stringContaining('IDENTIFIED INFORMATION GAPS'),
        expect.objectContaining({
          temperature: 0.3,
          maxOutputTokens: 1024
        })
      )
    })

    it('should prioritize queries based on gap types', async () => {
      const mockFollowupResponse = `1. Ocean acidification data statistics research
2. Climate change background information
3. Official verified ocean warming rates
4. Comprehensive detailed coral reef analysis
5. General marine information overview`

      mockGeminiClient.generateContent.mockResolvedValue({
        success: true,
        data: {
          candidates: [{
            content: {
              parts: [{ text: mockFollowupResponse }]
            }
          }]
        }
      } as any)

      const result = await orchestrator.generateFollowupQueries(testContext, mockAnalysisWithGaps)

      expect(result.success).toBe(true)
      expect(result.data).toHaveLength(5)
      
      // The first query should contain factual keywords (highest priority)
      const firstQuery = result.data![0]
      expect(firstQuery.toLowerCase()).toMatch(/data|statistics|research/)
    })

    it('should handle LLM generation failure gracefully', async () => {
      mockGeminiClient.generateContent.mockResolvedValue({
        success: false,
        error: { message: 'API rate limit exceeded', code: 'RATE_LIMIT' }
      } as any)

      const result = await orchestrator.generateFollowupQueries(testContext, mockAnalysisWithGaps)

      expect(result.success).toBe(false)
      expect(result.error?.message).toBe('Follow-up query generation failed')
      expect(result.error?.code).toBe('FOLLOWUP_GENERATION_FAILED')
    })

    it('should handle empty LLM response', async () => {
      mockGeminiClient.generateContent.mockResolvedValue({
        success: true,
        data: {
          candidates: [{
            content: {
              parts: [{ text: '' }]
            }
          }]
        }
      } as any)

      const result = await orchestrator.generateFollowupQueries(testContext, mockAnalysisWithGaps)

      expect(result.success).toBe(false)
      expect(result.error?.message).toBe('No follow-up queries generated')
      expect(result.error?.code).toBe('NO_FOLLOWUP_QUERIES_GENERATED')
    })

    it('should parse non-numbered format as fallback', async () => {
      const mockFollowupResponse = `Ocean temperature statistics
Coral reef damage research
Marine biodiversity studies
Ocean acidification impacts
Ecosystem resilience factors`

      mockGeminiClient.generateContent.mockResolvedValue({
        success: true,
        data: {
          candidates: [{
            content: {
              parts: [{ text: mockFollowupResponse }]
            }
          }]
        }
      } as any)

      const result = await orchestrator.generateFollowupQueries(testContext, mockAnalysisWithGaps)

      expect(result.success).toBe(true)
      expect(result.data!.length).toBeGreaterThan(0)
      expect(result.data).toContain('Ocean temperature statistics')
    })

    it('should limit queries to maxFollowupQueries setting', async () => {
      const orchestratorSmallLimit = new SearchOrchestrator({
        ...mockConfig,
        maxFollowupQueries: 2
      })

      const mockFollowupResponse = `1. Query one
2. Query two  
3. Query three
4. Query four
5. Query five`

      mockGeminiClient.generateContent.mockResolvedValue({
        success: true,
        data: {
          candidates: [{
            content: {
              parts: [{ text: mockFollowupResponse }]
            }
          }]
        }
      } as any)

      const result = await orchestratorSmallLimit.generateFollowupQueries(testContext, mockAnalysisWithGaps)

      expect(result.success).toBe(true)
      expect(result.data).toHaveLength(2)
    })

    it('should include gap categories in prompt for different focus modes', async () => {
      const technicalContext: SearchContext = {
        query: 'How to implement OAuth2 authentication',
        focusMode: 'technical' as SearchFocusMode,
        language: 'en',
        region: 'US'
      }

      const technicalAnalysis: ResultAnalysis = {
        completeness: 60,
        informationGaps: ['Missing code examples'],
        gapCategories: {
          factual: [],
          contextual: [],
          verification: [],
          depth: ['Implementation details needed']
        },
        followupTopics: ['OAuth2 implementation'],
        confidenceLevel: 70,
        needsMoreSearch: true,
        reasoning: 'Technical implementation details missing'
      }

      mockGeminiClient.generateContent.mockResolvedValue({
        success: true,
        data: {
          candidates: [{
            content: {
              parts: [{ text: '1. OAuth2 implementation guide detailed tutorial' }]
            }
          }]
        }
      } as any)

      const result = await orchestrator.generateFollowupQueries(technicalContext, technicalAnalysis)

      expect(result.success).toBe(true)
      expect(mockGeminiClient.generateContent).toHaveBeenCalledWith(
        expect.stringContaining('technical follow-up queries targeting documentation'),
        expect.any(Object)
      )
    })

    it('should handle unexpected errors during generation', async () => {
      mockGeminiClient.generateContent.mockRejectedValue(new Error('Network timeout'))

      const result = await orchestrator.generateFollowupQueries(testContext, mockAnalysisWithGaps)

      expect(result.success).toBe(false)
      expect(result.error?.message).toBe('Follow-up query generation error')
      expect(result.error?.code).toBe('FOLLOWUP_GENERATION_ERROR')
      expect(result.error?.details).toBeInstanceOf(Error)
    })

    it('should remove quotes from parsed queries', async () => {
      const mockFollowupResponse = `1. "Ocean temperature data statistics"
2. 'Coral reef bleaching research'
3. Marine ecosystem impacts`

      mockGeminiClient.generateContent.mockResolvedValue({
        success: true,
        data: {
          candidates: [{
            content: {
              parts: [{ text: mockFollowupResponse }]
            }
          }]
        }
      } as any)

      const result = await orchestrator.generateFollowupQueries(testContext, mockAnalysisWithGaps)

      expect(result.success).toBe(true)
      expect(result.data).toContain('Ocean temperature data statistics')
      expect(result.data).toContain('Coral reef bleaching research')
      expect(result.data).not.toContain('"Ocean temperature data statistics"')
    })

    it('should not include original query in follow-up queries', async () => {
      const mockFollowupResponse = `1. How does climate change affect ocean ecosystems?
2. Ocean temperature rise statistics
3. Coral reef bleaching impacts`

      mockGeminiClient.generateContent.mockResolvedValue({
        success: true,
        data: {
          candidates: [{
            content: {
              parts: [{ text: mockFollowupResponse }]
            }
          }]
        }
      } as any)

      const result = await orchestrator.generateFollowupQueries(testContext, mockAnalysisWithGaps)

      expect(result.success).toBe(true)
      expect(result.data).not.toContain(testContext.query)
      expect(result.data).toContain('Ocean temperature rise statistics')
    })
  })

  describe('Query prioritization algorithm', () => {
    const testContext: SearchContext = {
      query: 'Test query',
      focusMode: 'general',
      language: 'en',
      region: 'US'
    }

    const mockAnalysisForPriority: ResultAnalysis = {
      completeness: 50,
      informationGaps: ['Missing temperature data', 'No statistical information'],
      gapCategories: {
        factual: ['Temperature statistics', 'Research data'],
        contextual: ['Background information'],
        verification: ['Authoritative sources'],
        depth: ['Detailed analysis']
      },
      followupTopics: ['temperature', 'statistics'],
      confidenceLevel: 60,
      needsMoreSearch: true,
      reasoning: 'Multiple gaps identified'
    }

    it('should prioritize factual gap queries highest', async () => {
      const mockFollowupResponse = `1. General information overview
2. Temperature data statistics research
3. Background information context
4. Official verified sources`

      mockGeminiClient.generateContent.mockResolvedValue({
        success: true,
        data: {
          candidates: [{
            content: {
              parts: [{ text: mockFollowupResponse }]
            }
          }]
        }
      } as any)

      const result = await orchestrator.generateFollowupQueries(testContext, mockAnalysisForPriority)

      expect(result.success).toBe(true)
      
      // Query with factual keywords should be prioritized
      const factualQuery = result.data!.find(q => q.includes('data statistics research'))
      const generalQuery = result.data!.find(q => q.includes('General information'))
      
      expect(factualQuery).toBeDefined()
      expect(result.data!.indexOf(factualQuery!)).toBeLessThan(result.data!.indexOf(generalQuery!))
    })

    it('should give bonus points for topic matches', async () => {
      const mockFollowupResponse = `1. Temperature statistics data
2. Random unrelated query
3. Statistics research information`

      mockGeminiClient.generateContent.mockResolvedValue({
        success: true,
        data: {
          candidates: [{
            content: {
              parts: [{ text: mockFollowupResponse }]
            }
          }]
        }
      } as any)

      const result = await orchestrator.generateFollowupQueries(testContext, mockAnalysisForPriority)

      expect(result.success).toBe(true)
      
      // Queries matching follow-up topics should be prioritized
      const topicMatchQuery = result.data!.find(q => q.includes('Temperature') || q.includes('statistics'))
      expect(topicMatchQuery).toBeDefined()
    })

    it('should consider query length and word count in prioritization', async () => {
      const mockFollowupResponse = `1. A
2. This is a well-sized query with good length
3. This query is way too long and has too many words making it less effective for search engines and probably not great for finding specific information`

      mockGeminiClient.generateContent.mockResolvedValue({
        success: true,
        data: {
          candidates: [{
            content: {
              parts: [{ text: mockFollowupResponse }]
            }
          }]
        }
      } as any)

      const result = await orchestrator.generateFollowupQueries(testContext, mockAnalysisForPriority)

      expect(result.success).toBe(true)
      
      // The well-sized query should be prioritized over very short or very long ones
      const wellSizedQuery = result.data!.find(q => q.includes('well-sized query'))
      expect(wellSizedQuery).toBeDefined()
    })
  })

  describe('Focus mode specific instructions', () => {
    it('should include medical-specific instructions for medical focus mode', async () => {
      const medicalContext: SearchContext = {
        query: 'What are the symptoms of diabetes?',
        focusMode: 'medical' as SearchFocusMode,
        language: 'en',
        region: 'US'
      }

      const medicalAnalysis: ResultAnalysis = {
        completeness: 70,
        informationGaps: ['Missing treatment options'],
        gapCategories: {
          factual: ['Treatment statistics'],
          contextual: [],
          verification: [],
          depth: []
        },
        followupTopics: ['diabetes treatment'],
        confidenceLevel: 75,
        needsMoreSearch: true,
        reasoning: 'Treatment information needed'
      }

      mockGeminiClient.generateContent.mockResolvedValue({
        success: true,
        data: {
          candidates: [{
            content: {
              parts: [{ text: '1. Diabetes treatment clinical studies' }]
            }
          }]
        }
      } as any)

      const result = await orchestrator.generateFollowupQueries(medicalContext, medicalAnalysis)

      expect(result.success).toBe(true)
      expect(mockGeminiClient.generateContent).toHaveBeenCalledWith(
        expect.stringContaining('medical and health-related follow-up queries'),
        expect.any(Object)
      )
    })

    it('should include legal-specific instructions for legal focus mode', async () => {
      const legalContext: SearchContext = {
        query: 'What are the copyright laws?',
        focusMode: 'legal' as SearchFocusMode,
        language: 'en',
        region: 'US'
      }

      const legalAnalysis: ResultAnalysis = {
        completeness: 65,
        informationGaps: ['Missing case law examples'],
        gapCategories: {
          factual: [],
          contextual: ['Legal background'],
          verification: [],
          depth: []
        },
        followupTopics: ['copyright case law'],
        confidenceLevel: 70,
        needsMoreSearch: true,
        reasoning: 'Legal precedents needed'
      }

      mockGeminiClient.generateContent.mockResolvedValue({
        success: true,
        data: {
          candidates: [{
            content: {
              parts: [{ text: '1. Copyright law case precedents' }]
            }
          }]
        }
      } as any)

      const result = await orchestrator.generateFollowupQueries(legalContext, legalAnalysis)

      expect(result.success).toBe(true)
      expect(mockGeminiClient.generateContent).toHaveBeenCalledWith(
        expect.stringContaining('legal-focused follow-up queries targeting legal databases'),
        expect.any(Object)
      )
    })
  })
})