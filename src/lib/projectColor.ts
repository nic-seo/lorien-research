const CARD_COLORS = ['pink', 'blue', 'yellow', 'green'] as const;

export type CardColor = (typeof CARD_COLORS)[number];

/** Derive a deterministic color from a project ID so cards + detail pages match. */
export function projectColor(projectId: string): CardColor {
  let hash = 0;
  for (let i = 0; i < projectId.length; i++) {
    hash = ((hash << 5) - hash + projectId.charCodeAt(i)) | 0;
  }
  return CARD_COLORS[Math.abs(hash) % CARD_COLORS.length];
}
