'use client';

import { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, Type } from '@google/genai';
import ReactMarkdown from 'react-markdown';
import { Send, Search, MessageSquare, Loader2, ExternalLink, Image as ImageIcon, Sparkles, Columns, RefreshCw } from 'lucide-react';
import { useMashup, LEONARDO_MODELS } from './MashupContext';

type Tab = 'chat' | 'content';

interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  groundingChunks?: any[];
  recommendations?: string[];
}

export function Sidebar() {
  const [activeTab, setActiveTab] = useState<Tab>('chat');
  const [chatMessages, setChatMessages] = useState<Message[]>([]);
  const [contentMessages, setContentMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const chatRef = useRef<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { generateImages, settings, setView, generateComparison, generateNegativePrompt, setComparisonPrompt, setComparisonOptions, addIdea, isSidebarOpen, setIsSidebarOpen } = useMashup();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatMessages, contentMessages]);

  const handleSend = async (overrideInput?: string) => {
    const textToSend = overrideInput || input;
    if (!textToSend.trim() || isLoading) return;

    const userMsg = textToSend.trim();
    if (!overrideInput) setInput('');
    setIsLoading(true);

    if (activeTab === 'chat') {
      setChatMessages((prev) => [...prev, { id: Date.now().toString(), role: 'user', text: userMsg }]);
      try {
        const geminiApiKey = settings.apiKeys.gemini || process.env.NEXT_PUBLIC_GEMINI_API_KEY!;
        const ai = new GoogleGenAI({ apiKey: geminiApiKey });
        if (!chatRef.current) {
          chatRef.current = ai.chats.create({
            model: 'gemini-3.1-pro-preview',
            config: {
              systemInstruction: `${settings.agentPrompt || 'You are an expert on all fantasy and sci-fi universes (Marvel, DC, Star Wars, Warhammer 40k, etc.). Help the user brainstorm crossover ideas and answer questions.'} 
              Niches: ${settings.agentNiches?.join(', ') || 'None'}.
              Genres: ${settings.agentGenres?.join(', ') || 'None'}.`,
            },
          });
        }

        const stream = await chatRef.current.sendMessageStream({ message: userMsg });
        let fullText = '';
        const modelMsgId = (Date.now() + 1).toString();
        setChatMessages((prev) => [...prev, { id: modelMsgId, role: 'model', text: '' }]);

        for await (const chunk of stream) {
          fullText += (chunk as any).text || '';
          setChatMessages((prev) => {
            const newMsgs = [...prev];
            newMsgs[newMsgs.length - 1].text = fullText;
            return newMsgs;
          });
        }
      } catch (error) {
        console.error('Chat error:', error);
        setChatMessages((prev) => [...prev, { id: Date.now().toString(), role: 'model', text: 'Error: Could not get response.' }]);
      } finally {
        setIsLoading(false);
      }
    } else {
      // Content Generator
      setContentMessages((prev) => [...prev, { id: Date.now().toString(), role: 'user', text: userMsg }]);
      try {
        const geminiApiKey = settings.apiKeys.gemini || process.env.NEXT_PUBLIC_GEMINI_API_KEY!;
        const ai = new GoogleGenAI({ apiKey: geminiApiKey });
        
        const prompt = `${settings.agentPrompt || 'You are a Master Content Creator.'}
        The user is asking for content ideas about: ${userMsg}. 
        Platform Niches: ${settings.agentNiches?.join(', ') || 'None'}.
        Target Genres: ${settings.agentGenres?.join(', ') || 'None'}.
        
        Based on your personality, niches, and genres, brainstorm 3-5 rapid content creation ideas.
        You MUST strictly limit the content to ONLY these franchises: Star Wars, Marvel, DC, and Warhammer 40k.
        Format the ideas as a JSON array of objects, each with two keys:
        - "context": A short title or explanation of what the idea is about (e.g., "Darth Vader vs Batman in Gotham").
        - "concept": The highly detailed image generation prompt.
        Return ONLY the JSON array.`;

        const response = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: prompt,
          config: {
            tools: [{ googleSearch: {} }],
            responseMimeType: 'application/json',
          },
        });

        const text = response.text || '[]';
        const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];

        let ideaCount = 0;
        try {
          const ideasArray = JSON.parse(text);
          for (const item of ideasArray) {
            if (item.concept) {
              addIdea(item.concept, item.context);
              ideaCount++;
            }
          }
        } catch (e) {
          console.error("Failed to parse ideas JSON", e);
        }

        const cleanTextLines = [`✨ Generated ${ideaCount} ideas and saved them to your Ideas Board!`];

        setContentMessages((prev) => [...prev, { 
          id: Date.now().toString(),
          role: 'model', 
          text: cleanTextLines.join('\n').trim(), 
          groundingChunks: chunks
        }]);
      } catch (error) {
        console.error('Content Generator error:', error);
        setContentMessages((prev) => [...prev, { id: Date.now().toString(), role: 'model', text: 'Error: Could not perform search.' }]);
      } finally {
        setIsLoading(false);
      }
    }
  };

  const messages = activeTab === 'chat' ? chatMessages : contentMessages;

  return (
    <>
      {/* Mobile Backdrop */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}
      
      <div className={`fixed md:static inset-y-0 left-0 z-50 w-[85vw] sm:w-80 border-r border-zinc-800 bg-zinc-900/95 md:bg-zinc-900/50 flex flex-col h-full shrink-0 transition-transform duration-300 ease-in-out ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <div className="flex p-2 gap-2 border-b border-zinc-800">
          <button
            onClick={() => setActiveTab('chat')}
            className={`flex-1 py-2 px-3 rounded-lg flex items-center justify-center gap-2 text-sm font-medium transition-colors ${
              activeTab === 'chat' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            Chat
          </button>
          <button
            onClick={() => setActiveTab('content')}
            className={`flex-1 py-2 px-3 rounded-lg flex items-center justify-center gap-2 text-sm font-medium transition-colors ${
              activeTab === 'content' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
            }`}
          >
            <Search className="w-4 h-4" />
            Content Generator
          </button>
        </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-zinc-500 text-sm mt-10 flex flex-col items-center gap-4">
            {activeTab === 'chat' ? (
              <p>Ask me anything about fantasy universes or brainstorm crossover ideas!</p>
            ) : (
              <>
                <p>Generate peak content, what-if scenarios, and crossovers for Star Wars, Marvel, DC, and Warhammer 40k.</p>
                <button
                  onClick={() => {
                    handleSend(`Autonomous Content Generation: Research current trends and generate a viral concept with 3 image prompts based on my personality settings.`);
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors font-medium"
                >
                  <Sparkles className="w-4 h-4 text-indigo-400" />
                  Automate Content Gen
                </button>
              </>
            )}
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
            <div
              className={`max-w-[90%] rounded-2xl px-4 py-2 text-sm ${
                msg.role === 'user'
                  ? 'bg-indigo-600 text-white rounded-br-sm'
                  : 'bg-zinc-800 text-zinc-200 rounded-bl-sm'
              }`}
            >
              {msg.role === 'user' ? (
                msg.text
              ) : (
                <div className="prose prose-invert prose-sm max-w-none">
                  <ReactMarkdown>{msg.text}</ReactMarkdown>
                </div>
              )}
            </div>
            {msg.groundingChunks && msg.groundingChunks.length > 0 && (
              <div className="mt-2 space-y-1 w-full pl-2 border-l-2 border-zinc-700">
                <p className="text-xs text-zinc-500 font-medium">Sources:</p>
                {msg.groundingChunks.map((chunk, j) => {
                  if (chunk.web?.uri) {
                    return (
                      <a
                        key={j}
                        href={chunk.web.uri}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 truncate"
                      >
                        <ExternalLink className="w-3 h-3 shrink-0" />
                        <span className="truncate">{chunk.web.title || chunk.web.uri}</span>
                      </a>
                    );
                  }
                  return null;
                })}
              </div>
            )}
          </div>
        ))}
        {isLoading && (
          <div className="flex items-start">
            <div className="bg-zinc-800 text-zinc-200 rounded-2xl rounded-bl-sm px-4 py-3">
              <Loader2 className="w-4 h-4 animate-spin text-zinc-400" />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 border-t border-zinc-800 bg-zinc-900/80">
        <form
          suppressHydrationWarning
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="relative"
        >
          <input
            suppressHydrationWarning
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={activeTab === 'chat' ? 'Message AI...' : 'Generate content...'}
            className="w-full bg-zinc-950 border border-zinc-700 rounded-xl pl-4 pr-10 py-3 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            disabled={isLoading}
          />
          <button
            suppressHydrationWarning
            type="submit"
            disabled={!input.trim() || isLoading}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-zinc-400 hover:text-white disabled:opacity-50 disabled:hover:text-zinc-400 transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
    </>
  );
}
