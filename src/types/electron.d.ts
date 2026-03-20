interface ElectronAPI {
  isElectron: true;
  platform: string;
  getApiKeys: () => Promise<{ anthropicKey: string; braveKey: string }>;
  setApiKeys: (keys: { anthropicKey: string; braveKey?: string }) => Promise<void>;
  hasApiKeys: () => Promise<boolean>;
  getAppVersion: () => Promise<string>;
  checkForUpdates: () => Promise<{ status: string; version?: string; message?: string }>;
  installUpdate: () => Promise<void>;
  onUpdaterEvent: (
    callback: (event: { type: string; version?: string; percent?: number; message?: string }) => void
  ) => () => void;
  loadSessions: () => Promise<string>;
  saveSessions: (json: string) => Promise<void>;
  printToPdf: (title: string, html: string) => Promise<{ success: boolean; path?: string; error?: string }>;
  onAppShortcut: (callback: (shortcut: string) => void) => () => void;
}

interface Window {
  electronAPI?: ElectronAPI;
}
