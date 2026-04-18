import { BarChart3, Database, Filter, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { getAgentResults, getFunnelOptions, orchestrateAgents } from '../../services/api';
import {
  getMissingRequiredDatasets,
  hasRequiredClientDatasets,
  toFriendlyDataRequirementError,
} from '../../services/clientDataRequirements';
import AgentHeaderActions from '../shared/AgentHeaderActions';
import type { AgentOrchestrationResult, FunnelAnalysis, FunnelOptions } from '../../types';

interface FunnelWorkspaceProps {
  clientId?: string;
  onRunResult?: (result: AgentOrchestrationResult) => void;
}

export default function FunnelWorkspace({ clientId, onRunResult }: FunnelWorkspaceProps) {
  const [channel, setChannel] = useState('all');
  const [campaignType, setCampaignType] = useState('all');
  const [segment, setSegment] = useState('all');
  const [eventType, setEventType] = useState('all');
  const [timePeriod, setTimePeriod] = useState('month');
  const [options, setOptions] = useState<FunnelOptions | null>(null);
  const [isLoadingOptions, setIsLoadingOptions] = useState(true);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [result, setResult] = useState<FunnelAnalysis | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'channel' | 'segments' | 'timing' | 'revenue' | 'advanced'>('channel');

  useEffect(() => {
    if (!clientId || result) return;
    let cancelled = false;

    const hydrateLastResult = async () => {
      try {
        const raw = await getAgentResults('funnel', clientId);
        if (cancelled) return;

        const response = (raw && typeof raw === 'object') ? (raw as Record<string, unknown>) : {};
        const persisted = response.results;
        const persistedRecord = (persisted && typeof persisted === 'object' && !Array.isArray(persisted))
          ? (persisted as Record<string, unknown>)
          : null;

        const maybeFunnel = persistedRecord?.funnel_analysis ?? persistedRecord;
        if (maybeFunnel && typeof maybeFunnel === 'object' && Object.keys(maybeFunnel as Record<string, unknown>).length > 0) {
          setResult(maybeFunnel as FunnelAnalysis);
        }
      } catch {
        // Keep workspace usable even when hydration fails.
      }
    };

    hydrateLastResult();
    return () => {
      cancelled = true;
    };
  }, [clientId, result]);

  useEffect(() => {
    let cancelled = false;

    const loadOptions = async () => {
      setIsLoadingOptions(true);
      setOptionsError(null);

      try {
        const response = await getFunnelOptions(clientId);
        if (!response.success || !response.data) {
          throw new Error(response.detail || 'Unable to load funnel filter options.');
        }

        if (cancelled) return;
        const loaded = response.data;
        setOptions(loaded);
        setChannel(loaded.defaults.channel || 'all');
        setCampaignType(loaded.defaults.campaign_type || 'all');
        setSegment(loaded.defaults.segment || 'all');
        setEventType(loaded.defaults.event_type || 'all');
        setTimePeriod(loaded.defaults.time_period || 'month');
      } catch (loadError) {
        if (cancelled) return;
        setOptionsError(loadError instanceof Error ? loadError.message : 'Unable to load funnel options.');
      } finally {
        if (!cancelled) {
          setIsLoadingOptions(false);
        }
      }
    };

    loadOptions();
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  const stageRows = useMemo(() => {
    const funnel = result?.funnel;
    if (!funnel) return [];

    if (result.stage_details && result.stage_details.length > 0) {
      return result.stage_details.map((detail) => ({
        key: detail.stage,
        label: formatStageLabel(detail.stage),
        value: detail.value,
        dropoff: detail.dropoff_from_previous_pct,
        conversionFromPrevious: detail.conversion_from_previous_pct,
        conversionFromEntry: detail.conversion_from_entry_pct,
      }));
    }

    const fallbackValues = [
      { key: 'impressions', label: 'Impressions', value: funnel.impressions ?? 0 },
      { key: 'clicks', label: 'Clicks', value: funnel.clicks ?? 0 },
      { key: 'landing_page_views', label: 'Landing Page Views', value: funnel.landing_page_views ?? 0 },
      { key: 'add_to_cart', label: 'Add To Cart', value: funnel.add_to_cart ?? 0 },
      { key: 'purchases', label: 'Purchases', value: funnel.purchases ?? 0 },
    ];

    return fallbackValues.map((stage, index) => {
      const previous = index === 0 ? stage.value : fallbackValues[index - 1].value;
      const dropoff = index === 0 || previous <= 0 ? 0 : ((previous - stage.value) / previous) * 100;
      const conversionFromPrevious = index === 0 ? (stage.value > 0 ? 100 : 0) : previous > 0 ? (stage.value / previous) * 100 : 0;
      const entry = fallbackValues[0].value;
      const conversionFromEntry = entry > 0 ? (stage.value / entry) * 100 : 0;

      return {
        key: stage.key,
        label: stage.label,
        value: stage.value,
        dropoff,
        conversionFromPrevious,
        conversionFromEntry,
      };
    });
  }, [result]);

  const primaryFunnelChart = useMemo(() => {
    if (result?.primary_funnel_chart?.length) {
      return result.primary_funnel_chart;
    }
    return stageRows.map((row) => ({
      stage: row.key,
      stage_label: row.label,
      users: row.value,
      conversion_from_previous: (row.conversionFromPrevious || 0) / 100,
      dropoff_from_previous: (row.dropoff || 0) / 100,
      conversion_from_entry: (row.conversionFromEntry || 0) / 100,
    }));
  }, [result, stageRows]);

  const stageWaterfallChart = useMemo(() => {
    if (result?.stage_waterfall_chart?.length) {
      return result.stage_waterfall_chart;
    }
    return stageRows.slice(1).map((row, idx) => {
      const prev = stageRows[idx];
      const lost = Math.max(0, (prev?.value || 0) - (row.value || 0));
      return {
        transition: `${prev?.key || 'start'}_${row.key}`,
        transition_label: `${prev?.label || 'Start'} -> ${row.label}`,
        lost_users: -lost,
        lost_users_abs: lost,
      };
    });
  }, [result, stageRows]);

  const channelChart = result?.channel_comparison_chart ?? [];
  const segmentChart = result?.segment_comparison_chart ?? [];
  const timingChart = result?.stage_time_chart ?? [];
  const revenueChart = result?.revenue_opportunity_chart ?? [];
  const upliftChart = result?.uplift_scenarios_chart ?? [];

  const segmentOptions = useMemo(() => Array.from(new Set(segmentChart.map((item) => item.segment))), [segmentChart]);
  const segmentLeft = segmentOptions[0] || '';
  const segmentRight = segmentOptions[1] || '';

  const leftFunnel = useMemo(() => segmentChart.filter((item) => item.segment === segmentLeft), [segmentChart, segmentLeft]);
  const rightFunnel = useMemo(() => segmentChart.filter((item) => item.segment === segmentRight), [segmentChart, segmentRight]);

  const optionsSourceLabel = useMemo(() => {
    if (!options?.sources) return '-';
    const values = Object.values(options.sources);
    if (values.length === 0) return '-';
    if (values.every((value) => value === 'supabase')) return 'Supabase';
    if (values.some((value) => value === 'supabase')) return 'Supabase + Local fallback';
    if (values.every((value) => value === 'local')) return 'Local CSV fallback';
    return 'Mixed source';
  }, [options]);
  const hasRequiredClientData = useMemo(
    () => hasRequiredClientDatasets('funnel', options?.sources, clientId),
    [options?.sources, clientId],
  );
  const missingDatasets = useMemo(
    () => getMissingRequiredDatasets('funnel', options?.sources, clientId),
    [options?.sources, clientId],
  );
  const dataRequirementMessage = useMemo(
    () => toFriendlyDataRequirementError('Funnel analysis', 'funnel', '', missingDatasets),
    [missingDatasets],
  );
  const showMissingDataRequirementCard = !isLoadingOptions && Boolean(clientId) && Boolean(options?.sources) && !hasRequiredClientData && !error && !optionsError;

  const runFunnel = async () => {
    if (!hasRequiredClientData) {
      setError(dataRequirementMessage);
      return;
    }

    setIsRunning(true);
    setError(null);

    try {
      const response = await orchestrateAgents({
        intent: 'funnel_analysis',
        agents: ['funnel'],
        client_id: clientId,
        payload: {
          funnel_type: campaignType,
          campaign_type: campaignType,
          channel,
          segment,
          event_type: eventType,
          time_period: timePeriod,
        },
      });

      if (!response.success || !response.data?.success) {
        throw new Error(response.detail || response.data?.errors?.system || 'Failed to run funnel analysis.');
      }

      onRunResult?.(response.data);

      setResult(response.data.funnel_analysis ?? null);
    } catch (runError) {
      const rawMessage = runError instanceof Error ? runError.message : 'Failed to run funnel analysis.';
      setError(toFriendlyDataRequirementError('Funnel analysis', 'funnel', rawMessage, missingDatasets));
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="workspace-surface workspace-modern">
      <div className="workspace-header-glass workspace-header-glass-modern px-8 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="workspace-agent-icon">
              <Filter className="h-7 w-7" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-gray-900">Funnel Agent</h1>
          </div>
          <AgentHeaderActions clientId={clientId} />
        </div>
      </div>

      <div className="workspace-content">
        <div className="mx-auto w-full max-w-6xl space-y-6">
          <div className="workspace-panel">
            <div className="mb-4 flex flex-wrap items-center gap-3 text-xs text-gray-500">
              <span className="workspace-option-pill">
                <Database className="h-3.5 w-3.5" /> Source: {optionsSourceLabel}
              </span>
              {options?.row_counts && (
                <span className="workspace-option-pill">
                  Rows: campaigns {formatCount(options.row_counts.campaigns)} | events {formatCount(options.row_counts.events)}
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <FilterSelect
                label="Channel"
                value={channel}
                onChange={setChannel}
                disabled={isLoadingOptions || !options?.available_filters.channel}
                options={[{ value: 'all', label: 'All Channels' }, ...(options?.channels ?? []).map((item) => ({ value: item, label: item }))]}
              />

              <FilterSelect
                label="Campaign Type"
                value={campaignType}
                onChange={setCampaignType}
                disabled={isLoadingOptions || !options?.available_filters.campaign_type}
                options={[{ value: 'all', label: 'All Campaign Types' }, ...(options?.campaign_types ?? []).map((item) => ({ value: item, label: item }))]}
              />

              <FilterSelect
                label="Customer Segment"
                value={segment}
                onChange={setSegment}
                disabled={isLoadingOptions || !options?.available_filters.segment}
                options={[{ value: 'all', label: 'All Segments' }, ...(options?.segments ?? []).map((item) => ({ value: item, label: item }))]}
              />

              <FilterSelect
                label="Event Type Focus"
                value={eventType}
                onChange={setEventType}
                disabled={isLoadingOptions || !options?.available_filters.event_type}
                options={[{ value: 'all', label: 'All Event Types' }, ...(options?.event_types ?? []).map((item) => ({ value: item, label: item }))]}
              />

              <FilterSelect
                label="Time Period"
                value={timePeriod}
                onChange={setTimePeriod}
                disabled={isLoadingOptions}
                options={(options?.time_periods?.length ? options.time_periods : ['week', 'month', 'quarter', 'year', 'all']).map((period) => ({
                  value: period,
                  label: formatTimePeriodLabel(period),
                }))}
              />

              <div className="flex h-full flex-col">
                <span className="block min-h-[1.75rem] pb-1.5 text-sm font-medium text-transparent select-none">Action</span>
                <button
                  onClick={runFunnel}
                  disabled={isRunning || isLoadingOptions || !hasRequiredClientData}
                  className="workspace-action-btn h-11 w-full whitespace-nowrap bg-gradient-to-r from-blue-600 to-indigo-600 disabled:opacity-60"
                >

                  <span>{isRunning ? 'Running...' : 'Analyze Funnel'}</span>
                </button>
              </div>
            </div>

            <div className="mt-4">
              {isLoadingOptions && <p className="text-sm text-gray-500">Loading available funnel filters...</p>}
              {optionsError && (
                <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
                  <p className="text-sm font-semibold text-amber-900">Data Requirement</p>
                  <p className="mt-1 text-sm text-amber-800">
                    {toFriendlyDataRequirementError('Funnel analysis', 'funnel', optionsError, missingDatasets)}
                  </p>
                </div>
              )}
              {error && (
                <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
                  <p className="text-sm font-semibold text-amber-900">Funnel Unavailable</p>
                  <p className="mt-1 text-sm text-amber-800">{error}</p>
                </div>
              )}
              {showMissingDataRequirementCard && (
                <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
                  <p className="text-sm font-semibold text-amber-900">Data Requirement</p>
                  <p className="mt-1 text-sm text-amber-800">{dataRequirementMessage}</p>
                </div>
              )}

              {/* Intentionally hidden: technical mapping/event-stage notes for cleaner end-user UX. */}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <MetricCard title="Largest Dropoff" value={result?.largest_dropoff?.replace(/_/g, ' ') || '-'} />
            <MetricCard title="Dropoff Percent" value={result ? `${result.dropoff_percent.toFixed(1)}%` : '-'} />
            <MetricCard title="Potential Uplift" value={result ? `${(result.predicted_conversion_uplift_if_fixed * 100).toFixed(1)}%` : '-'} />
            <MetricCard title="Baseline CVR" value={formatPercent(result?.diagnostics?.baseline_conversion_rate)} />
            <MetricCard title="Recoverable Volume" value={formatCount(result?.diagnostics?.estimated_recovered_purchases)} />
          </div>

          <div className="workspace-panel">
            <h3 className="text-lg font-semibold text-gray-900">Main Funnel Graph</h3>
            <p className="mt-1 text-sm text-gray-500">Horizontal funnel view to compare stage volume, conversion, and dropoff.</p>
            <div className="mt-4 h-[320px] w-full">
              {primaryFunnelChart.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={primaryFunnelChart} layout="vertical" margin={{ top: 8, right: 24, left: 24, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis type="number" />
                    <YAxis dataKey="stage_label" type="category" width={120} />
                    <Tooltip formatter={(value: number, name: string) => (name === 'users' ? formatCount(value) : formatPercent(value))} />
                    <Legend />
                    <Bar dataKey="users" name="Users" fill="#10b981" radius={[0, 8, 8, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChart text="Run funnel analysis to render the funnel chart." />
              )}
            </div>
          </div>

          <div className="workspace-panel">
            <h3 className="text-lg font-semibold text-gray-900">Funnel Stages</h3>
            <div className="mt-4 space-y-3">
              {stageRows.length > 0 ? (
                stageRows.map((stage) => (
                  <div key={stage.key} className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-semibold text-gray-900">{stage.label}</span>
                      <span className="font-semibold text-gray-700">{formatCount(stage.value)}</span>
                    </div>
                    <div className="mt-1 text-xs text-gray-500">
                      {stage.dropoff > 0 ? `Dropoff: ${stage.dropoff.toFixed(1)}% | Step conversion: ${stage.conversionFromPrevious.toFixed(1)}%` : 'Entry stage'}
                    </div>
                    <div className="mt-1 text-xs text-gray-500">
                      Conversion from entry: {stage.conversionFromEntry.toFixed(1)}%
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-gray-500">Run funnel analysis to visualize stages and leakage.</p>
              )}
            </div>
          </div>

          <div className="workspace-panel">
            <h3 className="text-lg font-semibold text-gray-900">Stage Conversion Waterfall</h3>
            <p className="mt-1 text-sm text-gray-500">Absolute users lost between stages to reveal the largest bottleneck quickly.</p>
            <div className="mt-4 h-[280px] w-full">
              {stageWaterfallChart.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stageWaterfallChart} margin={{ top: 8, right: 20, left: 20, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="transition_label" tick={{ fontSize: 12 }} interval={0} angle={-15} textAnchor="end" height={66} />
                    <YAxis />
                    <Tooltip formatter={(value: number) => formatCount(Math.abs(value))} />
                    <Bar dataKey="lost_users" name="Users Lost" radius={[8, 8, 0, 0]}>
                      {stageWaterfallChart.map((row) => (
                        <Cell key={row.transition} fill={row.lost_users < 0 ? '#ef4444' : '#10b981'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChart text="Not enough stage data to build waterfall." />
              )}
            </div>
          </div>

          <div className="workspace-panel">
            <div className="flex flex-wrap items-center gap-2">
              <TabButton label="Channel Breakdown" active={activeTab === 'channel'} onClick={() => setActiveTab('channel')} />
              <TabButton label="Segment Comparison" active={activeTab === 'segments'} onClick={() => setActiveTab('segments')} />
              <TabButton label="Time Between Stages" active={activeTab === 'timing'} onClick={() => setActiveTab('timing')} />
              <TabButton label="Revenue Opportunity" active={activeTab === 'revenue'} onClick={() => setActiveTab('revenue')} />
              <TabButton label="Advanced Journey" active={activeTab === 'advanced'} onClick={() => setActiveTab('advanced')} />
            </div>

            {activeTab === 'channel' && (
              <div className="mt-4">
                <h3 className="text-lg font-semibold text-gray-900">Channel Comparison</h3>
                <p className="mt-1 text-sm text-gray-500">Grouped horizontal bars compare click, final conversion, and purchase rates by channel.</p>
                <div className="mt-4 h-[360px] w-full">
                  {channelChart.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={channelChart} layout="vertical" margin={{ top: 8, right: 20, left: 20, bottom: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis type="number" tickFormatter={(val) => `${(Number(val) * 100).toFixed(0)}%`} />
                        <YAxis dataKey="channel" type="category" width={110} />
                        <Tooltip formatter={(value: number) => formatPercent(value)} />
                        <Legend />
                        <Bar dataKey="click_rate" name="Click Rate" fill="#3b82f6" />
                        <Bar dataKey="final_conversion_rate" name="Final Conversion Rate" fill="#10b981" />
                        <Bar dataKey="purchase_rate" name="Purchase Rate" fill="#8b5cf6" />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <EmptyChart text="Channel conversion chart is unavailable for the current filters." />
                  )}
                </div>
              </div>
            )}

            {activeTab === 'segments' && (
              <div className="mt-4">
                <h3 className="text-lg font-semibold text-gray-900">Segment Comparison Dual Funnel</h3>
                <p className="mt-1 text-sm text-gray-500">Side-by-side funnels show which segment moves through stages better.</p>
                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                    <p className="mb-2 text-sm font-semibold text-gray-800">{segmentLeft || 'Segment A'}</p>
                    <div className="h-[280px]">
                      {leftFunnel.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={leftFunnel} layout="vertical" margin={{ top: 8, right: 10, left: 10, bottom: 8 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                            <XAxis type="number" />
                            <YAxis dataKey="stage_label" type="category" width={110} />
                            <Tooltip formatter={(value: number) => formatCount(value)} />
                            <Bar dataKey="users" fill="#10b981" radius={[0, 8, 8, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      ) : (
                        <EmptyChart text="Segment A funnel unavailable." />
                      )}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
                    <p className="mb-2 text-sm font-semibold text-gray-800">{segmentRight || 'Segment B'}</p>
                    <div className="h-[280px]">
                      {rightFunnel.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={rightFunnel} layout="vertical" margin={{ top: 8, right: 10, left: 10, bottom: 8 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                            <XAxis type="number" />
                            <YAxis dataKey="stage_label" type="category" width={110} />
                            <Tooltip formatter={(value: number) => formatCount(value)} />
                            <Bar dataKey="users" fill="#3b82f6" radius={[0, 8, 8, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      ) : (
                        <EmptyChart text="Segment B funnel unavailable." />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'timing' && (
              <div className="mt-4">
                <h3 className="text-lg font-semibold text-gray-900">Time Between Stages</h3>
                <p className="mt-1 text-sm text-gray-500">Median delay helps identify slow transitions in the journey.</p>
                <div className="mt-4 h-[320px] w-full">
                  {timingChart.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={timingChart} layout="vertical" margin={{ top: 8, right: 20, left: 30, bottom: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis type="number" />
                        <YAxis dataKey="transition_label" type="category" width={180} />
                        <Tooltip formatter={(value: number) => `${value.toFixed(2)} hrs`} />
                        <Bar dataKey="median_hours" fill="#f59e0b" radius={[0, 8, 8, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <EmptyChart text="Timing analysis is unavailable for this filtered dataset." />
                  )}
                </div>
              </div>
            )}

            {activeTab === 'revenue' && (
              <div className="mt-4 space-y-6">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Revenue Opportunity by Stage</h3>
                  <p className="mt-1 text-sm text-gray-500">Estimated revenue currently lost at each transition.</p>
                  <div className="mt-4 h-[300px] w-full">
                    {revenueChart.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={revenueChart} margin={{ top: 8, right: 20, left: 20, bottom: 60 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                          <XAxis dataKey="transition_label" tick={{ fontSize: 12 }} interval={0} angle={-15} textAnchor="end" height={66} />
                          <YAxis tickFormatter={(value) => compactCurrency(Number(value))} />
                          <Tooltip formatter={(value: number) => formatCurrency(Number(value))} />
                          <Bar dataKey="estimated_lost_revenue" fill="#ef4444" radius={[8, 8, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <EmptyChart text="Revenue opportunity chart is unavailable." />
                    )}
                  </div>
                </div>

                <div>
                  <h4 className="text-base font-semibold text-gray-900">Opportunity If Conversion Improves</h4>
                  <div className="mt-3 h-[240px] w-full">
                    {upliftChart.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={upliftChart} margin={{ top: 8, right: 20, left: 20, bottom: 8 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                          <XAxis dataKey="improvement_rate" tickFormatter={(value) => `${value}%`} />
                          <YAxis tickFormatter={(value) => compactCurrency(Number(value))} />
                          <Tooltip formatter={(value: number) => formatCurrency(Number(value))} />
                          <Bar dataKey="incremental_revenue" fill="#10b981" radius={[8, 8, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <EmptyChart text="Uplift scenario chart appears after funnel results are available." />
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'advanced' && (
              <div className="mt-4 rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-4">
                <h3 className="text-lg font-semibold text-gray-900">Advanced Journey View</h3>
                <p className="mt-1 text-sm text-gray-600">
                  Sankey diagram is intentionally optional to avoid clutter. We can add it next as a separate tab once multi-path journey data is finalized.
                </p>
              </div>
            )}
          </div>

          {result?.filters_applied && (
            <div className="workspace-panel">
              <h3 className="text-lg font-semibold text-gray-900">Applied Filters</h3>
              <div className="mt-3 grid gap-2 text-sm text-gray-700 md:grid-cols-2 xl:grid-cols-3">
                {Object.entries(result.filters_applied).map(([key, value]) => (
                  <div key={key} className="rounded-xl bg-gray-50 px-3 py-2">
                    <span className="font-semibold">{formatStageLabel(key)}:</span> {String(value)}
                  </div>
                ))}
              </div>
              {result.data_source && <p className="mt-3 text-xs text-gray-500">Analysis built from: {result.data_source}</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MetricCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="workspace-metric-card">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</div>
      <div className="mt-2 text-xl font-bold text-gray-900">{value}</div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  disabled,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="min-w-0 text-sm text-gray-600">
      <span className="block min-h-[1.75rem] pb-1.5 font-medium">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className="workspace-control h-11 min-w-0 text-base disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`workspace-tab ${
        active
          ? 'border border-gray-900 bg-gray-900 text-white shadow-[0_10px_24px_rgba(15,23,42,0.24)]'
          : 'border border-gray-200 bg-gray-100/80 text-gray-700 hover:bg-white'
      }`}
      type="button"
    >
      <BarChart3 className="h-4 w-4" />
      <span className="truncate">{label}</span>
    </button>
  );
}

function EmptyChart({ text }: { text: string }) {
  return <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-gray-300 text-sm text-gray-500">{text}</div>;
}

function formatCount(value?: number): string {
  if (value === undefined || value === null) return '-';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
}

function formatPercent(value?: number): string {
  if (value === undefined || value === null) return '-';
  return `${(value * 100).toFixed(2)}%`;
}

function formatCurrency(value?: number): string {
  if (value === undefined || value === null) return '-';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}

function compactCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

function formatStageLabel(value: string): string {
  return value
    .replace(/_/g, ' ')
    .split(' ')
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(' ');
}

function formatTimePeriodLabel(value: string): string {
  const labels: Record<string, string> = {
    week: 'Weekly',
    month: 'Monthly',
    quarter: 'Quarterly',
    year: 'Yearly',
    all: 'All time',
  };
  return labels[value] || formatStageLabel(value);
}

