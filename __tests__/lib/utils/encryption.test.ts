import { encryptApiKey, decryptApiKey, isValidEncryptedKey, secureWipe } from '@/lib/utils/encryption'

// Mock crypto-js
jest.mock('crypto-js', () => ({
  AES: {
    encrypt: jest.fn().mockImplementation((text, key) => ({
      toString: () => `encrypted_${text}`
    })),
    decrypt: jest.fn().mockImplementation((encrypted, key) => ({
      toString: jest.fn().mockImplementation((encoding) => {
        if (encrypted.startsWith('encrypted_')) {
          return encrypted.replace('encrypted_', '')
        }
        throw new Error('Invalid encrypted data')
      })
    }))
  },
  enc: {
    Utf8: 'utf8'
  }
}))

describe('Encryption Utilities', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('encryptApiKey', () => {
    it('should encrypt an API key successfully', () => {
      const apiKey = 'AIzaSyTest123'
      const result = encryptApiKey(apiKey)
      
      expect(result).toBe('encrypted_AIzaSyTest123')
    })

    it('should handle empty string', () => {
      const result = encryptApiKey('')
      expect(result).toBe('encrypted_')
    })

    it('should throw error when encryption fails', () => {
      const CryptoJS = require('crypto-js')
      CryptoJS.AES.encrypt.mockImplementationOnce(() => {
        throw new Error('Encryption error')
      })

      expect(() => encryptApiKey('test')).toThrow('Encryption failed')
    })
  })

  describe('decryptApiKey', () => {
    it('should decrypt an encrypted API key successfully', () => {
      const encryptedKey = 'encrypted_AIzaSyTest123'
      const result = decryptApiKey(encryptedKey)
      
      expect(result).toBe('AIzaSyTest123')
    })

    it('should handle empty encrypted string', () => {
      const result = decryptApiKey('encrypted_')
      expect(result).toBe('')
    })

    it('should throw error when decryption fails', () => {
      const CryptoJS = require('crypto-js')
      CryptoJS.AES.decrypt.mockImplementationOnce(() => {
        throw new Error('Decryption error')
      })

      expect(() => decryptApiKey('invalid')).toThrow('Decryption failed')
    })
  })

  describe('isValidEncryptedKey', () => {
    it('should return true for valid encrypted key', () => {
      const encryptedKey = 'encrypted_AIzaSyTest123'
      const result = isValidEncryptedKey(encryptedKey)
      
      expect(result).toBe(true)
    })

    it('should return false for empty encrypted key', () => {
      const encryptedKey = 'encrypted_'
      const result = isValidEncryptedKey(encryptedKey)
      
      expect(result).toBe(false)
    })

    it('should return false when decryption fails', () => {
      const result = isValidEncryptedKey('invalid_data')
      expect(result).toBe(false)
    })
  })

  describe('secureWipe', () => {
    it('should replace all characters with zeros', () => {
      const data = 'AIzaSyTest123'
      const result = secureWipe(data)
      
      expect(result).toBe('0000000000000')
      expect(result.length).toBe(data.length)
    })

    it('should handle empty string', () => {
      const result = secureWipe('')
      expect(result).toBe('')
    })

    it('should handle special characters', () => {
      const data = 'test@#$%'
      const result = secureWipe(data)
      expect(result).toBe('00000000')
    })
  })

  describe('Integration tests', () => {
    it('should encrypt and decrypt a key maintaining integrity', () => {
      const originalKey = 'AIzaSyTest123456789'
      const encrypted = encryptApiKey(originalKey)
      const decrypted = decryptApiKey(encrypted)
      
      expect(decrypted).toBe(originalKey)
    })

    it('should validate round-trip encryption', () => {
      const originalKey = 'AIzaSyTest123456789'
      const encrypted = encryptApiKey(originalKey)
      
      expect(isValidEncryptedKey(encrypted)).toBe(true)
    })
  })
})