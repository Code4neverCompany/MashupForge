// @vitest-environment jsdom
//
// FEAT-2: Post-Ready DnD between carousels — unit tests for the
// move handler logic and DraggableSingleWrapper / DroppableImageStrip.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import type { CarouselGroup } from '@/types/mashup';

beforeEach(() => {
  cleanup();
});

function makeGroups(...specs: [string, string[]][]): CarouselGroup[] {
  return specs.map(([id, imageIds]) => ({ id, imageIds }));
}

describe('FEAT-2 — DnD move handler logic', () => {
  function buildHandler(initialGroups: CarouselGroup[]) {
    let groups = JSON.parse(JSON.stringify(initialGroups)) as CarouselGroup[];
    const updateSettings = vi.fn((patch: { carouselGroups: CarouselGroup[] }) => {
      groups = patch.carouselGroups;
    });

    const moveImageToCarousel = (
      imageId: string,
      sourceCarouselId: string | null,
      targetCarouselId: string,
    ) => {
      const working = groups.map((g) => ({ ...g, imageIds: [...g.imageIds] }));

      if (sourceCarouselId) {
        const src = working.find((g) => g.id === sourceCarouselId);
        if (src) src.imageIds = src.imageIds.filter((id) => id !== imageId);
      }

      if (targetCarouselId.startsWith('new-group-')) {
        const targetImageId = targetCarouselId.replace('new-group-', '');
        if (targetImageId === imageId) return;
        working.push({ id: `manual-${targetImageId}`, imageIds: [targetImageId, imageId] });
      } else {
        const tgt = working.find((g) => g.id === targetCarouselId);
        if (tgt) {
          if (tgt.imageIds.includes(imageId)) return;
          tgt.imageIds.push(imageId);
        } else {
          return;
        }
      }

      const cleaned = working.filter((g) => g.imageIds.length >= 2);
      updateSettings({ carouselGroups: cleaned });
    };

    return { moveImageToCarousel, updateSettings, getGroups: () => groups };
  }

  it('moves image from carousel A to carousel B', () => {
    const { moveImageToCarousel, getGroups } = buildHandler(
      makeGroups(['A', ['img1', 'img2', 'img3']], ['B', ['img4', 'img5']]),
    );
    moveImageToCarousel('img1', 'A', 'B');
    const groups = getGroups();
    expect(groups.find((g) => g.id === 'A')!.imageIds).toEqual(['img2', 'img3']);
    expect(groups.find((g) => g.id === 'B')!.imageIds).toEqual(['img4', 'img5', 'img1']);
  });

  it('auto-dissolves source carousel when it drops below 2 images', () => {
    const { moveImageToCarousel, getGroups } = buildHandler(
      makeGroups(['A', ['img1', 'img2']], ['B', ['img3', 'img4']]),
    );
    moveImageToCarousel('img1', 'A', 'B');
    const groups = getGroups();
    expect(groups.find((g) => g.id === 'A')).toBeUndefined();
    expect(groups.find((g) => g.id === 'B')!.imageIds).toEqual(['img3', 'img4', 'img1']);
  });

  it('creates new group when single dropped onto another single', () => {
    const { moveImageToCarousel, getGroups } = buildHandler([]);
    moveImageToCarousel('imgA', null, 'new-group-imgB');
    const groups = getGroups();
    expect(groups).toHaveLength(1);
    expect(groups[0].id).toBe('manual-imgB');
    expect(groups[0].imageIds).toEqual(['imgB', 'imgA']);
  });

  it('same-source-target is guarded at the DndGrid level (handler removes + re-adds)', () => {
    const { moveImageToCarousel, getGroups } = buildHandler(
      makeGroups(['A', ['img1', 'img2']]),
    );
    moveImageToCarousel('img1', 'A', 'A');
    const g = getGroups().find((g) => g.id === 'A');
    expect(g).toBeDefined();
    expect(g!.imageIds).toContain('img1');
  });

  it('no-ops when image already in target', () => {
    const { moveImageToCarousel, updateSettings } = buildHandler(
      makeGroups(['A', ['img1', 'img2']], ['B', ['img1', 'img3']]),
    );
    moveImageToCarousel('img1', 'A', 'B');
    expect(updateSettings).not.toHaveBeenCalled();
  });

  it('no-ops when dropping a single onto itself', () => {
    const { moveImageToCarousel, updateSettings } = buildHandler([]);
    moveImageToCarousel('imgA', null, 'new-group-imgA');
    expect(updateSettings).not.toHaveBeenCalled();
  });

  it('no-ops when target carousel does not exist', () => {
    const { moveImageToCarousel, updateSettings } = buildHandler([]);
    moveImageToCarousel('img1', null, 'nonexistent');
    expect(updateSettings).not.toHaveBeenCalled();
  });

  it('handles moving from carousel to a new-group (single target)', () => {
    const { moveImageToCarousel, getGroups } = buildHandler(
      makeGroups(['A', ['img1', 'img2', 'img3']]),
    );
    moveImageToCarousel('img1', 'A', 'new-group-imgX');
    const groups = getGroups();
    expect(groups.find((g) => g.id === 'A')!.imageIds).toEqual(['img2', 'img3']);
    expect(groups.find((g) => g.id === 'manual-imgX')!.imageIds).toEqual(['imgX', 'img1']);
  });
});

describe('FEAT-2 — DraggableSingleWrapper rendering', () => {
  it('renders children and drag handle', async () => {
    const { DraggableSingleWrapper } = await import('@/components/postready/PostReadyDndGrid');
    const { DndContext } = await import('@dnd-kit/core');

    const { container } = render(
      <DndContext>
        <DraggableSingleWrapper imageId="img-1" imageUrl="https://cdn.example.com/1.jpg">
          <div data-testid="child">Card content</div>
        </DraggableSingleWrapper>
      </DndContext>,
    );

    expect(container.querySelector('[data-testid="child"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="Drag to reorder"]')).not.toBeNull();
  });
});
