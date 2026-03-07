import { app, safeStorage } from 'electron';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';

function getStorePath(): string {
  const dir = app.getPath('userData');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return path.join(dir, 'keys.json');
}

function readStore(): Record<string, string> {
  try {
    const data = readFileSync(getStorePath(), 'utf-8');
    return JSON.parse(data);
  } catch {
    return {};
  }
}

function writeStore(data: Record<string, string>): void {
  writeFileSync(getStorePath(), JSON.stringify(data, null, 2));
}

export function getKey(name: string): string | null {
  const store = readStore();
  const encrypted = store[name];
  if (!encrypted) return null;
  if (!safeStorage.isEncryptionAvailable()) return null;
  try {
    return safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
  } catch {
    return null;
  }
}

export function setKey(name: string, value: string): void {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('OS encryption not available');
  }
  const store = readStore();
  store[name] = safeStorage.encryptString(value).toString('base64');
  writeStore(store);
}

export function hasKeys(): boolean {
  return !!getKey('anthropic-api-key');
}
