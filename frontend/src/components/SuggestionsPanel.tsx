import type { UISuggestionItem as Suggestion } from '../types'; // Use UISuggestionItem

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
            <button
              key={suggestion.id || idx}
              onClick={() => onSuggestionClick(suggestion)}
              className="card hover:shadow-lg transition-all text-left hover:border-zinc-700 group bg-zinc-950 p-4"
            >
              <div className="flex items-start gap-3 mb-2">
                <h4 className="font-semibold text-white">{suggestion.title}</h4>
              </div>
              <p className="text-sm text-zinc-400 mb-2">{suggestion.description}</p>
              <p className="text-xs text-zinc-400 italic mb-2 border-l-2 border-zinc-800 pl-2">Source: {suggestion.source}</p>
              <div className="flex items-center gap-2 text-sm font-medium text-zinc-300 group-hover:gap-3 transition-all">Take action</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
