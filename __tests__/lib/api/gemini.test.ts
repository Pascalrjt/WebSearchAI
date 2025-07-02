import { GeminiClient, GeminiApiError } from '@/lib/api/gemini'
import { GeminiResponse, SearchContext } from '@/lib/types/api'

// Mock fetch globally
global.fetch = jest.fn()

describe('GeminiClient', () => {
  let client: GeminiClient
  const mockApiKey = 'test-api-key'

  beforeEach(() => {
    client = new GeminiClient({ apiKey: mockApiKey })
    jest.clearAllMocks()
  })

  describe('constructor', () => {
    it('should initialize with default values', () => {
      const defaultClient = new GeminiClient({ apiKey: mockApiKey })
      expect(defaultClient).toBeInstanceOf(GeminiClient)
    })

    it('should accept custom model and baseUrl', () => {
      const customClient = new GeminiClient({
        apiKey: mockApiKey,
        model: 'gemini-pro',
        baseUrl: 'https://custom.api.com'
      })
      expect(customClient).toBeInstanceOf(GeminiClient)
    })
  })

  describe('generateContent', () => {
    const mockResponse: GeminiResponse = {
      candidates: [
        {
          content: {
            parts: [{ text: 'Test response' }],
            role: 'model'
          },
          finishReason: 'STOP'
        }
      ],
      usageMetadata: {
        promptTokenCount: 10,
        candidatesTokenCount: 5,
        totalTokenCount: 15
      }
    }

    it('should generate content successfully', async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      })

      const result = await client.generateContent('Test prompt')

      expect(result.success).toBe(true)
      expect(result.data).toEqual(mockResponse)
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('generateContent'),
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.stringContaining('Test prompt')
        })
      )
    })

    it('should handle API errors', async () => {
      const errorResponse = {
        error: {
          message: 'Invalid API key',
          code: 'INVALID_API_KEY'
        }
      }

      ;(fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: () => Promise.resolve(errorResponse)
      })

      const result = await client.generateContent('Test prompt')

      expect(result.success).toBe(false)
      expect(result.error).toEqual({
        message: 'Invalid API key',
        code: 'INVALID_API_KEY',
        status: 401,
        details: errorResponse
      })
    })

    it('should handle network errors', async () => {
      (fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'))

      const result = await client.generateContent('Test prompt')

      expect(result.success).toBe(false)
      expect(result.error?.message).toBe('Network error')
      expect(result.error?.code).toBe('UNKNOWN_ERROR')
    })

    it('should use custom generation config', async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      })

      const customConfig = {
        temperature: 0.5,
        maxOutputTokens: 1000
      }

      await client.generateContent('Test prompt', customConfig)

      const callArgs = (fetch as jest.Mock).mock.calls[0]
      const requestBody = JSON.parse(callArgs[1].body)

      expect(requestBody.generationConfig.temperature).toBe(0.5)
      expect(requestBody.generationConfig.maxOutputTokens).toBe(1000)
    })
  })

  describe('generateSearchAnswer', () => {
    const mockContext: SearchContext = {
      query: 'What is AI?',
      focusMode: 'general'
    }

    const mockSearchResults = [
      'AI is artificial intelligence...',
      'Machine learning is a subset of AI...'
    ]

    it('should generate search answer successfully', async () => {
      const mockResponse: GeminiResponse = {
        candidates: [
          {
            content: {
              parts: [{ text: 'AI stands for Artificial Intelligence...' }],
              role: 'model'
            }
          }
        ]
      }

      ;(fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      })

      const result = await client.generateSearchAnswer(mockContext, mockSearchResults)

      expect(result.success).toBe(true)
      expect(result.data).toBe('AI stands for Artificial Intelligence...')
    })

    it('should handle empty response', async () => {
      const mockResponse: GeminiResponse = {
        candidates: []
      }

      ;(fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      })

      const result = await client.generateSearchAnswer(mockContext, mockSearchResults)

      expect(result.success).toBe(false)
      expect(result.error?.code).toBe('NO_CONTENT')
    })

    it('should use academic focus mode instructions', async () => {
      const academicContext: SearchContext = {
        query: 'Research on AI',
        focusMode: 'academic'
      }

      const mockResponse: GeminiResponse = {
        candidates: [
          {
            content: {
              parts: [{ text: 'Academic response about AI research...' }],
              role: 'model'
            }
          }
        ]
      }

      ;(fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      })

      await client.generateSearchAnswer(academicContext, mockSearchResults)

      const callArgs = (fetch as jest.Mock).mock.calls[0]
      const requestBody = JSON.parse(callArgs[1].body)
      const prompt = requestBody.contents[0].parts[0].text

      expect(prompt).toContain('scholarly accuracy')
      expect(prompt).toContain('academic language')
    })
  })

  describe('streamContent', () => {
    it('should handle streaming response', async () => {
      const mockReader = {
        read: jest.fn()
          .mockResolvedValueOnce({
            done: false,
            value: new TextEncoder().encode('data: {"candidates":[{"content":{"parts":[{"text":"Hello"}]}}]}\n')
          })
          .mockResolvedValueOnce({
            done: false,
            value: new TextEncoder().encode('data: {"candidates":[{"content":{"parts":[{"text":" World"}]}}]}\n')
          })
          .mockResolvedValueOnce({
            done: true,
            value: undefined
          }),
        releaseLock: jest.fn()
      }

      const mockResponse = {
        ok: true,
        body: {
          getReader: () => mockReader
        }
      }

      ;(fetch as jest.Mock).mockResolvedValueOnce(mockResponse)

      const results: string[] = []
      for await (const chunk of client.streamContent('Test prompt')) {
        results.push(chunk)
      }

      expect(results).toEqual(['Hello', ' World'])
      expect(mockReader.releaseLock).toHaveBeenCalled()
    })

    it('should handle streaming errors', async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: () => Promise.resolve({ error: { message: 'Bad request' } })
      })

      const generator = client.streamContent('Test prompt')

      await expect(async () => {
        for await (const chunk of generator) {
          // Should not reach here
        }
      }).rejects.toThrow(GeminiApiError)
    })
  })

  describe('validateApiKey', () => {
    it('should validate API key successfully', async () => {
      const mockResponse: GeminiResponse = {
        candidates: [
          {
            content: {
              parts: [{ text: 'Test' }],
              role: 'model'
            }
          }
        ]
      }

      ;(fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      })

      const result = await client.validateApiKey()

      expect(result.success).toBe(true)
      expect(result.data).toBe(true)
    })

    it('should handle validation failure', async () => {
      (fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: () => Promise.resolve({
          error: {
            message: 'Invalid API key',
            code: 'INVALID_API_KEY'
          }
        })
      })

      const result = await client.validateApiKey()

      expect(result.success).toBe(false)
      expect(result.error?.code).toBe('INVALID_API_KEY')
    })
  })

  describe('getUsageFromResponse', () => {
    it('should extract usage metadata', () => {
      const response: GeminiResponse = {
        candidates: [],
        usageMetadata: {
          promptTokenCount: 100,
          candidatesTokenCount: 50,
          totalTokenCount: 150
        }
      }

      const usage = client.getUsageFromResponse(response)

      expect(usage).toEqual({
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150
      })
    })

    it('should handle missing usage metadata', () => {
      const response: GeminiResponse = {
        candidates: []
      }

      const usage = client.getUsageFromResponse(response)

      expect(usage).toEqual({
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0
      })
    })
  })

  describe('estimateCost', () => {
    it('should calculate cost correctly', () => {
      const cost = client.estimateCost(1000, 500)
      
      // Expected: (1000/1000 * 0.00015) + (500/1000 * 0.0006) = 0.00015 + 0.0003 = 0.00045
      expect(cost).toBeCloseTo(0.00045, 6)
    })

    it('should handle zero tokens', () => {
      const cost = client.estimateCost(0, 0)
      expect(cost).toBe(0)
    })
  })

  describe('GeminiApiError', () => {
    it('should create error with all properties', () => {
      const error = new GeminiApiError('Test error', 'TEST_CODE', 400, { detail: 'test' })

      expect(error.message).toBe('Test error')
      expect(error.name).toBe('GeminiApiError')
      expect(error.code).toBe('TEST_CODE')
      expect(error.status).toBe(400)
      expect(error.details).toEqual({ detail: 'test' })
    })

    it('should create error with minimal properties', () => {
      const error = new GeminiApiError('Test error')

      expect(error.message).toBe('Test error')
      expect(error.name).toBe('GeminiApiError')
      expect(error.code).toBeUndefined()
      expect(error.status).toBeUndefined()
      expect(error.details).toBeUndefined()
    })
  })
})