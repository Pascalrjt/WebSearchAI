# WebSearch AI 🔍

> Change the ways you discover and interact with information online

WebSearch AI is an AI-powered conversational search engine that provides direct, synthesized answers with citations instead of traditional link lists. Built with Next.js 15 and powered by Google Gemini, it creates a research assistant experience that makes information discovery more efficient and transparent.

## ✨ Key Features

- **🤖 Direct AI Answers**: Get comprehensive, synthesized responses instead of sifting through link lists
- **📚 Real-time Web Search**: Scours the web in real-time with proper source citations
- **🎯 Specialized Search Modes**: Academic, News, Creative, Technical, Medical, and Legal focus modes
- **💬 Conversational Threads**: Persistent conversations for deep, multi-faceted research
- **🔐 Bring Your Own API Key**: Complete control over your API usage and costs
- **📖 Citation Management**: Export citations in APA, MLA, and Chicago formats
- **🌐 Mobile-First Design**: Responsive interface optimized for research on-the-go

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ or pnpm
- Google Gemini API key ([Get one here](https://aistudio.google.com/app/apikey))
- Google Custom Search API key and Search Engine ID ([Setup guide](https://developers.google.com/custom-search/v1/introduction))

### Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/Pascalrjt/WebSearchAI.git
   cd websearch-ai
   ```

2. **Install dependencies**

   ```bash
   pnpm install
   # or
   npm install
   ```

3. **Start the development server**

   ```bash
   pnpm dev
   # or
   npm run dev
   ```

4. **Open your browser**
   Navigate to [http://localhost:3000](http://localhost:3000)

### API Key Setup

WebSearch AI uses a "Bring Your Own API Key" (BYOK) model for transparency and cost control:

#### 1. Google Gemini API Key

1. Visit [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Create a new API key
3. Copy the key

#### 2. Google Custom Search Setup

1. Go to [Programmable Search Engine](https://programmablesearchengine.google.com)
2. Click "Add" to create a new search engine
3. Choose "Search the entire web" for general use
4. Note your Search Engine ID (cx parameter)
5. Get your API key from [Google Cloud Console](https://console.cloud.google.com/apis/credentials)

#### 3. Configure in WebSearch AI

1. On first launch, you'll see the setup wizard
2. Enter your Gemini API key
3. Enter your Custom Search API key and Engine ID
4. Test the connection with a sample query
5. Start searching!

## 🛠️ Development

### Tech Stack

- **Frontend**: Next.js 15, React 19, TypeScript
- **Styling**: Tailwind CSS with custom theme
- **UI Components**: shadcn/ui (Radix UI primitives)
- **Icons**: Lucide React
- **AI Integration**: Google Gemini API
- **Search**: Google Custom Search API

## 🙏 Acknowledgments

- **Google Gemini AI** for powerful language understanding
- **Google Custom Search** for comprehensive web search
- **Vercel** for Next.js and hosting platform
- **shadcn/ui** for beautiful, accessible components
- **Tailwind CSS** for efficient styling
