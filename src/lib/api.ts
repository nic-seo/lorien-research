// API client for the research server

export interface GenerateReportResult {
  htmlContent: string;
  title: string;
}

export async function generateReport(query: string): Promise<GenerateReportResult> {
  const response = await fetch('/api/research', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
    // Reports can take 2-3 minutes to generate — don't let the browser kill it early
    signal: AbortSignal.timeout(5 * 60 * 1000),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message = body?.error || `Server error (${response.status})`;
    throw new Error(message);
  }

  return response.json();
}
