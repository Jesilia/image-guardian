import { useUserRole } from '@/hooks/useUserRole';
import { WatermarkOverlay } from '@/components/WatermarkOverlay';

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

  if (loading || !canSeeVisibleWatermark) return null;

  return <WatermarkOverlay creatorId={creatorId} timestamp={timestamp} className={className} />;
}
