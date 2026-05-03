// ═════════════════════════════════════════════════════════════════════════════
// SPARTAN CRM — modules/11f-email-sanitize.js
// Extracted from 11-email-page.js on 2026-05-02 as part of monolith breakup.
// ═════════════════════════════════════════════════════════════════════════════


// HTML-escape helper. Gmail bodies and subjects routinely contain raw HTML
// (angle brackets, tags, entities). Interpolating them unescaped into
// template literals breaks layout when a single `<div>` or `</div>` leaks
// through — notably the unclosed tag that was swallowing the read-pane column.
function _escHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}


function _sanitizeHtml(html) {
  if (html == null) return '';
  if (typeof html !== 'string') html = String(html);
  if (html.length === 0) return '';
  try {
    // Parse in a sandboxed document. Note: <body> contents are a fragment;
    // we wrap in <!DOCTYPE><html><body> to get the full HTML5 parser
    // (entity decoding, auto-closing, etc.) without inheriting the live
    // document's CSP / base href.
    var doc = new DOMParser().parseFromString(
      '<!DOCTYPE html><html><body>' + html + '</body></html>',
      'text/html'
    );
    var body = doc && doc.body;
    if (!body) return '';
    _sanitizeWalk(body);
    return body.innerHTML;
  } catch (e) {
    // Parser failure (or DOMParser unavailable) — fall back to the safer
    // option of escape-everything rather than exposing the input unchanged.
    return _escHtml(html);
  }
}


// Walk children depth-first, mutating in place. Iteration is reverse-index
// so removals and unwraps don't shift the parts we haven't visited yet.
function _sanitizeWalk(node) {
  var children = node.childNodes;
  for (var i = children.length - 1; i >= 0; i--) {
    var child = children[i];
    var nt = child.nodeType;
    if (nt === 1) {
      // Element node
      var tag = child.tagName;
      if (!_SANITIZE_ALLOWED_TAGS[tag]) {
        // Disallowed: hard-remove for the dangerous set, unwrap (keep
        // children) for everything else so legitimate text inside an
        // unknown wrapper isn't silently lost.
        if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'IFRAME' ||
            tag === 'OBJECT' || tag === 'EMBED' || tag === 'LINK' ||
            tag === 'META' || tag === 'BASE' || tag === 'SVG' ||
            tag === 'FORM' || tag === 'INPUT' || tag === 'BUTTON' ||
            tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'OPTION') {
          child.parentNode.removeChild(child);
        } else {
          // Unwrap: move children up, then remove the wrapper.
          while (child.firstChild) child.parentNode.insertBefore(child.firstChild, child);
          child.parentNode.removeChild(child);
        }
      } else {
        _sanitizeAttrs(child);
        _sanitizeWalk(child);
      }
    } else if (nt === 8) {
      // Comment node — drop. No legitimate use in email body and they can
      // hide conditional-comment IE-targeted tricks.
      child.parentNode.removeChild(child);
    }
    // nt === 3 (text) — keep as-is. Text content is HTML-escaped on
    // serialise (innerHTML) so this is safe.
  }
}


function _sanitizeAttrs(el) {
  var tag = el.tagName;
  var allowed = _SANITIZE_ALLOWED_ATTRS[tag] || _SANITIZE_DEFAULT_ATTRS;
  var attrs = el.attributes;
  // Reverse-index so removals don't shift remaining attrs.
  for (var i = attrs.length - 1; i >= 0; i--) {
    var attr = attrs[i];
    var name = attr.name.toLowerCase();
    // Strip every event handler. The `on` prefix catches onclick, onerror,
    // onload, onmouseover, onmouseenter, onfocus, onblur, etc.
    if (name.indexOf('on') === 0) { el.removeAttribute(attr.name); continue; }
    // Strip any XML namespace attribute (xmlns, xml:base, …) — can be used
    // to inject SVG/MathML script semantics into otherwise-plain elements.
    if (name === 'xmlns' || name.indexOf('xml:') === 0 || name.indexOf('xmlns:') === 0) {
      el.removeAttribute(attr.name); continue;
    }
    // Drop anything not in the allow-list.
    if (!allowed[name]) { el.removeAttribute(attr.name); continue; }
    // Sanitise the values that need it.
    if (name === 'href') {
      var safeHref = _sanitizeUrl(attr.value, false);
      if (safeHref == null) { el.removeAttribute(attr.name); continue; }
      el.setAttribute(attr.name, safeHref);
    } else if (name === 'src') {
      var safeSrc = _sanitizeUrl(attr.value, tag === 'IMG');
      if (safeSrc == null) { el.removeAttribute(attr.name); continue; }
      el.setAttribute(attr.name, safeSrc);
    } else if (name === 'style') {
      var safeStyle = _sanitizeStyle(attr.value);
      if (safeStyle === '') { el.removeAttribute(attr.name); continue; }
      el.setAttribute('style', safeStyle);
    }
  }
  // Outbound link hardening: every <a> with an href gets rel="noopener
  // noreferrer" + target="_blank". This stops window.opener hijacking and
  // refers leaks, and ensures clicks open in a new tab rather than
  // navigating away from the CRM.
  if (tag === 'A' && el.getAttribute('href')) {
    el.setAttribute('rel', 'noopener noreferrer');
    el.setAttribute('target', '_blank');
  }
}


function _sanitizeUrl(value, isImg) {
  if (value == null) return null;
  var raw = String(value).trim();
  if (raw === '') return null;
  // Fragment / root-relative / path-relative URLs are always safe.
  var first = raw.charAt(0);
  if (first === '#' || first === '/' || first === '?' || first === '.') return raw;
  // Strip control chars + whitespace from the start of the value to defeat
  // bypasses like "java\nscript:..." or "  javascript:..."
  var cleaned = raw.replace(/[\x00-\x20]/g, '');
  if (cleaned === '') return null;
  var colon = cleaned.indexOf(':');
  if (colon < 0) return raw; // No scheme — relative URL, allow.
  // No '/' before the first ':' guarantees we have a scheme prefix.
  var slash = cleaned.indexOf('/');
  if (slash >= 0 && slash < colon) return raw; // path with colon — not a scheme
  var scheme = cleaned.slice(0, colon).toLowerCase();
  if (isImg) {
    // <img src> allows http(s) and a strict subset of data:image/*.
    if (scheme === 'http' || scheme === 'https') return raw;
    if (scheme === 'data') {
      // Allow only common raster image types. Reject SVG explicitly — it
      // can carry inline <script> elements that fire on render.
      if (/^data:image\/(png|jpe?g|gif|webp|bmp);/i.test(cleaned)) return raw;
      return null;
    }
    return null;
  }
  // <a href> allows http, https, mailto, tel — that covers practically
  // every legitimate email link without opening data: or javascript:.
  if (scheme === 'http' || scheme === 'https' || scheme === 'mailto' || scheme === 'tel') return raw;
  return null;
}


function _sanitizeStyle(value) {
  if (value == null) return '';
  var safe = [];
  String(value).split(';').forEach(function (decl) {
    decl = decl.trim();
    if (!decl) return;
    var colon = decl.indexOf(':');
    if (colon < 0) return;
    var prop = decl.slice(0, colon).trim().toLowerCase();
    var val  = decl.slice(colon + 1).trim();
    if (!val) return;
    if (!_SANITIZE_ALLOWED_CSS_PROPS[prop]) return;
    var lowerVal = val.toLowerCase();
    // Reject any value containing dangerous tokens. url() is rejected
    // entirely — even url(http://…) — since inbound email images can be
    // tracking pixels and we don't want background-image phoning home.
    if (lowerVal.indexOf('expression') >= 0) return;
    if (lowerVal.indexOf('javascript:') >= 0) return;
    if (lowerVal.indexOf('vbscript:') >= 0) return;
    if (lowerVal.indexOf('@import') >= 0) return;
    if (lowerVal.indexOf('url(') >= 0) return;
    // Reject angle brackets in values — paranoia against parser confusion.
    if (val.indexOf('<') >= 0 || val.indexOf('>') >= 0) return;
    safe.push(prop + ':' + val);
  });
  return safe.join(';');
}


// Top-level helper used at the email reading-pane and activity-timeline
// render sites. Distinguishes plain-text bodies (no tags at all) from
// HTML bodies, so plain-text emails preserve their newlines via
// white-space:pre-wrap while HTML emails control their own layout via
// the explicit tags they ship with. Without this branch, applying
// pre-wrap to HTML content adds spurious blank lines around block tags.
function _sanitizeEmailBody(body) {
  if (body == null) return '';
  body = String(body);
  if (body.indexOf('<') === -1) {
    return '<span style="white-space:pre-wrap">' + _escHtml(body) + '</span>';
  }
  return _sanitizeHtml(body);
}
