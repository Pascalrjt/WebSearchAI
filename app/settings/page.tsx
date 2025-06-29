'use client'

import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { useToast } from '@/hooks/use-toast'
import { useApiKeys } from '@/lib/stores/api-keys'
import { validateAllKeys } from '@/lib/utils/api-validation'
import { 
  Settings, 
  Key, 
  Eye, 
  EyeOff, 
  CheckCircle, 
  XCircle, 
  Loader2,
  ExternalLink,
  ArrowLeft,
  Shield,
  DollarSign
} from 'lucide-react'
import Link from 'next/link'

export default function SettingsPage() {
  const { toast } = useToast()
  const { keys, status, usage, hasKeys, saveKeys, clearKeys, updateStatus } = useApiKeys()
  
  const [formData, setFormData] = useState({
    geminiKey: keys?.geminiKey || '',
    customSearchKey: keys?.customSearchKey || '',
    searchEngineId: keys?.searchEngineId || ''
  })
  
  const [showKeys, setShowKeys] = useState({
    gemini: false,
    customSearch: false
  })
  
  const [isValidating, setIsValidating] = useState(false)

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleSave = async () => {
    if (!formData.geminiKey || !formData.customSearchKey || !formData.searchEngineId) {
      toast({
        title: "Missing Required Fields",
        description: "Please fill in all API key fields.",
        variant: "destructive"
      })
      return
    }

    const success = saveKeys({
      geminiKey: formData.geminiKey,
      customSearchKey: formData.customSearchKey,
      searchEngineId: formData.searchEngineId
    })

    if (success) {
      toast({
        title: "API Keys Saved",
        description: "Your API keys have been encrypted and stored securely.",
      })
    } else {
      toast({
        title: "Save Failed",
        description: "Failed to save API keys. Please try again.",
        variant: "destructive"
      })
    }
  }

  const handleValidate = async () => {
    if (!formData.geminiKey || !formData.customSearchKey || !formData.searchEngineId) {
      toast({
        title: "Missing Keys",
        description: "Please fill in all API key fields before validating.",
        variant: "destructive"
      })
      return
    }

    setIsValidating(true)
    
    try {
      const results = await validateAllKeys(
        formData.geminiKey,
        formData.customSearchKey,
        formData.searchEngineId
      )
      
      const newStatus = {
        gemini: {
          isValid: results.gemini.isValid,
          isValidating: false,
          error: results.gemini.error,
          lastValidated: new Date()
        },
        customSearch: {
          isValid: results.customSearch.isValid,
          isValidating: false,
          error: results.customSearch.error,
          lastValidated: new Date()
        }
      }
      
      updateStatus(newStatus)
      
      if (results.overall) {
        toast({
          title: "Keys Validated Successfully",
          description: "All API keys are working correctly.",
        })
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
        title: "Validation Error",
        description: "Failed to validate API keys. Please check your internet connection.",
        variant: "destructive"
      })
    } finally {
      setIsValidating(false)
    }
  }

  const handleClear = () => {
    clearKeys()
    setFormData({
      geminiKey: '',
      customSearchKey: '',
      searchEngineId: ''
    })
    
    toast({
      title: "Keys Cleared",
      description: "All API keys have been removed from local storage.",
    })
  }

  const maskKey = (key: string) => {
    if (!key) return ''
    return key.substring(0, 8) + '•'.repeat(Math.max(0, key.length - 12)) + key.substring(key.length - 4)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-600 via-purple-500 to-pink-500 bg-[length:400%_400%] animate-gradient p-4">
      <div className="max-w-4xl mx-auto py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link href="/">
            <Button variant="ghost" size="sm" className="text-white hover:bg-white/20">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Search
            </Button>
          </Link>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center">
              <Settings className="w-6 h-6 text-gray-800" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white">Settings</h1>
              <p className="text-white/80">Manage your API keys and preferences</p>
            </div>
          </div>
        </div>

        <div className="grid gap-6">
          {/* API Keys Section */}
          <Card className="bg-gray-900/90 backdrop-blur-md border-gray-700/50">
            <CardHeader>
              <div className="flex items-center gap-3">
                <Key className="w-5 h-5 text-white" />
                <div>
                  <CardTitle className="text-white">API Keys</CardTitle>
                  <CardDescription className="text-gray-400">
                    Configure your Google API keys to enable WebSearch AI functionality
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Google Gemini API Key */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="gemini-key" className="text-white font-medium">
                    Google Gemini API Key
                  </Label>
                  <div className="flex items-center gap-2">
                    {status.gemini.isValid && (
                      <Badge variant="default" className="bg-green-600 text-white">
                        <CheckCircle className="w-3 h-3 mr-1" />
                        Valid
                      </Badge>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowKeys(prev => ({ ...prev, gemini: !prev.gemini }))}
                      className="text-gray-400 hover:text-white"
                    >
                      {showKeys.gemini ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>
                <Input
                  id="gemini-key"
                  type={showKeys.gemini ? "text" : "password"}
                  value={formData.geminiKey}
                  onChange={(e) => handleInputChange('geminiKey', e.target.value)}
                  placeholder="AIza..."
                  className="bg-gray-800 border-gray-600 text-white placeholder-gray-400"
                />
                <p className="text-xs text-gray-400">
                  Get your key from{' '}
                  <a
                    href="https://aistudio.google.com/app/apikey"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:underline inline-flex items-center gap-1"
                  >
                    Google AI Studio
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </p>
              </div>

              <Separator className="bg-gray-700" />

              {/* Google Custom Search API Key */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="search-key" className="text-white font-medium">
                    Google Custom Search API Key
                  </Label>
                  <div className="flex items-center gap-2">
                    {status.customSearch.isValid && (
                      <Badge variant="default" className="bg-green-600 text-white">
                        <CheckCircle className="w-3 h-3 mr-1" />
                        Valid
                      </Badge>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowKeys(prev => ({ ...prev, customSearch: !prev.customSearch }))}
                      className="text-gray-400 hover:text-white"
                    >
                      {showKeys.customSearch ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>
                <Input
                  id="search-key"
                  type={showKeys.customSearch ? "text" : "password"}
                  value={formData.customSearchKey}
                  onChange={(e) => handleInputChange('customSearchKey', e.target.value)}
                  placeholder="AIza..."
                  className="bg-gray-800 border-gray-600 text-white placeholder-gray-400"
                />
                <p className="text-xs text-gray-400">
                  Create at{' '}
                  <a
                    href="https://console.cloud.google.com/apis/credentials"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:underline inline-flex items-center gap-1"
                  >
                    Google Cloud Console
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </p>
              </div>

              <Separator className="bg-gray-700" />

              {/* Search Engine ID */}
              <div className="space-y-2">
                <Label htmlFor="engine-id" className="text-white font-medium">
                  Search Engine ID
                </Label>
                <Input
                  id="engine-id"
                  value={formData.searchEngineId}
                  onChange={(e) => handleInputChange('searchEngineId', e.target.value)}
                  placeholder="a1b2c3d4e5f6g7h8i"
                  className="bg-gray-800 border-gray-600 text-white placeholder-gray-400"
                />
                <p className="text-xs text-gray-400">
                  Get from{' '}
                  <a
                    href="https://programmablesearchengine.google.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:underline inline-flex items-center gap-1"
                  >
                    Programmable Search Engine
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-4">
                <Button
                  onClick={handleSave}
                  className="bg-white text-gray-900 hover:bg-gray-100"
                >
                  <Shield className="w-4 h-4 mr-2" />
                  Save Keys
                </Button>
                <Button
                  onClick={handleValidate}
                  disabled={!hasKeys || isValidating}
                  variant="outline"
                  className="border-gray-600 text-white hover:bg-gray-800"
                >
                  {isValidating ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <CheckCircle className="w-4 h-4 mr-2" />
                  )}
                  Validate Keys
                </Button>
                <Button
                  onClick={handleClear}
                  variant="outline"
                  className="border-red-600 text-red-400 hover:bg-red-600/20"
                >
                  Clear All
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Usage Statistics */}
          {hasKeys && (
            <Card className="bg-gray-900/90 backdrop-blur-md border-gray-700/50">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <DollarSign className="w-5 h-5 text-white" />
                  <div>
                    <CardTitle className="text-white">Usage & Costs</CardTitle>
                    <CardDescription className="text-gray-400">
                      Track your API usage and estimated costs
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <h4 className="text-white font-medium">Google Gemini</h4>
                    <div className="text-2xl font-bold text-white">
                      {usage.gemini.tokensUsed.toLocaleString()} tokens
                    </div>
                    <p className="text-sm text-gray-400">
                      Est. cost: ${usage.gemini.estimatedCost.toFixed(4)}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <h4 className="text-white font-medium">Custom Search</h4>
                    <div className="text-2xl font-bold text-white">
                      {usage.customSearch.queriesUsed} / 100 queries
                    </div>
                    <p className="text-sm text-gray-400">
                      Est. cost: ${usage.customSearch.estimatedCost.toFixed(2)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}