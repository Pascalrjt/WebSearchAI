import { GeminiClient } from './gemini'
import { CustomSearchClient, SearchResponse } from './search'
import { SearchContext, ApiResponse } from '@/lib/types/api'

export interface SearchOrchestrationConfig {
  geminiApiKey: string
  customSearchApiKey: string
  searchEngineId: string
  geminiModel?: string
  maxSearchResults?: number
  enableStreaming?: boolean
}

export interface SearchResult {
  query: string
  focusMode: string
  answer: string
  sources: SearchSource[]
  searchTime: number
  tokensUsed: {
    prompt: number
    completion: number
    total: number
  }
  estimatedCost: number
}

export interface SearchSource {
  title: string
  url: string
  snippet: string
  displayUrl: string
  index: number
}

export class SearchOrchestrationError extends Error {
  constructor(
    message: string,
    public code?: string,
    public details?: any
  ) {
    super(message)
    this.name = 'SearchOrchestrationError'
  }
}

export class SearchOrchestrator {
  private geminiClient: GeminiClient
  private searchClient: CustomSearchClient
  private config: SearchOrchestrationConfig

  constructor(config: SearchOrchestrationConfig) {
    this.config = {
      maxSearchResults: 10,
      enableStreaming: false,
      ...config
    }

    this.geminiClient = new GeminiClient({
      apiKey: config.geminiApiKey,
      model: config.geminiModel
    })

    this.searchClient = new CustomSearchClient({
      apiKey: config.customSearchApiKey,
      searchEngineId: config.searchEngineId
    })
  }

  /**
   * Perform a complete search and answer generation
   */
  async search(context: SearchContext): Promise<ApiResponse<SearchResult>> {
    const startTime = Date.now()

    try {
      // Step 1: Perform web search
      const searchResponse = await this.searchClient.searchWithFocus(context, {
        num: this.config.maxSearchResults
      })

      if (!searchResponse.success || !searchResponse.data) {
        return {
          error: {
            message: 'Search failed',
            code: 'SEARCH_FAILED',
            details: searchResponse.error
          },
          success: false
        }
      }

      // Step 2: Extract content for AI processing
      const searchContent = this.searchClient.extractContentForSynthesis(searchResponse.data)
      
      if (searchContent.length === 0) {
        return {
          error: {
            message: 'No search results found',
            code: 'NO_RESULTS'
          },
          success: false
        }
      }

      // Step 3: Generate AI answer
      const answerResponse = await this.geminiClient.generateSearchAnswer(
        context,
        searchContent,
        {
          temperature: this.getTemperatureForFocus(context.focusMode),
          maxOutputTokens: 4096
        }
      )

      if (!answerResponse.success || !answerResponse.data) {
        return {
          error: {
            message: 'Answer generation failed',
            code: 'GENERATION_FAILED',
            details: answerResponse.error
          },
          success: false
        }
      }

      // Step 4: Compile results
      const sources = this.extractSources(searchResponse.data)
      const searchTime = Date.now() - startTime

      const result: SearchResult = {
        query: context.query,
        focusMode: context.focusMode,
        answer: answerResponse.data,
        sources,
        searchTime,
        tokensUsed: {
          prompt: 0, // Will be populated from response metadata
          completion: 0,
          total: 0
        },
        estimatedCost: 0
      }

      return {
        data: result,
        success: true
      }
    } catch (error) {
      return {
        error: {
          message: error instanceof Error ? error.message : 'Search orchestration failed',
          code: 'ORCHESTRATION_ERROR',
          details: error
        },
        success: false
      }
    }
  }

  /**
   * Perform streaming search with real-time answer generation
   */
  async *searchStream(context: SearchContext): AsyncGenerator<{
    type: 'search' | 'sources' | 'answer_start' | 'answer_chunk' | 'answer_complete' | 'error'
    data: any
  }, void, unknown> {
    try {
      yield { type: 'search', data: { status: 'searching', query: context.query } }

      // Step 1: Perform web search
      const searchResponse = await this.searchClient.searchWithFocus(context, {
        num: this.config.maxSearchResults
      })

      if (!searchResponse.success || !searchResponse.data) {
        yield { 
          type: 'error', 
          data: { 
            message: 'Search failed', 
            code: 'SEARCH_FAILED',
            details: searchResponse.error 
          } 
        }
        return
      }

      // Step 2: Send sources
      const sources = this.extractSources(searchResponse.data)
      yield { type: 'sources', data: { sources } }

      // Step 3: Extract content and start answer generation
      const searchContent = this.searchClient.extractContentForSynthesis(searchResponse.data)
      
      if (searchContent.length === 0) {
        yield { 
          type: 'error', 
          data: { 
            message: 'No search results found', 
            code: 'NO_RESULTS' 
          } 
        }
        return
      }

      yield { type: 'answer_start', data: { status: 'generating' } }

      // Step 4: Stream answer generation
      const prompt = this.buildSearchPrompt(context, searchContent)
      
      try {
        for await (const chunk of this.geminiClient.streamContent(prompt, {
          temperature: this.getTemperatureForFocus(context.focusMode),
          maxOutputTokens: 4096
        })) {
          yield { type: 'answer_chunk', data: { chunk } }
        }
        
        yield { type: 'answer_complete', data: { status: 'complete' } }
      } catch (streamError) {
        yield { 
          type: 'error', 
          data: { 
            message: 'Answer generation failed', 
            code: 'GENERATION_FAILED',
            details: streamError 
          } 
        }
      }
    } catch (error) {
      yield { 
        type: 'error', 
        data: { 
          message: error instanceof Error ? error.message : 'Streaming failed', 
          code: 'STREAM_ERROR',
          details: error 
        } 
      }
    }
  }

  /**
   * Validate both API keys
   */
  async validateConfiguration(): Promise<ApiResponse<{
    gemini: boolean
    customSearch: boolean
    overall: boolean
  }>> {
    try {
      const [geminiValidation, searchValidation] = await Promise.all([
        this.geminiClient.validateApiKey(),
        this.searchClient.validateApiKey()
      ])

      const result = {
        gemini: geminiValidation.success && geminiValidation.data === true,
        customSearch: searchValidation.success && searchValidation.data === true,
        overall: false
      }

      result.overall = result.gemini && result.customSearch

      return {
        data: result,
        success: true
      }
    } catch (error) {
      return {
        error: {
          message: 'Configuration validation failed',
          code: 'VALIDATION_ERROR',
          details: error
        },
        success: false
      }
    }
  }

  /**
   * Get usage statistics
   */
  getUsageStats(): {
    searchQueries: number
    tokensUsed: number
    estimatedCost: number
  } {
    // This would be implemented with actual usage tracking
    // For now, return placeholder values
    return {
      searchQueries: 0,
      tokensUsed: 0,
      estimatedCost: 0
    }
  }

  /**
   * Update configuration
   */
  updateConfiguration(config: Partial<SearchOrchestrationConfig>): void {
    this.config = { ...this.config, ...config }

    if (config.geminiApiKey || config.geminiModel) {
      this.geminiClient = new GeminiClient({
        apiKey: config.geminiApiKey || this.config.geminiApiKey,
        model: config.geminiModel || this.config.geminiModel
      })
    }

    if (config.customSearchApiKey || config.searchEngineId) {
      this.searchClient = new CustomSearchClient({
        apiKey: config.customSearchApiKey || this.config.customSearchApiKey,
        searchEngineId: config.searchEngineId || this.config.searchEngineId
      })
    }
  }

  private extractSources(searchResponse: SearchResponse): SearchSource[] {
    return searchResponse.items.map((item, index) => ({
      title: item.title,
      url: item.link,
      snippet: item.snippet,
      displayUrl: item.displayLink,
      index: index + 1
    }))
  }

  private getTemperatureForFocus(focusMode: string): number {
    const temperatures = {
      general: 0.7,
      academic: 0.3,
      creative: 0.9,
      news: 0.5,
      technical: 0.2,
      medical: 0.1,
      legal: 0.1
    }

    return temperatures[focusMode as keyof typeof temperatures] || 0.7
  }

  private buildSearchPrompt(context: SearchContext, searchContent: string[]): string {
    const focusModeInstructions = this.getFocusModeInstructions(context.focusMode)
    
    return `${focusModeInstructions}

User Query: "${context.query}"

Search Results:
${searchContent.map((content, index) => `[${index + 1}] ${content}`).join('\n\n')}

Instructions:
- Provide a comprehensive, well-structured answer based on the search results above
- Use numbered citations [1], [2], etc. to reference the sources
- Synthesize information from multiple sources when possible
- Ensure accuracy and relevance to the user's query
- Maintain an appropriate tone for the "${context.focusMode}" focus mode
- Structure your response with clear sections if the topic is complex

Please provide your response now:`
  }

  private getFocusModeInstructions(focusMode: string): string {
    const instructions = {
      general: 'Provide a balanced, informative response suitable for general audiences. Use clear language and helpful examples.',
      academic: 'Focus on scholarly accuracy and use academic language. Prioritize peer-reviewed sources and research findings. Include proper citations and maintain objectivity.',
      creative: 'Provide an engaging, creative response that inspires and informs. Use vivid language, examples, and feel free to explore innovative angles.',
      news: 'Focus on recent developments and current events. Prioritize credible news sources and provide timely, relevant information with proper context.',
      technical: 'Provide detailed technical information with precise terminology. Focus on implementation details, specifications, and technical accuracy.',
      medical: 'Provide accurate medical information while emphasizing that this is for informational purposes only and not medical advice. Recommend consulting healthcare professionals.',
      legal: 'Provide legal information while emphasizing that this is for informational purposes only and not legal advice. Recommend consulting legal professionals for specific cases.'
    }

    return instructions[focusMode as keyof typeof instructions] || instructions.general
  }
}