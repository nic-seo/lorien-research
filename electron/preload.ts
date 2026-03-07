import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform,

  // API key management
  getApiKeys: (): Promise<{ anthropicKey: string; braveKey: string }> =>
    ipcRenderer.invoke('get-api-keys'),

  setApiKeys: (keys: { anthropicKey: string; braveKey?: string }): Promise<void> =>
    ipcRenderer.invoke('set-api-keys', keys),

  hasApiKeys: (): Promise<boolean> =>
    ipcRenderer.invoke('has-api-keys'),

  // App info & updates
  getAppVersion: (): Promise<string> =>
    ipcRenderer.invoke('get-app-version'),

  checkForUpdates: (): Promise<{ status: string; version?: string; message?: string }> =>
    ipcRenderer.invoke('check-for-updates'),
});
