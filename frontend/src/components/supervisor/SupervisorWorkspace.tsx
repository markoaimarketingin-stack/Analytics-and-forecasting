import { useEffect, useRef, useState } from 'react';
import type { ComponentType } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Filter,
  LayoutDashboard,
  LoaderCircle,
  Network,
  PieChart,
  Play,
  TrendingUp,
  Users,
} from 'lucide-react';

type StageStatus = 'idle' | 'running' | 'done' | 'error';

interface SupervisorWorkspaceProps {
  onRunAnalysis: () => Promise<boolean>;
  onOpenDashboard: () => void;
}

type AgentStage = 'parallel' | 'forecast' | 'scenario';

interface AgentStep {
  label: string;
  hint: string;
  icon: ComponentType<{ className?: string }>;
  stage: AgentStage;
}

const AGENT_SEQUENCE: AgentStep[] = [
  { label: 'Funnel Agent', hint: 'Dropoff diagnostics', icon: Filter, stage: 'parallel' },
  { label: 'Cohort Agent', hint: 'Retention and LTV cohorts', icon: Users, stage: 'parallel' },
  { label: 'Attribution Agent', hint: 'Channel contribution mix', icon: Network, stage: 'parallel' },
  { label: 'Forecast Agent', hint: 'Forward revenue trajectory', icon: TrendingUp, stage: 'forecast' },
  { label: 'Scenario Agent', hint: 'What-if planning outcomes', icon: PieChart, stage: 'scenario' },
];

function StageCard({
  label,
  hint,
  status,
  icon: Icon,
  visible,
  stepNumber,
}: {
  label: string;
  hint: string;
  status: StageStatus;
  icon: ComponentType<{ className?: string }>;
  visible: boolean;
  stepNumber: number;
}) {
  if (!visible) {
    return null;
  }

  const styles =
    status === 'done'
      ? {
          shell: 'border-emerald-200/90 bg-emerald-50 shadow-[0_10px_30px_rgba(5,150,105,0.12)]',
          icon: 'bg-emerald-600 text-white',
          text: 'text-emerald-900',
          sub: 'text-emerald-700/90',
          tag: 'bg-emerald-100 text-emerald-700',
          tagText: 'Completed',
        }
      : status === 'running'
        ? {
            shell: 'border-blue-200/90 bg-gradient-to-br from-blue-50 to-indigo-50 shadow-[0_12px_34px_rgba(59,130,246,0.18)] ring-2 ring-blue-100',
            icon: 'bg-blue-600 text-white',
            text: 'text-blue-950',
            sub: 'text-blue-700/90',
            tag: 'bg-blue-100 text-blue-700',
            tagText: 'Running',
          }
        : status === 'error'
          ? {
              shell: 'border-red-200/90 bg-red-50 shadow-[0_10px_30px_rgba(239,68,68,0.16)]',
              icon: 'bg-red-600 text-white',
              text: 'text-red-900',
              sub: 'text-red-700/90',
              tag: 'bg-red-100 text-red-700',
              tagText: 'Failed',
            }
          : {
              shell: 'border-gray-200 bg-white/85',
              icon: 'bg-gray-100 text-gray-500',
              text: 'text-gray-800',
              sub: 'text-gray-500',
              tag: 'bg-gray-100 text-gray-600',
              tagText: 'Waiting',
            };

  return (
    <div className={`rounded-2xl border p-4 transition-all duration-500 ease-out motion-safe:animate-[fade-slide-up_420ms_ease-out] ${styles.shell}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-sm font-semibold text-gray-600">
            {stepNumber}
          </div>
          <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${styles.icon}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <div className={`text-base font-semibold ${styles.text}`}>{label}</div>
            <div className={`mt-1 text-sm ${styles.sub}`}>{hint}</div>
          </div>
        </div>

        <div className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${styles.tag}`}>
          {styles.tagText}
        </div>
      </div>
    </div>
  );
}

export default function SupervisorWorkspace({ onRunAnalysis, onOpenDashboard }: SupervisorWorkspaceProps) {
  const [parallelStatus, setParallelStatus] = useState<StageStatus>('idle');
  const [forecastStatus, setForecastStatus] = useState<StageStatus>('idle');
  const [scenarioStatus, setScenarioStatus] = useState<StageStatus>('idle');
  const [runState, setRunState] = useState<'idle' | 'running' | 'completed' | 'error'>('idle');
  const [hasStarted, setHasStarted] = useState(false);
  const [visibleSteps, setVisibleSteps] = useState(0);

  const timeoutsRef = useRef<number[]>([]);

  const clearTimers = () => {
    timeoutsRef.current.forEach((id) => window.clearTimeout(id));
    timeoutsRef.current = [];
  };

  const resetPipeline = () => {
    setParallelStatus('idle');
    setForecastStatus('idle');
    setScenarioStatus('idle');
    setVisibleSteps(0);
    setHasStarted(false);
  };

  useEffect(() => {
    return () => {
      clearTimers();
    };
  }, []);

  const playPipelineTimeline = () =>
    new Promise<void>((resolve) => {
      clearTimers();

      setHasStarted(true);
      setVisibleSteps(0);
      setParallelStatus('idle');
      setForecastStatus('idle');
      setScenarioStatus('idle');

      const revealOne = window.setTimeout(() => {
        setVisibleSteps(1);
        setParallelStatus('running');
      }, 300);

      const revealTwo = window.setTimeout(() => {
        setVisibleSteps(2);
      }, 850);

      const revealThree = window.setTimeout(() => {
        setVisibleSteps(3);
      }, 1400);

      const revealFour = window.setTimeout(() => {
        setVisibleSteps(4);
        setParallelStatus('done');
        setForecastStatus('running');
      }, 2150);

      const revealFive = window.setTimeout(() => {
        setVisibleSteps(5);
        setForecastStatus('done');
        setScenarioStatus('running');
      }, 2950);

      const final = window.setTimeout(() => {
        setScenarioStatus('done');
        resolve();
      }, 3800);

      timeoutsRef.current = [revealOne, revealTwo, revealThree, revealFour, revealFive, final];
    });

  const handleRun = async () => {
    if (runState === 'running') return;

    setRunState('running');

    try {
      const [ok] = await Promise.all([onRunAnalysis(), playPipelineTimeline()]);

      if (!ok) {
        clearTimers();
        setScenarioStatus('error');
        setRunState('error');
        return;
      }

      setParallelStatus('done');
      setForecastStatus('done');
      setScenarioStatus('done');
      setRunState('completed');
    } catch {
      clearTimers();
      setScenarioStatus('error');
      setRunState('error');
    }
  };

  const statusBadge =
    runState === 'completed'
      ? { text: 'Pipeline complete', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' }
      : runState === 'running'
        ? { text: 'Pipeline running', cls: 'bg-blue-100 text-blue-700 border-blue-200' }
        : runState === 'error'
          ? { text: 'Pipeline failed', cls: 'bg-red-100 text-red-700 border-red-200' }
          : { text: 'Ready to run', cls: 'bg-gray-100 text-gray-600 border-gray-200' };

  const getStepStatus = (stage: AgentStage): StageStatus => {
    if (stage === 'parallel') return parallelStatus;
    if (stage === 'forecast') return forecastStatus;
    return scenarioStatus;
  };

  return (
    <div className="workspace-surface workspace-modern">
      <div className="workspace-content">
        <div className="mx-auto w-full max-w-6xl space-y-6">
        <div className="workspace-panel relative overflow-hidden rounded-[28px] border border-gray-200 bg-gradient-to-br from-[#0f172a] via-[#111827] to-[#1e293b] p-8 text-white shadow-[0_20px_60px_rgba(15,23,42,0.28)]">
          <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-blue-500/20 blur-3xl" />
          <div className="absolute -bottom-20 left-20 h-56 w-56 rounded-full bg-violet-500/20 blur-3xl" />

          <div className="relative z-10 flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.3em] text-blue-200/85">Orchestration Center</div>
              <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-white md:text-4xl">Analytics Supervisor</h1>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-200 md:text-base">
                Launch a full multi-agent run where funnel, cohort, and attribution process in parallel, followed by
                forecast and scenario analysis for dashboard-ready business insights.
              </p>
            </div>

            <div className={`rounded-xl border px-3 py-2 text-xs font-semibold ${statusBadge.cls}`}>
              {statusBadge.text}
            </div>
          </div>

          <div className="relative z-10 mt-7 flex flex-wrap items-center gap-3">
            <button
              onClick={handleRun}
              disabled={runState === 'running'}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-[0_10px_28px_rgba(59,130,246,0.4)] transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {runState === 'running' ? (
                <>
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                  Running Analysis...
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  Run Analysis
                </>
              )}
            </button>

            {runState === 'completed' && (
              <button
                onClick={onOpenDashboard}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(16,185,129,0.35)] transition hover:bg-emerald-600"
              >
                <LayoutDashboard className="h-4 w-4" />
                Open Dashboard
              </button>
            )}

            {runState === 'error' && (
              <button
                onClick={() => {
                  setRunState('idle');
                  resetPipeline();
                }}
                className="inline-flex items-center gap-2 rounded-xl bg-white/95 px-4 py-3 text-sm font-semibold text-gray-700 transition hover:bg-white"
              >
                <AlertTriangle className="h-4 w-4 text-red-500" />
                Reset Pipeline
              </button>
            )}
          </div>
        </div>

        <div className="workspace-panel md:p-8">
          {!hasStarted ? (
            <div className="mt-2 flex min-h-[220px] items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-5 py-8 text-center">
              <span className="text-lg font-semibold text-gray-700">Click Run Analysis</span>
            </div>
          ) : (
            <div className="mt-5 space-y-3">
              {AGENT_SEQUENCE.map((agent, index) => (
                <StageCard
                  key={agent.label}
                  label={agent.label}
                  hint={agent.hint}
                  icon={agent.icon}
                  status={getStepStatus(agent.stage)}
                  visible={index < visibleSteps}
                  stepNumber={index + 1}
                />
              ))}
            </div>
          )}

          {runState !== 'idle' && (
            <div className="mt-5 rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
              {runState === 'completed' ? (
                <div className="flex items-center gap-2 text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" />
                  Pipeline finished. Open the dashboard to review unified insights and recommendations.
                </div>
              ) : runState === 'running' ? (
                <div className="flex items-center gap-2 text-blue-700">
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                  Agents are appearing and executing in sequence.
                </div>
              ) : (
                <div className="flex items-center gap-2 text-red-700">
                  <AlertTriangle className="h-4 w-4" />
                  Run failed. Reset and retry the pipeline.
                </div>
              )}
            </div>
          )}
        </div>
        </div>
      </div>
    </div>
  );
}
