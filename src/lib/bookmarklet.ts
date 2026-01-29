/**
 * Bookmarklet Generator
 * Creates a drag-to-bookmark tool that extracts images from any page
 */

export function generateBookmarkletCode(appUrl: string): string {
  // The bookmarklet code that runs on the target page
  const code = `
    (function() {
      var images = document.querySelectorAll('img');
      if (images.length === 0) {
        alert('No images found on this page');
        return;
      }
      
      var overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.9);z-index:999999;overflow:auto;padding:20px;display:flex;flex-wrap:wrap;gap:10px;align-content:flex-start;';
      
      var header = document.createElement('div');
      header.style.cssText = 'width:100%;text-align:center;color:#00ffff;font-family:system-ui;margin-bottom:20px;';
      header.innerHTML = '<h2 style="margin:0;font-size:24px;">Click an image to watermark</h2><p style="margin:10px 0 0;opacity:0.7;">Press ESC to close</p>';
      overlay.appendChild(header);
      
      images.forEach(function(img) {
        if (img.width < 50 || img.height < 50) return;
        
        var wrapper = document.createElement('div');
        wrapper.style.cssText = 'cursor:pointer;border:2px solid transparent;border-radius:8px;overflow:hidden;transition:all 0.2s;';
        wrapper.onmouseover = function() { this.style.borderColor = '#00ffff'; this.style.boxShadow = '0 0 20px rgba(0,255,255,0.3)'; };
        wrapper.onmouseout = function() { this.style.borderColor = 'transparent'; this.style.boxShadow = 'none'; };
        
        var preview = document.createElement('img');
        preview.src = img.src;
        preview.style.cssText = 'max-width:200px;max-height:200px;display:block;';
        
        wrapper.onclick = function() {
          var url = '${appUrl}?image=' + encodeURIComponent(img.src);
          window.open(url, '_blank');
          document.body.removeChild(overlay);
        };
        
        wrapper.appendChild(preview);
        overlay.appendChild(wrapper);
      });
      
      var closeBtn = document.createElement('button');
      closeBtn.textContent = '✕ Close';
      closeBtn.style.cssText = 'position:fixed;top:20px;right:20px;background:#00ffff;color:#000;border:none;padding:10px 20px;border-radius:6px;cursor:pointer;font-weight:bold;z-index:1000000;';
      closeBtn.onclick = function() { document.body.removeChild(overlay); };
      overlay.appendChild(closeBtn);
      
      document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && document.body.contains(overlay)) {
          document.body.removeChild(overlay);
        }
      });
      
      document.body.appendChild(overlay);
    })();
  `;

  // Minify and encode
  const minified = code.replace(/\s+/g, ' ').trim();
  return `javascript:${encodeURIComponent(minified)}`;
}

/**
 * Get the display-friendly bookmarklet for instruction purposes
 */
export function getBookmarkletInstructions(): string {
  return `
1. Drag the "Watermark Image" button to your bookmarks bar
2. Navigate to any webpage with images
3. Click the bookmarklet in your bookmarks
4. Select an image to watermark
5. The image will open in the watermark tool
  `.trim();
}
