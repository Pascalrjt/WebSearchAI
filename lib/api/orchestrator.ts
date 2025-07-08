import { GeminiClient } from './gemini'
import { CustomSearchClient, SearchResponse } from './search'
import { SearchContext, ApiResponse, ResultAnalysis } from '@/lib/types/api'

export interface SearchOrchestrationConfig {
  geminiApiKey: string
  customSearchApiKey: string
  searchEngineId: string
  geminiModel?: string
  maxSearchResults?: number
  enableStreaming?: boolean
  enableQueryGeneration?: boolean
  maxGeneratedQueries?: number
  enableIterativeSearch?: boolean
  maxSearchIterations?: number
  completenessThreshold?: number
  maxFollowupQueries?: number
  enableFactVerification?: boolean
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
      enableIterativeSearch: false,
      maxSearchIterations: 2,
      completenessThreshold: 80,
      maxFollowupQueries: 3,
      enableFactVerification: false,
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
   * Perform a complete search and answer generation with optional iterative refinement
   */
  async search(context: SearchContext): Promise<ApiResponse<SearchResult>> {
    const startTime = Date.now()

    try {
      console.log('🚀 [Search Start] Beginning search process')
      console.log(`   Query: "${context.query}"`)
      console.log(`   Focus: ${context.focusMode}`)
      console.log(`   Iterative: ${this.config.enableIterativeSearch ? 'enabled' : 'disabled'}`)
      
      let searchQueries: string[]
      let allSearchResults: SearchResponse[] = []
      let currentIteration = 1
      let iterationResults: SearchResponse[] = []
      
      // Step 1: Initial Query Generation and Search
      if (this.config.enableQueryGeneration) {
        console.log('🔍 [Query Generation] Original query:', context.query)
        console.log('🎯 [Query Generation] Focus mode:', context.focusMode)
        
        const queryGenResponse = await this.generateSearchQueries(context)
        if (!queryGenResponse.success || !queryGenResponse.data) {
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

        console.log('🔎 [Initial Search] Executing', searchQueries.length, 'searches in parallel...')
        const searchResponses = await this.searchMultipleQueries(searchQueries, context)
        iterationResults = searchResponses.filter(response => response.success && response.data).map(response => response.data!)
        
        console.log('📊 [Initial Search] Results summary:')
        searchResponses.forEach((response, index) => {
          if (response.success && response.data) {
            console.log(`   Query ${index + 1}: ${response.data.items.length} results found`)
          } else {
            console.log(`   Query ${index + 1}: Failed - ${response.error?.message}`)
          }
        })
        console.log(`📈 [Initial Search] Total successful searches: ${iterationResults.length}`)
        
        if (iterationResults.length === 0) {
          return {
            error: {
              message: 'All initial search queries failed',
              code: 'INITIAL_SEARCH_FAILED'
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
              message: 'Initial search failed',
              code: 'INITIAL_SEARCH_FAILED',
              details: searchResponse.error
            },
            success: false
          }
        }
        
        iterationResults = [searchResponse.data]
      }

      // Add initial results to all results
      allSearchResults = [...iterationResults]

      // Step 2: Iterative Search Loop (if enabled)
      if (this.config.enableIterativeSearch && this.config.maxSearchIterations! > 1) {
        console.log('🔄 [Iterative Search] Starting iterative refinement process')
        console.log(`   Max iterations: ${this.config.maxSearchIterations}`)
        console.log(`   Completeness threshold: ${this.config.completenessThreshold}%`)

        while (currentIteration < this.config.maxSearchIterations!) {
          console.log(`\n🔍 [Iteration ${currentIteration}] Analyzing current results...`)
          
          // Analyze current results
          const analysisResponse = await this.analyzeSearchResults(context, allSearchResults)
          
          if (!analysisResponse.success || !analysisResponse.data) {
            console.log('❌ [Iteration Analysis] Failed, stopping iterations')
            console.log('   Error:', analysisResponse.error?.message)
            break
          }

          const analysis = analysisResponse.data
          console.log(`📊 [Iteration ${currentIteration}] Analysis complete:`)
          console.log(`   Completeness: ${analysis.completeness}%`)
          console.log(`   Needs more search: ${analysis.needsMoreSearch}`)
          console.log(`   Information gaps: ${analysis.informationGaps.length}`)

          // Check stopping criteria
          if (!analysis.needsMoreSearch || analysis.completeness >= this.config.completenessThreshold!) {
            console.log(`✅ [Iteration ${currentIteration}] Stopping criteria met - completeness threshold reached`)
            break
          }

          if (analysis.informationGaps.length === 0) {
            console.log(`✅ [Iteration ${currentIteration}] Stopping criteria met - no information gaps identified`)
            break
          }

          // Generate follow-up queries
          console.log(`🔍 [Iteration ${currentIteration}] Generating follow-up queries...`)
          const followupResponse = await this.generateFollowupQueries(context, analysis)
          
          if (!followupResponse.success || !followupResponse.data || followupResponse.data.length === 0) {
            console.log(`❌ [Iteration ${currentIteration}] No follow-up queries generated, stopping iterations`)
            console.log('   Error:', followupResponse.error?.message)
            break
          }

          const followupQueries = followupResponse.data
          console.log(`🔎 [Iteration ${currentIteration}] Executing ${followupQueries.length} follow-up searches...`)

          // Execute follow-up searches
          const followupSearchResponses = await this.searchMultipleQueries(followupQueries, context)
          const newResults = followupSearchResponses.filter(response => response.success && response.data).map(response => response.data!)
          
          console.log(`📊 [Iteration ${currentIteration}] Follow-up results:`)
          followupSearchResponses.forEach((response, index) => {
            if (response.success && response.data) {
              console.log(`   Follow-up ${index + 1}: ${response.data.items.length} results found`)
            } else {
              console.log(`   Follow-up ${index + 1}: Failed - ${response.error?.message}`)
            }
          })

          if (newResults.length === 0) {
            console.log(`❌ [Iteration ${currentIteration}] No new results found, stopping iterations`)
            break
          }

          // Check for diminishing returns
          const newResultsCount = newResults.reduce((total, result) => total + result.items.length, 0)
          const previousResultsCount = allSearchResults.reduce((total, result) => total + result.items.length, 0)
          
          // Merge new results with previous results
          allSearchResults = [...allSearchResults, ...newResults]
          
          // Check if we're getting meaningful new information (diminishing returns detection)
          const aggregatedCurrentResults = this.aggregateResults(allSearchResults)
          const uniqueResultsAfter = aggregatedCurrentResults.items.length
          
          if (newResultsCount === 0 || uniqueResultsAfter <= previousResultsCount) {
            console.log(`⚠️ [Iteration ${currentIteration}] Diminishing returns detected, stopping iterations`)
            console.log(`   New results: ${newResultsCount}, Unique after merge: ${uniqueResultsAfter}`)
            break
          }

          console.log(`📈 [Iteration ${currentIteration}] New results added: ${newResultsCount} total, ${uniqueResultsAfter} unique after deduplication`)
          currentIteration++
        }

        console.log(`\n🏁 [Iterative Search] Completed after ${currentIteration} iteration(s)`)
      }

      // Step 3: Aggregate and deduplicate all results
      const aggregatedResults = this.aggregateResults(allSearchResults)
      
      console.log('\n🔗 [Final Aggregation] Results summary:')
      console.log(`   Before deduplication: ${allSearchResults.reduce((total, result) => total + result.items.length, 0)} total results`)
      console.log(`   After deduplication: ${aggregatedResults.items.length} unique results`)
      console.log(`   Total iterations: ${currentIteration}`)
      
      if (aggregatedResults.items.length === 0) {
        return {
          error: {
            message: 'No search results found after all iterations',
            code: 'NO_FINAL_RESULTS'
          },
          success: false
        }
      }

      // Step 4: Extract content for AI processing
      const searchContent = this.searchClient.extractContentForSynthesis(aggregatedResults)

      // Step 5: Generate final AI answer
      console.log('🤖 [Final Answer] Generating comprehensive answer from', searchContent.length, 'search result sources...')
      const answerResponse = await this.geminiClient.generateSearchAnswer(
        context,
        searchContent,
        {
          temperature: this.getTemperatureForFocus(context.focusMode),
          maxOutputTokens: 4096
        }
      )
      
      if (answerResponse.success) {
        console.log('✅ [Final Answer] Generated successfully')
      } else {
        console.log('❌ [Final Answer] Generation failed:', answerResponse.error?.message)
      }

      if (!answerResponse.success || !answerResponse.data) {
        return {
          error: {
            message: 'Final answer generation failed',
            code: 'FINAL_GENERATION_FAILED',
            details: answerResponse.error
          },
          success: false
        }
      }

      // Step 6: Compile final results
      const sources = this.extractSources(aggregatedResults)
      const searchTime = Date.now() - startTime

      console.log('\n📝 [Search Complete] Final summary:')
      console.log(`   ⏱️  Total time: ${searchTime}ms`)
      console.log(`   📚 Sources found: ${sources.length}`)
      console.log(`   🔄 Iterations completed: ${currentIteration}`)
      console.log(`   🎯 Focus mode: ${context.focusMode}`)
      console.log(`   🔍 Query enhancement: ${this.config.enableQueryGeneration ? 'enabled' : 'disabled'}`)
      console.log(`   🔄 Iterative search: ${this.config.enableIterativeSearch ? 'enabled' : 'disabled'}`)

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

  /**
   * Analyze search results for completeness and identify information gaps
   */
  async analyzeSearchResults(
    context: SearchContext, 
    searchResults: SearchResponse[]
  ): Promise<ApiResponse<ResultAnalysis>> {
    try {
      if (searchResults.length === 0) {
        return {
          data: {
            completeness: 0,
            informationGaps: ['No search results available'],
            gapCategories: {
              factual: ['No factual information found'],
              contextual: ['No contextual information available'],
              verification: [],
              depth: ['No detailed information available']
            },
            followupTopics: [],
            confidenceLevel: 0,
            needsMoreSearch: true,
            reasoning: 'No search results were available for analysis'
          },
          success: true
        }
      }

      // Extract search content for analysis
      const allContent = searchResults.flatMap(response => 
        this.searchClient.extractContentForSynthesis(response)
      )

      if (allContent.length === 0) {
        return {
          data: {
            completeness: 10,
            informationGaps: ['No meaningful content extracted from search results'],
            gapCategories: {
              factual: ['Limited factual data available'],
              contextual: ['Insufficient context provided'],
              verification: [],
              depth: ['Surface-level information only']
            },
            followupTopics: [],
            confidenceLevel: 20,
            needsMoreSearch: true,
            reasoning: 'Search results contained no meaningful extractable content'
          },
          success: true
        }
      }

      // Build analysis prompt
      const analysisPrompt = this.buildAnalysisPrompt(context, allContent)
      
      console.log('🔍 [Result Analysis] Analyzing search completeness for:', context.query)
      console.log('📊 [Result Analysis] Content sources:', allContent.length)

      // Get LLM analysis
      const response = await this.geminiClient.generateContent(analysisPrompt, {
        temperature: 0.2, // Lower temperature for more consistent analysis
        maxOutputTokens: 1024
      })

      if (!response.success || !response.data) {
        return {
          error: {
            message: 'Analysis generation failed',
            code: 'ANALYSIS_FAILED',
            details: response.error
          },
          success: false
        }
      }

      const generatedText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text
      if (!generatedText) {
        return {
          error: {
            message: 'No analysis generated',
            code: 'NO_ANALYSIS_GENERATED'
          },
          success: false
        }
      }

      console.log('🤖 [LLM Analysis] Raw response:')
      console.log('   "' + generatedText.replace(/\n/g, '\\n') + '"')

      // Parse the analysis response
      const analysis = this.parseAnalysisResponse(generatedText, context)
      
      console.log('✅ [Result Analysis] Completeness score:', analysis.completeness + '%')
      console.log('🔍 [Result Analysis] Needs more search:', analysis.needsMoreSearch)
      console.log('📋 [Result Analysis] Information gaps:', analysis.informationGaps.length)
      
      return {
        data: analysis,
        success: true
      }
    } catch (error) {
      return {
        error: {
          message: 'Result analysis error',
          code: 'ANALYSIS_ERROR',
          details: error
        },
        success: false
      }
    }
  }

  /**
   * Build analysis prompt for evaluating search result completeness
   */
  private buildAnalysisPrompt(context: SearchContext, searchContent: string[]): string {
    const focusAnalysisInstructions = this.getAnalysisInstructions(context.focusMode)
    
    return `You are an expert research analyst. Your task is to evaluate the completeness of search results for a user's query and identify information gaps that need to be filled through additional searches.

${focusAnalysisInstructions}

Original User Query: "${context.query}"
Focus Mode: ${context.focusMode}

Search Results Content:
${searchContent.map((content, index) => `[Source ${index + 1}] ${content}`).join('\n\n')}

Your task is to analyze these search results and provide a structured assessment. You must respond ONLY in valid JSON format with the following structure:

{
  "completeness": <number 0-100>,
  "informationGaps": ["gap1", "gap2", ...],
  "gapCategories": {
    "factual": ["missing fact 1", "missing fact 2", ...],
    "contextual": ["missing context 1", "missing context 2", ...],
    "verification": ["contradictory claim 1", "unverified fact 1", ...],
    "depth": ["needs more detail on topic 1", "shallow coverage of topic 2", ...]
  },
  "followupTopics": ["topic1", "topic2", ...],
  "confidenceLevel": <number 0-100>,
  "needsMoreSearch": <boolean>,
  "reasoning": "Explain your analysis in 1-2 sentences"
}

Analysis Guidelines:
- Completeness (0-100): How well do the search results answer the user's query?
- Information Gaps: Specific missing information that would improve the answer
- Gap Categories: Classify gaps as factual (missing data), contextual (missing background), verification (contradictory/unverified), or depth (insufficient detail)
- Follow-up Topics: Specific topics that could be searched to fill gaps
- Confidence Level (0-100): How confident are you in this analysis?
- Needs More Search: true if completeness < ${this.config.completenessThreshold}%
- Reasoning: Brief explanation of your assessment

Provide only the JSON response, no additional text:`
  }

  /**
   * Get focus mode-specific analysis instructions
   */
  private getAnalysisInstructions(focusMode: string): string {
    const instructions = {
      general: 'Evaluate for balanced coverage across multiple perspectives. Look for missing viewpoints, incomplete explanations, and lack of practical examples.',
      academic: 'Focus on scholarly rigor and research completeness. Identify missing citations, peer-reviewed sources, methodological details, and academic consensus.',
      creative: 'Assess creative inspiration and innovative ideas. Look for missing examples, creative approaches, artistic perspectives, and inspirational content.',
      news: 'Evaluate current events coverage and timeline completeness. Identify missing recent developments, expert opinions, and contextual background.',
      technical: 'Focus on implementation completeness and technical accuracy. Look for missing specifications, code examples, troubleshooting guides, and technical details.',
      medical: 'Assess medical information completeness and accuracy. Identify missing symptoms, treatments, medical studies, and professional medical context.',
      legal: 'Evaluate legal information completeness. Look for missing legal precedents, regulatory details, jurisdictional considerations, and professional legal guidance.'
    }

    return instructions[focusMode as keyof typeof instructions] || instructions.general
  }

  /**
   * Parse LLM analysis response into ResultAnalysis object
   */
  private parseAnalysisResponse(generatedText: string, context: SearchContext): ResultAnalysis {
    try {
      // Try to extract JSON from the response
      const jsonMatch = generatedText.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        throw new Error('No JSON found in response')
      }

      const analysisData = JSON.parse(jsonMatch[0])
      
      // Validate and sanitize the response
      const analysis: ResultAnalysis = {
        completeness: Math.max(0, Math.min(100, analysisData.completeness || 0)),
        informationGaps: Array.isArray(analysisData.informationGaps) ? analysisData.informationGaps : [],
        gapCategories: {
          factual: Array.isArray(analysisData.gapCategories?.factual) ? analysisData.gapCategories.factual : [],
          contextual: Array.isArray(analysisData.gapCategories?.contextual) ? analysisData.gapCategories.contextual : [],
          verification: Array.isArray(analysisData.gapCategories?.verification) ? analysisData.gapCategories.verification : [],
          depth: Array.isArray(analysisData.gapCategories?.depth) ? analysisData.gapCategories.depth : []
        },
        followupTopics: Array.isArray(analysisData.followupTopics) ? analysisData.followupTopics : [],
        confidenceLevel: Math.max(0, Math.min(100, analysisData.confidenceLevel || 0)),
        needsMoreSearch: Boolean(analysisData.needsMoreSearch),
        reasoning: String(analysisData.reasoning || 'Analysis completed')
      }

      return analysis
    } catch (error) {
      console.warn('🔄 [Analysis Parsing] Failed to parse LLM response, using fallback analysis')
      
      // Fallback analysis if parsing fails
      return {
        completeness: 50,
        informationGaps: ['Unable to properly analyze search results'],
        gapCategories: {
          factual: ['Analysis parsing failed - may need more factual information'],
          contextual: ['Unable to assess contextual completeness'],
          verification: [],
          depth: ['Cannot determine information depth']
        },
        followupTopics: [context.query + ' additional information'],
        confidenceLevel: 30,
        needsMoreSearch: true,
        reasoning: 'Analysis parsing failed, recommending additional search as precaution'
      }
    }
  }

  /**
   * Generate follow-up queries based on identified information gaps
   */
  async generateFollowupQueries(
    context: SearchContext,
    analysis: ResultAnalysis
  ): Promise<ApiResponse<string[]>> {
    try {
      if (!analysis.needsMoreSearch || analysis.informationGaps.length === 0) {
        return {
          data: [],
          success: true
        }
      }

      console.log('🔍 [Follow-up Generation] Generating queries for', analysis.informationGaps.length, 'information gaps')
      console.log('📊 [Follow-up Generation] Gap categories:', {
        factual: analysis.gapCategories.factual.length,
        contextual: analysis.gapCategories.contextual.length,
        verification: analysis.gapCategories.verification.length,
        depth: analysis.gapCategories.depth.length
      })

      // Build follow-up query generation prompt
      const followupPrompt = this.buildFollowupQueryPrompt(context, analysis)
      
      // Generate follow-up queries using LLM
      const response = await this.geminiClient.generateContent(followupPrompt, {
        temperature: 0.3, // Balanced creativity for query generation
        maxOutputTokens: 1024
      })

      if (!response.success || !response.data) {
        return {
          error: {
            message: 'Follow-up query generation failed',
            code: 'FOLLOWUP_GENERATION_FAILED',
            details: response.error
          },
          success: false
        }
      }

      const generatedText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text
      if (!generatedText) {
        return {
          error: {
            message: 'No follow-up queries generated',
            code: 'NO_FOLLOWUP_QUERIES_GENERATED'
          },
          success: false
        }
      }

      console.log('🤖 [Follow-up LLM] Raw response:')
      console.log('   "' + generatedText.replace(/\n/g, '\\n') + '"')

      // Parse and prioritize the generated follow-up queries
      const followupQueries = this.parseAndPrioritizeFollowupQueries(
        generatedText, 
        context, 
        analysis
      )
      
      console.log('✅ [Follow-up Generation] Generated', followupQueries.length, 'prioritized queries')
      followupQueries.forEach((query, index) => {
        console.log(`   ${index + 1}. "${query}"`)
      })
      
      return {
        data: followupQueries,
        success: true
      }
    } catch (error) {
      return {
        error: {
          message: 'Follow-up query generation error',
          code: 'FOLLOWUP_GENERATION_ERROR',
          details: error
        },
        success: false
      }
    }
  }

  /**
   * Build prompt for generating follow-up queries based on gaps
   */
  private buildFollowupQueryPrompt(context: SearchContext, analysis: ResultAnalysis): string {
    const focusInstructions = this.getFollowupQueryInstructions(context.focusMode)
    
    return `You are an expert at generating targeted search queries to fill specific information gaps. Your task is to create follow-up search queries that will help find the missing information identified in the analysis.

${focusInstructions}

Original User Query: "${context.query}"
Focus Mode: ${context.focusMode}
Current Completeness: ${analysis.completeness}%
Confidence Level: ${analysis.confidenceLevel}%

IDENTIFIED INFORMATION GAPS:

General Information Gaps:
${analysis.informationGaps.map(gap => `- ${gap}`).join('\n')}

Categorized Gaps:
${analysis.gapCategories.factual.length > 0 ? `
FACTUAL GAPS (Missing facts/data):
${analysis.gapCategories.factual.map(gap => `- ${gap}`).join('\n')}` : ''}

${analysis.gapCategories.contextual.length > 0 ? `
CONTEXTUAL GAPS (Missing background/context):
${analysis.gapCategories.contextual.map(gap => `- ${gap}`).join('\n')}` : ''}

${analysis.gapCategories.verification.length > 0 ? `
VERIFICATION GAPS (Contradictory/unverified information):
${analysis.gapCategories.verification.map(gap => `- ${gap}`).join('\n')}` : ''}

${analysis.gapCategories.depth.length > 0 ? `
DEPTH GAPS (Insufficient detail):
${analysis.gapCategories.depth.length > 0 ? analysis.gapCategories.depth.map(gap => `- ${gap}`).join('\n') : ''}` : ''}

Follow-up Topics Suggested:
${analysis.followupTopics.map(topic => `- ${topic}`).join('\n')}

Your task is to generate up to ${this.config.maxFollowupQueries} targeted search queries that will specifically address these gaps. Each query should:

1. **Target Specific Gaps**: Each query should address one or more identified gaps
2. **Use Effective Keywords**: Create queries likely to find the missing information
3. **Avoid Redundancy**: Don't repeat information already found in initial search
4. **Focus on Gaps**: Prioritize the most critical missing information
5. **Optimize for Search**: Use terms and phrases that search engines will understand

Gap-Specific Query Guidelines:
- **For Factual Gaps**: Focus on specific data, statistics, numbers, dates, names
- **For Contextual Gaps**: Seek background information, explanations, definitions, history
- **For Verification Gaps**: Look for authoritative sources, studies, official statements
- **For Depth Gaps**: Search for detailed explanations, step-by-step guides, comprehensive analysis

Requirements:
- Generate exactly up to ${this.config.maxFollowupQueries} different search queries
- Each query must directly address identified gaps
- Keep queries concise but specific (5-15 words ideal)
- Optimize for web search engines
- Format your response as a numbered list (1., 2., 3.)
- Focus on the most impactful gaps first

Generate the targeted follow-up search queries now:`
  }

  /**
   * Get focus mode-specific instructions for follow-up query generation
   */
  private getFollowupQueryInstructions(focusMode: string): string {
    const instructions = {
      general: 'Generate balanced follow-up queries covering different perspectives and reliable sources. Include both broad and specific query variations.',
      academic: 'Focus on scholarly follow-up queries targeting academic sources, research databases, and peer-reviewed content. Use academic terminology and research-focused keywords.',
      creative: 'Generate creative follow-up queries exploring innovative approaches, artistic perspectives, and inspirational content. Include terms that find creative examples and novel ideas.',
      news: 'Focus on current and recent information with news-oriented follow-up queries. Include temporal terms and keywords that find latest developments and breaking information.',
      technical: 'Generate technical follow-up queries targeting documentation, implementation guides, and technical specifications. Use precise technical terminology and implementation-focused keywords.',
      medical: 'Focus on medical and health-related follow-up queries targeting clinical sources, medical studies, and health databases. Use medical terminology and health-focused keywords.',
      legal: 'Generate legal-focused follow-up queries targeting legal databases, case law, and regulatory sources. Use legal terminology and jurisdiction-specific keywords.'
    }

    return instructions[focusMode as keyof typeof instructions] || instructions.general
  }

  /**
   * Parse generated follow-up queries and prioritize them based on gap importance
   */
  private parseAndPrioritizeFollowupQueries(
    generatedText: string, 
    context: SearchContext, 
    analysis: ResultAnalysis
  ): string[] {
    const lines = generatedText.split('\n').filter(line => line.trim())
    const queries: { query: string; priority: number }[] = []

    // Parse numbered list format
    for (const line of lines) {
      const match = line.match(/^\d+\.\s*(.+)$/)
      if (match && match[1]) {
        let query = match[1].trim()
        // Remove quotes if present
        query = query.replace(/^["']|["']$/g, '')
        
        if (query && query !== context.query) {
          // Calculate priority based on gap type and analysis
          const priority = this.calculateQueryPriority(query, analysis)
          queries.push({ query, priority })
        }
      }
    }

    // Fallback parsing if numbered format not found
    if (queries.length === 0) {
      const meaningfulLines = lines.filter(line => 
        line.length > 10 && 
        !line.toLowerCase().includes('follow-up') &&
        !line.toLowerCase().includes('search queries') &&
        !line.toLowerCase().includes('generated') &&
        line !== context.query
      )
      
      meaningfulLines.slice(0, this.config.maxFollowupQueries).forEach(line => {
        const priority = this.calculateQueryPriority(line, analysis)
        queries.push({ query: line.trim(), priority })
      })
    }

    // Sort by priority (higher priority first) and limit to maxFollowupQueries
    const prioritizedQueries = queries
      .sort((a, b) => b.priority - a.priority)
      .slice(0, this.config.maxFollowupQueries)
      .map(item => item.query)

    return prioritizedQueries
  }

  /**
   * Calculate priority score for a follow-up query based on analysis gaps
   */
  private calculateQueryPriority(query: string, analysis: ResultAnalysis): number {
    let priority = 0
    const queryLower = query.toLowerCase()

    // Higher priority for queries that address multiple gap types
    let gapTypesAddressed = 0

    // Check if query addresses factual gaps (highest priority)
    if (analysis.gapCategories.factual.length > 0) {
      const factualKeywords = ['data', 'statistics', 'numbers', 'facts', 'research', 'study', 'evidence']
      if (factualKeywords.some(keyword => queryLower.includes(keyword))) {
        priority += 40
        gapTypesAddressed++
      }
    }

    // Check if query addresses verification gaps (high priority)
    if (analysis.gapCategories.verification.length > 0) {
      const verificationKeywords = ['official', 'verified', 'confirmed', 'authoritative', 'source', 'validation']
      if (verificationKeywords.some(keyword => queryLower.includes(keyword))) {
        priority += 35
        gapTypesAddressed++
      }
    }

    // Check if query addresses depth gaps (medium-high priority)
    if (analysis.gapCategories.depth.length > 0) {
      const depthKeywords = ['detailed', 'comprehensive', 'complete', 'thorough', 'in-depth', 'advanced']
      if (depthKeywords.some(keyword => queryLower.includes(keyword))) {
        priority += 30
        gapTypesAddressed++
      }
    }

    // Check if query addresses contextual gaps (medium priority)
    if (analysis.gapCategories.contextual.length > 0) {
      const contextualKeywords = ['background', 'context', 'history', 'explanation', 'overview', 'introduction']
      if (contextualKeywords.some(keyword => queryLower.includes(keyword))) {
        priority += 25
        gapTypesAddressed++
      }
    }

    // Check if query matches suggested follow-up topics
    const topicMatches = analysis.followupTopics.filter(topic => 
      queryLower.includes(topic.toLowerCase()) || topic.toLowerCase().includes(queryLower)
    ).length
    priority += topicMatches * 15

    // Check if query addresses specific information gaps
    const gapMatches = analysis.informationGaps.filter(gap => 
      queryLower.includes(gap.toLowerCase()) || gap.toLowerCase().includes(queryLower)
    ).length
    priority += gapMatches * 10

    // Bonus for addressing multiple gap types (shows comprehensiveness)
    if (gapTypesAddressed > 1) {
      priority += 20
    }

    // Quality bonuses
    if (query.length >= 20 && query.length <= 80) { // Optimal query length
      priority += 5
    }
    
    if (queryLower.split(' ').length >= 3 && queryLower.split(' ').length <= 8) { // Good word count
      priority += 5
    }

    return Math.max(0, priority)
  }
}