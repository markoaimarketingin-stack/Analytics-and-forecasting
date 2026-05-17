import { Lightbulb, ArrowRight } from 'lucide-react';
import { Suggestion } from '../types';

interface SuggestionCardProps {
  suggestion: Suggestion;
  onClick: () => void;
}

export default function SuggestionCard({ suggestion, onClick }: SuggestionCardProps) {
  return (
    <button
      onClick={onClick}
      className="card hover:shadow-lg transition-all text-left hover:border-zinc-700 group bg-zinc-950"
    >
      <div className="flex items-start gap-3 mb-2">
        <Lightbulb size={20} className="text-zinc-300 flex-shrink-0 mt-1" />
        <h4 className="font-semibold text-white group-hover:text-zinc-200 transition-colors">
          {suggestion.title}
        </h4>
      </div>
      <p className="text-sm text-zinc-400 mb-3">{suggestion.description}</p>
      <p className="text-xs text-zinc-400 italic mb-3 border-l-2 border-zinc-800 pl-2">
        {suggestion.reasoning}
      </p>
      <div className="flex items-center gap-2 text-sm font-medium text-zinc-300 group-hover:gap-3 transition-all">
        Take action
        <ArrowRight size={16} />
      </div>
    </button>
  );
}

