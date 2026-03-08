import { useState, useEffect, useRef } from 'react';
import { exportDocs, importDocs } from '../../db';

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
  const [updateReady, setUpdateReady] = useState(false);
  const [transferStatus, setTransferStatus] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  // Load existing keys on mount + subscribe to updater events
  useEffect(() => {
    window.electronAPI?.getApiKeys().then(keys => {
      setAnthropicKey(keys.anthropicKey || '');
      setBraveKey(keys.braveKey || '');
    });
    window.electronAPI?.getAppVersion().then(v => setAppVersion(v || ''));
    inputRef.current?.focus();

    const unsub = window.electronAPI?.onUpdaterEvent(event => {
      if (event.type === 'update-available') {
        setUpdateStatus(`Downloading v${event.version}…`);
      } else if (event.type === 'download-progress') {
        setUpdateStatus(`Downloading… ${event.percent}%`);
      } else if (event.type === 'update-downloaded') {
        setUpdateStatus(`v${event.version} ready to install`);
        setUpdateReady(true);
      } else if (event.type === 'error') {
        setUpdateStatus(`Update error: ${event.message}`);
      }
    });
    return () => unsub?.();
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

          <hr className="settings-divider" />

          <div className="settings-field">
            <label className="settings-label">Data</label>
            <div className="settings-transfer-row">
              <button
                className="settings-transfer-btn"
                onClick={async () => {
                  setTransferStatus('Exporting…');
                  try {
                    const json = await exportDocs();
                    const a = Object.assign(document.createElement('a'), {
                      href: URL.createObjectURL(new Blob([json], { type: 'application/json' })),
                      download: `lorien-export-${new Date().toISOString().slice(0, 10)}.json`,
                    });
                    a.click();
                    setTransferStatus('Exported ✓');
                  } catch (e) {
                    setTransferStatus(`Export failed: ${e instanceof Error ? e.message : e}`);
                  }
                  setTimeout(() => setTransferStatus(''), 4000);
                }}
              >
                Export data
              </button>
              <button
                className="settings-transfer-btn"
                onClick={() => importInputRef.current?.click()}
              >
                Import data
              </button>
              <input
                ref={importInputRef}
                type="file"
                accept=".json"
                style={{ display: 'none' }}
                onChange={async e => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setTransferStatus('Importing…');
                  try {
                    const text = await file.text();
                    const { imported, errors } = await importDocs(text);
                    setTransferStatus(`Imported ${imported} docs${errors ? `, ${errors} errors` : ' ✓'}`);
                    setTimeout(() => { setTransferStatus(''); location.reload(); }, 1500);
                  } catch (e) {
                    setTransferStatus(`Import failed: ${e instanceof Error ? e.message : e}`);
                    setTimeout(() => setTransferStatus(''), 4000);
                  }
                  e.target.value = '';
                }}
              />
            </div>
            {transferStatus && <p className="settings-hint">{transferStatus}</p>}
          </div>

          {appVersion && (
            <>
              <hr className="settings-divider" />
              <div className="settings-field">
                <label className="settings-label">Updates</label>
                <div className="settings-version">
                  <span className="settings-version-label">v{appVersion}</span>
                  {updateReady ? (
                    <button
                      className="settings-update-btn settings-update-ready"
                      onClick={() => window.electronAPI?.installUpdate()}
                    >
                      Restart to update
                    </button>
                  ) : (
                    <button
                      className="settings-update-btn"
                      onClick={async () => {
                        setUpdateStatus('Checking…');
                        const result = await window.electronAPI?.checkForUpdates();
                        if (!result || result.status === 'dev') {
                          setUpdateStatus('Dev mode — updates disabled');
                          setTimeout(() => setUpdateStatus(''), 4000);
                        } else if (result.status === 'checked' && result.version) {
                          setUpdateStatus(`Downloading v${result.version}…`);
                        } else if (result.status === 'checked') {
                          setUpdateStatus('You\'re up to date');
                          setTimeout(() => setUpdateStatus(''), 4000);
                        } else {
                          setUpdateStatus(result.message || 'Check failed');
                          setTimeout(() => setUpdateStatus(''), 4000);
                        }
                      }}
                    >
                      Check for updates
                    </button>
                  )}
                  {updateStatus && <span className="settings-update-status">{updateStatus}</span>}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
