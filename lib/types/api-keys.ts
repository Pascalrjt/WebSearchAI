export interface ApiKeyConfig {
  geminiKey: string
  searchEngineId: string
  customSearchKey: string
}

export interface ApiKeyStatus {
  gemini: {
    isValid: boolean
    isValidating: boolean
    error?: string
    lastValidated?: Date
  }
  customSearch: {
    isValid: boolean
    isValidating: boolean
    error?: string
    lastValidated?: Date
  }
}

export interface ApiKeyUsage {
  gemini: {
    tokensUsed: number
    estimatedCost: number
    lastReset: Date
  }
  customSearch: {
    queriesUsed: number
    quotaRemaining: number
    estimatedCost: number
    lastReset: Date
  }
}

export interface ApiKeySettings {
  keys: ApiKeyConfig
  status: ApiKeyStatus
  usage: ApiKeyUsage
  preferences: {
    showUsageWarnings: boolean
    autoValidateKeys: boolean
    trackUsage: boolean
  }
}