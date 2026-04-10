import {
  AlertCircle,
  FileText,
  Sparkles,
  Download,
  Clock3,
  Check,
} from 'lucide-react';
import { useState } from 'react';
import { downloadGeneratedReport, generateAnalyticsReport } from '../../services/api';
import type {
  AgentOrchestrationResult,
  GeneratedReportPayload,
  ReportExportFormat,
  ReportType,
} from '../../types';

interface ReportWorkspaceProps {
  clientId?: string;
  onRunResult?: (result: AgentOrchestrationResult) => void;
}

interface AgentOption {
  id: string;
  label: string;
}

interface RecentReportItem {
  id: string;
  title: string;
  createdAt: string;
  payload: GeneratedReportPayload;
}

const AGENT_OPTIONS: AgentOption[] = [
  { id: 'attribution', label: 'Attribution Agent' },
  { id: 'funnel', label: 'Funnel Agent' },
  { id: 'cohort', label: 'Cohort Agent' },
  { id: 'forecast', label: 'Forecast Agent' },
  { id: 'scenario', label: 'Scenario Agent' },
];

export default function ReportWorkspace({ clientId, onRunResult }: ReportWorkspaceProps) {
  const [reportType, setReportType] = useState<ReportType>('executive');
  const [exportFormat, setExportFormat] = useState<ReportExportFormat>('pdf');
  const [selectedAgents, setSelectedAgents] = useState<string[]>(AGENT_OPTIONS.map((agent) => agent.id));
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [latestReport, setLatestReport] = useState<GeneratedReportPayload | null>(null);
  const [recentReports, setRecentReports] = useState<RecentReportItem[]>([]);

  const reportTypeOptions = [
    { id: 'executive' as const, label: 'Executive Summary' },
    { id: 'detailed' as const, label: 'Detailed Summary' },
  ];

  const exportFormatOptions = [
    { id: 'pdf' as const, label: 'PDF' },
    { id: 'doc' as const, label: 'DOC' },
  ];

  const toggleAgent = (agentId: string) => {
    setSelectedAgents((prev) => (
      prev.includes(agentId)
        ? prev.filter((id) => id !== agentId)
        : [...prev, agentId]
    ));
  };

  const handleGenerateReport = async () => {
    if (selectedAgents.length === 0) {
      setError('Select at least one agent to generate the report.');
      return;
    }

    setIsGenerating(true);
    setError(null);

    try {
      const response = await generateAnalyticsReport({
        report_type: reportType,
        export_format: exportFormat,
        agents: selectedAgents,
        client_id: clientId,
        payload: {},
      });

      if (!response.success || !response.data) {
        throw new Error(response.detail || 'Failed to generate report.');
      }

      setLatestReport(response.data);
      setRecentReports((prev) => {
        const createdAt = new Date().toISOString();
        const next: RecentReportItem = {
          id: `${response.data.filename}-${Date.now()}`,
          title: response.data.filename.replace(/\.[^.]+$/, '').replace(/_/g, ' '),
          createdAt,
          payload: response.data,
        };
        return [next, ...prev].slice(0, 8);
      });

      if (response.data.orchestration_result) {
        onRunResult?.(response.data.orchestration_result);
      }

      downloadGeneratedReport(response.data);
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : 'Failed to generate report.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownloadLatest = () => {
    if (!latestReport) {
      setError('Generate at least one report before downloading.');
      return;
    }
    setError(null);
    downloadGeneratedReport(latestReport);
  };

  const reportTypeLabel = reportType === 'executive' ? 'Executive' : 'Detailed';

  return (
    <div className="workspace-surface workspace-modern">
      <div className="workspace-header-glass workspace-header-glass-modern px-8 py-3">
        <div className="flex items-center gap-4">
          <div className="workspace-agent-icon bg-gradient-to-br from-slate-900 to-slate-700">
            <FileText className="h-7 w-7" />
          </div>

          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">
              Report Generator
            </h1>
          </div>
        </div>
      </div>

      <div className="workspace-content">
        <div className="mx-auto w-full max-w-6xl space-y-7">
          <div className="workspace-panel rounded-[28px] border border-slate-200/80 bg-gradient-to-b from-white to-slate-50/40 p-7 shadow-[0_20px_45px_-30px_rgba(15,23,42,0.35)] lg:p-10">
            <div className="mx-auto max-w-3xl text-center">
              <div className="text-[11px] font-semibold uppercase tracking-[0.32em] text-slate-400">
                Executive Reporting
              </div>

              <h2 className="mt-4 text-4xl font-bold leading-tight text-slate-900">
                Configure Your Analytics Report
              </h2>

              <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-slate-500">
                Select your report style, include the required agent sections,
                and export in your preferred format.
              </p>
            </div>

            <div className="mt-10 grid gap-5 xl:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <label className="mb-3 block text-[11px] font-semibold uppercase tracking-[0.26em] text-slate-400">
                  Report Type
                </label>

                <div className="space-y-2">
                  {reportTypeOptions.map((option) => {
                    const isActive = reportType === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => setReportType(option.id)}
                        className={`flex h-11 w-full items-center justify-between rounded-xl border px-3 text-sm font-semibold transition ${
                          isActive
                            ? 'border-slate-700 bg-slate-900 text-white shadow-sm'
                            : 'border-slate-200 bg-slate-50/70 text-slate-600 hover:border-slate-300 hover:bg-white'
                        }`}
                      >
                        <span>{option.label}</span>
                        {isActive ? <Check className="h-4 w-4" /> : null}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <label className="mb-3 block text-[11px] font-semibold uppercase tracking-[0.26em] text-slate-400">
                  Export Format
                </label>

                <div className="space-y-2">
                  {exportFormatOptions.map((option) => {
                    const isActive = exportFormat === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => setExportFormat(option.id)}
                        className={`flex h-11 w-full items-center justify-between rounded-xl border px-3 text-sm font-semibold transition ${
                          isActive
                            ? 'border-slate-700 bg-slate-900 text-white shadow-sm'
                            : 'border-slate-200 bg-slate-50/70 text-slate-600 hover:border-slate-300 hover:bg-white'
                        }`}
                      >
                        <span>{option.label}</span>
                        {isActive ? <Check className="h-4 w-4" /> : null}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 xl:col-span-2">
                <label className="mb-3 block text-[11px] font-semibold uppercase tracking-[0.26em] text-slate-400">
                  Agents Included In Report
                </label>

                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {AGENT_OPTIONS.map((agent) => {
                    const isSelected = selectedAgents.includes(agent.id);

                    return (
                      <button
                        key={agent.id}
                        type="button"
                        onClick={() => toggleAgent(agent.id)}
                        className={`flex h-11 items-center justify-between rounded-xl border px-3 text-sm font-semibold transition ${
                          isSelected
                            ? 'border-slate-700 bg-slate-900 text-white shadow-sm'
                            : 'border-slate-200 bg-slate-50/70 text-slate-600 hover:border-slate-300 hover:bg-white'
                        }`}
                      >
                        <span>{agent.label}</span>
                        {isSelected ? <Check className="h-4 w-4" /> : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {error ? (
              <div className="mt-5 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                <AlertCircle className="h-4 w-4" />
                {error}
              </div>
            ) : null}

          </div>

          <div className="workspace-panel overflow-hidden rounded-[28px] border border-slate-800 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-700 p-8 text-white shadow-[0_25px_50px_-25px_rgba(15,23,42,0.85)] lg:p-10">
            <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
              <div>
                <div className="inline-flex items-center rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.28em] text-slate-300">
                  Generate Report
                </div>

                <h3 className="mt-5 text-4xl font-bold leading-tight">
                  Ready To Export
                </h3>

                <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300">
                  Generate your final report and instantly download it in the
                  selected format.
                </p>

                <div className="mt-6 flex flex-wrap gap-2">
                  <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase text-slate-200">
                    {reportTypeLabel}
                  </span>
                  <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase text-slate-200">
                    {exportFormat}
                  </span>
                  <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase text-slate-200">
                    {selectedAgents.length} agent{selectedAgents.length === 1 ? '' : 's'}
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-3 lg:w-[270px]">
                <button
                  type="button"
                  onClick={handleGenerateReport}
                  disabled={isGenerating}
                  className="workspace-action-btn h-12 rounded-xl bg-white px-5 text-sm font-semibold text-slate-900 shadow-[0_10px_25px_rgba(255,255,255,0.2)] hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Sparkles className="h-4 w-4" />
                  {isGenerating ? 'Generating...' : 'Generate Report'}
                </button>

                <button
                  type="button"
                  onClick={handleDownloadLatest}
                  disabled={!latestReport}
                  className="workspace-action-btn h-12 rounded-xl border border-white/25 bg-white/5 px-5 text-sm font-semibold text-white shadow-none hover:border-white/45 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Download className="h-4 w-4" />
                  Download Latest
                </button>
              </div>
            </div>
          </div>

          <div className="workspace-panel rounded-[28px] border border-slate-200/80 bg-white p-7 shadow-[0_16px_35px_-30px_rgba(15,23,42,0.45)] lg:p-9">
            <div className="mb-7 flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.32em] text-slate-400">
                  Recent Reports
                </div>

                <h3 className="mt-3 text-3xl font-bold text-slate-900">
                  Previously Generated Reports
                </h3>
              </div>

              <button className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50">
                View All
              </button>
            </div>

            <div className="space-y-3">
              {recentReports.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 p-5 text-sm text-slate-500">
                  Generate your first report to populate this list.
                </div>
              ) : recentReports.map((report) => (
                <div
                  key={report.id}
                  className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 transition hover:border-slate-300 hover:bg-white lg:flex-row lg:items-center lg:justify-between"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                      <FileText className="h-5 w-5" />
                    </div>

                    <div>
                      <div className="text-sm font-semibold text-slate-900 lg:text-base">
                        {report.title}
                      </div>

                      <div className="mt-1 flex items-center gap-3 text-xs text-slate-500 lg:text-sm">
                        <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 font-semibold uppercase text-slate-600">
                          {report.payload.export_format}
                        </span>
                        <span className="h-1 w-1 rounded-full bg-slate-300" />
                        <span className="flex items-center gap-1">
                          <Clock3 className="h-3.5 w-3.5" />
                          {new Date(report.createdAt).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => downloadGeneratedReport(report.payload)}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                  >
                    <Download className="h-4 w-4" />
                    Download
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

