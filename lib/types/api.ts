// Gemini API Types
export interface GeminiGenerateRequest {
  contents: GeminiContent[]
  generationConfig?: GeminiGenerationConfig
  safetySettings?: GeminiSafetySettings[]
}

export interface GeminiContent {
  parts: GeminiPart[]
  role?: 'user' | 'model'
}

export interface GeminiPart {
  text: string
}

export interface GeminiGenerationConfig {
  temperature?: number
  topK?: number
  topP?: number
  maxOutputTokens?: number
  stopSequences?: string[]
}

export interface GeminiSafetySettings {
  category: string
  threshold: string
}

export interface GeminiResponse {
  candidates: GeminiCandidate[]
  usageMetadata?: GeminiUsageMetadata
}

export interface GeminiCandidate {
  content: GeminiContent
  finishReason?: string
  index?: number
  safetyRatings?: GeminiSafetyRating[]
}

export interface GeminiSafetyRating {
  category: string
  probability: string
}

export interface GeminiUsageMetadata {
  promptTokenCount: number
  candidatesTokenCount: number
  totalTokenCount: number
}

// Custom Search API Types
export interface CustomSearchRequest {
  q: string
  cx: string
  key: string
  num?: number
  start?: number
  lr?: string
  safe?: 'active' | 'off'
  filter?: '0' | '1'
  gl?: string
  hl?: string
  siteSearch?: string
  searchType?: 'image'
}

export interface CustomSearchResponse {
  kind: string
  url: CustomSearchUrl
  queries: CustomSearchQueries
  context: CustomSearchContext
  searchInformation: CustomSearchInformation
  items?: CustomSearchItem[]
}

export interface CustomSearchUrl {
  type: string
  template: string
}

export interface CustomSearchQueries {
  request: CustomSearchQuery[]
  nextPage?: CustomSearchQuery[]
}

export interface CustomSearchQuery {
  title: string
  totalResults: string
  searchTerms: string
  count: number
  startIndex: number
  inputEncoding: string
  outputEncoding: string
  safe: string
  cx: string
}

export interface CustomSearchContext {
  title: string
}

export interface CustomSearchInformation {
  searchTime: number
  formattedSearchTime: string
  totalResults: string
  formattedTotalResults: string
}

export interface CustomSearchItem {
  kind: string
  title: string
  htmlTitle: string
  link: string
  displayLink: string
  snippet: string
  htmlSnippet: string
  cacheId?: string
  formattedUrl: string
  htmlFormattedUrl: string
  pagemap?: {
    [key: string]: any[]
  }
}

// Common API Error Types
export interface ApiError {
  message: string
  code?: string | number
  status?: number
  details?: any
}

export interface ApiResponse<T> {
  data?: T
  error?: ApiError
  success: boolean
}

// Search Focus Mode Types
export type SearchFocusMode = 'general' | 'academic' | 'creative' | 'news' | 'technical' | 'medical' | 'legal'

export interface SearchContext {
  query: string
  focusMode: SearchFocusMode
  language?: string
  region?: string
  timeFilter?: string
}