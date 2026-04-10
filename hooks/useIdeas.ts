'use client';

import { useState, useEffect } from 'react';
import { get, set } from 'idb-keyval';
import { type Idea } from '../types/mashup';

export function useIdeas() {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [isIdeasLoaded, setIsIdeasLoaded] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const idbIdeas = await get('mashup_ideas');
        if (idbIdeas) setIdeas(idbIdeas);
      } catch (e) {
        console.error('Failed to load ideas', e);
      } finally {
        setIsIdeasLoaded(true);
      }
    };
    load();
  }, []);

  useEffect(() => {
    if (isIdeasLoaded) {
      set('mashup_ideas', ideas);
    }
  }, [ideas, isIdeasLoaded]);

  const addIdea = (concept: string, context?: string) => {
    const newIdea: Idea = {
      id: `idea-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      concept,
      context,
      createdAt: Date.now(),
      status: 'idea'
    };
    setIdeas(prev => [newIdea, ...prev]);
  };

  const updateIdeaStatus = (id: string, status: 'idea' | 'in-work' | 'done') => {
    setIdeas(prev => prev.map(idea => idea.id === id ? { ...idea, status } : idea));
  };

  const deleteIdea = (id: string) => {
    setIdeas(prev => prev.filter(idea => idea.id !== id));
  };

  const clearIdeas = () => {
    setIdeas([]);
  };

  return {
    ideas,
    addIdea,
    updateIdeaStatus,
    deleteIdea,
    clearIdeas,
    isIdeasLoaded,
  };
}
