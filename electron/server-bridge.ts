import net from 'node:net';
import path from 'node:path';
import { app } from 'electron';
import type { Server } from 'node:http';
import { createServer, updateKeys } from '../server/index.js';

let server: Server | null = null;

async function findFreePort(): Promise<number> {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.listen(0, () => {
      const port = (srv.address() as net.AddressInfo).port;
      srv.close(() => resolve(port));
    });
  });
}

export async function startServer(config: {
  anthropicKey: string;
  braveKey: string;
}): Promise<number> {
  const port = await findFreePort();

  // Determine paths based on whether we're packaged or in dev
  const isProd = app.isPackaged;
  const staticDir = isProd
    ? path.join(process.resourcesPath, 'dist')
    : undefined; // In dev, Vite serves the frontend
  const skillsDir = isProd
    ? path.join(process.resourcesPath, 'skills')
    : path.join(app.getAppPath(), '.claude', 'skills', 'deep-research');

  updateKeys(config.anthropicKey, config.braveKey);
  server = await createServer(port, { staticDir, skillsDir });

  return port;
}

export async function updateServerKeys(anthropicKey: string, braveKey?: string): Promise<void> {
  updateKeys(anthropicKey, braveKey);
}

export function stopServer(): void {
  server?.close();
  server = null;
}
