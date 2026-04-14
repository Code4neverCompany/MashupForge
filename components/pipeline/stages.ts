import {
  Lightbulb,
  TrendingUp,
  Sparkles,
  Image as ImageIcon,
  Tag,
  Edit3,
  Calendar,
  Send,
} from 'lucide-react';

export type PipelineToggleKey =
  | 'pipelineAutoTag'
  | 'pipelineAutoCaption'
  | 'pipelineAutoSchedule'
  | 'pipelineAutoPost';

export type Stage = {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  matchStep?: string;
  toggleKey?: PipelineToggleKey;
};

export const STAGES: Stage[] = [
  { key: 'idea', label: 'Idea', icon: Lightbulb, matchStep: 'Updating status' },
  { key: 'trending', label: 'Trending', icon: TrendingUp, matchStep: 'Researching trending' },
  { key: 'prompt', label: 'Prompt', icon: Sparkles, matchStep: 'Expanding idea' },
  { key: 'image', label: 'Image', icon: ImageIcon, matchStep: 'Generating' },
  { key: 'tag', label: 'Tag', icon: Tag, matchStep: 'Tagging', toggleKey: 'pipelineAutoTag' },
  { key: 'caption', label: 'Caption', icon: Edit3, matchStep: 'Captioning', toggleKey: 'pipelineAutoCaption' },
  { key: 'schedule', label: 'Schedule', icon: Calendar, matchStep: 'Scheduling', toggleKey: 'pipelineAutoSchedule' },
  { key: 'post', label: 'Post', icon: Send, matchStep: 'Posting', toggleKey: 'pipelineAutoPost' },
];
