import { Moon, Settings, Users, Plus, Trash2 } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { listAllowedUsers, addAllowedUser, deleteAllowedUser, type AllowedUser } from '../../services/auth';

type SettingsWorkspaceProps = {
  darkMode: boolean;
  onToggleDarkMode: (value: boolean) => void;
  onLogout: () => void;
};

export default function SettingsWorkspace({
  darkMode,
  onToggleDarkMode,
  onLogout,
}: SettingsWorkspaceProps) {
  const [users, setUsers] = useState<AllowedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [clientId, setClientId] = useState('');
  const [role, setRole] = useState('user');

  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const res = await listAllowedUsers();
      if (res.success) {
        setUsers(res.users);
      }
    } catch (err: any) {
      setFetchError(err.message || 'Failed to load allowed users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionError(null);
    setActionSuccess(null);

    if (!email.trim() || !password || !clientId.trim()) {
      setActionError('Email, password, and Client ID are required.');
      return;
    }

    try {
      setSubmitting(true);
      const res = await addAllowedUser(email.trim(), password, clientId.trim(), role);
      if (res.success) {
        setActionSuccess(`User ${res.user.email} added successfully!`);
        setEmail('');
        setPassword('');
        setClientId('');
        setRole('user');
        fetchUsers();
      }
    } catch (err: any) {
      setActionError(err.message || 'Failed to add allowed user');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteUser = async (userId: number) => {
    setActionError(null);
    setActionSuccess(null);
    if (!window.confirm('Are you sure you want to remove this user from the allowed list?')) {
      return;
    }

    try {
      const res = await deleteAllowedUser(userId);
      if (res.success) {
        setActionSuccess('User removed successfully.');
        fetchUsers();
      }
    } catch (err: any) {
      setActionError(err.message || 'Failed to delete allowed user');
    }
  };

  return (
    <div className="workspace-surface workspace-modern">
      <div className="workspace-header-glass workspace-header-glass-modern px-8 py-4">
        <div className="flex items-center gap-4">
          <div className="workspace-agent-icon">
            <Settings className="h-7 w-7" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-gray-900">Workspace Settings</h1>
          </div>
        </div>
      </div>

      <div className="workspace-content">
        <div className="mx-auto w-full max-w-4xl space-y-6">
          {/* General settings panel */}
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

            <div className="mt-8 border-t border-gray-200 pt-6">
              <div className="text-sm font-semibold text-gray-900">Account</div>
              <p className="mt-1 text-sm text-gray-500">Sign out to return to the login screen.</p>
              <button
                type="button"
                onClick={onLogout}
                className="mt-4 inline-flex h-10 items-center justify-center rounded-xl bg-black px-4 text-sm font-semibold text-white transition hover:bg-gray-900"
              >
                Logout
              </button>
            </div>
          </div>

          {/* Allowed Users Panel */}
          <div className="workspace-panel rounded-[30px] p-8 card-hover-lift mt-6">
            <div className="flex items-center gap-3 text-sm font-semibold uppercase tracking-[0.28em] text-gray-400 mb-6">
              <Users className="h-4 w-4" />
              Allowed Users & Access Control
            </div>

            {/* Ingestion Form */}
            <form onSubmit={handleAddUser} className="space-y-4 rounded-2xl bg-gray-50 p-6">
              <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2 mb-2">
                <Plus className="h-4 w-4 text-emerald-500" />
                Add New Allowed User
              </h3>
              
              {actionError && (
                <div className="p-3 text-xs bg-red-50 border border-red-200 text-red-600 rounded-xl">
                  {actionError}
                </div>
              )}
              {actionSuccess && (
                <div className="p-3 text-xs bg-emerald-50 border border-emerald-200 text-emerald-600 rounded-xl">
                  {actionSuccess}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-gray-700 uppercase tracking-wider">Email Address</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="user@example.com"
                    className="w-full h-10 px-3 text-sm rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-black"
                    required
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-gray-700 uppercase tracking-wider">Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full h-10 px-3 text-sm rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-black"
                    required
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-gray-700 uppercase tracking-wider">Client ID</label>
                  <input
                    type="text"
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                    placeholder="e.g. client_123"
                    className="w-full h-10 px-3 text-sm rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-black"
                    required
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-gray-700 uppercase tracking-wider">Role</label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="w-full h-10 px-3 text-sm rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-black/10 focus:border-black"
                  >
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex h-10 items-center justify-center rounded-xl bg-black px-6 text-sm font-semibold text-white transition hover:bg-gray-900 disabled:opacity-50"
                >
                  {submitting ? 'Adding...' : 'Add Allowed User'}
                </button>
              </div>
            </form>

            {/* List Section */}
            <div className="mt-8 border-t border-gray-200 pt-6">
              <h3 className="text-sm font-bold text-gray-900 mb-4">Allowed Users List</h3>
              
              {loading ? (
                <div className="py-8 text-center text-sm text-gray-500">Loading allowed users...</div>
              ) : fetchError ? (
                <div className="p-3 text-xs bg-red-50 border border-red-200 text-red-600 rounded-xl">
                  {fetchError}
                </div>
              ) : users.length === 0 ? (
                <div className="py-8 text-center text-sm text-gray-500">No allowed users configured.</div>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-gray-150">
                  <table className="w-full border-collapse text-left text-sm text-gray-500">
                    <thead className="bg-gray-50 text-xs font-bold text-gray-700 uppercase tracking-wider">
                      <tr>
                        <th className="px-6 py-3">Email</th>
                        <th className="px-6 py-3">Client ID</th>
                        <th className="px-6 py-3">Role</th>
                        <th className="px-6 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-150 bg-white">
                      {users.map((u) => (
                        <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-4 font-medium text-gray-900">{u.email}</td>
                          <td className="px-6 py-4">{u.client_id}</td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                              u.role === 'admin' ? 'bg-indigo-50 text-indigo-700' : 'bg-gray-100 text-gray-800'
                            }`}>
                              {u.role}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button
                              type="button"
                              onClick={() => handleDeleteUser(u.id)}
                              className="text-red-500 hover:text-red-700 transition"
                              title="Delete user"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
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
        type="button"
        aria-pressed={checked}
        className={`workspace-toggle-switch ${checked ? 'workspace-toggle-switch-on' : 'workspace-toggle-switch-off'}`}
      >
        <span
          className={`workspace-toggle-thumb ${checked ? 'left-6' : 'left-1'}`}
        />
      </button>
    </div>
  );
}


