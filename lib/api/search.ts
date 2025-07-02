import {
  CustomSearchRequest,
  CustomSearchResponse,
  CustomSearchItem,
  ApiResponse,
  SearchContext,
  SearchFocusMode
} from '@/lib/types/api'

export class CustomSearchApiError extends Error {
  constructor(
    message: string,
    public code?: string | number,
    public status?: number,
    public details?: any
  ) {
    super(message)
    this.name = 'CustomSearchApiError'
  }
}

export interface CustomSearchClientConfig {
  apiKey: string
  searchEngineId: string
  baseUrl?: string
}

export interface SearchResult {
  title: string
  link: string
  snippet: string
  displayLink: string
  formattedUrl: string
  htmlTitle: string
  htmlSnippet: string
  cacheId?: string
  metadata?: { [key: string]: any }
}

export interface SearchResponse {
  items: SearchResult[]
  searchInformation: {
    searchTime: number
    totalResults: string
    formattedTotalResults: string
  }
  totalResults: number
  hasNextPage: boolean
  nextPageStartIndex?: number
}

export class CustomSearchClient {
  private apiKey: string
  private searchEngineId: string
  private baseUrl: string

  constructor(config: CustomSearchClientConfig) {
    this.apiKey = config.apiKey
    this.searchEngineId = config.searchEngineId
    this.baseUrl = config.baseUrl || 'https://www.googleapis.com/customsearch/v1'
  }

  /**
   * Perform a web search
   */
  async search(
    query: string,
    options: {
      num?: number
      start?: number
      language?: string
      region?: string
      safe?: 'active' | 'off'
      dateRestrict?: string
      siteSearch?: string
      excludeTerms?: string[]
    } = {}
  ): Promise<ApiResponse<SearchResponse>> {
    try {
      const searchParams = this.buildSearchParams(query, options)
      const url = `${this.baseUrl}?${searchParams.toString()}`

      const response = await fetch(url)

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new CustomSearchApiError(
          errorData.error?.message || `HTTP ${response.status}: ${response.statusText}`,
          errorData.error?.code || response.status,
          response.status,
          errorData
        )
      }

      const data: CustomSearchResponse = await response.json()
      const searchResponse = this.parseSearchResponse(data)

      return {
        data: searchResponse,
        success: true
      }
    } catch (error) {
      if (error instanceof CustomSearchApiError) {
        return {
          error: {
            message: error.message,
            code: error.code,
            status: error.status,
            details: error.details
          },
          success: false
        }
      }

      return {
        error: {
          message: error instanceof Error ? error.message : 'Unknown error occurred',
          code: 'UNKNOWN_ERROR'
        },
        success: false
      }
    }
  }

  /**
   * Search with focus mode optimization
   */
  async searchWithFocus(
    context: SearchContext,
    options: {
      num?: number
      start?: number
    } = {}
  ): Promise<ApiResponse<SearchResponse>> {
    const optimizedQuery = this.optimizeQueryForFocus(context.query, context.focusMode)
    const searchOptions = this.getSearchOptionsForFocus(context.focusMode, options)

    return this.search(optimizedQuery, {
      ...searchOptions,
      language: context.language,
      region: context.region
    })
  }

  /**
   * Get search suggestions (if available through the API)
   */
  async getSuggestions(query: string): Promise<ApiResponse<string[]>> {
    // Note: Google Custom Search API doesn't directly provide suggestions
    // This is a placeholder for potential future implementation or alternative APIs
    try {
      // For now, return query variations based on common search patterns
      const suggestions = this.generateQuerySuggestions(query)
      
      return {
        data: suggestions,
        success: true
      }
    } catch (error) {
      return {
        error: {
          message: 'Failed to get suggestions',
          code: 'SUGGESTIONS_ERROR'
        },
        success: false
      }
    }
  }

  /**
   * Validate the API key and search engine ID
   */
  async validateApiKey(): Promise<ApiResponse<boolean>> {
    const result = await this.search('test', { num: 1 })
    
    if (result.success) {
      return {
        data: true,
        success: true
      }
    } else {
      return {
        error: result.error || {
          message: 'Validation failed',
          code: 'VALIDATION_ERROR'
        },
        success: false
      }
    }
  }

  /**
   * Get quota usage information
   */
  async getQuotaUsage(): Promise<ApiResponse<{
    queriesUsed: number
    quotaRemaining: number
    resetDate: Date
  }>> {
    // Note: Google Custom Search API doesn't provide direct quota information
    // This would need to be tracked client-side or through Google Cloud Console
    return {
      error: {
        message: 'Quota information not available through API',
        code: 'NOT_IMPLEMENTED'
      },
      success: false
    }
  }

  /**
   * Estimate cost based on query count
   */
  estimateCost(queryCount: number): number {
    // Google Custom Search API pricing (as of 2024)
    // First 100 queries per day are free, then $5 per 1000 queries
    if (queryCount <= 100) {
      return 0
    }
    
    const paidQueries = queryCount - 100
    return (paidQueries / 1000) * 5
  }

  /**
   * Extract clean text content from search results for AI processing
   */
  extractContentForSynthesis(searchResponse: SearchResponse): string[] {
    return searchResponse.items.map(item => {
      // Clean HTML tags and format content
      const cleanTitle = this.cleanHtml(item.htmlTitle || item.title)
      const cleanSnippet = this.cleanHtml(item.htmlSnippet || item.snippet)
      
      return `Title: ${cleanTitle}\nURL: ${item.link}\nContent: ${cleanSnippet}`
    })
  }

  private buildSearchParams(
    query: string,
    options: {
      num?: number
      start?: number
      language?: string
      region?: string
      safe?: 'active' | 'off'
      dateRestrict?: string
      siteSearch?: string
      excludeTerms?: string[]
    }
  ): URLSearchParams {
    const params = new URLSearchParams({
      key: this.apiKey,
      cx: this.searchEngineId,
      q: query
    })

    if (options.num) params.set('num', options.num.toString())
    if (options.start) params.set('start', options.start.toString())
    if (options.language) params.set('lr', `lang_${options.language}`)
    if (options.region) params.set('gl', options.region)
    if (options.safe) params.set('safe', options.safe)
    if (options.dateRestrict) params.set('dateRestrict', options.dateRestrict)
    if (options.siteSearch) params.set('siteSearch', options.siteSearch)
    
    // Add exclude terms to query
    if (options.excludeTerms && options.excludeTerms.length > 0) {
      const excludeQuery = options.excludeTerms.map(term => `-${term}`).join(' ')
      params.set('q', `${query} ${excludeQuery}`)
    }

    return params
  }

  private parseSearchResponse(data: CustomSearchResponse): SearchResponse {
    const items: SearchResult[] = (data.items || []).map(item => ({
      title: item.title,
      link: item.link,
      snippet: item.snippet,
      displayLink: item.displayLink,
      formattedUrl: item.formattedUrl,
      htmlTitle: item.htmlTitle,
      htmlSnippet: item.htmlSnippet,
      cacheId: item.cacheId,
      metadata: item.pagemap
    }))

    const totalResults = parseInt(data.searchInformation?.totalResults || '0', 10)
    const currentStart = data.queries?.request?.[0]?.startIndex || 1
    const currentCount = data.queries?.request?.[0]?.count || items.length
    const hasNextPage = data.queries?.nextPage !== undefined

    return {
      items,
      searchInformation: {
        searchTime: data.searchInformation?.searchTime || 0,
        totalResults: data.searchInformation?.totalResults || '0',
        formattedTotalResults: data.searchInformation?.formattedTotalResults || '0'
      },
      totalResults,
      hasNextPage,
      nextPageStartIndex: hasNextPage ? currentStart + currentCount : undefined
    }
  }

  private optimizeQueryForFocus(query: string, focusMode: SearchFocusMode): string {
    const optimizations = {
      general: query,
      academic: `"${query}" site:edu OR site:scholar.google.com OR filetype:pdf`,
      creative: `"${query}" inspiration OR creative OR ideas OR examples`,
      news: `"${query}" news OR latest OR recent OR breaking`,
      technical: `"${query}" documentation OR tutorial OR API OR implementation`,
      medical: `"${query}" medical OR health OR clinical OR research pubmed`,
      legal: `"${query}" law OR legal OR court OR statute OR regulation`
    }

    return optimizations[focusMode] || query
  }

  private getSearchOptionsForFocus(
    focusMode: SearchFocusMode,
    baseOptions: { num?: number; start?: number }
  ) {
    const focusOptions = {
      general: {},
      academic: {
        dateRestrict: 'y5', // Last 5 years for academic content
        safe: 'off' as const
      },
      creative: {
        safe: 'off' as const
      },
      news: {
        dateRestrict: 'y1', // Last year for news
        safe: 'active' as const
      },
      technical: {
        safe: 'off' as const
      },
      medical: {
        safe: 'active' as const,
        siteSearch: 'pubmed.ncbi.nlm.nih.gov OR who.int OR mayoclinic.org'
      },
      legal: {
        safe: 'active' as const
      }
    }

    return {
      ...baseOptions,
      ...focusOptions[focusMode]
    }
  }

  private generateQuerySuggestions(query: string): string[] {
    const words = query.toLowerCase().split(' ')
    const suggestions: string[] = []

    // Add question variations
    if (!query.includes('what') && !query.includes('how') && !query.includes('why')) {
      suggestions.push(`what is ${query}`)
      suggestions.push(`how to ${query}`)
      suggestions.push(`why ${query}`)
    }

    // Add comparison suggestions
    if (words.length === 1) {
      suggestions.push(`${query} vs`)
      suggestions.push(`${query} alternatives`)
      suggestions.push(`best ${query}`)
    }

    // Add time-based variations
    suggestions.push(`${query} 2024`)
    suggestions.push(`latest ${query}`)

    // Add tutorial/guide variations
    suggestions.push(`${query} tutorial`)
    suggestions.push(`${query} guide`)
    suggestions.push(`${query} examples`)

    return suggestions.slice(0, 8) // Return top 8 suggestions
  }

  private cleanHtml(htmlString: string): string {
    // Remove HTML tags and decode HTML entities
    return htmlString
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim()
  }
}