import { Settings, SlidersHorizontal, Sparkles, MessageSquare } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';

type SettingsState = {
  smoothAnimations: boolean;
  compactCards: boolean;
  chatAutoscroll: boolean;
};

const STORAGE_KEY = 'analytics_supervisor_settings';

export default function SettingsWorkspace() {
  const [settings, setSettings] = useState<SettingsState>({
    smoothAnimations: true,
    compactCards: false,
    chatAutoscroll: true,
  });

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        setSettings((prev) => ({ ...prev, ...JSON.parse(raw) }));
      }
    } catch {
      // keep defaults when storage is unavailable/corrupt
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    document.documentElement.classList.toggle('motion-reduce', !settings.smoothAnimations);
    document.documentElement.classList.toggle('compact-cards', settings.compactCards);
  }, [settings]);

  const update = (key: keyof SettingsState, value: boolean) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="workspace-surface">
      <div className="workspace-header-glass px-8 py-3">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-slate-900 text-white shadow-[0_12px_32px_rgba(15,23,42,0.28)]">
            <Settings className="h-7 w-7" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">Workspace Settings</h1>
          </div>
        </div>
      </div>

      <div className="workspace-content">
        <div className="mx-auto w-full max-w-4xl space-y-6">
          <div className="rounded-[30px] border border-gray-200 bg-white p-8 shadow-sm card-hover-lift">
            <div className="flex items-center gap-3 text-sm font-semibold uppercase tracking-[0.28em] text-gray-400">
              <SlidersHorizontal className="h-4 w-4" />
              Interface
            </div>

            <div className="mt-6 space-y-4">
              <SettingRow
                icon={<Sparkles className="h-5 w-5" />}
                title="Smooth Animations"
                description="Enable subtle transitions for cards and chat messages."
                checked={settings.smoothAnimations}
                onChange={(v) => update('smoothAnimations', v)}
              />

              <SettingRow
                icon={<SlidersHorizontal className="h-5 w-5" />}
                title="Compact Workspace Cards"
                description="Use tighter spacing in workspace cards."
                checked={settings.compactCards}
                onChange={(v) => update('compactCards', v)}
              />

              <SettingRow
                icon={<MessageSquare className="h-5 w-5" />}
                title="Chat Auto-scroll"
                description="Automatically scroll chat to latest reply."
                checked={settings.chatAutoscroll}
                onChange={(v) => update('chatAutoscroll', v)}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

type SettingRowProps = {
  icon: ReactNode;
  title: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
};

function SettingRow({ icon, title, description, checked, onChange }: SettingRowProps) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4">
      <div className="flex items-start gap-3">
        <div className="mt-1 text-gray-600">{icon}</div>
        <div>
          <div className="text-sm font-semibold text-gray-900">{title}</div>
          <div className="mt-1 text-sm text-gray-500">{description}</div>
        </div>
      </div>

      <button
        onClick={() => onChange(!checked)}
        className={`relative h-7 w-12 rounded-full transition ${checked ? 'bg-blue-600' : 'bg-gray-300'}`}
      >
        <span
          className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${checked ? 'left-6' : 'left-1'}`}
        />
      </button>
    </div>
  );
}


