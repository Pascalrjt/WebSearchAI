export interface ValidationResult {
  isValid: boolean
  error?: string
  details?: {
    service?: string
    quota?: number
    model?: string
  }
}

export async function validateGeminiKey(apiKey: string): Promise<ValidationResult> {
  if (!apiKey || apiKey.trim().length === 0) {
    return {
      isValid: false,
      error: 'API key is required'
    }
  }

  if (!apiKey.startsWith('AIza')) {
    return {
      isValid: false,
      error: 'Invalid Google API key format'
    }
  }

  try {
    // Test the Gemini API with a simple request
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: 'Test'
          }]
        }]
      })
    })

    if (response.ok) {
      return {
        isValid: true,
        details: {
          service: 'Gemini API',
          model: 'gemini-1.5-flash-latest'
        }
      }
    } else {
      const errorData = await response.json().catch(() => ({}))
      return {
        isValid: false,
        error: errorData.error?.message || `API request failed: ${response.status}`
      }
    }
  } catch (error) {
    return {
      isValid: false,
      error: error instanceof Error ? error.message : 'Network error'
    }
  }
}

export async function validateCustomSearchKey(apiKey: string, searchEngineId: string): Promise<ValidationResult> {
  if (!apiKey || apiKey.trim().length === 0) {
    return {
      isValid: false,
      error: 'Custom Search API key is required'
    }
  }

  if (!searchEngineId || searchEngineId.trim().length === 0) {
    return {
      isValid: false,
      error: 'Search Engine ID is required'
    }
  }

  if (!apiKey.startsWith('AIza')) {
    return {
      isValid: false,
      error: 'Invalid Google API key format'
    }
  }

  try {
    // Test the Custom Search API with a simple query
    const params = new URLSearchParams({
      key: apiKey,
      cx: searchEngineId,
      q: 'test',
      num: '1'
    })

    const response = await fetch(`https://www.googleapis.com/customsearch/v1?${params}`)

    if (response.ok) {
      const data = await response.json()
      return {
        isValid: true,
        details: {
          service: 'Custom Search API',
          quota: data.queries?.request?.[0]?.totalResults ? 
            Math.min(100, parseInt(data.queries.request[0].totalResults)) : 100
        }
      }
    } else {
      const errorData = await response.json().catch(() => ({}))
      
      if (response.status === 429) {
        return {
          isValid: false,
          error: 'Daily quota exceeded. Try again tomorrow or add another API key.'
        }
      }
      
      return {
        isValid: false,
        error: errorData.error?.message || `API request failed: ${response.status}`
      }
    }
  } catch (error) {
    return {
      isValid: false,
      error: error instanceof Error ? error.message : 'Network error'
    }
  }
}

export async function validateAllKeys(geminiKey: string, customSearchKey: string, searchEngineId: string): Promise<{
  gemini: ValidationResult
  customSearch: ValidationResult
  overall: boolean
}> {
  const [geminiResult, customSearchResult] = await Promise.all([
    validateGeminiKey(geminiKey),
    validateCustomSearchKey(customSearchKey, searchEngineId)
  ])

  return {
    gemini: geminiResult,
    customSearch: customSearchResult,
    overall: geminiResult.isValid && customSearchResult.isValid
  }
}

export function getApiKeyStrength(apiKey: string): 'weak' | 'medium' | 'strong' {
  if (!apiKey || apiKey.length < 32) return 'weak'
  if (apiKey.length < 39) return 'medium'
  return 'strong'
}

export function estimateGeminiCost(tokens: number): number {
  // Gemini 1.5 Flash pricing: $0.35 per 1M input tokens, $1.05 per 1M output tokens
  // Estimate 50/50 split for conversational usage
  const inputCost = (tokens * 0.5) * (0.35 / 1_000_000)
  const outputCost = (tokens * 0.5) * (1.05 / 1_000_000)
  return inputCost + outputCost
}

export function estimateSearchCost(queries: number): number {
  // Google Custom Search: $5 per 1,000 queries after free tier
  const paidQueries = Math.max(0, queries - 100)
  return (paidQueries / 1000) * 5
}