import {
  validateGeminiKey,
  validateCustomSearchKey,
  validateAllKeys,
  getApiKeyStrength,
  estimateGeminiCost,
  estimateSearchCost
} from '@/lib/utils/api-validation'

// Mock fetch globally
const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>

describe('API Validation', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockFetch.mockReset()
  })

  describe('validateGeminiKey', () => {
    it('should return invalid for empty key', async () => {
      const result = await validateGeminiKey('')
      
      expect(result.isValid).toBe(false)
      expect(result.error).toBe('API key is required')
    })

    it('should return invalid for key not starting with AIza', async () => {
      const result = await validateGeminiKey('invalid-key')
      
      expect(result.isValid).toBe(false)
      expect(result.error).toBe('Invalid Google API key format')
    })

    it('should return valid for successful API response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true })
      } as Response)

      const result = await validateGeminiKey('AIzaSyTest123')
      
      expect(result.isValid).toBe(true)
      expect(result.details?.service).toBe('Gemini API')
      expect(result.details?.model).toBe('gemini-1.5-flash-latest')
    })

    it('should return invalid for API error response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          error: { message: 'Invalid API key' }
        })
      } as Response)

      const result = await validateGeminiKey('AIzaSyTest123')
      
      expect(result.isValid).toBe(false)
      expect(result.error).toBe('Invalid API key')
    })

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const result = await validateGeminiKey('AIzaSyTest123')
      
      expect(result.isValid).toBe(false)
      expect(result.error).toBe('Network error')
    })

    it('should handle API response without error details', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({})
      } as Response)

      const result = await validateGeminiKey('AIzaSyTest123')
      
      expect(result.isValid).toBe(false)
      expect(result.error).toBe('API request failed: 500')
    })
  })

  describe('validateCustomSearchKey', () => {
    it('should return invalid for empty API key', async () => {
      const result = await validateCustomSearchKey('', 'test-engine-id')
      
      expect(result.isValid).toBe(false)
      expect(result.error).toBe('Custom Search API key is required')
    })

    it('should return invalid for empty search engine ID', async () => {
      const result = await validateCustomSearchKey('AIzaSyTest123', '')
      
      expect(result.isValid).toBe(false)
      expect(result.error).toBe('Search Engine ID is required')
    })

    it('should return invalid for key not starting with AIza', async () => {
      const result = await validateCustomSearchKey('invalid-key', 'test-engine-id')
      
      expect(result.isValid).toBe(false)
      expect(result.error).toBe('Invalid Google API key format')
    })

    it('should return valid for successful API response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          queries: {
            request: [{ totalResults: '1000' }]
          }
        })
      } as Response)

      const result = await validateCustomSearchKey('AIzaSyTest123', 'test-engine-id')
      
      expect(result.isValid).toBe(true)
      expect(result.details?.service).toBe('Custom Search API')
      expect(result.details?.quota).toBe(100)
    })

    it('should handle quota exceeded error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: async () => ({})
      } as Response)

      const result = await validateCustomSearchKey('AIzaSyTest123', 'test-engine-id')
      
      expect(result.isValid).toBe(false)
      expect(result.error).toBe('Daily quota exceeded. Try again tomorrow or add another API key.')
    })

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Connection failed'))

      const result = await validateCustomSearchKey('AIzaSyTest123', 'test-engine-id')
      
      expect(result.isValid).toBe(false)
      expect(result.error).toBe('Connection failed')
    })
  })

  describe('validateAllKeys', () => {
    it('should validate all keys and return overall result', async () => {
      // Mock successful responses for both APIs
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true })
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            queries: { request: [{ totalResults: '1000' }] }
          })
        } as Response)

      const result = await validateAllKeys('AIzaSyGemini123', 'AIzaSySearch123', 'engine-id')
      
      expect(result.overall).toBe(true)
      expect(result.gemini.isValid).toBe(true)
      expect(result.customSearch.isValid).toBe(true)
    })

    it('should return false overall when one key is invalid', async () => {
      // Mock one successful, one failed
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true })
        } as Response)
        .mockResolvedValueOnce({
          ok: false,
          status: 400,
          json: async () => ({ error: { message: 'Invalid key' } })
        } as Response)

      const result = await validateAllKeys('AIzaSyGemini123', 'AIzaSySearch123', 'engine-id')
      
      expect(result.overall).toBe(false)
      expect(result.gemini.isValid).toBe(true)
      expect(result.customSearch.isValid).toBe(false)
    })
  })

  describe('getApiKeyStrength', () => {
    it('should return weak for short keys', () => {
      expect(getApiKeyStrength('short')).toBe('weak')
      expect(getApiKeyStrength('AIzaSyTest')).toBe('weak')
    })

    it('should return medium for medium keys', () => {
      expect(getApiKeyStrength('AIzaSyTestKey12345678901234567890123')).toBe('medium')
    })

    it('should return strong for long keys', () => {
      expect(getApiKeyStrength('AIzaSyTestKey1234567890123456789012345678901234567890')).toBe('strong')
    })

    it('should handle empty string', () => {
      expect(getApiKeyStrength('')).toBe('weak')
    })
  })

  describe('estimateGeminiCost', () => {
    it('should calculate cost correctly for given tokens', () => {
      const tokens = 1000
      const cost = estimateGeminiCost(tokens)
      
      // Expected: (500 * 0.35 + 500 * 1.05) / 1,000,000 = 0.0007
      expect(cost).toBeCloseTo(0.0007, 6)
    })

    it('should handle zero tokens', () => {
      expect(estimateGeminiCost(0)).toBe(0)
    })

    it('should handle large numbers', () => {
      const tokens = 1_000_000
      const cost = estimateGeminiCost(tokens)
      expect(cost).toBeCloseTo(0.7, 2)
    })
  })

  describe('estimateSearchCost', () => {
    it('should return 0 for queries within free tier', () => {
      expect(estimateSearchCost(50)).toBe(0)
      expect(estimateSearchCost(100)).toBe(0)
    })

    it('should calculate cost for queries above free tier', () => {
      const queries = 1100 // 1000 paid queries
      const cost = estimateSearchCost(queries)
      
      // Expected: (1000 / 1000) * 5 = 5
      expect(cost).toBe(5)
    })

    it('should handle edge case at free tier limit', () => {
      expect(estimateSearchCost(101)).toBe(0.005) // 1 paid query
    })
  })
})