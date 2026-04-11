# Fix GPT-Image-1.5 "No Outputs" Issue

**Problem:** When generating images with `gpt-image-1.5` via the Leonardo v2 API, some generations complete but return no images. The current code treats this as a hard failure with no retry, leaving placeholder images stuck in "generating" state.

**Root causes (likely one or more):**
1. GPT-1.5 has stricter content moderation — prompts that pass on other models get silently filtered, returning `COMPLETE` with 0 images
2. The v2 API response shape for GPT-1.5 may differ from other models (different field names for images)
3. No retry mechanism for transient failures
4. The `quality` parameter is sent but never passed from the client (L328-336 in useImageGeneration.ts doesn't send `quality`)

---

## Tasks

### Task 1: Add `quality` parameter to client-side generation request

In `hooks/useImageGeneration.ts`, the request body at L328-336 doesn't include `quality`. The server route defaults to `MEDIUM`, but the user might want to control this. Add it:

```typescript
body: JSON.stringify({
  prompt: modelPrompt,
  negative_prompt: generatedNegativePrompt,
  modelId: selectedModel,
  width: dims.width,
  height: dims.height,
  styleIds: leonardoStyleUuids,
  apiKey: settings.apiKeys.leonardo,
  quality: selectedModel === 'gpt-image-1.5' ? (options?.quality || 'MEDIUM') : undefined,
})
```

Check if there's a second generation path (around L500+) that also needs the same fix.

### Task 2: Add retry logic in the polling route (`app/api/leonardo/[id]/route.ts`)

When the v2 API returns `COMPLETE` with 0 images, it might be a transient issue. Log the full response and return a special status so the client can retry:

```typescript
if (generation.status === 'COMPLETE') {
  const images = generation.generated_images || generation.images || [];
  if (images.length > 0) {
    const imageUrl = images[0].motionMP4URL || images[0].url;
    return NextResponse.json({ status: 'COMPLETE', url: imageUrl, imageId: images[0].id });
  }
  // Log the FULL response shape so we can debug field name mismatches
  console.error('[Leonardo] COMPLETE but 0 images. Full response:', JSON.stringify(getData).slice(0, 1000));
  console.error('[Leonardo] Generation object keys:', Object.keys(generation));
  return NextResponse.json({ status: 'FAILED', error: 'Generation complete but no images found' });
}
```

### Task 3: Add retry logic on client-side for failed generations

In `hooks/useImageGeneration.ts`, the catch block at L399 catches errors but just logs them — the placeholder stays stuck. Add retry logic:

Around L399-401, change:
```typescript
} catch (imgError: any) {
  console.error(`Error generating image ${i + 1} with ${modelName}:`, imgError);
}
```

To:
```typescript
} catch (imgError: any) {
  console.error(`Error generating image ${i + 1} with ${modelName}:`, imgError);
  // Update the placeholder to show the error instead of being stuck "generating"
  const errMsg = imgError?.message || 'Generation failed';
  setImages(prev => prev.map(img => img.id === placeholders[i].id ? {
    ...img,
    status: 'error',
    error: errMsg,
  } : img));
}
```

Check if the `GeneratedImage` type has an `error` field. If not, add it to `types/mashup.ts`.

### Task 4: Handle GPT-1.5 content filter responses gracefully

Add detection for content filter responses. When GPT-1.5 filters a prompt, it typically returns COMPLETE with 0 images. Show a clear message to the user:

In the error handling, detect the pattern and show a helpful message:
```typescript
if (errMsg.includes('no images found')) {
  // Likely a content filter hit — show actionable message
  setImages(prev => prev.map(img => img.id === placeholders[i].id ? {
    ...img,
    status: 'error',
    error: `GPT-1.5 filtered this prompt. Try rephrasing to avoid potentially sensitive content.`,
  } : img));
}
```

---

## Files to Modify

| File | Change |
|------|--------|
| `hooks/useImageGeneration.ts` | Send `quality` param, add error state for failed placeholders, detect content filter |
| `app/api/leonardo/[id]/route.ts` | Enhanced logging for empty-image responses |
| `types/mashup.ts` | Add `error?: string` field to `GeneratedImage` if not present |

## Key Question to Answer

Check the `GeneratedImage` type in `types/mashup.ts` — does it already have an `error` field? Does it already have a status value for `'error'`? Check what status values are used.

## Acceptance Criteria

1. When GPT-1.5 returns COMPLETE with 0 images, the user sees a clear error message (not a stuck spinner)
2. The error message distinguishes between "content filter" and other failures
3. The `quality` parameter is properly sent for GPT-1.5 generations
4. Server logs include the full v2 response shape for debugging empty-image cases
