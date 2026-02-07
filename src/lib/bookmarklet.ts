/**
 * Bookmarklet Generator
 * Creates a drag-to-bookmark tool that extracts images from any page
 * Supports both watermarking and verification modes
 */

export function generateBookmarkletCode(appUrl: string, mode: 'watermark' | 'verify' = 'watermark'): string {
  const param = mode === 'verify' ? 'verify' : 'image';
  const title = mode === 'verify' ? 'Click an image to verify' : 'Click an image to watermark';
  const buttonLabel = mode === 'verify' ? '🔍 Verify Image' : '🛡️ Watermark Image';

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
      header.innerHTML = '<h2 style="margin:0;font-size:24px;">${title}</h2><p style="margin:10px 0 0;opacity:0.7;">Press ESC to close</p>';
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
          var url = '${appUrl}?${param}=' + encodeURIComponent(img.src);
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

  const minified = code.replace(/\s+/g, ' ').trim();
  return `javascript:${encodeURIComponent(minified)}`;
}

/**
 * Generate a combined bookmarklet that lets user choose watermark or verify
 */
export function generateCombinedBookmarkletCode(appUrl: string): string {
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
      header.innerHTML = '<h2 style="margin:0;font-size:24px;">Image Guardian</h2><p style="margin:10px 0 0;opacity:0.7;">Click an image, then choose action. Press ESC to close.</p>';
      overlay.appendChild(header);
      
      images.forEach(function(img) {
        if (img.width < 50 || img.height < 50) return;
        
        var wrapper = document.createElement('div');
        wrapper.style.cssText = 'cursor:pointer;border:2px solid transparent;border-radius:8px;overflow:hidden;transition:all 0.2s;position:relative;';
        wrapper.onmouseover = function() { this.style.borderColor = '#00ffff'; this.style.boxShadow = '0 0 20px rgba(0,255,255,0.3)'; };
        wrapper.onmouseout = function() { this.style.borderColor = 'transparent'; this.style.boxShadow = 'none'; };
        
        var preview = document.createElement('img');
        preview.src = img.src;
        preview.style.cssText = 'max-width:200px;max-height:200px;display:block;';
        
        wrapper.onclick = function() {
          var actionOverlay = document.createElement('div');
          actionOverlay.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#111;border:2px solid #00ffff;border-radius:12px;padding:24px;z-index:1000001;text-align:center;';
          actionOverlay.innerHTML = '<p style="color:#fff;margin:0 0 16px;font-family:system-ui;">Choose action:</p>';
          var wmBtn = document.createElement('button');
          wmBtn.textContent = '🛡️ Watermark';
          wmBtn.style.cssText = 'background:#00ffff;color:#000;border:none;padding:10px 24px;border-radius:6px;cursor:pointer;font-weight:bold;margin:0 8px;font-size:14px;';
          wmBtn.onclick = function() { window.open('${appUrl}?image=' + encodeURIComponent(img.src), '_blank'); document.body.removeChild(overlay); };
          var vfBtn = document.createElement('button');
          vfBtn.textContent = '🔍 Verify';
          vfBtn.style.cssText = 'background:#00ff88;color:#000;border:none;padding:10px 24px;border-radius:6px;cursor:pointer;font-weight:bold;margin:0 8px;font-size:14px;';
          vfBtn.onclick = function() { window.open('${appUrl}?verify=' + encodeURIComponent(img.src), '_blank'); document.body.removeChild(overlay); };
          actionOverlay.appendChild(wmBtn);
          actionOverlay.appendChild(vfBtn);
          overlay.appendChild(actionOverlay);
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

  const minified = code.replace(/\s+/g, ' ').trim();
  return `javascript:${encodeURIComponent(minified)}`;
}

export function getBookmarkletInstructions(): string {
  return `
1. Drag the "Image Guardian" button to your bookmarks bar
2. Navigate to any webpage with images
3. Click the bookmarklet in your bookmarks
4. Select an image and choose: Watermark or Verify
5. The image will open in the appropriate tool
  `.trim();
}
