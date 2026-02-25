interface TagPillProps {
  label: string;
  color?: 'pink' | 'green' | 'blue' | 'yellow' | 'lavender' | 'coral';
  onClick?: () => void;
}

export default function TagPill({ label, color = 'blue', onClick }: TagPillProps) {
  return (
    <span
      className={`tag-pill tag-${color}`}
      onClick={onClick}
      style={onClick ? { cursor: 'pointer' } : undefined}
    >
      {label}
    </span>
  );
}
