import { Moon, Settings } from 'lucide-react';
import type { ReactNode } from 'react';

type SettingsWorkspaceProps = {
  darkMode: boolean;
  onToggleDarkMode: (value: boolean) => void;
};

export default function SettingsWorkspace({
  darkMode,
  onToggleDarkMode,
}: SettingsWorkspaceProps) {

  return (
    <div className="workspace-surface workspace-modern">
      <div className="workspace-header-glass workspace-header-glass-modern px-8 py-3">
        <div className="flex items-center gap-4">
          <div className="workspace-agent-icon bg-gradient-to-br from-slate-900 to-indigo-700">
            <Settings className="h-7 w-7" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">Workspace Settings</h1>
          </div>
        </div>
      </div>

      <div className="workspace-content">
        <div className="mx-auto w-full max-w-4xl space-y-6">
          <div className="workspace-panel rounded-[30px] p-8 card-hover-lift">
            <div className="flex items-center gap-3 text-sm font-semibold uppercase tracking-[0.28em] text-gray-400">
              <Moon className="h-4 w-4" />
              Interface
            </div>

            <div className="mt-6">
              <SettingRow
                icon={<Moon className="h-5 w-5" />}
                title="Dark Mode"
                description="Switch the app between light and dark themes."
                checked={darkMode}
                onChange={onToggleDarkMode}
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
    <div className="workspace-metric-card settings-row flex items-center justify-between rounded-2xl bg-gray-50 px-4 py-4">
      <div className="flex items-start gap-3">
        <div className="settings-row-icon mt-1 text-gray-600">{icon}</div>
        <div>
          <div className="settings-row-title text-sm font-semibold text-gray-900">{title}</div>
          <div className="settings-row-description mt-1 text-sm text-gray-500">{description}</div>
        </div>
      </div>

      <button
        onClick={() => onChange(!checked)}
        className={`relative h-7 w-12 rounded-full transition ${checked ? 'bg-gradient-to-r from-blue-600 to-indigo-600 shadow-[0_6px_16px_rgba(37,99,235,0.38)]' : 'bg-gray-300'}`}
      >
        <span
          className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${checked ? 'left-6' : 'left-1'}`}
        />
      </button>
    </div>
  );
}


