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
  enableQueryGeneration?: boolean
  maxGeneratedQueries?: number
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
      enableQueryGeneration: true,
      maxGeneratedQueries: 5,
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
      let searchQueries: string[]
      let allSearchResults: SearchResponse[] = []
      
      if (this.config.enableQueryGeneration) {
        // Step 1: Generate optimized search queries using LLM
        console.log('🔍 [Query Generation] Original query:', context.query)
        console.log('🎯 [Query Generation] Focus mode:', context.focusMode)
        
        const queryGenResponse = await this.generateSearchQueries(context)
        if (!queryGenResponse.success || !queryGenResponse.data) {
          // Fallback to original query if generation fails
          console.log('❌ [Query Generation] Failed, falling back to original query')
          console.log('   Error:', queryGenResponse.error?.message)
          searchQueries = [context.query]
        } else {
          searchQueries = queryGenResponse.data
          console.log('✅ [Query Generation] Generated queries:')
          searchQueries.forEach((query, index) => {
            console.log(`   ${index + 1}. "${query}"`)
          })
        }

        // Step 2: Execute multiple searches in parallel
        console.log('🔎 [Multi-Search] Executing', searchQueries.length, 'searches in parallel...')
        const searchResponses = await this.searchMultipleQueries(searchQueries, context)
        allSearchResults = searchResponses.filter(response => response.success && response.data).map(response => response.data!)
        
        console.log('📊 [Multi-Search] Results summary:')
        searchResponses.forEach((response, index) => {
          if (response.success && response.data) {
            console.log(`   Query ${index + 1}: ${response.data.items.length} results found`)
          } else {
            console.log(`   Query ${index + 1}: Failed - ${response.error?.message}`)
          }
        })
        console.log(`📈 [Multi-Search] Total successful searches: ${allSearchResults.length}`)
        
        if (allSearchResults.length === 0) {
          return {
            error: {
              message: 'All search queries failed',
              code: 'SEARCH_FAILED'
            },
            success: false
          }
        }
      } else {
        // Original single search approach
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
        
        allSearchResults = [searchResponse.data]
      }

      // Step 3: Aggregate and deduplicate results
      const aggregatedResults = this.aggregateResults(allSearchResults)
      
      console.log('🔗 [Result Aggregation] Before deduplication:', allSearchResults.reduce((total, result) => total + result.items.length, 0), 'total results')
      console.log('🎯 [Result Aggregation] After deduplication:', aggregatedResults.items.length, 'unique results')
      
      if (aggregatedResults.items.length === 0) {
        return {
          error: {
            message: 'No search results found',
            code: 'NO_RESULTS'
          },
          success: false
        }
      }

      // Step 4: Extract content for AI processing
      const searchContent = this.searchClient.extractContentForSynthesis(aggregatedResults)

      // Step 5: Generate AI answer
      console.log('🤖 [AI Answer] Generating answer from', searchContent.length, 'search result sources...')
      const answerResponse = await this.geminiClient.generateSearchAnswer(
        context,
        searchContent,
        {
          temperature: this.getTemperatureForFocus(context.focusMode),
          maxOutputTokens: 4096
        }
      )
      
      if (answerResponse.success) {
        console.log('✅ [AI Answer] Generated successfully')
      } else {
        console.log('❌ [AI Answer] Generation failed:', answerResponse.error?.message)
      }

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

      // Step 6: Compile results
      const sources = this.extractSources(aggregatedResults)
      const searchTime = Date.now() - startTime

      console.log('📝 [Final Results] Search completed:')
      console.log(`   ⏱️  Total time: ${searchTime}ms`)
      console.log(`   📚 Sources found: ${sources.length}`)
      console.log(`   🎯 Focus mode: ${context.focusMode}`)
      console.log(`   🔍 Query enhancement: ${this.config.enableQueryGeneration ? 'enabled' : 'disabled'}`)

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
   * Estimate cost for query generation enhancement
   */
  estimateQueryGenerationCost(baseSearchCost: number): {
    queryGenerationCost: number
    multiSearchCost: number
    totalCost: number
    costMultiplier: number
  } {
    if (!this.config.enableQueryGeneration) {
      return {
        queryGenerationCost: 0,
        multiSearchCost: baseSearchCost,
        totalCost: baseSearchCost,
        costMultiplier: 1.0
      }
    }

    // Gemini cost for query generation (typically ~200-500 tokens)
    const avgQueryGenTokens = 350
    const geminiCostPer1K = 0.00015 // $0.15 per 1M tokens for Gemini 1.5 Flash
    const queryGenerationCost = (avgQueryGenTokens / 1000) * geminiCostPer1K

    // Multiple searches cost (2-3x base search cost)
    const searchMultiplier = this.config.maxGeneratedQueries || 3
    const multiSearchCost = baseSearchCost * searchMultiplier

    const totalCost = queryGenerationCost + multiSearchCost
    const costMultiplier = totalCost / baseSearchCost

    return {
      queryGenerationCost,
      multiSearchCost,
      totalCost,
      costMultiplier
    }
  }

  /**
   * Get configuration with cost management options
   */
  getCostOptimizedConfig(): {
    current: SearchOrchestrationConfig
    budgetFriendly: SearchOrchestrationConfig
    balanced: SearchOrchestrationConfig
    comprehensive: SearchOrchestrationConfig
  } {
    const current = { ...this.config }

    return {
      current,
      budgetFriendly: {
        ...current,
        enableQueryGeneration: false,
        maxSearchResults: 5
      },
      balanced: {
        ...current,
        enableQueryGeneration: true,
        maxGeneratedQueries: 2,
        maxSearchResults: 8
      },
      comprehensive: {
        ...current,
        enableQueryGeneration: true,
        maxGeneratedQueries: 3,
        maxSearchResults: 12
      }
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

  /**
   * Generate optimized search queries using LLM based on user query and focus mode
   */
  async generateSearchQueries(context: SearchContext): Promise<ApiResponse<string[]>> {
    try {
      const prompt = this.buildQueryGenerationPrompt(context)
      
      const response = await this.geminiClient.generateContent(prompt, {
        temperature: 0.3, // Lower temperature for more focused query generation
        maxOutputTokens: 1024
      })

      if (!response.success || !response.data) {
        return {
          error: {
            message: 'Query generation failed',
            code: 'QUERY_GENERATION_FAILED',
            details: response.error
          },
          success: false
        }
      }

      const generatedText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text
      if (!generatedText) {
        return {
          error: {
            message: 'No queries generated',
            code: 'NO_QUERIES_GENERATED'
          },
          success: false
        }
      }

      console.log('🔤 [LLM Response] Raw generated text:')
      console.log('   "' + generatedText.replace(/\n/g, '\\n') + '"')

      // Parse the generated queries
      const queries = this.parseGeneratedQueries(generatedText, context.query)
      console.log('🔍 [Query Parsing] Extracted', queries.length, 'queries from LLM response')
      
      return {
        data: queries,
        success: true
      }
    } catch (error) {
      return {
        error: {
          message: 'Query generation error',
          code: 'QUERY_GENERATION_ERROR',
          details: error
        },
        success: false
      }
    }
  }

  /**
   * Execute multiple search queries in parallel
   */
  async searchMultipleQueries(
    queries: string[], 
    context: SearchContext
  ): Promise<ApiResponse<SearchResponse>[]> {
    const searchPromises = queries.map(query => 
      this.searchClient.search(query, {
        num: Math.ceil(this.config.maxSearchResults! / queries.length),
        language: context.language,
        region: context.region
      })
    )

    try {
      const results = await Promise.allSettled(searchPromises)
      
      return results.map((result, index) => {
        if (result.status === 'fulfilled') {
          return result.value
        } else {
          return {
            error: {
              message: `Search failed for query: ${queries[index]}`,
              code: 'INDIVIDUAL_SEARCH_FAILED',
              details: result.reason
            },
            success: false
          }
        }
      })
    } catch (error) {
      // This shouldn't happen with Promise.allSettled, but just in case
      return queries.map(query => ({
        error: {
          message: `Search failed for query: ${query}`,
          code: 'SEARCH_ERROR',
          details: error
        },
        success: false
      }))
    }
  }

  /**
   * Aggregate and deduplicate search results from multiple queries
   */
  aggregateResults(searchResponses: SearchResponse[]): SearchResponse {
    const allItems = searchResponses.flatMap(response => response.items)
    const seenUrls = new Set<string>()
    const uniqueItems = []

    // Deduplicate by URL while preserving order and diversity
    for (const item of allItems) {
      if (!seenUrls.has(item.link)) {
        seenUrls.add(item.link)
        uniqueItems.push(item)
      }
    }

    // Limit to maxSearchResults
    const limitedItems = uniqueItems.slice(0, this.config.maxSearchResults)

    // Use the first response as base and replace items
    const baseResponse = searchResponses[0]
    return {
      ...baseResponse,
      items: limitedItems,
      totalResults: limitedItems.length,
      hasNextPage: false,
      nextPageStartIndex: undefined
    }
  }

  /**
   * Build prompt for LLM query generation
   */
  private buildQueryGenerationPrompt(context: SearchContext): string {
    const focusInstructions = this.getQueryGenerationInstructions(context.focusMode)
    
    return `You are an expert at query generation. Your primary role is to act as a sophisticated query generation system for a search engine. When a user provides a query, your task is to generate ${this.config.maxGeneratedQueries} concise and relevant Google search queries that will help find the most accurate and comprehensive information to answer the user's request.

${focusInstructions}

Original Query: "${context.query}"
Focus Mode: ${context.focusMode}

Core Responsibilities:
- Deconstruct the User's Query: Analyze the user's input to identify the core intent and the key entities (e.g., people, places, concepts, dates).
- Generate Diverse Queries: Create a variety of search queries that approach the user's goal from different angles. This should include:
- Direct Questions: Formulate the user's query as a natural language question.
- Keyword Extraction: Identify and use the most critical keywords and phrases.
- Synonym and Related Term Expansion: Broaden the search by including synonyms and closely related concepts.
- Specific Facets: Generate queries that target specific aspects of the user's request, such as "causes," "effects," "timeline," "how to," or "examples."
- Entity-Specific Searches: If the query involves a specific person, organization, or product, generate queries to find official websites, reviews, or recent news.
- Prioritize Conciseness: Queries should be as short as possible while retaining their meaning and effectiveness.

Requirements:
- Generate exactly ${this.config.maxGeneratedQueries} different search queries
- Do not respond to the user in a conversational manner. Your output should only be the generated search queries
- Every generated query must be directly relevant to the user's input
- Each query should capture a different aspect or angle of the original question
- Generate queries that are clear and unlikely to produce irrelevant results.
- Optimize queries for web search engines (use effective keywords and phrases)
- Ensure queries are diverse enough to get comprehensive results
- Keep queries concise but specific
- Format your response as a numbered list (1., 2., 3.)

Generate the optimized search queries now:`
  }

  /**
   * Get focus mode-specific instructions for query generation
   */
  private getQueryGenerationInstructions(focusMode: string): string {
    const instructions = {
      general: 'Generate balanced queries that cover different perspectives and sources. Include both broad and specific variations.',
      academic: 'Focus on scholarly terminology, research concepts, and academic sources. Include terms like "research", "study", "analysis", and discipline-specific keywords.',
      creative: 'Generate queries that explore creative, innovative, and inspirational aspects. Include terms like "creative", "innovative", "inspiration", "examples".',
      news: 'Focus on current events, recent developments, and news-worthy angles. Include terms like "latest", "recent", "news", "current", with temporal modifiers.',
      technical: 'Use technical terminology, implementation details, and documentation-focused queries. Include terms like "tutorial", "documentation", "implementation", "API".',
      medical: 'Focus on medical terminology, health conditions, and clinical aspects. Include terms like "medical", "clinical", "health", "treatment", "symptoms".',
      legal: 'Use legal terminology, regulatory aspects, and law-focused queries. Include terms like "legal", "law", "regulation", "court", "statute".'
    }

    return instructions[focusMode as keyof typeof instructions] || instructions.general
  }

  /**
   * Parse generated queries from LLM response
   */
  private parseGeneratedQueries(generatedText: string, originalQuery: string): string[] {
    const lines = generatedText.split('\n').filter(line => line.trim())
    const queries: string[] = []

    for (const line of lines) {
      // Match numbered list format: "1. query", "2. query", etc.
      const match = line.match(/^\d+\.\s*(.+)$/)
      if (match && match[1]) {
        let query = match[1].trim()
        // Remove quotes if present
        query = query.replace(/^["']|["']$/g, '')
        if (query && query !== originalQuery) {
          queries.push(query)
        }
      }
    }

    // Fallback: if no properly formatted queries found, try to extract any meaningful lines
    if (queries.length === 0) {
      const meaningfulLines = lines.filter(line => 
        line.length > 5 && 
        !line.toLowerCase().includes('here are') &&
        !line.toLowerCase().includes('search queries') &&
        !line.toLowerCase().includes('cannot generate') &&
        line !== originalQuery
      )
      queries.push(...meaningfulLines.slice(0, this.config.maxGeneratedQueries))
    }

    // Always include original query as fallback if no other queries generated
    if (queries.length === 0) {
      queries.push(originalQuery)
    }

    return queries.slice(0, this.config.maxGeneratedQueries)
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