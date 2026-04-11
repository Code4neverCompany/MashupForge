# Fix Instagram Carousel Image Cropping — Server-Side Image Prep

**Problem:** When posting carousel images to Instagram, the images get cropped and watermarks near edges are cut off. Instagram enforces aspect ratios between 4:5 (0.8) and 1.91:1. Images outside this range are center-cropped, cutting off watermarks.

**Root cause:** The `/api/social/post` route sends raw Leonardo URLs directly to the Instagram Graph API. No server-side image preprocessing ensures images fit Instagram's accepted aspect ratios. The watermark padding (3% of canvas width) places watermarks too close to edges for Instagram's crop.

**Fix:** Add server-side image preprocessing in the post route that pads/resizes images to a safe Instagram aspect ratio (4:5 portrait or 1:1 square) before uploading.

---

## Tasks

### Task 1: Install sharp for server-side image processing

```bash
cd ~/projects/Multiverse-Mashup-Studio_09_04_26_13-14
npm install sharp
```

### Task 2: Add image preprocessing function in `/api/social/post/route.ts`

Add a function that takes an image buffer and returns a new buffer padded to fit Instagram's accepted ratios:

```typescript
import sharp from 'sharp';

/**
 * Pad an image to fit Instagram's accepted aspect ratio range (4:5 to 1.91:1).
 * If the image is already in range, return as-is.
 * If too tall (narrower than 4:5 = 0.8), add horizontal letterboxing.
 * If too wide (wider than 1.91:1), add vertical letterboxing.
 * Letterbox color: black (#000000).
 */
async function prepareForInstagram(buffer: Buffer): Promise<Buffer> {
  const meta = await sharp(buffer).metadata();
  const { width = 1080, height = 1080 } = meta;
  const ratio = width / height;
  
  const MIN_RATIO = 4 / 5;   // 0.8 — portrait
  const MAX_RATIO = 1.91;    // landscape

  if (ratio >= MIN_RATIO && ratio <= MAX_RATIO) {
    return buffer; // Already in range
  }

  let newWidth: number, newHeight: number;
  
  if (ratio < MIN_RATIO) {
    // Too tall — add horizontal padding
    newHeight = height;
    newWidth = Math.ceil(height * MIN_RATIO);
  } else {
    // Too wide — add vertical padding
    newWidth = width;
    newHeight = Math.ceil(width / MAX_RATIO);
  }

  return sharp(buffer)
    .resize({
      width: newWidth,
      height: newHeight,
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 1 },
      position: 'center',
    })
    .jpeg({ quality: 95 })
    .toBuffer();
}
```

### Task 3: Apply preprocessing before Instagram upload

In the Instagram section of the POST handler, apply `prepareForInstagram` to each image buffer BEFORE uploading to uguu or passing the URL to Instagram.

Specifically, modify the loop at L57-79 (`for (const item of imageItems)`) — for Instagram, preprocess the buffer:

```typescript
// Inside the instagram block, before the upload-to-uguu logic:
if (platforms.includes('instagram')) {
  for (const item of imageItems) {
    item.buffer = await prepareForInstagram(item.buffer);
    item.mimeType = 'image/jpeg';
  }
}
```

Place this preprocessing BEFORE the `igMediaUrls` loop so the padded images get uploaded.

### Task 4: Also increase watermark padding (client-side)

In `hooks/useImageGeneration.ts`, line 39, increase padding from 3% to 8%:

```typescript
// Before:
const padding = canvas.width * 0.03;
// After:
const padding = canvas.width * 0.08;
```

This gives the watermark more breathing room even if Instagram applies minor adjustments.

---

## Files to Modify

| File | Change |
|------|--------|
| `package.json` | Add `sharp` dependency |
| `app/api/social/post/route.ts` | Add `prepareForInstagram()` function, apply before IG upload |
| `hooks/useImageGeneration.ts` | Increase watermark padding from 3% to 8% |

## Acceptance Criteria

1. Images posted to Instagram are never cropped — they fit within Instagram's accepted ratio range
2. Watermarks remain fully visible after posting
3. Portrait images (like 9:16) get black side-bars instead of being cropped
4. Landscape images (like 16:9) get black top/bottom bars instead of being cropped
5. Images already in the safe range (4:5 to 1.91:1) pass through unchanged
6. The fix only applies to Instagram — Twitter and Pinterest use their own sizing
