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
      className="card hover:shadow-lg transition-all text-left hover:border-blue-400 group"
    >
      <div className="flex items-start gap-3 mb-2">
        <Lightbulb size={20} className="text-blue-600 flex-shrink-0 mt-1" />
        <h4 className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
          {suggestion.title}
        </h4>
      </div>
      <p className="text-sm text-gray-600 mb-3">{suggestion.description}</p>
      <p className="text-xs text-gray-500 italic mb-3 border-l-2 border-blue-200 pl-2">
        {suggestion.reasoning}
      </p>
      <div className="flex items-center gap-2 text-sm font-medium text-blue-600 group-hover:gap-3 transition-all">
        Take action
        <ArrowRight size={16} />
      </div>
    </button>
  );
}

