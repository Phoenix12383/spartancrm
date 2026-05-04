// ═════════════════════════════════════════════════════════════════════════════
// SPARTAN CRM — modules/11d-email-rte.js
// Extracted from 11-email-page.js on 2026-05-02 as part of monolith breakup.
// ═════════════════════════════════════════════════════════════════════════════


// ─────────────────────────────────────────────────────────────────────────────
// EMAIL RTE ACTIONS (data-action framework)
// ─────────────────────────────────────────────────────────────────────────────

defineAction('email-rte-bold', function(target, ev) {
  var editorId = target.dataset.editorId;
  if (editorId) rteBold(editorId);
});

defineAction('email-rte-italic', function(target, ev) {
  var editorId = target.dataset.editorId;
  if (editorId) rteItalic(editorId);
});

defineAction('email-rte-underline', function(target, ev) {
  var editorId = target.dataset.editorId;
  if (editorId) rteUnderline(editorId);
});

defineAction('email-rte-heading', function(target, ev) {
  var editorId = target.dataset.editorId;
  if (editorId) rteHeading(editorId);
});

defineAction('email-rte-bullet-list', function(target, ev) {
  var editorId = target.dataset.editorId;
  if (editorId) rteBulletList(editorId);
});

defineAction('email-rte-number-list', function(target, ev) {
  var editorId = target.dataset.editorId;
  if (editorId) rteNumberList(editorId);
});

defineAction('email-rte-create-link', function(target, ev) {
  var editorId = target.dataset.editorId;
  if (editorId) rteCreateLink(editorId);
});

defineAction('email-rte-insert-image', function(target, ev) {
  var editorId = target.dataset.editorId;
  if (editorId) rteInsertImage(editorId);
});

defineAction('email-rte-remove-format', function(target, ev) {
  var editorId = target.dataset.editorId;
  if (editorId) rteRemoveFormat(editorId);
});


// Generic toolbar action. Restores focus, runs execCommand, dispatches a
// synthetic `input` event so the editor's oninput handler fires.
function _rteExec(editorId, cmd, value) {
  var el = document.getElementById(editorId);
  if (!el) return;
  if (document.activeElement !== el) el.focus();
  try { document.execCommand(cmd, false, value == null ? null : value); } catch (e) {}
  try { el.dispatchEvent(new InputEvent('input', { bubbles: true })); }
  catch (e) { try { el.dispatchEvent(new Event('input', { bubbles: true })); } catch (e2) {} }
}


// Direct execCommand mappings — first arg is the editor id.
function rteBold(id)       { _rteExec(id, 'bold'); }

function rteItalic(id)     { _rteExec(id, 'italic'); }

function rteUnderline(id)  { _rteExec(id, 'underline'); }

function rteBulletList(id) { _rteExec(id, 'insertUnorderedList'); }

function rteNumberList(id) { _rteExec(id, 'insertOrderedList'); }

function rteRemoveFormat(id) { _rteExec(id, 'removeFormat'); }


// Toggles between <h3> and <p> so a second click on a heading line clears it.
// h3 fits inline-email size constraints better than h1/h2.
function rteHeading(id) {
  var el = document.getElementById(id); if (!el) return;
  el.focus();
  var sel = window.getSelection();
  var inHeading = false;
  if (sel && sel.rangeCount > 0) {
    var node = sel.getRangeAt(0).startContainer;
    while (node && node !== el) {
      if (node.nodeType === 1 && /^H[1-6]$/.test(node.tagName)) { inHeading = true; break; }
      node = node.parentNode;
    }
  }
  _rteExec(id, 'formatBlock', inHeading ? '<p>' : '<h3>');
}


// Link insertion. Requires a non-empty selection so there's something to
// attach the link to. Auto-prepends https:// for bare domains and mailto:
// for email-shaped strings so the Phase 1 sanitiser allow-list accepts the
// result.
function rteCreateLink(id) {
  var el = document.getElementById(id); if (!el) return;
  el.focus();
  var sel = window.getSelection();
  if (!sel || sel.toString().length === 0) {
    addToast('Select some text first, then click Link', 'info');
    return;
  }
  var url = window.prompt('Link URL:', 'https://');
  if (url == null) return;
  url = String(url).trim();
  if (url === '' || url === 'https://' || url === 'http://') return;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(url)) {
    if (url.indexOf('@') >= 0 && url.indexOf(' ') < 0) url = 'mailto:' + url;
    else url = 'https://' + url;
  }
  _rteExec(id, 'createLink', url);
}

function rteInsertImage(id) {
  var el = document.getElementById(id); if (!el) return;
  el.focus();
  var sel = window.getSelection();
  var savedRange = (sel && sel.rangeCount > 0) ? sel.getRangeAt(0).cloneRange() : null;

  var input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/png,image/jpeg,image/gif,image/webp';
  input.style.display = 'none';
  input.onchange = function () {
    var f = input.files && input.files[0];
    document.body.removeChild(input);
    if (!f) return;
    if (f.size > RTE_IMAGE_MAX_BYTES) {
      addToast('Image too large — max ' + Math.round(RTE_IMAGE_MAX_BYTES / 1024) + 'KB. Resize or host the image and link to it instead.', 'error');
      return;
    }
    var reader = new FileReader();
    reader.onload = function (ev) {
      var dataUri = ev.target.result;
      el.focus();
      if (savedRange) {
        var sel2 = window.getSelection();
        sel2.removeAllRanges();
        sel2.addRange(savedRange);
      }
      _rteExec(id, 'insertImage', dataUri);
    };
    reader.onerror = function () { addToast('Could not read the image file', 'error'); };
    reader.readAsDataURL(f);
  };
  document.body.appendChild(input);
  input.click();
}


// Renders the formatting toolbar HTML for a given editor id. Centralised so
// the composer and per-state signature editors share the same buttons +
// behaviour. Each button uses onmousedown=preventDefault so the editor
// doesn't blur and lose its selection on click.
function RteToolbar(editorId) {
  var safeId = String(editorId).replace(/'/g, "\\'");
  return ''
    +'<div style="padding:6px 14px;border-bottom:1px solid #f9fafb;display:flex;align-items:center;gap:4px;flex-wrap:wrap;background:#fafafa">'
    +  '<button title="Bold (Ctrl+B)"        onmousedown="event.preventDefault()" data-action="email-rte-bold" data-editor-id="'+safeId+'"         style="width:28px;height:28px;border:1px solid #e5e7eb;border-radius:6px;background:#fff;cursor:pointer;font-family:inherit;font-weight:700;font-size:13px;color:#374151" onmouseover="this.style.background=\'#f3f4f6\'" onmouseout="this.style.background=\'#fff\'">B</button>'
    +  '<button title="Italic (Ctrl+I)"      onmousedown="event.preventDefault()" data-action="email-rte-italic" data-editor-id="'+safeId+'"       style="width:28px;height:28px;border:1px solid #e5e7eb;border-radius:6px;background:#fff;cursor:pointer;font-family:inherit;font-style:italic;font-size:13px;color:#374151" onmouseover="this.style.background=\'#f3f4f6\'" onmouseout="this.style.background=\'#fff\'">I</button>'
    +  '<button title="Underline (Ctrl+U)"   onmousedown="event.preventDefault()" data-action="email-rte-underline" data-editor-id="'+safeId+'"    style="width:28px;height:28px;border:1px solid #e5e7eb;border-radius:6px;background:#fff;cursor:pointer;font-family:inherit;text-decoration:underline;font-size:13px;color:#374151" onmouseover="this.style.background=\'#f3f4f6\'" onmouseout="this.style.background=\'#fff\'">U</button>'
    +  '<span style="width:1px;height:18px;background:#e5e7eb;margin:0 4px"></span>'
    +  '<button title="Heading"              onmousedown="event.preventDefault()" data-action="email-rte-heading" data-editor-id="'+safeId+'"      style="height:28px;padding:0 8px;border:1px solid #e5e7eb;border-radius:6px;background:#fff;cursor:pointer;font-family:inherit;font-weight:700;font-size:11px;color:#374151" onmouseover="this.style.background=\'#f3f4f6\'" onmouseout="this.style.background=\'#fff\'">H</button>'
    +  '<button title="Bullet list"          onmousedown="event.preventDefault()" data-action="email-rte-bullet-list" data-editor-id="'+safeId+'"   style="width:28px;height:28px;border:1px solid #e5e7eb;border-radius:6px;background:#fff;cursor:pointer;font-family:inherit;font-size:13px;color:#374151" onmouseover="this.style.background=\'#f3f4f6\'" onmouseout="this.style.background=\'#fff\'">•</button>'
    +  '<button title="Numbered list"        onmousedown="event.preventDefault()" data-action="email-rte-number-list" data-editor-id="'+safeId+'"   style="width:28px;height:28px;border:1px solid #e5e7eb;border-radius:6px;background:#fff;cursor:pointer;font-family:inherit;font-size:11px;color:#374151" onmouseover="this.style.background=\'#f3f4f6\'" onmouseout="this.style.background=\'#fff\'">1.</button>'
    +  '<span style="width:1px;height:18px;background:#e5e7eb;margin:0 4px"></span>'
    +  '<button title="Insert link"          onmousedown="event.preventDefault()" data-action="email-rte-create-link" data-editor-id="'+safeId+'"   style="height:28px;padding:0 8px;border:1px solid #e5e7eb;border-radius:6px;background:#fff;cursor:pointer;font-family:inherit;font-size:11px;color:#374151" onmouseover="this.style.background=\'#f3f4f6\'" onmouseout="this.style.background=\'#fff\'">🔗 Link</button>'
    +  '<button title="Insert image (max 1MB)" onmousedown="event.preventDefault()" data-action="email-rte-insert-image" data-editor-id="'+safeId+'" style="height:28px;padding:0 8px;border:1px solid #e5e7eb;border-radius:6px;background:#fff;cursor:pointer;font-family:inherit;font-size:11px;color:#374151" onmouseover="this.style.background=\'#f3f4f6\'" onmouseout="this.style.background=\'#fff\'">🖼 Image</button>'
    +  '<span style="width:1px;height:18px;background:#e5e7eb;margin:0 4px"></span>'
    +  '<button title="Clear formatting"     onmousedown="event.preventDefault()" data-action="email-rte-remove-format" data-editor-id="'+safeId+'" style="height:28px;padding:0 8px;border:1px solid #e5e7eb;border-radius:6px;background:#fff;cursor:pointer;font-family:inherit;font-size:11px;color:#374151" onmouseover="this.style.background=\'#f3f4f6\'" onmouseout="this.style.background=\'#fff\'">Tx</button>'
    +'</div>';
}
