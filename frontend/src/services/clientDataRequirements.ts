type AgentDatasetKey = 'forecast' | 'scenario' | 'budget_allocator' | 'attribution' | 'cohort' | 'funnel';

const AGENT_REQUIREMENTS: Record<AgentDatasetKey, string[][]> = {
  forecast: [['campaigns']],
  scenario: [['campaigns']],
  budget_allocator: [['campaigns']],
  attribution: [['campaigns'], ['events'], ['transactions']],
  cohort: [['customers'], ['retention'], ['transactions']],
  funnel: [['campaigns', 'events']],
};

const DATASET_LABELS: Record<string, string> = {
  campaigns: 'Campaigns',
  events: 'Events',
  customers: 'Customers',
  retention: 'Retention',
  transactions: 'Transactions',
};

function isClientUploadSource(source?: string): boolean {
  return (source || '').trim().toLowerCase() === 'client_uploads';
}

function normalizeDatasetKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '_');
}

function toDatasetLabel(dataset: string): string {
  return DATASET_LABELS[dataset] || dataset.charAt(0).toUpperCase() + dataset.slice(1);
}

function joinDatasetLabels(datasets: string[]): string {
  if (datasets.length <= 1) {
    return datasets[0] ? toDatasetLabel(datasets[0]) : '';
  }
  if (datasets.length === 2) {
    return `${toDatasetLabel(datasets[0])} or ${toDatasetLabel(datasets[1])}`;
  }
  const allButLast = datasets.slice(0, -1).map(toDatasetLabel).join(', ');
  return `${allButLast}, or ${toDatasetLabel(datasets[datasets.length - 1])}`;
}

function parseMissingDatasetsFromError(raw?: string): string[] {
  const text = (raw || '').trim();
  if (!text) return [];

  const normalized = text.replace(/\s+/g, ' ');
  const match = normalized.match(/missing[^:]*:\s*([^.]+)/i);
  if (!match?.[1]) return [];

  return match[1]
    .split(',')
    .map((item) => normalizeDatasetKey(item))
    .filter(Boolean);
}

export function hasRequiredClientDatasets(
  agent: AgentDatasetKey,
  sources: Record<string, string> | undefined,
  clientId?: string,
): boolean {
  if (!clientId) return true;
  if (!sources) return false;

  const requirementGroups = AGENT_REQUIREMENTS[agent] || [];
  if (requirementGroups.length === 0) return true;

  return requirementGroups.every((group) => group.some((dataset) => isClientUploadSource(sources[dataset])));
}

export function getMissingRequiredDatasets(
  agent: AgentDatasetKey,
  sources: Record<string, string> | undefined,
  clientId?: string,
): string[] {
  if (!clientId) return [];
  const requirementGroups = AGENT_REQUIREMENTS[agent] || [];

  return requirementGroups
    .filter((group) => !group.some((dataset) => isClientUploadSource(sources?.[dataset])))
    .flatMap((group) => group);
}

export function toFriendlyDataRequirementError(
  agentLabel: string,
  fallbackAgent: AgentDatasetKey,
  rawError?: string,
  fallbackMissingDatasets: string[] = [],
): string {
  const parsedMissing = parseMissingDatasetsFromError(rawError);
  const effectiveMissing = Array.from(
    new Set(parsedMissing.length > 0 ? parsedMissing : fallbackMissingDatasets.map(normalizeDatasetKey)),
  );

  if (effectiveMissing.length > 0) {
    return [
      `${agentLabel} cannot run because required client data is missing.`,
      `Required dataset${effectiveMissing.length > 1 ? 's' : ''}: ${joinDatasetLabels(effectiveMissing)}.`,
      'Please open Supervisor > Train Model, upload the required file(s) in the matching dataset category, and run the analysis again.',
    ].join(' ');
  }

  const text = (rawError || '').trim();
  if (text) {
    return text;
  }

  const defaultGroups = AGENT_REQUIREMENTS[fallbackAgent] || [];
  const defaultDatasets = defaultGroups.flat();
  if (defaultDatasets.length > 0) {
    return [
      `${agentLabel} cannot run because required client data is missing.`,
      `Please upload ${joinDatasetLabels(defaultDatasets)} in Supervisor > Train Model, then try again.`,
    ].join(' ');
  }

  return rawError?.trim() || `${agentLabel} is currently unavailable. Please upload the required dataset in Supervisor > Train Model and try again.`;
}
