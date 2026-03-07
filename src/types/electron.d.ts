interface ElectronAPI {
  isElectron: true;
  platform: string;
  getApiKeys: () => Promise<{ anthropicKey: string; braveKey: string }>;
  setApiKeys: (keys: { anthropicKey: string; braveKey?: string }) => Promise<void>;
  hasApiKeys: () => Promise<boolean>;
  getAppVersion: () => Promise<string>;
  checkForUpdates: () => Promise<{ status: string; version?: string; message?: string }>;
}

interface Window {
  electronAPI?: ElectronAPI;
}
