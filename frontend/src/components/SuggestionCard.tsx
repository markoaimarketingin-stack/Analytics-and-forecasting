import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { UISuggestionItem } from '../types';

interface SuggestionCardProps {
  item: UISuggestionItem;
  onExecute: (item: UISuggestionItem) => void;
  onIgnore: (id: string) => void;
}

function inferActionTag(item: UISuggestionItem): string {
  const text = `${item.title} ${item.description} ${item.prompt}`.toUpperCase();
  if (text.includes('DECREAS') || text.includes('REDUC') || text.includes('CUT')) return 'DECREASE';
  if (text.includes('INCREAS') || text.includes('BOOST') || text.includes('SCALE')) return 'INCREASE';
  if (text.includes('REALLOCAT') || text.includes('SHIFT') || text.includes('MOVE')) return 'REALLOCATE';
  if (text.includes('PAUSE') || text.includes('STOP')) return 'PAUSE';
  if (text.includes('TEST') || text.includes('EXPERIMENT') || text.includes('A/B')) return 'TEST';
  if (text.includes('OPTIM')) return 'OPTIMIZE';
  if (text.includes('FORECAST') || text.includes('PREDICT')) return 'FORECAST';
  if (text.includes('ANALYS') || text.includes('COHORT') || text.includes('FUNNEL')) return 'ANALYZE';
  return 'ACTION';
}

function inferPriority(item: UISuggestionItem): 'HIGH' | 'MEDIUM' | 'LOW' {
  const text = `${item.title} ${item.description} ${item.prompt}`.toLowerCase();
  const highSignals = ['urgent', 'critical', 'immediately', 'dropoff', 'churn', 'failure', 'loss', 'decline', 'spike', 'error', 'risk', 'budget', 'roas', 'roi'];
  const mediumSignals = ['optimize', 'improve', 'refresh', 'experiment', 'test', 'enhance', 'opportunity', 'boost'];
  if (highSignals.some(s => text.includes(s))) return 'HIGH';
  if (mediumSignals.some(s => text.includes(s))) return 'MEDIUM';
  return 'LOW';
}

function inferCategory(item: UISuggestionItem): string {
  const src = (item.source || '').toUpperCase();
  if (src.includes('BUDGET') || src.includes('ALLOCAT')) return 'BUDGET PLAN';
  if (src.includes('FUNNEL')) return 'FUNNEL PLAN';
  if (src.includes('COHORT')) return 'COHORT PLAN';
  if (src.includes('FORECAST')) return 'FORECAST PLAN';
  if (src.includes('ATTRIBUT')) return 'ATTRIBUTION PLAN';
  const text = `${item.title} ${item.description}`.toUpperCase();
  if (text.includes('AD-SET') || text.includes('ADSET') || text.includes('AD SET')) return 'AD-SET PLAN';
  if (text.includes('CAMPAIGN')) return 'CAMPAIGN PLAN';
  if (text.includes('CHANNEL')) return 'CHANNEL PLAN';
  return src ? `${src} PLAN` : 'ANALYSIS PLAN';
}

function getExecuteButtonText(item: UISuggestionItem, category: string, isExecuted: boolean): string {
  if (isExecuted) return 'Executing…';
  const cat = category.toUpperCase();
  if (cat.includes('BUDGET') || cat.includes('AD-SET') || cat.includes('ADSET')) {
    return 'Apply budget';
  }
  if (cat.includes('FORECAST')) {
    return 'Run Forecast';
  }
  if (cat.includes('FUNNEL')) {
    return 'Analyze Funnel';
  }
  if (cat.includes('COHORT')) {
    return 'Analyze Retention';
  }
  return 'Execute';
}

export default function SuggestionCard({ item, onExecute, onIgnore }: SuggestionCardProps) {
  const [logicOpen, setLogicOpen] = useState(false);
  const [impactOpen, setImpactOpen] = useState(false);

  const priority = inferPriority(item);
  const actionTag = inferActionTag(item);
  const category = inferCategory(item);
  const isExecuted = item.status === 'implemented' || item.status === 'in_progress';

  const detailedLogic = item.description ||
    'This recommendation is based on performance patterns detected across your active campaigns and historical data segments.';

  const expectedImpact = item.expectedImpact ||
    'Expected to improve overall efficiency metrics within the next 7–14 days based on current trend analysis.';

  return (
    <div className="suggestion-card-v2">
      {/* ── Header ───────────────────────────────────────────── */}
      <div className="suggestion-card-v2-header">
        <h3 className="suggestion-card-v2-title" title={item.title}>{item.title}</h3>
        <span className={`suggestion-card-v2-action-tag ${actionTag.toLowerCase()}`}>{actionTag}</span>
      </div>

      {/* ── Meta row ─────────────────────────────────────────── */}
      <div className="suggestion-card-v2-meta">
        <span className={`suggestion-card-v2-priority ${priority.toLowerCase()}`}>{priority} PRIORITY</span>
        <span className="suggestion-card-v2-sep">AD-SET PLAN</span>
      </div>

      {/* ── Accordion: Detailed Logic ─────────────────────────── */}
      <div className="w-full">
        <button
          className="suggestion-card-v2-accordion"
          onClick={() => setLogicOpen(v => !v)}
          aria-expanded={logicOpen}
        >
          <span>Detailed logic</span>
          {logicOpen
            ? <ChevronUp className="h-4 w-4 flex-shrink-0" />
            : <ChevronDown className="h-4 w-4 flex-shrink-0" />}
        </button>
        {logicOpen && (
          <div className="suggestion-card-v2-accordion-body">
            {detailedLogic}
          </div>
        )}
      </div>

      {/* ── Accordion: Expected Impact ─────────────────────────── */}
      <div className="w-full">
        <button
          className="suggestion-card-v2-accordion"
          onClick={() => setImpactOpen(v => !v)}
          aria-expanded={impactOpen}
        >
          <span>Expected impact</span>
          {impactOpen
            ? <ChevronUp className="h-4 w-4 flex-shrink-0" />
            : <ChevronDown className="h-4 w-4 flex-shrink-0" />}
        </button>
        {impactOpen && (
          <div className="suggestion-card-v2-accordion-body">
            {expectedImpact}
          </div>
        )}
      </div>

      {/* ── Footer ────────────────────────────────────────────── */}
      <div className="suggestion-card-v2-footer">
        <div className="suggestion-card-v2-status">
          <span>Status: <strong>{(item.status || 'pending').toUpperCase()}</strong></span>
          <span className="suggestion-card-v2-sep">•</span>
          <span>Window: Last 7 days</span>
        </div>

        <div className="suggestion-card-v2-actions">
          <button
            className="suggestion-card-v2-btn-ignore"
            onClick={() => onIgnore(item.id)}
            disabled={isExecuted}
            title="Move to end of queue — not removed"
          >
            Ignore
          </button>
          <button
            className="suggestion-card-v2-btn-execute"
            onClick={() => onExecute(item)}
            disabled={isExecuted}
            title="Execute this suggestion"
          >
            {getExecuteButtonText(item, category, isExecuted)}
          </button>
        </div>
      </div>
    </div>
  );
}

