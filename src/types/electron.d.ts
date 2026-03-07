interface ElectronAPI {
  isElectron: true;
  platform: string;
  getApiKeys: () => Promise<{ anthropicKey: string; braveKey: string }>;
  setApiKeys: (keys: { anthropicKey: string; braveKey?: string }) => Promise<void>;
  hasApiKeys: () => Promise<boolean>;
}

interface Window {
  electronAPI?: ElectronAPI;
}
