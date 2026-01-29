import { useState } from 'react';
import { Bookmark, GripVertical, Info } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { generateBookmarkletCode } from '@/lib/bookmarklet';

export function BookmarkletSection() {
  const [isDragging, setIsDragging] = useState(false);
  
  // Get the current app URL for the bookmarklet
  const appUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const bookmarkletCode = generateBookmarkletCode(appUrl);

  return (
    <Card className="glass-panel p-6 neon-border">
      <div className="flex items-start gap-4">
        <div className="p-3 rounded-lg bg-primary/10 text-primary">
          <Bookmark className="w-6 h-6" />
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-foreground mb-2">
            Bookmarklet Tool
          </h3>
          <p className="text-sm text-muted-foreground mb-4">
            Drag this button to your bookmarks bar, then click it on any page to select and watermark images.
          </p>

          {/* Draggable Bookmarklet */}
          <a
            href={bookmarkletCode}
            draggable
            onDragStart={() => setIsDragging(true)}
            onDragEnd={() => setIsDragging(false)}
            onClick={(e) => e.preventDefault()}
            className={`
              inline-flex items-center gap-2 px-4 py-3 rounded-lg font-medium
              bg-gradient-to-r from-primary to-accent text-primary-foreground
              cursor-grab active:cursor-grabbing
              transition-all duration-200
              ${isDragging ? 'scale-105 shadow-lg shadow-primary/30' : 'hover:shadow-md hover:shadow-primary/20'}
            `}
          >
            <GripVertical className="w-4 h-4 opacity-60" />
            <Bookmark className="w-4 h-4" />
            Watermark Image
          </a>

          {/* Instructions */}
          <div className="mt-4 p-3 rounded-lg bg-muted/30 border border-border/50">
            <div className="flex items-start gap-2 text-xs text-muted-foreground">
              <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium text-foreground/80 mb-1">How to use:</p>
                <ol className="list-decimal list-inside space-y-1">
                  <li>Drag the button above to your bookmarks bar</li>
                  <li>Visit any webpage with AI-generated images</li>
                  <li>Click the bookmarklet to see all images</li>
                  <li>Select an image to watermark it here</li>
                </ol>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
