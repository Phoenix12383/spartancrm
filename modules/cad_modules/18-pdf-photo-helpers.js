// ═══════════════════════════════════════════════════════════════════════════
// M6: PHOTO DOWNSAMPLING HELPER (contract §6 — 1 MB PDF cap)
// ═══════════════════════════════════════════════════════════════════════════
// Async: shrinks a photo source (Blob / File / dataURL / http(s) URL) to a
// JPEG dataURL sized for PDF embedding. Longest edge ≤ maxEdgePx (default
// 800), quality default 0.7 — yields ≈50–100 KB per photo so 8 photos
// still leaves ≈400 KB under the 1 MB cap for body content. Resolves null
// on failure so the caller skips rather than crashing the whole PDF build.
// ═══════════════════════════════════════════════════════════════════════════

function downsamplePhoto(src, maxEdgePx, quality) {
  var maxEdge = (typeof maxEdgePx === 'number' && maxEdgePx > 0) ? maxEdgePx : 800;
  var q = (typeof quality === 'number' && quality > 0 && quality <= 1) ? quality : 0.7;

  return new Promise(function(resolve) {
    if (!src) { resolve(null); return; }

    var srcUrl, revokeAfter = false;
    try {
      if (typeof src === 'string') {
        srcUrl = src;
      } else if (src instanceof Blob || (typeof File !== 'undefined' && src instanceof File)) {
        srcUrl = URL.createObjectURL(src);
        revokeAfter = true;
      } else { resolve(null); return; }
    } catch (e) { resolve(null); return; }

    var cleanup = function() {
      if (revokeAfter) { try { URL.revokeObjectURL(srcUrl); } catch (e) {} }
    };

    var img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = function() {
      try {
        var w = img.naturalWidth || img.width;
        var h = img.naturalHeight || img.height;
        if (!w || !h) { cleanup(); resolve(null); return; }
        var scale = Math.min(1, maxEdge / Math.max(w, h));
        var tw = Math.max(1, Math.round(w * scale));
        var th = Math.max(1, Math.round(h * scale));
        var canvas = document.createElement('canvas');
        canvas.width = tw;
        canvas.height = th;
        var cctx = canvas.getContext('2d');
        // White background — JPEG has no alpha channel
        cctx.fillStyle = '#ffffff';
        cctx.fillRect(0, 0, tw, th);
        cctx.drawImage(img, 0, 0, tw, th);
        var dataUrl = canvas.toDataURL('image/jpeg', q);
        cleanup();
        resolve(dataUrl);
      } catch (e) { cleanup(); resolve(null); }
    };
    img.onerror = function() { cleanup(); resolve(null); };
    img.src = srcUrl;
  });
}

