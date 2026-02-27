import { useState, useRef, useCallback, useEffect } from 'react';
import { Trash2, Check } from 'lucide-react';

type DeleteState = 'idle' | 'confirming' | 'deleting';

interface ConfirmDeleteButtonProps {
  onConfirm: () => void | Promise<void>;
  size?: number;
  title?: string;
  confirmTitle?: string;
  timeoutMs?: number;
}

export default function ConfirmDeleteButton({
  onConfirm,
  size = 15,
  title = 'Delete',
  confirmTitle = 'Click to confirm',
  timeoutMs = 3000,
}: ConfirmDeleteButtonProps) {
  const [state, setState] = useState<DeleteState>('idle');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => clearTimer, [clearTimer]);

  const handleClick = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();

      if (state === 'idle') {
        setState('confirming');
        timerRef.current = setTimeout(() => setState('idle'), timeoutMs);
      } else if (state === 'confirming') {
        clearTimer();
        setState('deleting');
        try {
          await onConfirm();
        } catch (err) {
          console.error('Delete failed:', err);
          setState('idle');
        }
      }
    },
    [state, onConfirm, timeoutMs, clearTimer]
  );

  const Icon = state === 'idle' ? Trash2 : Check;
  const className = [
    'btn-delete',
    state === 'confirming' && 'confirming',
    state === 'deleting' && 'deleting',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      className={className}
      onClick={handleClick}
      disabled={state === 'deleting'}
      title={state === 'confirming' ? confirmTitle : title}
      aria-label={state === 'confirming' ? confirmTitle : title}
    >
      <Icon size={size} />
    </button>
  );
}
