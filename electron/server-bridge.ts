import net from 'node:net';
import path from 'node:path';
import { app } from 'electron';
import type { Server } from 'node:http';
import { createServer, updateKeys } from '../server/index.js';

let server: Server | null = null;

// Fixed port keeps the localhost origin stable across launches so IndexedDB persists.
// Chosen to avoid common dev ports; virtually never conflicts on a personal machine.
const STABLE_PORT = 47321;

async function findFreePort(): Promise<number> {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.listen(0, () => {
      const port = (srv.address() as net.AddressInfo).port;
      srv.close(() => resolve(port));
    });
  });
}

// Try the stable port first; fall back to a random free port only if something
// else on the machine has already claimed it.
async function getPort(): Promise<number> {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', async () => resolve(await findFreePort()));
    srv.listen(STABLE_PORT, '127.0.0.1', () => {
      srv.close(() => resolve(STABLE_PORT));
    });
  });
}

export async function startServer(config: {
  anthropicKey: string;
  braveKey: string;
}): Promise<number> {
  const port = await getPort();

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
