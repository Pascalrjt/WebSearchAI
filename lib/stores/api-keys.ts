'use client'

import { ApiKeyConfig, ApiKeyStatus, ApiKeyUsage, ApiKeySettings } from '@/lib/types/api-keys'
import { encryptApiKey, decryptApiKey, isValidEncryptedKey } from '@/lib/utils/encryption'

const STORAGE_KEY = 'websearch-ai-keys'
const USAGE_KEY = 'websearch-ai-usage'
const SETTINGS_KEY = 'websearch-ai-settings'

class ApiKeyStore {
  private listeners: Set<() => void> = new Set()

  // Get current API keys (decrypted)
  getApiKeys(): ApiKeyConfig | null {
    if (typeof window === 'undefined') return null
    
    try {
      const encrypted = localStorage.getItem(STORAGE_KEY)
      if (!encrypted) return null

      const parsed = JSON.parse(encrypted)
      return {
        geminiKey: parsed.geminiKey ? decryptApiKey(parsed.geminiKey) : '',
        searchEngineId: parsed.searchEngineId || '',
        customSearchKey: parsed.customSearchKey ? decryptApiKey(parsed.customSearchKey) : ''
      }
    } catch (error) {
      console.error('Failed to get API keys:', error)
      return null
    }
  }

  // Save API keys (encrypted)
  saveApiKeys(keys: ApiKeyConfig): boolean {
    if (typeof window === 'undefined') return false

    try {
      const encrypted = {
        geminiKey: keys.geminiKey ? encryptApiKey(keys.geminiKey) : '',
        searchEngineId: keys.searchEngineId || '',
        customSearchKey: keys.customSearchKey ? encryptApiKey(keys.customSearchKey) : ''
      }

      localStorage.setItem(STORAGE_KEY, JSON.stringify(encrypted))
      this.notifyListeners()
      return true
    } catch (error) {
      console.error('Failed to save API keys:', error)
      return false
    }
  }

  // Check if keys exist
  hasApiKeys(): boolean {
    const keys = this.getApiKeys()
    return !!(keys?.geminiKey && keys?.customSearchKey && keys?.searchEngineId)
  }

  // Clear all keys
  clearApiKeys(): void {
    if (typeof window === 'undefined') return

    localStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(USAGE_KEY)
    this.notifyListeners()
  }

  // Get API key status
  getStatus(): ApiKeyStatus {
    if (typeof window === 'undefined') {
      return this.getDefaultStatus()
    }

    try {
      const stored = localStorage.getItem('websearch-ai-status')
      if (stored) {
        return JSON.parse(stored)
      }
    } catch (error) {
      console.error('Failed to get status:', error)
    }

    return this.getDefaultStatus()
  }

  // Save API key status
  saveStatus(status: ApiKeyStatus): void {
    if (typeof window === 'undefined') return

    try {
      localStorage.setItem('websearch-ai-status', JSON.stringify(status))
      this.notifyListeners()
    } catch (error) {
      console.error('Failed to save status:', error)
    }
  }

  // Get usage statistics
  getUsage(): ApiKeyUsage {
    if (typeof window === 'undefined') {
      return this.getDefaultUsage()
    }

    try {
      const stored = localStorage.getItem(USAGE_KEY)
      if (stored) {
        return JSON.parse(stored)
      }
    } catch (error) {
      console.error('Failed to get usage:', error)
    }

    return this.getDefaultUsage()
  }

  // Update usage statistics
  updateUsage(updates: Partial<ApiKeyUsage>): void {
    if (typeof window === 'undefined') return

    const current = this.getUsage()
    const updated = { ...current, ...updates }

    try {
      localStorage.setItem(USAGE_KEY, JSON.stringify(updated))
      this.notifyListeners()
    } catch (error) {
      console.error('Failed to update usage:', error)
    }
  }

  // Subscribe to changes
  subscribe(callback: () => void): () => void {
    this.listeners.add(callback)
    return () => this.listeners.delete(callback)
  }

  private notifyListeners(): void {
    this.listeners.forEach(callback => callback())
  }

  private getDefaultStatus(): ApiKeyStatus {
    return {
      gemini: {
        isValid: false,
        isValidating: false
      },
      customSearch: {
        isValid: false,
        isValidating: false
      }
    }
  }

  private getDefaultUsage(): ApiKeyUsage {
    const now = new Date()
    return {
      gemini: {
        tokensUsed: 0,
        estimatedCost: 0,
        lastReset: now
      },
      customSearch: {
        queriesUsed: 0,
        quotaRemaining: 100, // Free tier daily quota
        estimatedCost: 0,
        lastReset: now
      }
    }
  }
}

export const apiKeyStore = new ApiKeyStore()

// React hook for using API keys
export function useApiKeys() {
  const [keys, setKeys] = React.useState<ApiKeyConfig | null>(null)
  const [status, setStatus] = React.useState<ApiKeyStatus>(apiKeyStore.getStatus())
  const [usage, setUsage] = React.useState<ApiKeyUsage>(apiKeyStore.getUsage())

  React.useEffect(() => {
    // Initial load
    setKeys(apiKeyStore.getApiKeys())
    setStatus(apiKeyStore.getStatus())
    setUsage(apiKeyStore.getUsage())

    // Subscribe to changes
    const unsubscribe = apiKeyStore.subscribe(() => {
      setKeys(apiKeyStore.getApiKeys())
      setStatus(apiKeyStore.getStatus())
      setUsage(apiKeyStore.getUsage())
    })

    return unsubscribe
  }, [])

  const saveKeys = React.useCallback((newKeys: ApiKeyConfig) => {
    return apiKeyStore.saveApiKeys(newKeys)
  }, [])

  const clearKeys = React.useCallback(() => {
    apiKeyStore.clearApiKeys()
  }, [])

  const updateStatus = React.useCallback((newStatus: ApiKeyStatus) => {
    apiKeyStore.saveStatus(newStatus)
  }, [])

  const updateUsage = React.useCallback((updates: Partial<ApiKeyUsage>) => {
    apiKeyStore.updateUsage(updates)
  }, [])

  return {
    keys,
    status,
    usage,
    hasKeys: apiKeyStore.hasApiKeys(),
    saveKeys,
    clearKeys,
    updateStatus,
    updateUsage
  }
}

// Fix import issue
import React from 'react'