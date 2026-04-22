'use client';

import React from 'react';
import {
  Bookmark,
  Search,
  Filter,
  Save,
  Edit3,
  Video,
  Tag,
  Trash2,
  XCircle,
} from 'lucide-react';
import { LEONARDO_MODELS, type Collection } from './MashupContext';

interface GalleryStats {
  total: number;
  tagged: number;
  captioned: number;
}

export interface GalleryFilterBarProps {
  galleryStats: GalleryStats;
  postReadyCount: number;
  displayedCount: number;
  selectedForBatch: Set<string>;
  searchQuery: string;
  sortBy: 'newest' | 'oldest';
  filterModel: string;
  filterUniverse: string;
  selectedCollectionId: string;
  tagQuery: string;
  collections: Collection[];
  onSearchChange: (q: string) => void;
  onSortChange: (sort: 'newest' | 'oldest') => void;
  onFilterModelChange: (model: string) => void;
  onFilterUniverseChange: (universe: string) => void;
  onCollectionChange: (id: string) => void;
  onTagQueryChange: (q: string) => void;
  onBulkTag: () => void;
  onBatchPostReady: () => void;
  onBatchCaption: () => void;
  onBatchAnimate: () => void;
  onBatchDelete: () => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
}

export function GalleryFilterBar({
  galleryStats,
  postReadyCount,
  displayedCount,
  selectedForBatch,
  searchQuery,
  sortBy,
  filterModel,
  filterUniverse,
  selectedCollectionId,
  tagQuery,
  collections,
  onSearchChange,
  onSortChange,
  onFilterModelChange,
  onFilterUniverseChange,
  onCollectionChange,
  onTagQueryChange,
  onBulkTag,
  onBatchPostReady,
  onBatchCaption,
  onBatchAnimate,
  onBatchDelete,
  onSelectAll,
  onClearSelection,
}: GalleryFilterBarProps) {
  return (
    <div className="mb-6 space-y-4">
      {/* Section header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="icon-box-blue">
            <Bookmark className="w-5 h-5 text-[#00e6ff]" />
          </div>
          <div>
            <h2 className="type-title">Gallery</h2>
            <p className="type-muted">{galleryStats.total} saved images</p>
          </div>
        </div>
        <div className="flex items-center gap-4 text-xs text-zinc-500">
          <span>{galleryStats.total} images</span>
          <span className="text-zinc-700">·</span>
          <span>{galleryStats.tagged} tagged</span>
          <span className="text-zinc-700">·</span>
          <span>{galleryStats.captioned} captioned</span>
          <span className="text-zinc-700">·</span>
          <span>{postReadyCount} post-ready</span>
        </div>
      </div>

      {/* Filter card */}
      <div className="flex flex-col gap-4 card p-4 md:p-5">
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          <div className="relative w-full sm:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              type="text"
              placeholder="Search by prompt or tags..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full bg-zinc-900/60 border border-zinc-700/50 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-[#00e6ff]/20 focus:border-[#00e6ff]/35 transition-all duration-200"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            {selectedForBatch.size > 0 && (
              <>
                <span className="px-2 py-1 text-[11px] font-medium bg-[#00e6ff]/15 text-[#00e6ff] rounded-full border border-[#00e6ff]/30">
                  {selectedForBatch.size} selected
                </span>
                <button
                  onClick={onBatchPostReady}
                  className="px-3 py-2 bg-[#c5a062] hover:bg-[#d4b478] active:bg-[#a68748] text-[#050505] rounded-xl text-xs font-semibold transition-colors flex items-center gap-2"
                >
                  <Save className="w-3.5 h-3.5" />
                  Post Ready
                </button>
                <button
                  onClick={onBatchCaption}
                  className="btn-blue-sm py-2"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  Caption
                </button>
                <button
                  onClick={onBatchAnimate}
                  className="btn-blue-sm py-2"
                >
                  <Video className="w-3.5 h-3.5" />
                  Animate
                </button>
                <button
                  onClick={onBulkTag}
                  className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl text-xs font-medium transition-colors flex items-center gap-2"
                >
                  <Tag className="w-3.5 h-3.5" />
                  Tag
                </button>
                <button
                  onClick={onBatchDelete}
                  className="px-3 py-2 bg-red-600/20 hover:bg-red-600/40 text-red-300 rounded-xl text-xs font-medium transition-colors flex items-center gap-2 border border-red-500/30"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete
                </button>
                <button
                  onClick={onSelectAll}
                  className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl text-xs font-medium transition-colors"
                >
                  Select All
                </button>
                <button
                  onClick={onClearSelection}
                  className="px-2 py-2 text-zinc-400 hover:text-zinc-200 text-xs font-medium transition-colors"
                >
                  Clear
                </button>
              </>
            )}
            {selectedForBatch.size === 0 && displayedCount > 0 && (
              <button
                onClick={onSelectAll}
                className="px-3 py-2 bg-zinc-800/60 hover:bg-zinc-700 text-zinc-300 rounded-xl text-xs font-medium transition-colors"
              >
                Select All
              </button>
            )}
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-zinc-500" />
              <select
                value={sortBy}
                onChange={(e) => onSortChange(e.target.value as 'newest' | 'oldest')}
                className="bg-zinc-950 border border-zinc-800/60 rounded-xl px-3 py-2 text-xs text-zinc-300 focus:outline-none focus:ring-2 focus:ring-[#c5a062]/30 cursor-pointer"
              >
                <option value="newest">Newest First</option>
                <option value="oldest">Oldest First</option>
              </select>
            </div>
          </div>
        </div>

        {/* Model pills */}
        <div className="flex flex-wrap gap-1.5 pt-3 border-t border-zinc-800/60">
          <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider self-center mr-1">
            Model
          </span>
          <button
            onClick={() => onFilterModelChange('all')}
            className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
              filterModel === 'all'
                ? 'bg-[#00e6ff]/15 text-[#00e6ff] border border-[#00e6ff]/30'
                : 'text-zinc-500 hover:text-zinc-300 border border-zinc-800/60'
            }`}
          >
            All
          </button>
          {LEONARDO_MODELS.map((m) => (
            <button
              key={m.id}
              onClick={() => onFilterModelChange(m.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                filterModel === m.id
                  ? 'bg-[#00e6ff]/15 text-[#00e6ff] border border-[#00e6ff]/30'
                  : 'text-zinc-500 hover:text-zinc-300 border border-zinc-800/60'
              }`}
            >
              {m.name}
            </button>
          ))}
        </div>

        {/* Universe + Collection + Tag query */}
        <div className="flex flex-wrap gap-3 pt-3 border-t border-zinc-800/60">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Universe</span>
            <select
              value={filterUniverse}
              onChange={(e) => onFilterUniverseChange(e.target.value)}
              className="bg-zinc-950 border border-zinc-800/60 rounded-xl px-3 py-1.5 text-xs text-zinc-300 focus:outline-none focus:ring-2 focus:ring-[#c5a062]/30 cursor-pointer"
            >
              <option value="all">All Universes</option>
              <option value="Marvel">Marvel</option>
              <option value="DC">DC</option>
              <option value="Star Wars">Star Wars</option>
              <option value="Warhammer 40k">Warhammer 40k</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Collection</span>
            <select
              value={selectedCollectionId}
              onChange={(e) => onCollectionChange(e.target.value)}
              className="bg-zinc-950 border border-zinc-800/60 rounded-xl px-3 py-1.5 text-xs text-zinc-300 focus:outline-none focus:ring-2 focus:ring-[#c5a062]/30 cursor-pointer"
            >
              <option value="all">All Collections</option>
              {collections.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 flex-1 min-w-[220px]">
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider whitespace-nowrap">Tags</span>
            <div className="relative flex-1">
              <Tag className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-500" />
              <input
                type="text"
                placeholder="e.g. Marvel OR DC; NOT Grimdark"
                value={tagQuery}
                onChange={(e) => onTagQueryChange(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800/60 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-[#c5a062]/30 transition-colors"
              />
            </div>
            {tagQuery && (
              <button
                onClick={() => onTagQueryChange('')}
                className="p-1 text-zinc-500 hover:text-white"
                aria-label="Clear search query"
              >
                <XCircle className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
