# Pipeline Overhaul + Global UI Refresh

## Overview

Three workstreams:
1. **Pipeline functionality** — continuous auto-generation, approval flow, idea generation
2. **Pipeline UI** — functional start button, clearable log, visual improvements  
3. **Global UI consistency** — modern, sleek, clean across ALL tabs

---

## Part 1: Pipeline Logic Changes (`hooks/usePipeline.ts`)

### 1A: Fix greyed-out Start Pipeline button

**Current:** L310 disables button when `pendingIdeas.length === 0`
**Fix:** Remove the `pendingIdeas.length === 0` check. When no ideas exist, the pipeline should auto-generate ideas (see 1C). The button should be enabled whenever `pipelineEnabled` is true.

In `PipelinePanel.tsx` L310, change:
```tsx
disabled={!pipelineEnabled || pendingIdeas.length === 0}
```
to:
```tsx
disabled={!pipelineEnabled}
```

### 1B: Continuous / daemon mode

**Current:** Pipeline runs through `pendingIdeas` once then stops.
**New:** Add a "continuous" mode toggle. When enabled, after processing all current ideas, the pipeline:
1. Generates new ideas automatically (calls pi to create ideas matching configured niches/genres)
2. Sleeps for a configurable interval (default: 2 hours)
3. Checks the schedule — if fewer than N posts scheduled in the next 7 days, generates more
4. Repeats indefinitely until stopped

Add to `usePipeline.ts`:
```typescript
const [pipelineContinuous, setPipelineContinuous] = useState(false);
const [pipelineInterval, setPipelineInterval] = useState(120); // minutes
const [pipelineTargetDays, setPipelineTargetDays] = useState(7); // schedule ahead N days
```

The continuous loop in `startPipeline`:
```typescript
// After the main for-loop completes, if continuous mode:
if (pipelineContinuous && !stopRequestedRef.current) {
  // Check how many posts are scheduled in next N days
  const futurePosts = countScheduledPosts(settings.scheduledPosts, pipelineTargetDays);
  const targetPostsPerDay = 2; // configurable
  const targetTotal = pipelineTargetDays * targetPostsPerDay;
  
  if (futurePosts < targetTotal) {
    // Generate new ideas to fill the gap
    const ideasNeeded = Math.ceil((targetTotal - futurePosts) / allModelIds.length);
    const newIdeas = await autoGenerateIdeas(ideasNeeded);
    // Add to ideas list
    // Loop back to process them
  }
  
  // Sleep for interval
  setPipelineProgress({ current: 0, total: 0, currentStep: `Next cycle in ${pipelineInterval} minutes...`, currentIdea: '' });
  await delay(pipelineInterval * 60 * 1000);
  // Then restart the pipeline with new ideas
}
```

Add a new function `autoGenerateIdeas`:
```typescript
const autoGenerateIdeas = async (count: number): Promise<Idea[]> => {
  const prompt = `${settings.agentPrompt || 'You are an elite AI art director.'}
Active Niches: ${settings.agentNiches?.join(', ') || 'None'}.
Active Genres: ${settings.agentGenres?.join(', ') || 'None'}.

Generate ${count} unique, creative content ideas for social media posts.
Each idea should be visually striking, shareable, and aligned with the niches/genres.
Return a JSON array of objects with "concept" and "context" fields. Example:
[{"concept": "...", "context": "..."}]
Return ONLY the JSON array.`;

  const text = await streamAIToString(prompt, { mode: 'enhance' });
  // Parse JSON from response (use extractJsonFromLLM)
  const parsed = extractJsonFromLLM(text);
  return parsed.map((idea: any) => ({
    id: `idea-auto-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    concept: idea.concept,
    context: idea.context || '',
    status: 'idea' as const,
    createdAt: new Date(),
  }));
};
```

### 1C: Approval flow for scheduled posts

**Current:** Posts go straight to `scheduled` status and stay there until manually posted.
**New:** Add `pending_approval` status. Pipeline-generated posts go to `pending_approval` first.

In the `processIdea` function (L253-261), change:
```typescript
status: 'scheduled',
```
to:
```typescript
status: 'pending_approval',
```

Add `approveScheduledPost` and `rejectScheduledPost` functions in `MashupContext.tsx`:
```typescript
const approveScheduledPost = (postId: string) => {
  const posts = settings.scheduledPosts || [];
  updateSettings({
    scheduledPosts: posts.map(p => p.id === postId ? { ...p, status: 'scheduled' } : p)
  });
};

const rejectScheduledPost = (postId: string) => {
  const posts = settings.scheduledPosts || [];
  updateSettings({
    scheduledPosts: posts.filter(p => p.id !== postId)
  });
};
```

Update `ScheduledPost` type in `types/mashup.ts` to include `status: 'pending_approval' | 'scheduled' | 'posted' | 'failed'`.

### 1D: Add `clearPipelineLog` function

In `usePipeline.ts`, add:
```typescript
const clearPipelineLog = useCallback(() => {
  setPipelineLog([]);
}, []);
```

Return it from the hook.

Add to `MashupContext.tsx` context value and types.

---

## Part 2: Pipeline Panel UI (`components/PipelinePanel.tsx`)

### 2A: Fix Start Pipeline button
- Remove `pendingIdeas.length === 0` from disabled condition (as described above)
- When no ideas exist and pipeline starts, it should show "Auto-generating ideas..." in progress

### 2B: Add clear log button
In the log section header (L497-509), add a "Clear" button next to the collapse chevron:
```tsx
<button
  onClick={clearPipelineLog}
  className="text-[10px] px-2 py-1 text-zinc-500 hover:text-zinc-300 bg-zinc-800 rounded-md transition-colors"
>
  Clear
</button>
```

### 2C: Add continuous mode toggle and config
Below the existing delay config (L328-343), add:
```tsx
<div className="flex items-center gap-3 pt-2 border-t border-zinc-800/60">
  <span className="text-sm text-zinc-400">Continuous mode</span>
  <button onClick={toggleContinuous} className={toggle-classes}>
    {/* Same toggle switch as pipelineEnabled */}
  </button>
  {pipelineContinuous && (
    <>
      <span className="text-sm text-zinc-500">Every</span>
      <input type="number" min={30} max={1440} value={pipelineInterval}
        onChange={...}
        className={input-classes}
      />
      <span className="text-sm text-zinc-500">min, target</span>
      <input type="number" min={1} max={30} value={pipelineTargetDays}
        onChange={...}
        className={input-classes}
      />
      <span className="text-sm text-zinc-500">days ahead</span>
    </>
  )}
</div>
```

### 2D: Show pending approval posts in Pipeline panel
Add a section at the bottom showing posts awaiting approval:
```tsx
{pendingApprovalPosts.length > 0 && (
  <div className="bg-amber-500/10 rounded-2xl border border-amber-500/30 p-5 space-y-3">
    <span className="text-sm font-medium text-amber-300">Awaiting Approval ({pendingApprovalPosts.length})</span>
    {pendingApprovalPosts.map(post => (
      <div key={post.id} className="flex items-center gap-3 bg-zinc-900/80 rounded-xl p-3">
        {/* Thumbnail */}
        <img src={getImageUrl(post.imageId)} className="w-12 h-12 object-cover rounded-lg" />
        {/* Caption preview */}
        <div className="flex-1 min-w-0">
          <p className="text-sm text-zinc-300 truncate">{post.caption}</p>
          <p className="text-xs text-zinc-500">{post.date} at {post.time} → {post.platforms.join(', ')}</p>
        </div>
        {/* Approve / Reject */}
        <button onClick={() => approvePost(post.id)} className="p-2 bg-emerald-600/20 hover:bg-emerald-600/40 rounded-lg text-emerald-400">
          <Check className="w-4 h-4" />
        </button>
        <button onClick={() => rejectPost(post.id)} className="p-2 bg-red-600/20 hover:bg-red-600/40 rounded-lg text-red-400">
          <X className="w-4 h-4" />
        </button>
      </div>
    ))}
  </div>
)}
```

---

## Part 3: Global UI Consistency

### Design System (apply to ALL tabs)

**Color palette:**
- Background: `bg-zinc-950` (page), `bg-zinc-900/80 backdrop-blur-sm` (cards/panels)
- Borders: `border-zinc-800/60`
- Text primary: `text-white`, `text-zinc-100`
- Text secondary: `text-zinc-400`
- Text muted: `text-zinc-500`, `text-zinc-600`
- Accent primary: `emerald-500/600` (action buttons, active states)
- Accent secondary: `indigo-500/600` (pipeline, generation)
- Warning: `amber-500` (pending approval, attention)
- Danger: `red-500/600` (delete, reject, errors)

**Border radius:** All cards `rounded-2xl`, inner elements `rounded-xl`, small elements `rounded-lg`
**Spacing:** `p-5` for cards, `gap-3` between elements, `space-y-6` between sections
**Transitions:** `transition-all` or `transition-colors` on all interactive elements

### Specific fixes per tab:

**Tab bar (L1378-1422):**
- Already decent. Ensure consistent gap and padding.
- Add a subtle indicator dot or glow on tabs with activity (e.g., Pipeline when running, Calendar when posts pending)

**Ideas tab:**
- Ensure idea cards use the card design system (bg-zinc-900/80, rounded-2xl, border-zinc-800/60)
- Status badges should use consistent colors: idea=zinc, in-work=indigo, done=emerald

**Studio tab:**
- Generation area should use card design system
- Model selector pills should be consistent with platform pills in Pipeline
- Progress indicators should match Pipeline progress style

**Gallery tab:**
- Image grid cards consistent spacing and hover effects
- Action buttons (save, delete, etc.) should use icon-only buttons with consistent styling

**Captioning tab:**
- Caption editor cards should use the standard card design
- Group/ungroup UI should be clean and consistent

**Post Ready tab:**
- Carousel preview cards need the `object-contain` fix already applied
- Schedule button styling consistent with Pipeline start button
- Status badges consistent

**Calendar tab:**
- Day cells should use the card design system
- Posts in calendar should show approval status with color coding
- Drag-and-drop visual feedback should use emerald accent

**Settings tab:**
- Consolidate "AI Agent Personality" and "Pi.dev AI Engine" into one section
- Use consistent input styling (bg-zinc-800, border-zinc-700, rounded-lg)
- Group related settings with clear section headers

### Typography:
- Headings: `text-xl font-semibold text-white`
- Subheadings: `text-sm font-medium text-zinc-300`
- Body: `text-sm text-zinc-400`
- Labels: `text-[10px] font-bold text-zinc-500 uppercase tracking-wider`
- Mono: `font-mono` for timestamps, IDs, technical values

---

## Files to Modify

| File | Changes |
|------|---------|
| `hooks/usePipeline.ts` | Continuous mode, autoGenerateIdeas, clearPipelineLog, approval flow |
| `components/PipelinePanel.tsx` | Start button fix, clear log, continuous toggle, approval section, visual refresh |
| `components/MashupContext.tsx` | Wire new pipeline functions, approveScheduledPost, rejectScheduledPost |
| `types/mashup.ts` | Add `pending_approval` status, continuous mode settings, clearPipelineLog |
| `components/MainContent.tsx` | Global UI consistency pass across all tabs |

## Acceptance Criteria

1. Start Pipeline button is enabled whenever pipeline is toggled ON (even with 0 ideas)
2. Pipeline can run continuously, auto-generating ideas to fill a week+ of scheduled content
3. All pipeline-generated posts go to "pending approval" status
4. User can approve/reject posts from Pipeline panel or Calendar
5. Pipeline log has a Clear button
6. All tabs use consistent design system (colors, borders, spacing, typography)
7. Settings tab has consolidated AI config section
8. Calendar shows approval status with color coding
