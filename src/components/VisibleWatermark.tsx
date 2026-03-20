import { useUserRole } from '@/hooks/useUserRole';
import { useAuth } from '@/hooks/useAuth';
import { Shield } from 'lucide-react';

interface VisibleWatermarkProps {
  creatorId: string;
  timestamp: string;
  className?: string;
}

/**
 * Role-based visible watermark overlay (encrypted).
 * Only visible to admin/creator users — acts as "decrypted" view.
 * Public viewers see nothing.
 */
export function VisibleWatermark({ creatorId, timestamp, className = '' }: VisibleWatermarkProps) {
  const { canSeeVisibleWatermark, loading } = useUserRole();
  const { user } = useAuth();

  if (loading || !canSeeVisibleWatermark) return null;

  const displayName = user?.user_metadata?.full_name || user?.email || creatorId;
  const date = new Date(timestamp).toLocaleString();
  const watermarkText = `© ${displayName} • ${date}`;

  return (
    <div className={`absolute inset-0 pointer-events-none overflow-hidden ${className}`}>
      {/* Single large diagonal watermark centered */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div
          className="select-none whitespace-nowrap font-bold opacity-[0.25] tracking-widest"
          style={{
            transform: 'rotate(-35deg)',
            fontSize: 'clamp(1rem, 4vw, 2.5rem)',
            color: 'white',
            textShadow: '0 1px 6px rgba(0,0,0,0.5)',
            letterSpacing: '0.15em',
          }}
        >
          {watermarkText}
        </div>
      </div>

      {/* Corner badge */}
      <div className="absolute bottom-2 right-2 flex items-center gap-1 bg-primary/80 text-primary-foreground text-[10px] font-semibold px-2 py-1 rounded-full backdrop-blur-sm">
        <Shield className="w-3 h-3" />
        <span>© {displayName}</span>
      </div>
    </div>
  );
}
