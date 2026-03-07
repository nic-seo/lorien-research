import { useState, useRef, useEffect } from 'react';

interface OnboardingOverlayProps {
  onComplete: () => void;
}

export default function OnboardingOverlay({ onComplete }: OnboardingOverlayProps) {
  const [anthropicKey, setAnthropicKey] = useState('');
  const [braveKey, setBraveKey] = useState('');
  const [showAnthropic, setShowAnthropic] = useState(false);
  const [showBrave, setShowBrave] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleGetStarted = async () => {
    if (!anthropicKey.trim()) {
      setError('An Anthropic API key is required to use Lorien Research.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await window.electronAPI?.setApiKeys({
        anthropicKey: anthropicKey.trim(),
        braveKey: braveKey.trim() || undefined,
      });
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save keys.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="onboarding-overlay">
      <div className="onboarding-modal">
        <div className="onboarding-header">
          <h2>Welcome to Lorien Research</h2>
          <p className="onboarding-subtitle">
            To get started, add your API keys below. Your keys are encrypted
            and stored locally on this device.
          </p>
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
              />
              <button
                className="settings-toggle-vis"
                onClick={() => setShowAnthropic(v => !v)}
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
              />
              <button
                className="settings-toggle-vis"
                onClick={() => setShowBrave(v => !v)}
              >
                {showBrave ? '◠' : '◡'}
              </button>
            </div>
            <p className="settings-hint">
              Enables web search in reports. You can add this later in Settings.
            </p>
          </div>

          {error && <p className="settings-error">{error}</p>}

          <button
            className="settings-save"
            onClick={handleGetStarted}
            disabled={saving || !anthropicKey.trim()}
          >
            {saving ? 'Setting up...' : 'Get Started'}
          </button>
        </div>
      </div>
    </div>
  );
}
