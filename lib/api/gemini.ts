import { 
  GeminiGenerateRequest, 
  GeminiResponse, 
  GeminiGenerationConfig,
  GeminiSafetySettings,
  ApiResponse,
  SearchContext
} from '@/lib/types/api'

export class GeminiApiError extends Error {
  constructor(
    message: string,
    public code?: string | number,
    public status?: number,
    public details?: any
  ) {
    super(message)
    this.name = 'GeminiApiError'
  }
}

export interface GeminiClientConfig {
  apiKey: string
  model?: string
  baseUrl?: string
}

export class GeminiClient {
  private apiKey: string
  private model: string
  private baseUrl: string

  constructor(config: GeminiClientConfig) {
    this.apiKey = config.apiKey
    this.model = config.model || 'gemini-1.5-flash'
    this.baseUrl = config.baseUrl || 'https://generativelanguage.googleapis.com/v1beta'
  }

  /**
   * Generate content using Gemini API
   */
  async generateContent(
    prompt: string,
    config?: Partial<GeminiGenerationConfig>
  ): Promise<ApiResponse<GeminiResponse>> {
    try {
      const request: GeminiGenerateRequest = {
        contents: [
          {
            parts: [{ text: prompt }],
            role: 'user'
          }
        ],
        generationConfig: {
          temperature: 0.7,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 8192,
          ...config
        },
        safetySettings: this.getDefaultSafetySettings()
      }

      const response = await fetch(
        `${this.baseUrl}/models/${this.model}:generateContent?key=${this.apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(request)
        }
      )

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new GeminiApiError(
          errorData.error?.message || `HTTP ${response.status}: ${response.statusText}`,
          errorData.error?.code || response.status,
          response.status,
          errorData
        )
      }

      const data: GeminiResponse = await response.json()
      
      return {
        data,
        success: true
      }
    } catch (error) {
      if (error instanceof GeminiApiError) {
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
   * Generate a search-optimized answer based on search context and results
   */
  async generateSearchAnswer(
    context: SearchContext,
    searchResults: string[],
    config?: Partial<GeminiGenerationConfig>
  ): Promise<ApiResponse<string>> {
    const prompt = this.buildSearchPrompt(context, searchResults)
    
    const response = await this.generateContent(prompt, {
      temperature: 0.3, // Lower temperature for more factual responses
      maxOutputTokens: 4096,
      ...config
    })

    if (!response.success || !response.data) {
      return {
        error: response.error || {
          message: 'Failed to generate content',
          code: 'GENERATION_FAILED'
        },
        success: false
      }
    }

    try {
      const generatedText = response.data.candidates?.[0]?.content?.parts?.[0]?.text
      if (!generatedText) {
        return {
          error: {
            message: 'No content generated',
            code: 'NO_CONTENT'
          },
          success: false
        }
      }

      return {
        data: generatedText,
        success: true
      }
    } catch (error) {
      return {
        error: {
          message: 'Failed to parse response',
          code: 'PARSE_ERROR'
        },
        success: false
      }
    }
  }

  /**
   * Stream content generation (for real-time responses)
   */
  async *streamContent(
    prompt: string,
    config?: Partial<GeminiGenerationConfig>
  ): AsyncGenerator<string, void, unknown> {
    try {
      const request: GeminiGenerateRequest = {
        contents: [
          {
            parts: [{ text: prompt }],
            role: 'user'
          }
        ],
        generationConfig: {
          temperature: 0.7,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 8192,
          ...config
        },
        safetySettings: this.getDefaultSafetySettings()
      }

      const response = await fetch(
        `${this.baseUrl}/models/${this.model}:streamGenerateContent?key=${this.apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(request)
        }
      )

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new GeminiApiError(
          errorData.error?.message || `HTTP ${response.status}: ${response.statusText}`,
          errorData.error?.code || response.status,
          response.status,
          errorData
        )
      }

      const reader = response.body?.getReader()
      if (!reader) {
        throw new GeminiApiError('No response body reader available')
      }

      const decoder = new TextDecoder()
      let buffer = ''

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            if (line.trim() && line.startsWith('data: ')) {
              try {
                const jsonStr = line.slice(6).trim()
                if (jsonStr === '[DONE]') return
                
                const data: GeminiResponse = JSON.parse(jsonStr)
                const text = data.candidates?.[0]?.content?.parts?.[0]?.text
                if (text) {
                  yield text
                }
              } catch (parseError) {
                // Skip malformed JSON lines
                continue
              }
            }
          }
        }
      } finally {
        reader.releaseLock()
      }
    } catch (error) {
      if (error instanceof GeminiApiError) {
        throw error
      }
      throw new GeminiApiError(
        error instanceof Error ? error.message : 'Streaming failed'
      )
    }
  }

  /**
   * Validate the API key
   */
  async validateApiKey(): Promise<ApiResponse<boolean>> {
    const response = await this.generateContent('Test', {
      maxOutputTokens: 10
    })
    
    if (response.success) {
      return {
        data: true,
        success: true
      }
    } else {
      return {
        error: response.error || {
          message: 'Validation failed',
          code: 'VALIDATION_ERROR'
        },
        success: false
      }
    }
  }

  /**
   * Get token usage from the last response
   */
  getUsageFromResponse(response: GeminiResponse): {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  } {
    const usage = response.usageMetadata
    return {
      promptTokens: usage?.promptTokenCount || 0,
      completionTokens: usage?.candidatesTokenCount || 0,
      totalTokens: usage?.totalTokenCount || 0
    }
  }

  /**
   * Estimate cost based on token usage
   */
  estimateCost(promptTokens: number, completionTokens: number): number {
    // Gemini 1.5 Flash pricing (as of 2024)
    const promptCostPer1K = 0.00015 // $0.15 per 1M tokens
    const completionCostPer1K = 0.0006 // $0.60 per 1M tokens
    
    return (
      (promptTokens / 1000) * promptCostPer1K +
      (completionTokens / 1000) * completionCostPer1K
    )
  }

  private buildSearchPrompt(context: SearchContext, searchResults: string[]): string {
    const focusModeInstructions = this.getFocusModeInstructions(context.focusMode)
    
    return `${focusModeInstructions}

Query: "${context.query}"

Search Results:
${searchResults.map((result, index) => `[${index + 1}] ${result}`).join('\n\n')}

Please provide a comprehensive, well-structured answer based on the search results above. Include relevant citations using [1], [2], etc. format to reference the sources. Make sure your response is accurate, helpful, and directly addresses the user's query.

Requirements:
- Synthesize information from multiple sources when possible
- Cite sources using numbered references
- Provide a clear, structured response
- Focus on accuracy and helpfulness
- Maintain an appropriate tone for the search focus mode`
  }

  private getFocusModeInstructions(focusMode: string): string {
    const instructions = {
      general: 'Provide a balanced, informative response suitable for general audiences.',
      academic: 'Focus on scholarly accuracy, cite sources properly, and use academic language. Prioritize peer-reviewed sources and research.',
      creative: 'Provide an engaging, creative response that inspires and informs. Feel free to use vivid language and examples.',
      news: 'Focus on recent developments, current events, and timely information. Prioritize credible news sources.',
      technical: 'Provide detailed technical information with precise terminology. Focus on implementation details and technical accuracy.',
      medical: 'Provide accurate medical information while noting that this is for informational purposes only and not medical advice.',
      legal: 'Provide legal information while noting that this is for informational purposes only and not legal advice.'
    }

    return instructions[focusMode as keyof typeof instructions] || instructions.general
  }

  private getDefaultSafetySettings(): GeminiSafetySettings[] {
    return [
      {
        category: 'HARM_CATEGORY_HARASSMENT',
        threshold: 'BLOCK_MEDIUM_AND_ABOVE'
      },
      {
        category: 'HARM_CATEGORY_HATE_SPEECH',
        threshold: 'BLOCK_MEDIUM_AND_ABOVE'
      },
      {
        category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
        threshold: 'BLOCK_MEDIUM_AND_ABOVE'
      },
      {
        category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
        threshold: 'BLOCK_MEDIUM_AND_ABOVE'
      }
    ]
  }
}