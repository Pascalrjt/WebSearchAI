import { apiKeyStore } from '@/lib/stores/api-keys'
import { ApiKeyConfig, ApiKeyStatus, ApiKeyUsage } from '@/lib/types/api-keys'

// Mock React for the hook tests
jest.mock('react', () => ({
  useState: jest.fn(),
  useEffect: jest.fn(),
  useCallback: jest.fn()
}))

// Mock the encryption utilities
jest.mock('@/lib/utils/encryption', () => ({
  encryptApiKey: jest.fn((key) => `encrypted_${key}`),
  decryptApiKey: jest.fn((key) => key.replace('encrypted_', '')),
  isValidEncryptedKey: jest.fn(() => true)
}))

describe('ApiKeyStore', () => {
  let mockLocalStorage: { [key: string]: string }

  beforeEach(() => {
    // Reset localStorage mock
    mockLocalStorage = {}
    
    const localStorageMock = {
      getItem: jest.fn((key) => mockLocalStorage[key] || null),
      setItem: jest.fn((key, value) => {
        mockLocalStorage[key] = value
      }),
      removeItem: jest.fn((key) => {
        delete mockLocalStorage[key]
      }),
      clear: jest.fn(() => {
        mockLocalStorage = {}
      })
    }
    
    Object.defineProperty(global, 'localStorage', {
      value: localStorageMock,
      writable: true
    })
  })

  describe('getApiKeys', () => {
    it('should return null when no keys stored', () => {
      const result = apiKeyStore.getApiKeys()
      expect(result).toBeNull()
    })

    it('should return decrypted keys when stored', () => {
      mockLocalStorage['websearch-ai-keys'] = JSON.stringify({
        geminiKey: 'encrypted_AIzaSyGemini123',
        customSearchKey: 'encrypted_AIzaSySearch123',
        searchEngineId: 'engine-123'
      })

      const result = apiKeyStore.getApiKeys()
      
      expect(result).toEqual({
        geminiKey: 'AIzaSyGemini123',
        customSearchKey: 'AIzaSySearch123',
        searchEngineId: 'engine-123'
      })
    })

    it('should handle corrupted data gracefully', () => {
      mockLocalStorage['websearch-ai-keys'] = 'invalid-json'
      
      const result = apiKeyStore.getApiKeys()
      expect(result).toBeNull()
    })

    it('should return null in server environment', () => {
      // Mock window as undefined (server environment)
      const originalWindow = global.window
      delete (global as any).window

      const result = apiKeyStore.getApiKeys()
      expect(result).toBeNull()

      // Restore window
      global.window = originalWindow
    })
  })

  describe('saveApiKeys', () => {
    it('should save encrypted keys successfully', () => {
      const keys: ApiKeyConfig = {
        geminiKey: 'AIzaSyGemini123',
        customSearchKey: 'AIzaSySearch123',
        searchEngineId: 'engine-123'
      }

      const result = apiKeyStore.saveApiKeys(keys)
      
      expect(result).toBe(true)
      const stored = JSON.parse(mockLocalStorage['websearch-ai-keys'])
      expect(stored.geminiKey).toBe('encrypted_AIzaSyGemini123')
      expect(stored.customSearchKey).toBe('encrypted_AIzaSySearch123')
      expect(stored.searchEngineId).toBe('engine-123')
    })

    it('should handle empty keys', () => {
      const keys: ApiKeyConfig = {
        geminiKey: '',
        customSearchKey: '',
        searchEngineId: ''
      }

      const result = apiKeyStore.saveApiKeys(keys)
      
      expect(result).toBe(true)
      const stored = JSON.parse(mockLocalStorage['websearch-ai-keys'])
      expect(stored.geminiKey).toBe('')
      expect(stored.customSearchKey).toBe('')
      expect(stored.searchEngineId).toBe('')
    })

    it('should return false in server environment', () => {
      // Mock typeof window === 'undefined'
      Object.defineProperty(global, 'window', {
        value: undefined,
        writable: true
      })

      const keys: ApiKeyConfig = {
        geminiKey: 'test',
        customSearchKey: 'test',
        searchEngineId: 'test'
      }

      const result = apiKeyStore.saveApiKeys(keys)
      expect(result).toBe(false)

      // Restore window
      Object.defineProperty(global, 'window', {
        value: {},
        writable: true
      })
    })
  })

  describe('hasApiKeys', () => {
    it('should return false when no keys exist', () => {
      expect(apiKeyStore.hasApiKeys()).toBe(false)
    })

    it('should return false when keys are incomplete', () => {
      mockLocalStorage['websearch-ai-keys'] = JSON.stringify({
        geminiKey: 'encrypted_AIzaSyGemini123',
        customSearchKey: '',
        searchEngineId: 'engine-123'
      })

      expect(apiKeyStore.hasApiKeys()).toBe(false)
    })

    it('should return true when all keys exist', () => {
      mockLocalStorage['websearch-ai-keys'] = JSON.stringify({
        geminiKey: 'encrypted_AIzaSyGemini123',
        customSearchKey: 'encrypted_AIzaSySearch123',
        searchEngineId: 'engine-123'
      })

      expect(apiKeyStore.hasApiKeys()).toBe(true)
    })
  })

  describe('clearApiKeys', () => {
    it('should remove all stored data', () => {
      mockLocalStorage['websearch-ai-keys'] = 'test'
      mockLocalStorage['websearch-ai-usage'] = 'test'

      apiKeyStore.clearApiKeys()

      expect(mockLocalStorage['websearch-ai-keys']).toBeUndefined()
      expect(mockLocalStorage['websearch-ai-usage']).toBeUndefined()
    })

    it('should handle server environment gracefully', () => {
      const originalWindow = global.window
      delete (global as any).window

      expect(() => apiKeyStore.clearApiKeys()).not.toThrow()

      global.window = originalWindow
    })
  })

  describe('getStatus', () => {
    it('should return default status when none stored', () => {
      const result = apiKeyStore.getStatus()
      
      expect(result).toEqual({
        gemini: {
          isValid: false,
          isValidating: false
        },
        customSearch: {
          isValid: false,
          isValidating: false
        }
      })
    })

    it('should return stored status', () => {
      const status: ApiKeyStatus = {
        gemini: {
          isValid: true,
          isValidating: false,
          lastValidated: new Date('2024-01-01')
        },
        customSearch: {
          isValid: true,
          isValidating: false,
          lastValidated: new Date('2024-01-01')
        }
      }

      mockLocalStorage['websearch-ai-status'] = JSON.stringify(status)

      const result = apiKeyStore.getStatus()
      expect(result.gemini.isValid).toBe(true)
      expect(result.customSearch.isValid).toBe(true)
      expect(result.gemini.isValidating).toBe(false)
      expect(result.customSearch.isValidating).toBe(false)
    })

    it('should handle corrupted status data', () => {
      mockLocalStorage['websearch-ai-status'] = 'invalid-json'
      
      const result = apiKeyStore.getStatus()
      expect(result.gemini.isValid).toBe(false)
      expect(result.customSearch.isValid).toBe(false)
    })
  })

  describe('saveStatus', () => {
    it('should save status successfully', () => {
      const status: ApiKeyStatus = {
        gemini: {
          isValid: true,
          isValidating: false,
          lastValidated: new Date('2024-01-01')
        },
        customSearch: {
          isValid: false,
          isValidating: true
        }
      }

      apiKeyStore.saveStatus(status)
      
      expect(mockLocalStorage['websearch-ai-status']).toBe(JSON.stringify(status))
    })
  })

  describe('getUsage', () => {
    it('should return default usage when none stored', () => {
      const result = apiKeyStore.getUsage()
      
      expect(result.gemini.tokensUsed).toBe(0)
      expect(result.gemini.estimatedCost).toBe(0)
      expect(result.customSearch.queriesUsed).toBe(0)
      expect(result.customSearch.quotaRemaining).toBe(100)
      expect(result.customSearch.estimatedCost).toBe(0)
    })

    it('should return stored usage', () => {
      const usage: ApiKeyUsage = {
        gemini: {
          tokensUsed: 1000,
          estimatedCost: 0.05,
          lastReset: new Date('2024-01-01')
        },
        customSearch: {
          queriesUsed: 50,
          quotaRemaining: 50,
          estimatedCost: 0.25,
          lastReset: new Date('2024-01-01')
        }
      }

      mockLocalStorage['websearch-ai-usage'] = JSON.stringify(usage)

      const result = apiKeyStore.getUsage()
      expect(result.gemini.tokensUsed).toBe(1000)
      expect(result.gemini.estimatedCost).toBe(0.05)
      expect(result.customSearch.queriesUsed).toBe(50)
      expect(result.customSearch.quotaRemaining).toBe(50)
      expect(result.customSearch.estimatedCost).toBe(0.25)
    })
  })

  describe('updateUsage', () => {
    it('should update usage with partial data', () => {
      const initialUsage: ApiKeyUsage = {
        gemini: {
          tokensUsed: 500,
          estimatedCost: 0.025,
          lastReset: new Date('2024-01-01')
        },
        customSearch: {
          queriesUsed: 25,
          quotaRemaining: 75,
          estimatedCost: 0.125,
          lastReset: new Date('2024-01-01')
        }
      }

      mockLocalStorage['websearch-ai-usage'] = JSON.stringify(initialUsage)

      apiKeyStore.updateUsage({
        gemini: {
          tokensUsed: 1000,
          estimatedCost: 0.05,
          lastReset: new Date('2024-01-01')
        }
      })

      const stored = JSON.parse(mockLocalStorage['websearch-ai-usage'])
      expect(stored.gemini.tokensUsed).toBe(1000)
      expect(stored.customSearch.queriesUsed).toBe(25) // unchanged
    })
  })

  describe('subscribe', () => {
    it('should add and remove listeners', () => {
      const callback = jest.fn()
      
      const unsubscribe = apiKeyStore.subscribe(callback)
      expect(typeof unsubscribe).toBe('function')
      
      // Test notification
      apiKeyStore.saveApiKeys({
        geminiKey: 'test',
        customSearchKey: 'test',
        searchEngineId: 'test'
      })
      
      expect(callback).toHaveBeenCalled()
      
      // Test unsubscribe
      callback.mockClear()
      unsubscribe()
      
      apiKeyStore.saveApiKeys({
        geminiKey: 'test2',
        customSearchKey: 'test2',
        searchEngineId: 'test2'
      })
      
      expect(callback).not.toHaveBeenCalled()
    })
  })
})