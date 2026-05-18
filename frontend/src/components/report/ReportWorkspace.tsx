
import {
  FileText,
  Sparkles,
  Download,
  Clock3,
  File,
  Presentation,
  FileSpreadsheet,
  ChevronDown,
} from 'lucide-react';
import { useKnowledgeBase } from '../../context/KnowledgeBaseContext';

export default function ReportWorkspace() {
  const { openKnowledgeModal, openUploadModal } = useKnowledgeBase();
  const REPORT_AGENT_ID = 6;
  return (
    <div className="workspace-surface">
      {/* Header */}
          <div className="workspace-header-glass px-8 py-3">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-zinc-800 text-white shadow-[0_12px_32px_rgba(0,0,0,0.6)]">
            <FileText className="h-7 w-7" />
          </div>

          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">
              Report Generator
            </h1>

          </div>
        </div>
      </div>

      {/* Content */}
      <div className="workspace-content">
        <div className="mx-auto w-full max-w-5xl space-y-6">
          {/* Configuration Card */}
          <div className="rounded-[32px] border border-zinc-800 bg-zinc-950 p-8 shadow-sm lg:p-10">
            <div className="mx-auto max-w-2xl text-center">
              <div className="text-[11px] font-semibold uppercase tracking-[0.35em] text-zinc-400">
                Executive Reporting
              </div>

              <h2 className="mt-4 text-4xl font-bold leading-tight text-white">
                Configure Your Analytics Report
              </h2>

              <p className="mx-auto mt-4 max-w-2xl text-base leading-8 text-zinc-400">
                Select the report type, choose which sections to include, and
                export the final document in your preferred format.
              </p>
            </div>

            <div className="mt-12 grid gap-6 xl:grid-cols-3">
              <div>
                <label className="mb-3 block text-[11px] font-semibold uppercase tracking-[0.28em] text-zinc-400">
                  Report Type
                </label>

                <div className="relative">
                  <select className="h-14 w-full appearance-none rounded-2xl border border-zinc-800 bg-zinc-900 px-5 pr-12 text-sm font-semibold text-white outline-none transition focus:border-zinc-700 focus:ring-4 focus:ring-zinc-900">
                    <option>Executive Summary</option>
                    <option>Detailed Analysis</option>
                    <option>Board Presentation</option>
                    <option>Investor Update</option>
                    <option>Custom Report</option>
                  </select>

                  <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400" />
                </div>
              </div>

              <div>
                <label className="mb-3 block text-[11px] font-semibold uppercase tracking-[0.28em] text-zinc-400">
                  Include Sections
                </label>

                <div className="relative">
                  <select className="h-14 w-full appearance-none rounded-2xl border border-zinc-800 bg-zinc-900 px-5 pr-12 text-sm font-semibold text-white outline-none transition focus:border-zinc-700 focus:ring-4 focus:ring-zinc-900">
                    <option>All Sections</option>
                    <option>Forecast + Scenario</option>
                    <option>Funnel + Attribution</option>
                    <option>Cohort + Forecast</option>
                    <option>Executive KPIs Only</option>
                  </select>

                  <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400" />
                </div>
              </div>

              <div>
                <label className="mb-3 block text-[11px] font-semibold uppercase tracking-[0.28em] text-zinc-400">
                  Export Format
                </label>

                <div className="relative">
                  <select className="h-14 w-full appearance-none rounded-2xl border border-zinc-800 bg-zinc-900 px-5 pr-12 text-sm font-semibold text-white outline-none transition focus:border-zinc-700 focus:ring-4 focus:ring-zinc-900">
                    <option>PDF Document</option>
                    <option>PowerPoint Presentation</option>
                    <option>Excel Workbook</option>
                    <option>CSV Bundle</option>
                  </select>

                  <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400" />
                </div>
              </div>
            </div>
          </div>

          {/* Generate Section */}
            <div className="rounded-[32px] bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-700 p-8 text-white shadow-lg lg:p-10">
            <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.35em] text-zinc-300">
                  Generate Report
                </div>

                <h3 className="mt-4 text-4xl font-bold leading-tight">
                  Ready To Export
                </h3>

                <p className="mt-4 max-w-2xl text-base leading-8 text-slate-300">
                  Generate your final report and instantly download it in the
                  selected format.
                </p>
              </div>

              <div className="flex flex-col gap-4 lg:w-[260px]">
                <button className="flex h-14 items-center justify-center gap-3 rounded-2xl bg-zinc-200/5 px-6 text-sm font-semibold text-white transition hover:bg-zinc-900">
                  <Sparkles className="h-5 w-5" />
                  Generate Report
                </button>

                <button className="flex h-14 items-center justify-center gap-3 rounded-2xl border border-zinc-700 bg-zinc-900/40 px-6 text-sm font-semibold text-white transition hover:border-zinc-600 hover:bg-zinc-900/60">
                  <Download className="h-5 w-5" />
                  Download Latest
                </button>
              </div>
            </div>
          </div>

          {/* Recent Reports */}
          <div className="rounded-[32px] border border-zinc-800 bg-zinc-950 p-8 shadow-sm lg:p-10">
            <div className="mb-8">
              <div className="text-[11px] font-semibold uppercase tracking-[0.35em] text-zinc-400">
                Recent Reports
              </div>

              <h3 className="mt-3 text-3xl font-bold text-white">
                Previously Generated Reports
              </h3>
            </div>

            <div className="space-y-4">
              {[
                {
                  title: 'Executive Report – March 2026',
                  type: 'PDF',
                  icon: File,
                },
                {
                  title: 'Detailed Funnel & Attribution Review',
                  type: 'PowerPoint',
                  icon: Presentation,
                },
                {
                  title: 'Cohort + Forecast Export',
                  type: 'Excel',
                  icon: FileSpreadsheet,
                },
              ].map((report, index) => {
                const Icon = report.icon;

                return (
                  <div
                    key={index}
                    className="flex flex-col gap-5 rounded-3xl border border-zinc-800 bg-zinc-950 p-5 transition hover:border-zinc-600 hover:bg-zinc-900 lg:flex-row lg:items-center lg:justify-between"
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-900 text-zinc-300">
                        <Icon className="h-5 w-5" />
                      </div>

                      <div>
                        <div className="text-base font-semibold text-white">
                          {report.title}
                        </div>

                        <div className="mt-2 flex items-center gap-3 text-sm text-zinc-400">
                          <span>{report.type}</span>
                          <span className="h-1 w-1 rounded-full bg-zinc-700" />
                          <span className="flex items-center gap-1">
                            <Clock3 className="h-4 w-4" />
                            Generated recently
                          </span>
                        </div>
                      </div>
                    </div>

                    <button className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-zinc-800 bg-zinc-900 px-5 text-sm font-semibold text-white transition hover:border-zinc-600 hover:bg-zinc-800">
                      <Download className="h-4 w-4" />
                      Download
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
