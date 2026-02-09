/**
 * Bookmarklet Generator
 * Creates a drag-to-bookmark tool that extracts images from any page
 * and opens them in the /tools page for watermarking or verification
 */

export function generateBookmarkletCode(appUrl: string, mode: 'watermark' | 'verify' = 'watermark'): string {
  const param = mode === 'verify' ? 'verify' : 'image';
  const title = mode === 'verify' ? 'Click an image to verify' : 'Click an image to watermark';

  const code = `
    (function() {
      var images = document.querySelectorAll('img');
      if (images.length === 0) {
        alert('No images found on this page');
        return;
      }
      
      var overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.85);z-index:999999;overflow:auto;padding:20px;display:flex;flex-wrap:wrap;gap:10px;align-content:flex-start;';
      
      var header = document.createElement('div');
      header.style.cssText = 'width:100%;text-align:center;color:#fff;font-family:system-ui;margin-bottom:20px;';
      header.innerHTML = '<h2 style="margin:0;font-size:24px;">${title}</h2><p style="margin:10px 0 0;opacity:0.6;font-size:14px;">Press ESC to close</p>';
      overlay.appendChild(header);
      
      images.forEach(function(img) {
        if (img.width < 50 || img.height < 50) return;
        
        var wrapper = document.createElement('div');
        wrapper.style.cssText = 'cursor:pointer;border:2px solid transparent;border-radius:8px;overflow:hidden;transition:all 0.2s;';
        wrapper.onmouseover = function() { this.style.borderColor = '#3b82f6'; this.style.boxShadow = '0 0 15px rgba(59,130,246,0.3)'; };
        wrapper.onmouseout = function() { this.style.borderColor = 'transparent'; this.style.boxShadow = 'none'; };
        
        var preview = document.createElement('img');
        preview.src = img.src;
        preview.style.cssText = 'max-width:200px;max-height:200px;display:block;';
        
        wrapper.onclick = function() {
          var url = '${appUrl}/tools?${param}=' + encodeURIComponent(img.src);
          window.open(url, '_blank');
          document.body.removeChild(overlay);
        };
        
        wrapper.appendChild(preview);
        overlay.appendChild(wrapper);
      });
      
      var closeBtn = document.createElement('button');
      closeBtn.textContent = '✕ Close';
      closeBtn.style.cssText = 'position:fixed;top:20px;right:20px;background:#3b82f6;color:#fff;border:none;padding:10px 20px;border-radius:6px;cursor:pointer;font-weight:bold;z-index:1000000;font-family:system-ui;';
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
      overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.85);z-index:999999;overflow:auto;padding:20px;display:flex;flex-wrap:wrap;gap:10px;align-content:flex-start;';
      
      var header = document.createElement('div');
      header.style.cssText = 'width:100%;text-align:center;color:#fff;font-family:system-ui;margin-bottom:20px;';
      header.innerHTML = '<h2 style="margin:0;font-size:24px;">Image Guardian</h2><p style="margin:10px 0 0;opacity:0.6;font-size:14px;">Click an image, then choose action. Press ESC to close.</p>';
      overlay.appendChild(header);
      
      images.forEach(function(img) {
        if (img.width < 50 || img.height < 50) return;
        
        var wrapper = document.createElement('div');
        wrapper.style.cssText = 'cursor:pointer;border:2px solid transparent;border-radius:8px;overflow:hidden;transition:all 0.2s;position:relative;';
        wrapper.onmouseover = function() { this.style.borderColor = '#3b82f6'; this.style.boxShadow = '0 0 15px rgba(59,130,246,0.3)'; };
        wrapper.onmouseout = function() { this.style.borderColor = 'transparent'; this.style.boxShadow = 'none'; };
        
        var preview = document.createElement('img');
        preview.src = img.src;
        preview.style.cssText = 'max-width:200px;max-height:200px;display:block;';
        
        wrapper.onclick = function() {
          var actionOverlay = document.createElement('div');
          actionOverlay.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#1e293b;border:1px solid #334155;border-radius:12px;padding:24px;z-index:1000001;text-align:center;font-family:system-ui;';
          actionOverlay.innerHTML = '<p style="color:#fff;margin:0 0 16px;font-size:15px;">Choose action:</p>';
          var wmBtn = document.createElement('button');
          wmBtn.textContent = '🛡️ Watermark';
          wmBtn.style.cssText = 'background:#3b82f6;color:#fff;border:none;padding:10px 24px;border-radius:6px;cursor:pointer;font-weight:600;margin:0 8px;font-size:14px;font-family:system-ui;';
          wmBtn.onclick = function() { window.open('${appUrl}/tools?image=' + encodeURIComponent(img.src), '_blank'); document.body.removeChild(overlay); };
          var vfBtn = document.createElement('button');
          vfBtn.textContent = '🔍 Verify';
          vfBtn.style.cssText = 'background:#22c55e;color:#fff;border:none;padding:10px 24px;border-radius:6px;cursor:pointer;font-weight:600;margin:0 8px;font-size:14px;font-family:system-ui;';
          vfBtn.onclick = function() { window.open('${appUrl}/tools?verify=' + encodeURIComponent(img.src), '_blank'); document.body.removeChild(overlay); };
          var cancelBtn = document.createElement('button');
          cancelBtn.textContent = 'Cancel';
          cancelBtn.style.cssText = 'background:transparent;color:#94a3b8;border:1px solid #475569;padding:10px 24px;border-radius:6px;cursor:pointer;font-weight:500;margin:0 8px;font-size:14px;font-family:system-ui;';
          cancelBtn.onclick = function() { actionOverlay.remove(); };
          actionOverlay.appendChild(wmBtn);
          actionOverlay.appendChild(vfBtn);
          actionOverlay.appendChild(cancelBtn);
          overlay.appendChild(actionOverlay);
        };
        
        wrapper.appendChild(preview);
        overlay.appendChild(wrapper);
      });
      
      var closeBtn = document.createElement('button');
      closeBtn.textContent = '✕ Close';
      closeBtn.style.cssText = 'position:fixed;top:20px;right:20px;background:#3b82f6;color:#fff;border:none;padding:10px 20px;border-radius:6px;cursor:pointer;font-weight:bold;z-index:1000000;font-family:system-ui;';
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
5. The image will open in the Tools page and auto-load
  `.trim();
}
