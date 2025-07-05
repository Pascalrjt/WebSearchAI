"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Search, Send, Settings, MessageSquare, BookOpen, Lightbulb, FileText, ExternalLink, Code, Heart, Scale } from "lucide-react"
import { SetupWizard } from "@/components/setup-wizard"
import { useApiKeys } from "@/lib/stores/api-keys"
import { SearchOrchestrator } from "@/lib/api/orchestrator"
import { SearchContext, SearchFocusMode } from "@/lib/types/api"
import { useToast } from "@/hooks/use-toast"  
import Link from "next/link"

interface Message {
  id: string
  type: "user" | "assistant"
  content: string
  sources?: Array<{
    title: string
    url: string
    snippet: string
  }>
  timestamp: Date
}

interface SearchFocus {
  id: string
  name: string
  icon: React.ReactNode
  description: string
}

export default function WebSearchAI() {
  const { hasKeys, keys } = useApiKeys()
  const { toast } = useToast()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [isSearching, setIsSearching] = useState(false)
  const [selectedFocus, setSelectedFocus] = useState("general")
  const [showSetup, setShowSetup] = useState(false)
  const [orchestrator, setOrchestrator] = useState<SearchOrchestrator | null>(null)

  useEffect(() => {
    // Check if we need to show setup wizard
    setShowSetup(!hasKeys)
  }, [hasKeys])

  useEffect(() => {
    // Initialize orchestrator when API keys are available
    if (hasKeys && keys?.geminiKey && keys?.customSearchKey && keys?.searchEngineId) {
      try {
        const newOrchestrator = new SearchOrchestrator({
          geminiApiKey: keys.geminiKey,
          customSearchApiKey: keys.customSearchKey,
          searchEngineId: keys.searchEngineId,
          maxSearchResults: 5
        })
        setOrchestrator(newOrchestrator)
      } catch (error) {
        console.error('Failed to initialize search orchestrator:', error)
        toast({
          title: "Configuration Error",
          description: "Failed to initialize search. Please check your API keys.",
          variant: "destructive"
        })
      }
    } else {
      setOrchestrator(null)
    }
  }, [hasKeys, keys, toast])

  const searchFocuses: SearchFocus[] = [
    {
      id: "general",
      name: "General",
      icon: <Search className="w-4 h-4" />,
      description: "Balanced search across all sources",
    },
    {
      id: "academic",
      name: "Academic",
      icon: <BookOpen className="w-4 h-4" />,
      description: "Focus on scholarly articles and research",
    },
    {
      id: "creative",
      name: "Creative",
      icon: <Lightbulb className="w-4 h-4" />,
      description: "Emphasize creative and artistic content",
    },
    {
      id: "news",
      name: "News",
      icon: <FileText className="w-4 h-4" />,
      description: "Latest news and current events",
    },
    {
      id: "technical",
      name: "Technical",
      icon: <Code className="w-4 h-4" />,
      description: "Documentation and technical resources",
    },
    {
      id: "medical",
      name: "Medical",
      icon: <Heart className="w-4 h-4" />,
      description: "Medical and health information",
    },
    {
      id: "legal",
      name: "Legal",
      icon: <Scale className="w-4 h-4" />,
      description: "Legal documents and regulations",
    },
  ]

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim()) return

    // Check if orchestrator is available
    if (!orchestrator) {
      toast({
        title: "Configuration Required",
        description: "Please configure your API keys in settings to start searching.",
        variant: "destructive"
      })
      return
    }

    const userQuery = input.trim()
    const userMessage: Message = {
      id: Date.now().toString(),
      type: "user",
      content: userQuery,
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, userMessage])
    setInput("")
    setIsSearching(true)

    try {
      // Create search context
      const searchContext: SearchContext = {
        query: userQuery,
        focusMode: selectedFocus as SearchFocusMode,
        language: 'en',
        region: 'US'
      }

      // Perform search using orchestrator
      const result = await orchestrator.search(searchContext)

      if (result.success && result.data) {
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          type: "assistant",
          content: result.data.answer,
          sources: result.data.sources.map(source => ({
            title: source.title,
            url: source.url,
            snippet: source.snippet
          })),
          timestamp: new Date(),
        }
        setMessages((prev) => [...prev, assistantMessage])
      } else {
        // Handle search failure
        const errorMessage: Message = {
          id: (Date.now() + 1).toString(),
          type: "assistant",
          content: `I apologize, but I encountered an error while searching for "${userQuery}". ${result.error?.message || 'Please try again or check your API configuration.'}`,
          timestamp: new Date(),
        }
        setMessages((prev) => [...prev, errorMessage])
        
        toast({
          title: "Search Error",
          description: result.error?.message || "Failed to perform search. Please try again.",
          variant: "destructive"
        })
      }
    } catch (error) {
      console.error('Search error:', error)
      
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: "assistant",  
        content: `I encountered an unexpected error while searching for "${userQuery}". Please try again or check your internet connection.`,
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, errorMessage])
      
      toast({
        title: "Unexpected Error",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive"
      })
    } finally {
      setIsSearching(false)
    }
  }

  // Show setup wizard if no API keys
  if (showSetup) {
    return (
      <SetupWizard 
        onComplete={() => setShowSetup(false)}
        onSkip={() => setShowSetup(false)}
      />
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-600 via-purple-500 to-pink-500 bg-[length:400%_400%] animate-gradient p-4">
      <div className="max-w-4xl mx-auto min-h-screen flex flex-col py-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 pt-4">
          <Card className="bg-gray-900/90 backdrop-blur-md border-gray-700/50 rounded-3xl px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
                <Search className="w-5 h-5 text-gray-800" />
              </div>
              <h1 className="text-2xl font-bold text-white">WebSearch AI</h1>
            </div>
          </Card>
          <Card className="bg-gray-900/90 backdrop-blur-md border-gray-700/50 rounded-3xl p-2">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                className="text-white hover:bg-white/30 hover:text-gray-100 hover:shadow-md transition-all duration-200 transform hover:scale-105"
              >
                <MessageSquare className="w-4 h-4 mr-2" />
                Conversations
              </Button>
              <Link href="/settings">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-white hover:bg-white/30 hover:text-gray-100 hover:shadow-md transition-all duration-200 transform hover:scale-105"
                >
                  <Settings className="w-4 h-4" />
                </Button>
              </Link>
            </div>
          </Card>
        </div>

        {/* Main Chat Interface */}
        <Card className="min-h-[200px] max-h-[80vh] bg-gray-900/90 backdrop-blur-md border-gray-700/50 flex flex-col rounded-3xl">
          {/* Search Focus Selector */}
          <div className="p-4 border-b border-gray-700">
            <div className="flex flex-wrap gap-2">
              {searchFocuses.map((focus) => (
                <Button
                  key={focus.id}
                  variant={selectedFocus === focus.id ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setSelectedFocus(focus.id)}
                  className={`transition-all duration-200 ${
                    selectedFocus === focus.id
                      ? "bg-white hover:bg-gray-100 text-gray-900 shadow-lg"
                      : "text-gray-300 hover:bg-gray-500/70 hover:text-white"
                  }`}
                >
                  {focus.icon}
                  <span className="ml-2">{focus.name}</span>
                </Button>
              ))}
            </div>
          </div>

          {/* Messages Area */}
          <div className="min-h-0 flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4">
                  <Search className="w-8 h-8 text-gray-800" />
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">Ask anything, get answers</h2>
                <p className="text-gray-400 max-w-md mx-auto">
                  WebSearch AI scours the web in real-time to provide you with comprehensive, cited answers to your
                  questions. Start a conversation below.
                </p>
              </div>
            ) : (
              messages.map((message) => (
                <div key={message.id} className={`flex ${message.type === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-3xl ${message.type === "user" ? "bg-white text-gray-900" : "bg-gray-800"} rounded-2xl p-4`}
                  >
                    <p className={`${message.type === "user" ? "text-gray-900" : "text-white"} mb-2`}>
                      {message.content}
                    </p>
                    {message.sources && (
                      <div className="mt-4 space-y-2">
                        <p className="text-sm text-gray-300 font-medium">Sources:</p>
                        {message.sources.map((source, index) => (
                          <div key={index} className="bg-gray-700 rounded-xl p-3">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <h4 className="text-sm font-medium text-white mb-1">{source.title}</h4>
                                <p className="text-xs text-gray-400 mb-2">{source.snippet}</p>
                                <a
                                  href={source.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-white hover:text-gray-100 hover:underline flex items-center gap-1 transition-all duration-200"
                                >
                                  {source.url}
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}

            {isSearching && (
              <div className="flex justify-start">
                <div className="bg-gray-800 rounded-2xl p-4 max-w-xs">
                  <div className="flex items-center gap-2">
                    <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></div>
                    <span className="text-gray-300 text-sm">Searching the web...</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Input Area */}
          <div className="p-4 border-t border-gray-700">
            <form onSubmit={handleSubmit} className="flex gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask me anything..."
                className="flex-1 bg-gray-800 border-gray-600 text-white placeholder-gray-400 focus:border-white transition-all duration-200"
                disabled={isSearching}
              />
              <Button
                type="submit"
                disabled={!input.trim() || isSearching}
                className={`
    bg-white text-gray-900 transition-all duration-200 transform
    hover:bg-gray-100 hover:shadow-lg hover:scale-105
    active:scale-95 active:shadow-md
    disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none disabled:shadow-none
    focus:outline-none focus:ring-2 focus:ring-white focus:ring-opacity-50
    ${isSearching ? "animate-pulse" : ""}
  `}
              >
                {isSearching ? (
                  <div className="animate-spin w-4 h-4 border-2 border-gray-900 border-t-transparent rounded-full"></div>
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </Button>
            </form>
            <div className="flex items-center justify-between mt-2">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="bg-gray-800 text-gray-300">
                  {searchFocuses.find((f) => f.id === selectedFocus)?.description}
                </Badge>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span>Press Enter to send</span>
              </div>
            </div>
          </div>
        </Card>

        {/* Footer */}
        <div className="text-center mt-4 text-white/70 text-sm">
          <p>WebSearch AI • Powered by real-time web search and AI synthesis</p>
        </div>
      </div>
    </div>
  )
}
