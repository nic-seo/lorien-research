import { useState, useEffect, useRef } from 'react';

interface SettingsOverlayProps {
  onClose: () => void;
}

export default function SettingsOverlay({ onClose }: SettingsOverlayProps) {
  const [anthropicKey, setAnthropicKey] = useState('');
  const [braveKey, setBraveKey] = useState('');
  const [showAnthropic, setShowAnthropic] = useState(false);
  const [showBrave, setShowBrave] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appVersion, setAppVersion] = useState('');
  const [updateStatus, setUpdateStatus] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Load existing keys on mount
  useEffect(() => {
    window.electronAPI?.getApiKeys().then(keys => {
      setAnthropicKey(keys.anthropicKey || '');
      setBraveKey(keys.braveKey || '');
    });
    window.electronAPI?.getAppVersion().then(v => setAppVersion(v || ''));
    inputRef.current?.focus();
  }, []);

  const handleSave = async () => {
    if (!anthropicKey.trim()) {
      setError('Anthropic API key is required.');
      return;
    }

    setSaving(true);
    setError(null);
    setSaved(false);

    try {
      await window.electronAPI?.setApiKeys({
        anthropicKey: anthropicKey.trim(),
        braveKey: braveKey.trim() || undefined,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save keys.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={e => e.stopPropagation()}>
        <div className="settings-header">
          <h3>Settings</h3>
          <button className="settings-close" onClick={onClose}>Esc</button>
        </div>

        <div className="settings-body">
          <div className="settings-field">
            <label className="settings-label">
              Anthropic API Key
              <span className="settings-required">required</span>
            </label>
            <div className="settings-input-row">
              <input
                ref={inputRef}
                type={showAnthropic ? 'text' : 'password'}
                className="settings-input"
                value={anthropicKey}
                onChange={e => setAnthropicKey(e.target.value)}
                placeholder="sk-ant-..."
                onKeyDown={e => { if (e.key === 'Escape') onClose(); }}
              />
              <button
                className="settings-toggle-vis"
                onClick={() => setShowAnthropic(v => !v)}
                title={showAnthropic ? 'Hide' : 'Show'}
              >
                {showAnthropic ? '◠' : '◡'}
              </button>
            </div>
            <p className="settings-hint">
              Get one at <span className="settings-link">console.anthropic.com</span>
            </p>
          </div>

          <div className="settings-field">
            <label className="settings-label">
              Brave Search API Key
              <span className="settings-optional">optional</span>
            </label>
            <div className="settings-input-row">
              <input
                type={showBrave ? 'text' : 'password'}
                className="settings-input"
                value={braveKey}
                onChange={e => setBraveKey(e.target.value)}
                placeholder="BSA..."
                onKeyDown={e => { if (e.key === 'Escape') onClose(); }}
              />
              <button
                className="settings-toggle-vis"
                onClick={() => setShowBrave(v => !v)}
                title={showBrave ? 'Hide' : 'Show'}
              >
                {showBrave ? '◠' : '◡'}
              </button>
            </div>
            <p className="settings-hint">
              Enables web search in reports. Get one at <span className="settings-link">brave.com/search/api</span>
            </p>
          </div>

          {error && <p className="settings-error">{error}</p>}

          <button
            className="settings-save"
            onClick={handleSave}
            disabled={saving || !anthropicKey.trim()}
          >
            {saving ? 'Saving...' : saved ? 'Saved' : 'Save Keys'}
          </button>

          {appVersion && (
            <div className="settings-version">
              <span className="settings-version-label">v{appVersion}</span>
              <button
                className="settings-update-btn"
                onClick={async () => {
                  setUpdateStatus('Checking...');
                  const result = await window.electronAPI?.checkForUpdates();
                  if (!result || result.status === 'dev') {
                    setUpdateStatus('Dev mode — updates disabled');
                  } else if (result.status === 'checked' && result.version) {
                    setUpdateStatus(`Update available: v${result.version}`);
                  } else if (result.status === 'checked') {
                    setUpdateStatus('You\'re up to date');
                  } else {
                    setUpdateStatus(result.message || 'Check failed');
                  }
                  setTimeout(() => setUpdateStatus(''), 5000);
                }}
              >
                Check for updates
              </button>
              {updateStatus && <span className="settings-update-status">{updateStatus}</span>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
