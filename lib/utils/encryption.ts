import CryptoJS from 'crypto-js'

const ENCRYPTION_KEY = 'websearch-ai-2024'

export function encryptApiKey(apiKey: string): string {
  try {
    return CryptoJS.AES.encrypt(apiKey, ENCRYPTION_KEY).toString()
  } catch (error) {
    console.error('Failed to encrypt API key:', error)
    throw new Error('Encryption failed')
  }
}

export function decryptApiKey(encryptedKey: string): string {
  try {
    const bytes = CryptoJS.AES.decrypt(encryptedKey, ENCRYPTION_KEY)
    return bytes.toString(CryptoJS.enc.Utf8)
  } catch (error) {
    console.error('Failed to decrypt API key:', error)
    throw new Error('Decryption failed')
  }
}

export function isValidEncryptedKey(encryptedKey: string): boolean {
  try {
    const decrypted = decryptApiKey(encryptedKey)
    return decrypted.length > 0
  } catch {
    return false
  }
}

export function secureWipe(data: string): string {
  return data.replace(/./g, '0')
}