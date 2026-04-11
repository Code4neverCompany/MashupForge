'use client';

import { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import ReactMarkdown from 'react-markdown';
import { Send, Search, MessageSquare, Loader2, ExternalLink, Image as ImageIcon, Sparkles, Columns, RefreshCw, History } from 'lucide-react';
import { useMashup, LEONARDO_MODELS } from './MashupContext';
import { streamAI } from '@/lib/aiClient';

type Tab = 'chat' | 'content' | 'history';

interface TrendSource {
  topic: string;
  headline: string;
  source: string;
  url: string;
}

interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  groundingChunks?: any[];
  recommendations?: string[];
  trendingSources?: TrendSource[];
  ideas?: Array<{ context: string; concept: string }>;
}

export function Sidebar() {
  const [activeTab, setActiveTab] = useState<Tab>('content');
  const [chatMessages, setChatMessages] = useState<Message[]>([]);
  const [contentMessages, setContentMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { generateImages, settings, setView, generateComparison, generateNegativePrompt, setComparisonPrompt, setComparisonOptions, addIdea, isSidebarOpen, setIsSidebarOpen, images, clearComparison } = useMashup();

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
      const userMsgObj = { id: Date.now().toString(), role: 'user' as const, text: userMsg };
      const modelMsgId = (Date.now() + 1).toString();
      setChatMessages((prev) => [
        ...prev,
        userMsgObj,
        { id: modelMsgId, role: 'model', text: '' },
      ]);
      try {
        const systemInstruction = `${settings.agentPrompt || 'You are an expert on all fantasy and sci-fi universes (Marvel, DC, Star Wars, Warhammer 40k, etc.). Help the user brainstorm crossover ideas and answer questions.'}
              Niches: ${settings.agentNiches?.join(', ') || 'None'}.
              Genres: ${settings.agentGenres?.join(', ') || 'None'}.`;

        let acc = '';
        for await (const delta of streamAI(userMsg, {
          mode: 'chat',
          systemPrompt: systemInstruction,
        })) {
          acc += delta;
          setChatMessages((prev) =>
            prev.map((m) => (m.id === modelMsgId ? { ...m, text: acc } : m))
          );
        }
        if (!acc) {
          setChatMessages((prev) =>
            prev.map((m) =>
              m.id === modelMsgId ? { ...m, text: '(no response)' } : m
            )
          );
        }
      } catch (error) {
        console.error('Chat error:', error);
        setChatMessages((prev) =>
          prev.map((m) =>
            m.id === modelMsgId
              ? { ...m, text: 'Error: Could not get response.' }
              : m
          )
        );
      } finally {
        setIsLoading(false);
      }
    } else {
      // Content Generator — fetch trending first, then stream ideas.
      const userMsgObj = { id: Date.now().toString(), role: 'user' as const, text: userMsg };
      const modelMsgId = (Date.now() + 1).toString();
      setContentMessages((prev) => [
        ...prev,
        userMsgObj,
        { id: modelMsgId, role: 'model', text: '⏳ Researching trending topics…' },
      ]);

      try {
        // Step 1: Fetch trending data for all active niches/genres
        let trendingSummary = '';
        let trendingResults: TrendSource[] = [];
        try {
          const trendRes = await fetch('/api/trending', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              niches: settings.agentNiches,
              genres: settings.agentGenres,
              ideaConcept: userMsg,
            }),
          });
          const trendData = await trendRes.json();
          if (trendData.success && trendData.summary) {
            trendingSummary = trendData.summary;
          }
          if (trendData.success && Array.isArray(trendData.results)) {
            trendingResults = trendData.results;
          }
        } catch { /* non-blocking */ }

        // Step 2: Build trend-aware prompt
        const trendingBlock = trendingSummary
          ? `\n\nCURRENT TRENDING CONTEXT — base your ideas on these real trends to make them timely and shareable:\n${trendingSummary}\n`
          : '';
        const niches = settings.agentNiches?.join(', ') || 'Marvel, DC, Star Wars, Warhammer 40k';
        const genres = settings.agentGenres?.join(', ') || 'Cinematic Crossovers, Epic Action, Visual Storytelling';

        const message = `${settings.agentPrompt || 'You are an elite AI art director and social media growth hacker.'}

Active Niches: ${niches}
Active Genres: ${genres}
${trendingBlock}

Topic: ${userMsg}

Generate 3-5 crossover content ideas that are SPECTACULAR, timely, and would go viral on Instagram. Each idea should be a visually stunning image concept.
Return them as a JSON array. Each object has "context" (short catchy title) and "concept" (detailed image generation prompt, vivid and cinematic).
Return ONLY the JSON array, no prose.`;

        setContentMessages((prev) =>
          prev.map((m) =>
            m.id === modelMsgId
              ? { ...m, text: trendingSummary ? `📈 Found trending topics!\n\n⏳ Generating trend-aware ideas…` : '⏳ Generating ideas…' }
              : m
          )
        );

        let acc = '';
        for await (const delta of streamAI(message, { mode: 'idea' })) {
          acc += delta;
          setContentMessages((prev) =>
            prev.map((m) => (m.id === modelMsgId ? { ...m, text: acc } : m))
          );
        }

        let ideaCount = 0;
        let parsedIdeas: Array<{ context: string; concept: string }> = [];
        try {
          const cleaned = acc.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
          const ideasArray = JSON.parse(cleaned);
          for (const item of ideasArray) {
            if (item.concept) {
              addIdea(item.concept, item.context);
              parsedIdeas.push({ context: item.context || '', concept: item.concept });
              ideaCount++;
            }
          }
        } catch (e) {
          console.error('Failed to parse ideas JSON', e);
        }

        setContentMessages((prev) =>
          prev.map((m) =>
            m.id === modelMsgId
              ? {
                  ...m,
                  text: parsedIdeas.length > 0
                    ? `✨ Generated ${ideaCount} ideas and saved them to your Ideas Board!`
                    : acc,
                  trendingSources: trendingResults,
                  ideas: parsedIdeas.length > 0 ? parsedIdeas : undefined,
                }
              : m
          )
        );
      } catch (error) {
        console.error('Content Generator error:', error);
        setContentMessages((prev) =>
          prev.map((m) =>
            m.id === modelMsgId
              ? { ...m, text: 'Error: Could not perform search.' }
              : m
          )
        );
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
            onClick={() => setActiveTab('content')}
            className={`flex-1 py-2 px-3 rounded-lg flex items-center justify-center gap-2 text-sm font-medium transition-colors ${
              activeTab === 'content' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
            }`}
          >
            <Search className="w-4 h-4" />
            Content
          </button>
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
            onClick={() => setActiveTab('history')}
            className={`flex-1 py-2 px-3 rounded-lg flex items-center justify-center gap-2 text-sm font-medium transition-colors ${
              activeTab === 'history' ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
            }`}
          >
            <History className="w-4 h-4" />
            History
          </button>
        </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {activeTab === 'history' ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Recent Generations</h3>
              {images.length > 0 && (
                <button 
                  onClick={clearComparison}
                  className="text-[10px] text-zinc-500 hover:text-red-400 transition-colors"
                >
                  Clear All
                </button>
              )}
            </div>
            {images.length === 0 ? (
              <div className="text-center py-10">
                <History className="w-8 h-8 text-zinc-800 mx-auto mb-2" />
                <p className="text-xs text-zinc-600">No generation history yet.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {images.filter(img => img.status === 'ready').map((img) => (
                  <div 
                    key={img.id} 
                    className="group relative aspect-square bg-zinc-950 rounded-lg overflow-hidden border border-zinc-800 hover:border-indigo-500/50 transition-all cursor-pointer"
                    onClick={() => {
                      setComparisonPrompt(img.prompt);
                      setView('compare');
                    }}
                  >
                    {img.url ? (
                      <Image src={img.url} alt="" fill className="object-cover" unoptimized />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Loader2 className="w-4 h-4 animate-spin text-zinc-700" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2">
                      <p className="text-[10px] text-white line-clamp-2 leading-tight">{img.prompt}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
        <>
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
            {msg.trendingSources && msg.trendingSources.length > 0 && (
              <div className="mt-2 space-y-1 w-full pl-2 border-l-2 border-indigo-500/40">
                <p className="text-xs text-zinc-500 font-medium">Trending sources:</p>
                {msg.trendingSources.map((src, j) =>
                  src.url ? (
                    <a
                      key={j}
                      href={src.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 truncate"
                    >
                      <ExternalLink className="w-3 h-3 shrink-0" />
                      <span className="truncate">
                        <span className="text-zinc-500">[{src.source}]</span> {src.headline}
                      </span>
                    </a>
                  ) : (
                    <div key={j} className="flex items-center gap-1 text-xs text-zinc-400 truncate">
                      <span className="truncate">
                        <span className="text-zinc-500">[{src.source}]</span> {src.headline}
                      </span>
                    </div>
                  )
                )}
              </div>
            )}
            {msg.ideas && msg.ideas.length > 0 && (
              <div className="mt-2 space-y-2 w-full pl-3 border-l-2 border-emerald-500/30">
                {msg.ideas.map((idea, j) => (
                  <div
                    key={j}
                    className="group cursor-pointer rounded-lg bg-zinc-800/50 border border-zinc-700/50 hover:border-emerald-500/40 p-2.5 transition-colors"
                    onClick={() => {
                      setComparisonPrompt(idea.concept);
                      setView('compare');
                    }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-medium text-white leading-tight">{idea.context || `Idea ${j + 1}`}</p>
                      <span className="shrink-0 text-[10px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">On Board</span>
                    </div>
                    <p className="text-[11px] text-zinc-400 mt-1 line-clamp-3 leading-relaxed">{idea.concept}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        {isLoading && (
          <div className="flex items-start">
            <div className="bg-zinc-800 text-zinc-300 rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-2 text-xs">
              {activeTab === 'chat' ? (
                <>
                  <span className="inline-flex gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse [animation-delay:0ms]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse [animation-delay:200ms]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse [animation-delay:400ms]" />
                  </span>
                </>
              ) : (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                  <span>Generating…</span>
                </>
              )}
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
        </>
        )}
      </div>

      {activeTab !== 'history' && (
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
      )}
    </div>
    </>
  );
}
