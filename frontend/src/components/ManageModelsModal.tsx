import React, { useState, useEffect } from 'react';
import { X, ChevronDown, Eye, EyeOff, CheckCircle2, AlertCircle } from 'lucide-react';

const API_BASE =
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_API_URL ||
  'http://localhost:8001/api';

const STORAGE_KEY = 'marko_custom_model_config';

interface ModelConfig {
  provider: string;
  model_name: string;
  base_url: string;
  api_key: string;
  enabled: boolean;
}

const DEFAULT_CONFIG: ModelConfig = {
  provider: 'openai',
  model_name: '',
  base_url: 'https://api.openai.com/v1',
  api_key: '',
  enabled: false,
};

const PROVIDER_DEFAULTS: Record<string, { base_url: string; placeholder: string }> = {
  openai: { base_url: 'https://api.openai.com/v1', placeholder: 'gpt-4.1-mini or gpt-4o' },
  gemini: { base_url: '', placeholder: 'gemini-2.5-flash or gemini-2.5-pro' },
  anthropic: { base_url: 'https://api.anthropic.com/v1', placeholder: 'claude-3-5-sonnet-20241022' },
  openrouter: { base_url: 'https://openrouter.ai/api/v1', placeholder: 'google/gemma-3-27b-it:free' },
};

interface ManageModelsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ManageModelsModal({ isOpen, onClose }: ManageModelsModalProps) {
  const [config, setConfig] = useState<ModelConfig>(DEFAULT_CONFIG);
  const [showKey, setShowKey] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [savedKeyLabel, setSavedKeyLabel] = useState('No custom API key saved yet.');

  // Load from localStorage on open
  useEffect(() => {
    if (!isOpen) return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as ModelConfig;
        setConfig({ ...DEFAULT_CONFIG, ...parsed, api_key: '' }); // Never pre-fill key for security
        if (parsed.api_key) {
          setSavedKeyLabel('API key saved. Enter a new key to replace it.');
        } else {
          setSavedKeyLabel('No custom API key saved yet.');
        }
      }
    } catch {
      // ignore
    }
  }, [isOpen]);

  const handleProviderChange = (provider: string) => {
    const defaults = PROVIDER_DEFAULTS[provider] || PROVIDER_DEFAULTS['openai'];
    setConfig((prev) => ({
      ...prev,
      provider,
      base_url: defaults.base_url,
    }));
  };

  const handleSave = async () => {
    setSaveStatus('saving');
    try {
      // Persist (without exposing key in localStorage fully, we store a flag)
      const toStore: ModelConfig = {
        ...config,
        api_key: config.api_key || (localStorage.getItem(STORAGE_KEY)
          ? (JSON.parse(localStorage.getItem(STORAGE_KEY)!) as ModelConfig).api_key
          : ''),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));

      // Send to backend
      await fetch(`${API_BASE}/user-model-config`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: config.provider,
          model_name: config.model_name,
          base_url: config.base_url || null,
          api_key: toStore.api_key,
          enabled: config.enabled,
        }),
      });

      setSaveStatus('saved');
      setSavedKeyLabel(toStore.api_key ? 'API key saved.' : 'No custom API key saved yet.');
      setConfig((prev) => ({ ...prev, api_key: '' }));
      setTimeout(() => setSaveStatus('idle'), 2500);
    } catch {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 2500);
    }
  };

  if (!isOpen) return null;

  const modelPlaceholder =
    (PROVIDER_DEFAULTS[config.provider] || PROVIDER_DEFAULTS['openai']).placeholder;
  const baseUrlLabel =
    config.provider === 'gemini' ? 'BASE URL (NOT REQUIRED FOR GEMINI)' : 'BASE URL (OPTIONAL)';

  return (
    <div
      className="manage-models-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Manage Models"
    >
      <div
        className="manage-models-card"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="manage-models-header">
          <div>
            <p className="manage-models-eyebrow">WORKSPACE TOOL</p>
            <h2 className="manage-models-title">Manage Models</h2>
            <p className="manage-models-subtitle">
              Choose whether chat uses the managed stack or a secured custom provider, then update
              the provider details in one place.
            </p>
          </div>
          <button
            onClick={onClose}
            className="manage-models-close-btn"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="manage-models-body">
          {/* Section card */}
          <div className="manage-models-section-card">
            <div className="manage-models-section-header">
              <div>
                <h3 className="manage-models-section-title">Assistant Model Access</h3>
                <p className="manage-models-section-desc">
                  Keep using the managed fallback stack, or connect your own model with an API key.
                </p>
              </div>
            </div>

            {/* Toggle row */}
            <div className="manage-models-toggle-row">
              <div>
                <p className="manage-models-toggle-label">Enable your own model</p>
                <p className="manage-models-toggle-desc">
                  When enabled, chat can switch from the managed model to your saved provider and model.
                </p>
              </div>
              <button
                id="enable-own-model-toggle"
                role="switch"
                aria-checked={config.enabled}
                onClick={() => setConfig((prev) => ({ ...prev, enabled: !prev.enabled }))}
                className={`manage-models-toggle-switch ${config.enabled ? 'enabled' : ''}`}
              >
                <span className="manage-models-toggle-thumb" />
              </button>
            </div>

            {/* Provider + Model Name row */}
            <div className="manage-models-fields-grid">
              <div className="manage-models-field-group">
                <label className="manage-models-field-label" htmlFor="provider-select">
                  PROVIDER
                </label>
                <div className="manage-models-select-wrapper">
                  <select
                    id="provider-select"
                    value={config.provider}
                    onChange={(e) => handleProviderChange(e.target.value)}
                    className="manage-models-select"
                    disabled={!config.enabled}
                  >
                    <option value="openai">OpenAI compatible</option>
                    <option value="gemini">Gemini</option>
                    <option value="anthropic">Anthropic</option>
                    <option value="openrouter">OpenRouter</option>
                  </select>
                  <ChevronDown className="manage-models-select-icon" />
                </div>
              </div>

              <div className="manage-models-field-group">
                <label className="manage-models-field-label" htmlFor="model-name-input">
                  MODEL NAME
                </label>
                <input
                  id="model-name-input"
                  type="text"
                  value={config.model_name}
                  onChange={(e) => setConfig((prev) => ({ ...prev, model_name: e.target.value }))}
                  placeholder={modelPlaceholder}
                  className="manage-models-input"
                  disabled={!config.enabled}
                />
              </div>
            </div>

            {/* Base URL + API Key row */}
            <div className="manage-models-fields-grid">
              <div className="manage-models-field-group">
                <label className="manage-models-field-label" htmlFor="base-url-input">
                  {baseUrlLabel}
                </label>
                <input
                  id="base-url-input"
                  type="text"
                  value={config.base_url}
                  onChange={(e) => setConfig((prev) => ({ ...prev, base_url: e.target.value }))}
                  placeholder={config.provider === 'gemini' ? '(uses Google AI SDK)' : 'https://api.openai.com/v1'}
                  className="manage-models-input"
                  disabled={!config.enabled || config.provider === 'gemini'}
                />
              </div>

              <div className="manage-models-field-group">
                <label className="manage-models-field-label" htmlFor="api-key-input">
                  API KEY
                </label>
                <div className="manage-models-key-row">
                  <div className="manage-models-key-input-wrapper">
                    <input
                      id="api-key-input"
                      type={showKey ? 'text' : 'password'}
                      value={config.api_key}
                      onChange={(e) => setConfig((prev) => ({ ...prev, api_key: e.target.value }))}
                      placeholder="••••••••"
                      className="manage-models-input manage-models-key-input"
                      disabled={!config.enabled}
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey((v) => !v)}
                      className="manage-models-eye-btn"
                      disabled={!config.enabled}
                      aria-label={showKey ? 'Hide key' : 'Show key'}
                    >
                      {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                  <button
                    id="save-model-config-btn"
                    onClick={handleSave}
                    disabled={!config.enabled || saveStatus === 'saving'}
                    className={`manage-models-save-btn ${saveStatus === 'saved' ? 'saved' : saveStatus === 'error' ? 'error' : ''}`}
                  >
                    {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? 'Saved!' : saveStatus === 'error' ? 'Error' : 'Save'}
                  </button>
                </div>
                <p className={`manage-models-key-status ${saveStatus === 'saved' ? 'text-emerald-400' : saveStatus === 'error' ? 'text-red-400' : ''}`}>
                  {saveStatus === 'saved' ? (
                    <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> {savedKeyLabel}</span>
                  ) : saveStatus === 'error' ? (
                    <span className="flex items-center gap-1"><AlertCircle className="h-3 w-3" /> Failed to save. Try again.</span>
                  ) : savedKeyLabel}
                </p>
              </div>
            </div>

            {/* Info banner when disabled */}
            {!config.enabled && (
              <div className="manage-models-info-banner">
                <span className="text-zinc-400">Using managed model stack:</span>
                <span className="font-semibold text-white ml-1">marko-2.0-mini</span>
                <span className="text-zinc-500 ml-1">→ Gemini → OpenRouter free models</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
