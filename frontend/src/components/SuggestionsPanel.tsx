import { Suggestion } from '../types';
import SuggestionCard from './SuggestionCard';

interface SuggestionsPanelProps {
  suggestions: Suggestion[];
  onSuggestionClick: (suggestion: Suggestion) => void;
}

export default function SuggestionsPanel({ suggestions, onSuggestionClick }: SuggestionsPanelProps) {
  if (suggestions.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-white mb-4">Suggested Actions</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {suggestions.map((suggestion, idx) => (
            <SuggestionCard
              key={idx}
              suggestion={suggestion}
              onClick={() => onSuggestionClick(suggestion)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

