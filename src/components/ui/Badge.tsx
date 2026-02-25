interface BadgeProps {
  label: string;
  variant?: 'pink' | 'green' | 'blue' | 'yellow' | 'lavender' | 'coral';
}

export default function Badge({ label, variant = 'blue' }: BadgeProps) {
  return <span className={`badge badge-${variant}`}>{label}</span>;
}
