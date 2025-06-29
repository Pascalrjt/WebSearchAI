'use client'

import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { useToast } from '@/hooks/use-toast'
import { useApiKeys } from '@/lib/stores/api-keys'
import { validateAllKeys } from '@/lib/utils/api-validation'
import { 
  ChevronRight, 
  ChevronLeft,
  Key, 
  CheckCircle, 
  ExternalLink,
  Loader2,
  Rocket,
  Shield,
  Search
} from 'lucide-react'

interface SetupWizardProps {
  onComplete: () => void
  onSkip?: () => void
}

const STEPS = [
  {
    id: 'welcome',
    title: 'Welcome to WebSearch AI',
    description: 'Let\'s get you set up with API keys'
  },
  {
    id: 'gemini',
    title: 'Google Gemini API',
    description: 'Configure your AI language model'
  },
  {
    id: 'search',
    title: 'Google Custom Search',
    description: 'Enable web search capabilities'
  },
  {
    id: 'complete',
    title: 'Setup Complete',
    description: 'You\'re ready to start searching!'
  }
]

export function SetupWizard({ onComplete, onSkip }: SetupWizardProps) {
  const { toast } = useToast()
  const { saveKeys, updateStatus } = useApiKeys()
  
  const [currentStep, setCurrentStep] = useState(0)
  const [isValidating, setIsValidating] = useState(false)
  const [formData, setFormData] = useState({
    geminiKey: '',
    customSearchKey: '',
    searchEngineId: ''
  })
  
  const [validation, setValidation] = useState({
    gemini: false,
    customSearch: false
  })

  const progress = ((currentStep + 1) / STEPS.length) * 100

  const handleNext = async () => {
    if (currentStep === 1) {
      // Validate Gemini key before proceeding
      if (!formData.geminiKey) {
        toast({
          title: "API Key Required",
          description: "Please enter your Google Gemini API key.",
          variant: "destructive"
        })
        return
      }
    }
    
    if (currentStep === 2) {
      // Validate Custom Search before proceeding
      if (!formData.customSearchKey || !formData.searchEngineId) {
        toast({
          title: "API Keys Required",
          description: "Please enter both your Custom Search API key and Search Engine ID.",
          variant: "destructive"
        })
        return
      }
    }

    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1)
    }
  }

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1)
    }
  }

  const handleValidateAndFinish = async () => {
    setIsValidating(true)
    
    try {
      const results = await validateAllKeys(
        formData.geminiKey,
        formData.customSearchKey,
        formData.searchEngineId
      )
      
      if (results.overall) {
        // Save keys
        const success = saveKeys({
          geminiKey: formData.geminiKey,
          customSearchKey: formData.customSearchKey,
          searchEngineId: formData.searchEngineId
        })
        
        if (success) {
          // Update status
          updateStatus({
            gemini: {
              isValid: true,
              isValidating: false,
              lastValidated: new Date()
            },
            customSearch: {
              isValid: true,
              isValidating: false,
              lastValidated: new Date()
            }
          })
          
          setValidation({ gemini: true, customSearch: true })
          toast({
            title: "Setup Complete!",
            description: "Your API keys have been validated and saved securely.",
          })
          
          setTimeout(() => {
            onComplete()
          }, 1500)
        } else {
          throw new Error('Failed to save keys')
        }
      } else {
        const errors = []
        if (!results.gemini.isValid) errors.push(`Gemini: ${results.gemini.error}`)
        if (!results.customSearch.isValid) errors.push(`Search: ${results.customSearch.error}`)
        
        toast({
          title: "Validation Failed",
          description: errors.join(' | '),
          variant: "destructive"
        })
      }
    } catch (error) {
      toast({
        title: "Setup Failed",
        description: "Failed to validate API keys. Please check your keys and try again.",
        variant: "destructive"
      })
    } finally {
      setIsValidating(false)
    }
  }

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const renderStepContent = () => {
    switch (currentStep) {
      case 0: // Welcome
        return (
          <div className="text-center space-y-6">
            <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mx-auto">
              <Rocket className="w-10 h-10 text-gray-800" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white mb-2">Welcome to WebSearch AI</h2>
              <p className="text-gray-300 max-w-md mx-auto">
                WebSearch AI uses your own Google API keys to provide AI-powered search with real-time web results. 
                Your keys are encrypted and stored securely on your device.
              </p>
            </div>
            <div className="grid gap-3 text-left max-w-sm mx-auto">
              <div className="flex items-center gap-3 text-gray-300">
                <Shield className="w-5 h-5 text-green-400" />
                <span>Your keys never leave your device</span>
              </div>
              <div className="flex items-center gap-3 text-gray-300">
                <Search className="w-5 h-5 text-blue-400" />
                <span>Real-time web search results</span>
              </div>
              <div className="flex items-center gap-3 text-gray-300">
                <Key className="w-5 h-5 text-purple-400" />
                <span>No subscription fees</span>
              </div>
            </div>
          </div>
        )

      case 1: // Gemini API
        return (
          <div className="space-y-6">
            <div className="text-center">
              <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4">
                <Key className="w-8 h-8 text-gray-800" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">Google Gemini API Key</h2>
              <p className="text-gray-300">
                This key enables AI-powered answer synthesis and conversation capabilities.
              </p>
            </div>
            
            <div className="space-y-4">
              <div>
                <Label htmlFor="gemini-key" className="text-white font-medium">
                  API Key
                </Label>
                <Input
                  id="gemini-key"
                  type="password"
                  value={formData.geminiKey}
                  onChange={(e) => handleInputChange('geminiKey', e.target.value)}
                  placeholder="AIza..."
                  className="bg-gray-800 border-gray-600 text-white placeholder-gray-400 mt-2"
                />
              </div>
              
              <div className="bg-gray-800/50 rounded-lg p-4">
                <h4 className="text-white font-medium mb-2">How to get your key:</h4>
                <ol className="text-sm text-gray-300 space-y-1 list-decimal list-inside">
                  <li>Visit Google AI Studio</li>
                  <li>Sign in with your Google account</li>
                  <li>Click "Get API key"</li>
                  <li>Copy the generated key</li>
                </ol>
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-blue-400 hover:underline mt-3"
                >
                  Open Google AI Studio
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            </div>
          </div>
        )

      case 2: // Custom Search API
        return (
          <div className="space-y-6">
            <div className="text-center">
              <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4">
                <Search className="w-8 h-8 text-gray-800" />
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">Google Custom Search</h2>
              <p className="text-gray-300">
                These credentials enable real-time web search capabilities.
              </p>
            </div>
            
            <div className="space-y-4">
              <div>
                <Label htmlFor="search-key" className="text-white font-medium">
                  Custom Search API Key
                </Label>
                <Input
                  id="search-key"
                  type="password"
                  value={formData.customSearchKey}
                  onChange={(e) => handleInputChange('customSearchKey', e.target.value)}
                  placeholder="AIza..."
                  className="bg-gray-800 border-gray-600 text-white placeholder-gray-400 mt-2"
                />
              </div>
              
              <div>
                <Label htmlFor="engine-id" className="text-white font-medium">
                  Search Engine ID
                </Label>
                <Input
                  id="engine-id"
                  value={formData.searchEngineId}
                  onChange={(e) => handleInputChange('searchEngineId', e.target.value)}
                  placeholder="a1b2c3d4e5f6g7h8i"
                  className="bg-gray-800 border-gray-600 text-white placeholder-gray-400 mt-2"
                />
              </div>
              
              <div className="bg-gray-800/50 rounded-lg p-4">
                <h4 className="text-white font-medium mb-2">Setup instructions:</h4>
                <ol className="text-sm text-gray-300 space-y-1 list-decimal list-inside">
                  <li>Create API key at Google Cloud Console</li>
                  <li>Create search engine at Programmable Search</li>
                  <li>Copy both credentials above</li>
                </ol>
                <div className="flex gap-4 mt-3">
                  <a
                    href="https://console.cloud.google.com/apis/credentials"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-blue-400 hover:underline text-sm"
                  >
                    API Key <ExternalLink className="w-3 h-3" />
                  </a>
                  <a
                    href="https://programmablesearchengine.google.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-blue-400 hover:underline text-sm"
                  >
                    Search Engine <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            </div>
          </div>
        )

      case 3: // Complete
        return (
          <div className="text-center space-y-6">
            <div className="w-20 h-20 bg-green-600 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle className="w-10 h-10 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white mb-2">Setup Complete!</h2>
              <p className="text-gray-300">
                Your API keys have been validated and saved securely. You can now start using WebSearch AI.
              </p>
            </div>
            
            {(validation.gemini && validation.customSearch) && (
              <div className="grid gap-2 max-w-sm mx-auto">
                <div className="flex items-center justify-between bg-gray-800/50 rounded-lg p-3">
                  <span className="text-gray-300">Gemini API</span>
                  <CheckCircle className="w-5 h-5 text-green-400" />
                </div>
                <div className="flex items-center justify-between bg-gray-800/50 rounded-lg p-3">
                  <span className="text-gray-300">Custom Search</span>
                  <CheckCircle className="w-5 h-5 text-green-400" />
                </div>
              </div>
            )}
          </div>
        )

      default:
        return null
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-600 via-purple-500 to-pink-500 bg-[length:400%_400%] animate-gradient p-4">
      <div className="max-w-2xl mx-auto min-h-screen flex items-center">
        <Card className="w-full bg-gray-900/90 backdrop-blur-md border-gray-700/50">
          <CardHeader>
            <div className="flex items-center justify-between mb-4">
              <div className="text-white">
                <CardTitle>Setup ({currentStep + 1}/{STEPS.length})</CardTitle>
                <CardDescription className="text-gray-400">
                  {STEPS[currentStep].title}
                </CardDescription>
              </div>
              {onSkip && currentStep === 0 && (
                <Button
                  variant="ghost"
                  onClick={onSkip}
                  className="text-gray-400 hover:text-white"
                >
                  Skip Setup
                </Button>
              )}
            </div>
            <Progress value={progress} className="h-2" />
          </CardHeader>
          
          <CardContent className="space-y-6">
            {renderStepContent()}
            
            <div className="flex justify-between pt-6">
              <Button
                variant="outline"
                onClick={handleBack}
                disabled={currentStep === 0}
                className="border-gray-600 text-white hover:bg-gray-800"
              >
                <ChevronLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
              
              {currentStep === STEPS.length - 1 ? (
                <Button
                  onClick={handleValidateAndFinish}
                  disabled={isValidating}
                  className="bg-white text-gray-900 hover:bg-gray-100"
                >
                  {isValidating ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Validating...
                    </>
                  ) : (
                    <>
                      Complete Setup
                      <CheckCircle className="w-4 h-4 ml-2" />
                    </>
                  )}
                </Button>
              ) : (
                <Button
                  onClick={handleNext}
                  className="bg-white text-gray-900 hover:bg-gray-100"
                >
                  Next
                  <ChevronRight className="w-4 h-4 ml-2" />
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}