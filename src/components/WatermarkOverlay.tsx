import { useRef, useEffect, useState } from 'react';

interface WatermarkOverlayProps {
  creatorId: string;
  timestamp: string;
  className?: string;
}

/**
 * Diagonal white watermark overlay that scales to fit the image container.
 * Renders the watermark text diagonally across the center of the image.
 */
export function WatermarkOverlay({ creatorId, timestamp, className = '' }: WatermarkOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [fontSize, setFontSize] = useState(16);

  const date = new Date(timestamp).toLocaleString();
  const watermarkText = `© ${creatorId} • ${date}`;

  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        // Scale font to ~4% of the diagonal length so it fits nicely
        const diagonal = Math.sqrt(width * width + height * height);
        const newSize = Math.max(10, Math.min(diagonal * 0.035, 32));
        setFontSize(newSize);
      }
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      className={`absolute inset-0 pointer-events-none overflow-hidden ${className}`}
    >
      {/* Repeating diagonal watermarks for full coverage */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-12">
        {[-2, -1, 0, 1, 2].map((offset) => (
          <div
            key={offset}
            className="select-none font-bold tracking-widest text-center"
            style={{
              transform: `rotate(-35deg) translateY(${offset * 60}px)`,
              fontSize: `${fontSize}px`,
              color: 'white',
              textShadow: '0 2px 8px rgba(0,0,0,0.7), 0 0px 20px rgba(0,0,0,0.3)',
              letterSpacing: '0.12em',
              opacity: offset === 0 ? 0.5 : 0.25,
              whiteSpace: 'nowrap',
            }}
          >
            {watermarkText}
          </div>
        ))}
      </div>
    </div>
  );
}
