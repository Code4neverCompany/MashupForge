'use client';

import { useState, useCallback } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { GripVertical } from 'lucide-react';
import type { PostItem } from '@/lib/carouselView';

export interface DndMoveHandler {
  moveImageToCarousel: (imageId: string, sourceCarouselId: string | null, targetCarouselId: string) => void;
  moveImageToNewGroup: (imageId: string, sourceCarouselId: string | null) => void;
}

interface PostReadyDndGridProps {
  children: React.ReactNode;
  postItems: PostItem[];
  onMove: DndMoveHandler;
}

export interface DragData {
  imageId: string;
  sourceCarouselId: string | null;
  imageUrl?: string;
}

export function DraggableSingleWrapper({
  imageId,
  imageUrl,
  children,
}: {
  imageId: string;
  imageUrl?: string;
  children: React.ReactNode;
}) {
  const dragData: DragData = { imageId, sourceCarouselId: null, imageUrl };
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: `drag-single-${imageId}`,
    data: dragData,
  });
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `drop-single-${imageId}`,
    data: { carouselId: `new-group-${imageId}` },
  });

  return (
    <div
      ref={(node) => { setDragRef(node); setDropRef(node); }}
      className={`relative ${isDragging ? 'opacity-40' : ''} ${isOver ? 'ring-2 ring-[#00e6ff]/60 rounded-2xl' : ''}`}
    >
      <button
        type="button"
        {...listeners}
        {...attributes}
        className="absolute top-3 right-12 z-10 p-1 rounded bg-black/60 text-zinc-500 hover:text-zinc-200 opacity-0 hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing"
        aria-label="Drag to reorder"
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical className="w-4 h-4" />
      </button>
      {children}
    </div>
  );
}

export function PostReadyDndGrid({ children, postItems, onMove }: PostReadyDndGridProps) {
  const [activeData, setActiveData] = useState<DragData | null>(null);

  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: { distance: 8 },
  });
  const touchSensor = useSensor(TouchSensor, {
    activationConstraint: { delay: 200, tolerance: 5 },
  });
  const keyboardSensor = useSensor(KeyboardSensor);
  const sensors = useSensors(pointerSensor, touchSensor, keyboardSensor);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const data = event.active.data.current as DragData | undefined;
    if (data) setActiveData(data);
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveData(null);
    const { active, over } = event;
    if (!over) return;

    const source = active.data.current as DragData | undefined;
    if (!source) return;

    const targetCarouselId = over.data.current?.carouselId as string | undefined;
    if (!targetCarouselId) return;

    if (source.sourceCarouselId === targetCarouselId) return;

    onMove.moveImageToCarousel(source.imageId, source.sourceCarouselId, targetCarouselId);
  }, [onMove]);

  const handleDragCancel = useCallback(() => {
    setActiveData(null);
  }, []);

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      {children}
      <DragOverlay dropAnimation={null}>
        {activeData?.imageUrl && (
          <div className="opacity-60 scale-95 shadow-2xl border-2 border-[#00e6ff]/60 rounded-lg overflow-hidden pointer-events-none">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={activeData.imageUrl}
              alt="Dragging"
              className="h-32 w-32 object-cover"
            />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
