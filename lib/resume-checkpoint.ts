// FEAT-006 / SHOULDFIX-001 / V030-001: pure side-effect driver for the
// resume-accept flow. Extracted from usePipeline.acceptResume so the
// interaction (setters + idea-status flip + startPipeline call) is
// testable without renderHook / jsdom.
//
// V030-001: the daemon no longer keeps per-field refs — the outer loop
// reads live values via functional setState peek. This helper is now
// ref-free: it takes setters + getIdeas() only.

import type { PipelineCheckpoint } from './pipeline-checkpoint';
import type { Idea } from '../types/mashup';

export interface ApplyResumeDeps {
  /** State setters for the four pipeline settings we snapshot. */
  setPipelineDelayState: (v: number) => void;
  setPipelineContinuous: (v: boolean) => void;
  setPipelineIntervalState: (v: number) => void;
  setPipelineTargetDaysState: (v: number) => void;
  /** Live reader over the ideas list; the in-flight idea is looked up by id. */
  getIdeas: () => Idea[];
  /** Flip status back to 'idea' so startPipeline re-runs the in-flight idea. */
  updateIdeaStatus: (id: string, status: 'idea' | 'in-work' | 'done') => void;
  /** Clears the resume prompt. */
  setPendingResume: (v: null) => void;
  /** Kicks the pipeline run. */
  startPipeline: () => void | Promise<void>;
}

/**
 * Apply a resume checkpoint: push snapshot settings through setters,
 * flip the in-flight idea back to 'idea' if still 'in-work', clear the
 * prompt, call startPipeline.
 *
 * No-ops if cp is null — matches the early-return in the React wrapper.
 */
export function applyResumeCheckpoint(
  cp: PipelineCheckpoint | null,
  deps: ApplyResumeDeps,
): void {
  if (!cp) return;

  deps.setPipelineDelayState(cp.settings.delay);
  deps.setPipelineContinuous(cp.settings.continuous);
  deps.setPipelineIntervalState(cp.settings.interval);
  deps.setPipelineTargetDaysState(cp.settings.targetDays);

  const idea = deps.getIdeas().find(i => i.id === cp.ideaId);
  if (idea && idea.status === 'in-work') deps.updateIdeaStatus(cp.ideaId, 'idea');

  deps.setPendingResume(null);
  void deps.startPipeline();
}
