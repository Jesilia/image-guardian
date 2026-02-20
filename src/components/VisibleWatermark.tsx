import { useUserRole } from '@/hooks/useUserRole';
import { useAuth } from '@/hooks/useAuth';
import { Shield } from 'lucide-react';

interface VisibleWatermarkProps {
  creatorId: string;
  timestamp: string;
  className?: string;
}

/**
 * Role-based visible watermark overlay.
 * Shows the user's display name (or email) and timestamp.
 * - Admin/Creator: Full semi-transparent copyright overlay
 * - Public (viewer/unauthenticated): Nothing visible
 */
export function VisibleWatermark({ creatorId, timestamp, className = '' }: VisibleWatermarkProps) {
  const { canSeeVisibleWatermark, loading } = useUserRole();
  const { user } = useAuth();

  if (loading || !canSeeVisibleWatermark) return null;

  const displayName = user?.user_metadata?.full_name || user?.email || creatorId;
  const date = new Date(timestamp).toLocaleString();

  return (
    <div className={`absolute inset-0 pointer-events-none ${className}`}>
      {/* Diagonal repeating watermark text — name + timestamp */}
      <div className="absolute inset-0 overflow-hidden opacity-[0.08]">
        <div className="absolute inset-[-50%] flex flex-wrap gap-16 rotate-[-30deg] items-center justify-center">
          {Array.from({ length: 12 }).map((_, i) => (
            <span
              key={i}
              className="text-foreground text-lg font-bold whitespace-nowrap select-none"
            >
              © {displayName} • {date}
            </span>
          ))}
        </div>
      </div>

      {/* Corner badge — show username */}
      <div className="absolute bottom-2 right-2 flex items-center gap-1 bg-primary/80 text-primary-foreground text-[10px] font-semibold px-2 py-1 rounded-full backdrop-blur-sm">
        <Shield className="w-3 h-3" />
        <span>© {displayName}</span>
      </div>
    </div>
  );
}
