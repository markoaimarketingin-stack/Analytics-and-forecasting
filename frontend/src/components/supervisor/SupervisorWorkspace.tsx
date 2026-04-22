import { useEffect, useRef, useState } from 'react';
import type { ComponentType } from 'react';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Filter,
  LayoutDashboard,
  LoaderCircle,
  Network,
  PieChart,
  Play,
  Plus,
  TrendingUp,
  Users,
} from 'lucide-react';
import { useKnowledgeBase } from '../../context/KnowledgeBaseContext';
import KnowledgeBaseModal from './KnowledgeBaseModal';
import TrainModelModal from './TrainModelModal';

type StageStatus = 'idle' | 'running' | 'done' | 'error';

interface SupervisorWorkspaceProps {
  onRunAnalysis: () => Promise<boolean>;
  onOpenDashboard: () => void;
  resetToken: number;
  clientId?: string;
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

function MarkoBarsIcon({ size = 'sm' }: { size?: 'sm' | 'lg' }) {
  const wrapperClass = size === 'lg' ? 'h-36 w-36' : 'h-11 w-11';
  const iconClass = size === 'lg' ? 'h-12 w-12' : 'h-5 w-5';

  return (
    <div className={`flex items-center justify-center rounded-full bg-black shadow-[0_10px_24px_rgba(0,0,0,0.2)] ${wrapperClass}`}>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={iconClass}
        aria-hidden="true"
      >
        <rect x="5" y="12" width="3" height="7" rx="1.5" fill="#ffffff" />
        <rect x="10.5" y="7" width="3" height="12" rx="1.5" fill="#ffffff" />
        <rect x="16" y="10" width="3" height="9" rx="1.5" fill="#ffffff" />
      </svg>
    </div>
  );
}

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
          shell: 'border-gray-900 bg-gray-950 shadow-[0_12px_24px_rgba(0,0,0,0.22)]',
          icon: 'bg-white text-black',
          text: 'text-white',
          sub: 'text-gray-300',
          tag: 'bg-white text-black',
          tagText: 'Completed',
        }
      : status === 'running'
        ? {
            shell: 'border-gray-400 bg-white shadow-[0_10px_20px_rgba(0,0,0,0.08)] ring-1 ring-gray-200',
            icon: 'bg-black text-white',
            text: 'text-gray-950',
            sub: 'text-gray-600',
            tag: 'bg-black text-white',
            tagText: 'Running',
          }
        : status === 'error'
          ? {
              shell: 'border-gray-300 bg-gray-100',
              icon: 'bg-black text-white',
              text: 'text-gray-900',
              sub: 'text-gray-600',
              tag: 'bg-gray-900 text-white',
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

export default function SupervisorWorkspace({ onRunAnalysis, onOpenDashboard, resetToken, clientId }: SupervisorWorkspaceProps) {
  const { setCurrentAgentId } = useKnowledgeBase();
  const [isKnowledgeBaseModalOpen, setIsKnowledgeBaseModalOpen] = useState(false);
  const [isTrainModelModalOpen, setIsTrainModelModalOpen] = useState(false);
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

  useEffect(() => {
    clearTimers();
    setRunState('idle');
    resetPipeline();
  }, [resetToken]);

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

  const getStepStatus = (stage: AgentStage): StageStatus => {
    if (stage === 'parallel') return parallelStatus;
    if (stage === 'forecast') return forecastStatus;
    return scenarioStatus;
  };

  return (
    <div className="flex h-full flex-col bg-[#f3f4f6]">
      <div className="border-b border-gray-200 bg-white px-6 py-3">
        <div className="mx-auto flex w-full max-w-6xl flex-nowrap items-center justify-between gap-4">
          <div className="flex min-w-0 shrink items-center gap-3">
            <MarkoBarsIcon size="sm" />
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight text-black">Supervisor</h1>
              <p className="mt-0.5 text-sm text-gray-600">Orchestrator</p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setCurrentAgentId(1);
                setIsKnowledgeBaseModalOpen(true);
              }}
              className="inline-flex h-10 items-center gap-2 rounded-full border-2 border-black bg-white px-4 text-sm font-semibold text-black ring-1 ring-black/80 transition hover:bg-gray-100"
            >
              <BookOpen className="h-4 w-4" /> Knowledge Base
            </button>
            <button
              type="button"
              onClick={() => setIsTrainModelModalOpen(true)}
              className="inline-flex h-11 items-center gap-3 rounded-full border-2 border-black bg-white px-4 text-sm font-semibold text-black shadow-[0_5px_14px_rgba(0,0,0,0.1)] transition hover:-translate-y-[1px] hover:bg-gray-50"
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-black text-white">
                <Plus className="h-3 w-3" strokeWidth={2.5} />
              </span>
              <span>Train Model</span>
            </button>
            <button
              onClick={handleRun}
              disabled={runState === 'running'}
              className="inline-flex h-10 items-center gap-2 rounded-[999px] border border-black bg-black px-4 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-70"
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
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto w-full max-w-6xl space-y-6">
          {!hasStarted ? (
            <div className="flex min-h-[430px] flex-col items-center justify-center px-6 text-center">
              <MarkoBarsIcon size="lg" />

              <h2 className="mt-7 text-3xl font-extrabold tracking-tight text-black">I am your Analytics Supervisor Agent</h2>
              <p className="mt-4 max-w-3xl text-base leading-relaxed text-gray-600">
                Specialized in orchestrating funnel, cohort, attribution, forecast, and scenario workflows for
                unified, decision-ready insights.
              </p>
            </div>
          ) : (
            <div className="workspace-panel md:p-8">
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
            </div>
          )}

            {runState === 'completed' && (
              <button
                onClick={onOpenDashboard}
                className="inline-flex items-center gap-2 rounded-xl bg-black px-5 py-3 text-sm font-semibold text-white transition hover:bg-gray-900"
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
                className="inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
              >
                <AlertTriangle className="h-4 w-4 text-gray-600" />
                Reset Pipeline
              </button>
            )}

          {runState !== 'idle' && (
            <div className="mt-5 rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
              {runState === 'completed' ? (
                <div className="flex items-center gap-2 text-gray-800">
                  <CheckCircle2 className="h-4 w-4" />
                  Pipeline finished. Open the dashboard to review unified insights and recommendations.
                </div>
              ) : runState === 'running' ? (
                <div className="flex items-center gap-2 text-gray-800">
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                  Executing...
                </div>
              ) : (
                <div className="flex items-center gap-2 text-gray-800">
                  <AlertTriangle className="h-4 w-4" />
                  Run failed. Reset and retry the pipeline.
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <TrainModelModal
        isOpen={isTrainModelModalOpen}
        onClose={() => setIsTrainModelModalOpen(false)}
        clientId={clientId}
      />
      <KnowledgeBaseModal
        isOpen={isKnowledgeBaseModalOpen}
        onClose={() => setIsKnowledgeBaseModalOpen(false)}
        clientId={clientId}
      />
    </div>
  );
}
