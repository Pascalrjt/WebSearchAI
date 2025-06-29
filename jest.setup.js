import '@testing-library/jest-dom'

// Mock crypto-js for testing
jest.mock('crypto-js', () => ({
  AES: {
    encrypt: jest.fn().mockImplementation((text) => ({
      toString: () => `encrypted_${text}`
    })),
    decrypt: jest.fn().mockImplementation((encrypted) => ({
      toString: () => encrypted.replace('encrypted_', '')
    }))
  }
}))

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
}

global.localStorage = localStorageMock

// Mock fetch globally
global.fetch = jest.fn()

// Mock console.error to avoid noise in test output for expected errors
const originalError = console.error
beforeAll(() => {
  console.error = (...args) => {
    if (
      typeof args[0] === 'string' &&
      args[0].includes('Warning: ReactDOM.render is no longer supported')
    ) {
      return
    }
    originalError.call(console, ...args)
  }
})

afterAll(() => {
  console.error = originalError
})