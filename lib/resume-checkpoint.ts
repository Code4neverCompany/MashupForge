// FEAT-006 / SHOULDFIX-001: pure side-effect driver for the resume-accept
// flow. Extracted from usePipeline.acceptResume so the interaction
// (setter + ref sync + idea-status flip + startPipeline call) is
// testable without renderHook / jsdom.
//
// acceptResume stays a 1-line React wrapper over this helper.

import type { PipelineCheckpoint } from './pipeline-checkpoint';
import type { Idea } from '../types/mashup';

export interface ApplyResumeDeps {
  /** State setters for the four pipeline settings we snapshot. */
  setPipelineDelayState: (v: number) => void;
  setPipelineContinuous: (v: boolean) => void;
  setPipelineIntervalState: (v: number) => void;
  setPipelineTargetDaysState: (v: number) => void;
  /** Matching refs. Updated synchronously because startPipeline reads refs. */
  pipelineDelayRef: { current: number };
  pipelineContinuousRef: { current: boolean };
  pipelineIntervalRef: { current: number };
  pipelineTargetDaysRef: { current: number };
  /** Current ideas snapshot; the in-flight idea is looked up by id. */
  ideasRef: { current: Idea[] };
  /** Flip status back to 'idea' so startPipeline re-runs the in-flight idea. */
  updateIdeaStatus: (id: string, status: 'idea' | 'in-work' | 'done') => void;
  /** Clears the resume prompt. */
  setPendingResume: (v: null) => void;
  /** Kicks the pipeline run. */
  startPipeline: () => void | Promise<void>;
}

/**
 * Apply a resume checkpoint: snapshot settings → refs + state, flip the
 * in-flight idea back to 'idea' if still 'in-work', clear the prompt,
 * call startPipeline.
 *
 * No-ops if cp is null — matches the early-return in the React wrapper.
 */
export function applyResumeCheckpoint(
  cp: PipelineCheckpoint | null,
  deps: ApplyResumeDeps,
): void {
  if (!cp) return;

  deps.setPipelineDelayState(cp.settings.delay);
  deps.pipelineDelayRef.current = cp.settings.delay;
  deps.setPipelineContinuous(cp.settings.continuous);
  deps.pipelineContinuousRef.current = cp.settings.continuous;
  deps.setPipelineIntervalState(cp.settings.interval);
  deps.pipelineIntervalRef.current = cp.settings.interval;
  deps.setPipelineTargetDaysState(cp.settings.targetDays);
  deps.pipelineTargetDaysRef.current = cp.settings.targetDays;

  const idea = deps.ideasRef.current.find((i) => i.id === cp.ideaId);
  if (idea && idea.status === 'in-work') deps.updateIdeaStatus(cp.ideaId, 'idea');

  deps.setPendingResume(null);
  void deps.startPipeline();
}
