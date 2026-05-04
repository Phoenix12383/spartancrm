// ═════════════════════════════════════════════════════════════════════════════
// SPARTAN CRM — 14a-google-maps-real.js
// Real Google Maps implementation. When the SDK loaded by loadGoogleMaps()
// in 11-email-page.js finishes initialising, this module swaps the mock
// exports (from 14-google-maps-mock.js) for real ones and re-mounts the
// leads map. If the SDK never loads (no key, auth failure, network blocked),
// the mock stays in place as a graceful fallback.
// ═════════════════════════════════════════════════════════════════════════════

// ── Event-delegation actions (07-shared-ui.js framework, 2026-05-03) ────────
defineAction('maps-open-lead', function(target, ev) {
  var leadId = target.dataset.leadId;
  setState({leadDetailId: leadId, page: 'leads'});
  renderPage();
});

var _realLeadsMap = null;
var _realLeadsMarkers = [];

// ── Geocoding cache ─────────────────────────────────────────────────────────
// Persisted to localStorage so we don't re-hit the Google Geocoding API for
// the same address on every reload. Values are {lat,lng} for successful hits
// or null for addresses Google couldn't resolve (prevents retry storms).
var _geocodeCache = (function() {
  try { return JSON.parse(localStorage.getItem('spartan_geocode_cache') || '{}'); }
  catch(e) { return {}; }
})();
var _geocodePending = {};  // addressKey → true; dedups in-flight requests
function _geocodeCacheKey(s) { return String(s || '').trim().toLowerCase(); }
function _persistGeocodeCache() {
  try { localStorage.setItem('spartan_geocode_cache', JSON.stringify(_geocodeCache)); }
  catch(e) { /* localStorage full — fine, just lose the cache */ }
}
// Exposed for manual cache flushing during testing.
window._clearGeocodeCache = function() {
  _geocodeCache = {};
  _geocodePending = {};
  try { localStorage.removeItem('spartan_geocode_cache'); } catch(e) {}
  console.log('[Geocode] cache cleared');
  if (typeof refreshRealMapData === 'function') refreshRealMapData();
};

function _scheduleGeocode(address, key) {
  if (_geocodePending[key]) return;
  if (!window.google || !google.maps || typeof google.maps.Geocoder !== 'function') return;
  _geocodePending[key] = true;
  var geocoder = new google.maps.Geocoder();
  geocoder.geocode({ address: address, region: 'au' }, function(results, status) {
    delete _geocodePending[key];
    if (status === 'OK' && results && results[0]) {
      var loc = results[0].geometry.location;
      _geocodeCache[key] = { lat: loc.lat(), lng: loc.lng() };
      _persistGeocodeCache();
      // Refresh the map so the newly-resolved pin appears.
      if (typeof refreshRealMapData === 'function') {
        try { refreshRealMapData(); } catch(e) {}
      }
    } else if (status === 'ZERO_RESULTS') {
      // Address genuinely unresolvable — cache a null to stop retrying.
      _geocodeCache[key] = null;
      _persistGeocodeCache();
    } else {
      // OVER_QUERY_LIMIT / REQUEST_DENIED / UNKNOWN_ERROR — don't cache,
      // may succeed on a later attempt.
      console.warn('[Geocode]', status, 'for', address);
    }
  });
}

// Resolve a CRM entity (lead / deal / appointment) to lat/lng using Google
// Geocoding, with cache. Returns cached coord synchronously if available;
// otherwise kicks off async geocoding and returns the best fallback (suburb
// centroid if the suburb is in SUBURB_COORDS, else the branch centre).
function resolveEntityCoords(entity) {
  if (!entity) return null;
  var branch = entity.branch || 'VIC';
  var parts = [entity.street, entity.suburb, entity.state || branch, entity.postcode, 'Australia']
    .map(function(p) { return (p || '').toString().trim(); })
    .filter(Boolean);
  var address = parts.join(', ');
  var fallback = (typeof getSuburbCoords === 'function') ? getSuburbCoords(entity.suburb, branch) : null;
  if (!address || address === 'Australia') return fallback;

  var key = _geocodeCacheKey(address);
  if (key in _geocodeCache) {
    // Cached — may be {lat,lng} or null (unresolvable).
    return _geocodeCache[key] || fallback;
  }
  _scheduleGeocode(address, key);
  return fallback;
}

// Schedule Map page state (separate from the leads map so both can coexist).
var _scheduleMap = null;
var _scheduleMarkers = [];
var _scheduleMapEl = null;

function initRealGoogleMap(containerId) {
  var container = document.getElementById(containerId);
  if (!container) return null;
  if (!window.google || !window.google.maps || typeof window.google.maps.Map !== 'function') {
    console.warn('[Real Maps] google.maps.Map not available — cannot init');
    return null;
  }

  // Initial centre follows the state's branch filter (default VIC).
  var st = (typeof getState === 'function') ? getState() : {};
  var branch = st.branch && st.branch !== 'all' ? st.branch : 'VIC';
  var centre = branch === 'SA'  ? { lat: -34.9287, lng: 138.5999 }
             : branch === 'ACT' ? { lat: -35.2809, lng: 149.1300 }
                                : { lat: -37.8136, lng: 144.9631 };

  // mapId is required for AdvancedMarkerElement to render. 'DEMO_MAP_ID' is a
  // Google-provided placeholder good for development. Swap for a real Map ID
  // created in Cloud Console → Map Management when you want custom styling.
  _realLeadsMap = new google.maps.Map(container, {
    center: centre,
    zoom: 11,
    mapId: 'DEMO_MAP_ID',
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: false,
    clickableIcons: false,
  });
  console.log('[Real Maps] Map initialised at', centre);
  return _realLeadsMap;
}

function refreshRealMapData() {
  if (!_realLeadsMap) return;
  if (!google.maps.marker || typeof google.maps.marker.AdvancedMarkerElement !== 'function') {
    console.warn('[Real Maps] marker library not loaded — ensure libraries=places,marker in the SDK URL');
    return;
  }

  var AdvancedMarker = google.maps.marker.AdvancedMarkerElement;
  var Pin = google.maps.marker.PinElement;

  // Clear previous markers so we don't accumulate across refreshes.
  _realLeadsMarkers.forEach(function(m) { try { m.map = null; } catch(e) {} });
  _realLeadsMarkers = [];

  var st = (typeof getState === 'function') ? getState() : {};
  var leads = st.leads || [];
  var branchFilter = st.branch && st.branch !== 'all' ? st.branch : null;

  // Jitter stacked markers so overlapping pins stay individually visible.
  // Keyed by 5-decimal-place lat/lng (~1m resolution) — anything closer than
  // that is treated as a collision and fanned out on a golden-angle spiral.
  var _stackCounts = {};
  function _spreadIfStacked(coords) {
    if (!coords) return coords;
    var key = coords.lat.toFixed(5) + ',' + coords.lng.toFixed(5);
    var n = _stackCounts[key] || 0;
    _stackCounts[key] = n + 1;
    if (n === 0) return coords;
    // ~50m radius; golden angle (137.5°) spreads pins evenly for any N.
    var angle = (n * 137.5) * Math.PI / 180;
    return {
      lat: coords.lat + Math.cos(angle) * 0.00045,
      lng: coords.lng + Math.sin(angle) * 0.00045,
    };
  }

  // Rep base markers — larger coloured pin with a star glyph so reps are
  // instantly distinguishable from leads (which use initials). Hover title
  // still shows the rep's name + branch.
  if (typeof REP_BASES !== 'undefined' && Array.isArray(REP_BASES)) {
    REP_BASES.forEach(function(rep) {
      if (branchFilter && rep.branch !== branchFilter) return;
      var pin = new Pin({
        background: (typeof getRepColor === 'function' ? getRepColor(rep.name) : rep.col),
        borderColor: '#fff',
        glyphText: '\u2605',  // ★
        glyphColor: '#fff',
        scale: 1.3,
      });
      var marker = new AdvancedMarker({
        position: { lat: rep.lat, lng: rep.lng },
        map: _realLeadsMap,
        title: rep.name + ' (' + rep.branch + ')',
        content: pin.element,
        zIndex: 10,
      });
      _realLeadsMarkers.push(marker);
    });
  }

  // Lead markers — smaller pin coloured by status, initials as glyph.
  var statusColors = { 'New': '#3b82f6', 'Contacted': '#f59e0b', 'Qualified': '#22c55e', 'Unqualified': '#9ca3af' };
  leads.forEach(function(lead) {
    if (branchFilter && lead.branch !== branchFilter) return;
    if (lead.converted || lead.status === 'Archived') return;
    // Geocode full address (street + suburb + postcode) via Google when we
    // haven't seen this address before; cached results return synchronously.
    // Falls back to SUBURB_COORDS / branch centre until the geocode resolves.
    var coords = resolveEntityCoords(lead);
    if (!coords) return;
    // Jitter if this exact coord already has a marker — stops pins from
    // hiding behind each other when multiple leads share a suburb centroid
    // or the same street address.
    coords = _spreadIfStacked(coords);
    var initials = ((lead.fn || '?').charAt(0) + (lead.ln || '?').charAt(0)).toUpperCase();
    var pin = new Pin({
      background: statusColors[lead.status] || '#9ca3af',
      borderColor: '#fff',
      glyphText: initials,
      glyphColor: '#fff',
      scale: 0.9,
    });
    var marker = new AdvancedMarker({
      position: { lat: coords.lat, lng: coords.lng },
      map: _realLeadsMap,
      title: (lead.fn || '') + ' ' + (lead.ln || '') + ' — ' + (lead.status || ''),
      content: pin.element,
      gmpClickable: true,
      zIndex: 5,
    });
    // Open an InfoWindow on click so users can identify the pin.
    marker.addListener('gmp-click', function() {
      var iw = new google.maps.InfoWindow({
        content: '<div style="font-family:system-ui;font-size:12px;min-width:140px"><strong>' +
          (lead.fn || '') + ' ' + (lead.ln || '') + '</strong><br>' +
          (lead.suburb || '') + ' ' + (lead.branch || '') + '<br>' +
          '<span style="color:#6b7280">' + (lead.status || '') + '</span></div>'
      });
      iw.open({ anchor: marker, map: _realLeadsMap });
    });
    _realLeadsMarkers.push(marker);
  });

  // Re-centre based on marker count. fitBounds with a single point can no-op
  // in Google Maps, so handle 1-marker case explicitly.
  var _leadPts = [];
  _realLeadsMarkers.forEach(function(m) {
    if (m && m.position) _leadPts.push(m.position);
  });
  var centre = branchFilter === 'SA'  ? { lat: -34.9287, lng: 138.5999 }
             : branchFilter === 'ACT' ? { lat: -35.2809, lng: 149.1300 }
                                      : { lat: -37.8136, lng: 144.9631 };
  if (_leadPts.length === 0) {
    _realLeadsMap.setCenter(centre);
    _realLeadsMap.setZoom(11);
  } else if (_leadPts.length === 1) {
    _realLeadsMap.setCenter(_leadPts[0]);
    _realLeadsMap.setZoom(13);
  } else {
    var bounds = new google.maps.LatLngBounds();
    _leadPts.forEach(function(p){ bounds.extend(p); });
    _realLeadsMap.fitBounds(bounds, 80);
    google.maps.event.addListenerOnce(_realLeadsMap, 'idle', function() {
      if (_realLeadsMap.getZoom() > 13) _realLeadsMap.setZoom(13);
    });
  }

  console.log('[Real Maps] Added', _realLeadsMarkers.length, 'markers');
}

// ── Schedule Map page ───────────────────────────────────────────────────────
// Separate map instance for the "Schedule Map" page (renderMapPage). Plots
// one marker per appointment matching the current rep+date filter, coloured
// by rep. Uses the same persistent-element pattern as the leads map so
// navigating or filtering doesn't reload the map tiles.

function _scheduleMapCentre() {
  var st = (typeof getState === 'function') ? getState() : {};
  var selRepName = (typeof mapSelectedRep !== 'undefined' && mapSelectedRep !== 'all') ? mapSelectedRep : null;
  var selRep = null;
  if (selRepName && typeof REP_BASES !== 'undefined') {
    selRep = REP_BASES.find(function(r){ return r.name === selRepName; });
  }
  var branch = (selRep && selRep.branch) || (st.branch && st.branch !== 'all' ? st.branch : 'VIC');
  return branch === 'SA'  ? { lat: -34.9287, lng: 138.5999 }
       : branch === 'ACT' ? { lat: -35.2809, lng: 149.1300 }
                          : { lat: -37.8136, lng: 144.9631 };
}

function initRealScheduleMap(containerId) {
  var container = document.getElementById(containerId);
  if (!container) return null;
  if (!window.google || !google.maps || typeof google.maps.Map !== 'function') return null;

  _scheduleMap = new google.maps.Map(container, {
    center: _scheduleMapCentre(),
    zoom: 10,
    mapId: 'DEMO_MAP_ID',
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: false,
    clickableIcons: false,
  });
  console.log('[Real Maps] Schedule map initialised');
  return _scheduleMap;
}

function refreshRealScheduleMapData() {
  if (!_scheduleMap) return;
  if (!google.maps.marker || typeof google.maps.marker.AdvancedMarkerElement !== 'function') return;

  var AdvancedMarker = google.maps.marker.AdvancedMarkerElement;
  var Pin = google.maps.marker.PinElement;

  _scheduleMarkers.forEach(function(m) { try { m.map = null; } catch(e) {} });
  _scheduleMarkers = [];
  var spread = _makeSpreader();

  var st = (typeof getState === 'function') ? getState() : {};
  var leads = st.leads || [];
  var apts = (typeof MOCK_APPOINTMENTS !== 'undefined' && Array.isArray(MOCK_APPOINTMENTS)) ? MOCK_APPOINTMENTS : [];
  var branchFilter = st.branch && st.branch !== 'all' ? st.branch : null;
  var repFilter = (typeof mapSelectedRep !== 'undefined' && mapSelectedRep !== 'all') ? mapSelectedRep : null;
  var dateFilter = (typeof mapSelectedDate !== 'undefined') ? mapSelectedDate : null;

  // Rep colour lookup (used for scheduled appt markers).
  var repColors = {};
  if (typeof REP_BASES !== 'undefined') {
    REP_BASES.forEach(function(r) { repColors[r.name] = r.col; });
  }

  // Track every marker's position so we can choose the right re-centre
  // strategy (fitBounds with ≥2 points, setCenter with 1, branch fallback with 0).
  var _points = [];

  // ── 1. Rep bases ────────────────────────────────────────────────────────
  // Large star pin in the rep's colour. Always shown. Narrows to the selected
  // rep if the page-level rep filter is set; narrows to the branch otherwise.
  if (typeof REP_BASES !== 'undefined') {
    REP_BASES.forEach(function(rep) {
      if (branchFilter && rep.branch !== branchFilter) return;
      if (repFilter && rep.name !== repFilter) return;
      var pin = new Pin({
        background: (typeof getRepColor === 'function' ? getRepColor(rep.name) : rep.col),
        borderColor: '#fff',
        glyphText: '\u2605',  // ★
        glyphColor: '#fff',
        scale: 1.3,
      });
      var marker = new AdvancedMarker({
        position: { lat: rep.lat, lng: rep.lng },
        map: _scheduleMap,
        title: rep.name + ' — ' + rep.branch + ' rep base',
        content: pin.element,
        zIndex: 10,
      });
      _scheduleMarkers.push(marker);
      _points.push({ lat: rep.lat, lng: rep.lng });
    });
  }

  // ── 2. Unscheduled leads ────────────────────────────────────────────────
  // Active leads that haven't been booked into any appointment. Shown as
  // amber pins with initials regardless of the date filter — these are the
  // pool of work still to be assigned.
  var scheduledNames = {};
  apts.forEach(function(a){ if (a.client) scheduledNames[a.client] = true; });
  leads.forEach(function(lead) {
    if (lead.converted || lead.status === 'Archived' || lead.status === 'Unqualified') return;
    if (branchFilter && lead.branch !== branchFilter) return;
    var leadName = (lead.fn || '') + ' ' + (lead.ln || '');
    if (scheduledNames[leadName.trim()]) return;  // has an appointment already
    var coords = resolveEntityCoords(lead);
    if (!coords) return;
    coords = spread(coords);
    var initials = ((lead.fn || '?').charAt(0) + (lead.ln || '?').charAt(0)).toUpperCase();
    var pin = new Pin({
      background: '#f59e0b',  // amber — "needs scheduling"
      borderColor: '#fff',
      glyphText: initials,
      glyphColor: '#fff',
      scale: 0.95,
    });
    var marker = new AdvancedMarker({
      position: coords,
      map: _scheduleMap,
      title: leadName.trim() + ' — unscheduled',
      content: pin.element,
      gmpClickable: true,
      zIndex: 5,
    });
    marker.addListener('gmp-click', function() {
      var iw = new google.maps.InfoWindow({
        content: '<div style="font-family:system-ui;font-size:12px;min-width:160px">' +
          '<strong>' + leadName.trim() + '</strong><br>' +
          (lead.suburb || '') + ' (' + (lead.branch || '') + ')<br>' +
          '<span style="color:#f59e0b;font-weight:600">⏳ Unscheduled</span>' +
          '<br><a href="#" style="color:#c41230;font-size:11px" data-action="maps-open-lead" data-lead-id="' + lead.id + '">Open lead →</a></div>'
      });
      iw.open({ anchor: marker, map: _scheduleMap });
    });
    _scheduleMarkers.push(marker);
    _points.push(coords);
  });

  // ── 3. Scheduled leads for the selected date ────────────────────────────
  // Appointments whose date matches the date-picker. Pin is the rep's colour
  // with the appointment hour as glyph. Hidden on any other date (key request).
  apts.forEach(function(apt) {
    if (dateFilter && apt.date !== dateFilter) return;
    if (branchFilter && apt.branch !== branchFilter) return;
    if (repFilter && apt.rep !== repFilter) return;
    var coords = resolveEntityCoords(apt);
    if (!coords) return;
    coords = spread(coords);
    var pin = new Pin({
      background: (typeof getRepColor === 'function' ? getRepColor(apt.rep) : (repColors[apt.rep] || '#9ca3af')),
      borderColor: '#fff',
      glyphText: (apt.time || '').replace(':', '').slice(0, 2) || '?',
      glyphColor: '#fff',
      scale: 1.0,
    });
    var marker = new AdvancedMarker({
      position: coords,
      map: _scheduleMap,
      title: (apt.client || '') + ' · ' + (apt.time || '') + ' · ' + (apt.rep || ''),
      content: pin.element,
      gmpClickable: true,
      zIndex: 6,
    });
    marker.addListener('gmp-click', function() {
      var iw = new google.maps.InfoWindow({
        content: '<div style="font-family:system-ui;font-size:12px;min-width:160px">' +
          '<strong>' + (apt.client || '') + '</strong><br>' +
          (apt.suburb || '') + ' (' + (apt.branch || '') + ')<br>' +
          '<span style="color:#6b7280">📅 ' + (apt.time || '') + ' · ' + (apt.rep || '') + '</span></div>'
      });
      iw.open({ anchor: marker, map: _scheduleMap });
    });
    _scheduleMarkers.push(marker);
    _points.push(coords);
  });

  // Re-centre. fitBounds with a single point is unreliable in Google Maps
  // (near-zero-size bounds can no-op). Branch off on the point count:
  //   0 → recentre on the branch's state capital at zoom 10.
  //   1 → setCenter + setZoom(13) directly.
  //   2+ → fitBounds with a zoom cap so tight clusters don't over-zoom.
  if (_points.length === 0) {
    _scheduleMap.setCenter(_scheduleMapCentre());
    _scheduleMap.setZoom(10);
  } else if (_points.length === 1) {
    _scheduleMap.setCenter(_points[0]);
    _scheduleMap.setZoom(13);
  } else {
    var bounds = new google.maps.LatLngBounds();
    _points.forEach(function(p){ bounds.extend(p); });
    _scheduleMap.fitBounds(bounds, 80);
    google.maps.event.addListenerOnce(_scheduleMap, 'idle', function() {
      if (_scheduleMap.getZoom() > 13) _scheduleMap.setZoom(13);
    });
  }

  console.log('[Real Maps] Schedule map —', _scheduleMarkers.length, 'markers (reps + unscheduled + ' + (dateFilter || 'today') + ' appts)');
}

function mountScheduleGoogleMap() {
  var slot = document.getElementById('scheduleMapSlot');
  if (!slot) return;
  if (!window.google || !google.maps) return;

  if (!_scheduleMapEl) {
    slot.innerHTML = '';
    _scheduleMapEl = document.createElement('div');
    _scheduleMapEl.id = 'schedule-google-map';
    _scheduleMapEl.style.cssText = 'height:100%;width:100%';
    slot.appendChild(_scheduleMapEl);
    initRealScheduleMap('schedule-google-map');
  } else if (_scheduleMapEl.parentNode !== slot) {
    slot.appendChild(_scheduleMapEl);
  }
  refreshRealScheduleMapData();
}
window.mountScheduleGoogleMap = mountScheduleGoogleMap;

// ── Shared helper for spread-on-collision markers ───────────────────────────
// Used by every map so pins at the same coord fan out on a golden-angle spiral.
function _makeSpreader() {
  var counts = {};
  return function(coords) {
    if (!coords) return coords;
    var key = coords.lat.toFixed(5) + ',' + coords.lng.toFixed(5);
    var n = counts[key] || 0;
    counts[key] = n + 1;
    if (n === 0) return coords;
    var angle = (n * 137.5) * Math.PI / 180;
    return { lat: coords.lat + Math.cos(angle) * 0.00045, lng: coords.lng + Math.sin(angle) * 0.00045 };
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Service Map (renderServiceMap in 19-service-crm.js)
// Plots every open service call coloured by status, filtered by branch.
// ═══════════════════════════════════════════════════════════════════════════
var _serviceMap = null;
var _serviceMapEl = null;
var _serviceMarkers = [];

function initServiceGoogleMap(containerId) {
  var container = document.getElementById(containerId);
  if (!container) return null;
  if (!window.google || !google.maps || typeof google.maps.Map !== 'function') return null;
  var st = (typeof getState === 'function') ? getState() : {};
  var branch = st.branch && st.branch !== 'all' ? st.branch : 'VIC';
  var centre = branch === 'SA' ? { lat:-34.9287, lng:138.5999 }
             : branch === 'ACT' ? { lat:-35.2809, lng:149.1300 }
             : branch === 'TAS' ? { lat:-42.8821, lng:147.3272 }
                                : { lat:-37.8136, lng:144.9631 };
  _serviceMap = new google.maps.Map(container, {
    center: centre, zoom: 11, mapId: 'DEMO_MAP_ID',
    mapTypeControl: false, streetViewControl: false, fullscreenControl: false, clickableIcons: false,
  });
  console.log('[Real Maps] Service map initialised');
  return _serviceMap;
}

function refreshServiceGoogleMapData() {
  if (!_serviceMap) return;
  if (!google.maps.marker || typeof google.maps.marker.AdvancedMarkerElement !== 'function') return;
  var AdvancedMarker = google.maps.marker.AdvancedMarkerElement;
  var Pin = google.maps.marker.PinElement;

  _serviceMarkers.forEach(function(m) { try { m.map = null; } catch(e) {} });
  _serviceMarkers = [];
  var spread = _makeSpreader();

  var st = (typeof getState === 'function') ? getState() : {};
  var svcs = (typeof getServiceCalls === 'function') ? getServiceCalls() : (st.serviceCalls || []);
  var branchFilter = st.branch && st.branch !== 'all' ? st.branch : null;
  var statusColors = { new:'#3b82f6', assigned:'#a855f7', scheduled:'#06b6d4', in_progress:'#f59e0b', completed:'#22c55e', closed:'#6b7280' };

  var _svcPts = [];

  svcs.forEach(function(svc) {
    if (svc.status === 'completed' || svc.status === 'closed') return;
    if (branchFilter && svc.branch !== branchFilter) return;
    var coords = resolveEntityCoords(svc);
    if (!coords) return;
    coords = spread(coords);
    var pin = new Pin({
      background: statusColors[svc.status] || '#9ca3af',
      borderColor: '#fff',
      glyphText: (svc.serviceNumber || '').slice(-3) || '?',
      glyphColor: '#fff',
      scale: 1.0,
    });
    var marker = new AdvancedMarker({
      position: coords, map: _serviceMap,
      title: (svc.serviceNumber || '') + ' — ' + (svc.contactName || '') + ' (' + (svc.status || '') + ')',
      content: pin.element, gmpClickable: true,
    });
    marker.addListener('gmp-click', function() {
      var iw = new google.maps.InfoWindow({
        content: '<div style="font-family:system-ui;font-size:12px;min-width:160px">' +
          '<strong>' + (svc.serviceNumber || '') + '</strong><br>' +
          (svc.contactName || '') + '<br>' +
          (svc.suburb || '') + ' (' + (svc.branch || '') + ')<br>' +
          '<span style="color:#6b7280">' + (svc.type || '') + ' · ' + (svc.status || '') + '</span></div>'
      });
      iw.open({ anchor: marker, map: _serviceMap });
    });
    _serviceMarkers.push(marker);
    _svcPts.push(coords);
  });

  // Re-centre (0 / 1 / 2+ points, same pattern as schedule + leads maps).
  var svcCentre = branchFilter === 'SA'  ? { lat:-34.9287, lng:138.5999 }
                : branchFilter === 'ACT' ? { lat:-35.2809, lng:149.1300 }
                : branchFilter === 'TAS' ? { lat:-42.8821, lng:147.3272 }
                                         : { lat:-37.8136, lng:144.9631 };
  if (_svcPts.length === 0) {
    _serviceMap.setCenter(svcCentre); _serviceMap.setZoom(11);
  } else if (_svcPts.length === 1) {
    _serviceMap.setCenter(_svcPts[0]); _serviceMap.setZoom(13);
  } else {
    var sb = new google.maps.LatLngBounds();
    _svcPts.forEach(function(p){ sb.extend(p); });
    _serviceMap.fitBounds(sb, 80);
    google.maps.event.addListenerOnce(_serviceMap, 'idle', function() {
      if (_serviceMap.getZoom() > 13) _serviceMap.setZoom(13);
    });
  }
  console.log('[Real Maps] Service map —', _serviceMarkers.length, 'markers');
}

function mountServiceGoogleMap() {
  var slot = document.getElementById('serviceMapSlot');
  if (!slot) return;
  if (!window.google || !google.maps) return;
  if (!_serviceMapEl) {
    slot.innerHTML = '';
    _serviceMapEl = document.createElement('div');
    _serviceMapEl.id = 'service-google-map';
    _serviceMapEl.style.cssText = 'height:100%;width:100%';
    slot.appendChild(_serviceMapEl);
    initServiceGoogleMap('service-google-map');
  } else if (_serviceMapEl.parentNode !== slot) {
    slot.appendChild(_serviceMapEl);
  }
  refreshServiceGoogleMapData();
}
window.mountServiceGoogleMap = mountServiceGoogleMap;

// ═══════════════════════════════════════════════════════════════════════════
// CM Schedule Map (renderCMMapPage in 21-cm-schedule.js)
// Plots CM jobs coloured by assigned installer. Filters by date + installer.
// ═══════════════════════════════════════════════════════════════════════════
var _cmMap = null;
var _cmMapEl = null;
var _cmMarkers = [];

function initCMGoogleMap(containerId) {
  var container = document.getElementById(containerId);
  if (!container) return null;
  if (!window.google || !google.maps || typeof google.maps.Map !== 'function') return null;
  var st = (typeof getState === 'function') ? getState() : {};
  var branch = st.branch && st.branch !== 'all' ? st.branch : 'VIC';
  var centre = branch === 'SA' ? { lat:-34.9287, lng:138.5999 }
             : branch === 'ACT' ? { lat:-35.2809, lng:149.1300 }
             : branch === 'TAS' ? { lat:-42.8821, lng:147.3272 }
                                : { lat:-37.8136, lng:144.9631 };
  _cmMap = new google.maps.Map(container, {
    center: centre, zoom: 11, mapId: 'DEMO_MAP_ID',
    mapTypeControl: false, streetViewControl: false, fullscreenControl: false, clickableIcons: false,
  });
  console.log('[Real Maps] CM map initialised');
  return _cmMap;
}

function refreshCMGoogleMapData() {
  if (!_cmMap) return;
  if (!google.maps.marker || typeof google.maps.marker.AdvancedMarkerElement !== 'function') return;
  var AdvancedMarker = google.maps.marker.AdvancedMarkerElement;
  var Pin = google.maps.marker.PinElement;

  _cmMarkers.forEach(function(m) { try { m.map = null; } catch(e) {} });
  _cmMarkers = [];
  var spread = _makeSpreader();

  var st = (typeof getState === 'function') ? getState() : {};
  var jobs = st.jobs || [];
  var branchFilter = st.branch && st.branch !== 'all' ? st.branch : null;
  var installers = (typeof getInstallers === 'function') ? getInstallers().filter(function(i){return i.active;}) : [];
  var instById = {};
  installers.forEach(function(i){ instById[i.id] = i; });
  var dateFilter = (typeof cmMapDate !== 'undefined') ? cmMapDate : null;
  var installerFilter = (typeof cmMapInstaller !== 'undefined' && cmMapInstaller !== 'all') ? cmMapInstaller : null;

  var _cmPts = [];

  jobs.forEach(function(j) {
    if (j.status !== 'a_check_measure' || j.cmCompletedAt) return;
    if (branchFilter && j.branch !== branchFilter) return;
    // Only show: unbooked (any date) + booked for the selected date.
    if (j.cmBookedDate && j.cmBookedDate !== dateFilter) return;
    // Installer filter only applies to booked jobs.
    if (installerFilter && j.cmBookedDate && j.cmAssignedTo !== installerFilter) return;
    var coords = resolveEntityCoords(j);
    if (!coords) return;
    coords = spread(coords);
    var inst = instById[j.cmAssignedTo];
    var bg = inst ? (inst.colour || '#c41230') : (j.cmBookedDate ? '#9ca3af' : '#f59e0b');
    var glyphRaw = inst ? (inst.name || '').charAt(0).toUpperCase() : (j.cmBookedDate ? '✓' : '·');
    var glyph = glyphRaw || '·';
    try {
      var pin = new Pin({ background: bg, borderColor: '#fff', glyphText: glyph, glyphColor: '#fff', scale: 1.0 });
      var marker = new AdvancedMarker({
        position: coords, map: _cmMap,
        title: (j.jobNumber || j.id) + ' — ' + (j.suburb || ''),
        content: pin.element, gmpClickable: true,
      });
      marker.addListener('gmp-click', function() {
        var iw = new google.maps.InfoWindow({
          content: '<div style="font-family:system-ui;font-size:12px;min-width:160px">' +
            '<strong>' + (j.jobNumber || j.id) + '</strong><br>' +
            (j.suburb || '') + ' (' + (j.branch || '') + ')<br>' +
            '<span style="color:#6b7280">' + (j.cmBookedDate ? 'Booked ' + j.cmBookedDate + (inst ? ' · ' + inst.name : '') : 'Unbooked') + '</span></div>'
        });
        iw.open({ anchor: marker, map: _cmMap });
      });
      _cmMarkers.push(marker);
      _cmPts.push(coords);
    } catch (e) {
      console.warn('[CM Map] Skipped marker for', j.jobNumber || j.id, e);
    }
  });

  // Re-centre (0 / 1 / 2+ points).
  var cmCentre = branchFilter === 'SA'  ? { lat:-34.9287, lng:138.5999 }
               : branchFilter === 'ACT' ? { lat:-35.2809, lng:149.1300 }
               : branchFilter === 'TAS' ? { lat:-42.8821, lng:147.3272 }
                                        : { lat:-37.8136, lng:144.9631 };
  if (_cmPts.length === 0) {
    _cmMap.setCenter(cmCentre); _cmMap.setZoom(11);
  } else if (_cmPts.length === 1) {
    _cmMap.setCenter(_cmPts[0]); _cmMap.setZoom(13);
  } else {
    var cb = new google.maps.LatLngBounds();
    _cmPts.forEach(function(p){ cb.extend(p); });
    _cmMap.fitBounds(cb, 80);
    google.maps.event.addListenerOnce(_cmMap, 'idle', function() {
      if (_cmMap.getZoom() > 13) _cmMap.setZoom(13);
    });
  }
  console.log('[Real Maps] CM map —', _cmMarkers.length, 'markers');
}

function mountCMGoogleMap() {
  var slot = document.getElementById('cmMapSlot');
  if (!slot) return;
  if (!window.google || !google.maps) return;
  if (!_cmMapEl) {
    slot.innerHTML = '';
    _cmMapEl = document.createElement('div');
    _cmMapEl.id = 'cm-google-map';
    _cmMapEl.style.cssText = 'height:100%;width:100%';
    slot.appendChild(_cmMapEl);
    initCMGoogleMap('cm-google-map');
  } else if (_cmMapEl.parentNode !== slot) {
    slot.appendChild(_cmMapEl);
  }
  refreshCMGoogleMapData();
}
window.mountCMGoogleMap = mountCMGoogleMap;

// ═══════════════════════════════════════════════════════════════════════════
// Inline Activity mini-map (renderInlineMapScheduler in 08-sales-crm.js)
// Shows the entity's location + nearby rep bases on the Activity tab of a
// lead / deal / contact detail view.
// ═══════════════════════════════════════════════════════════════════════════
var _inlineMap = null;
var _inlineMapEl = null;
var _inlineMapMarkers = [];
var _inlineMapEntityKey = '';  // `${entityType}:${entityId}` — triggers re-centre on change

function initInlineGoogleMap(containerId) {
  var container = document.getElementById(containerId);
  if (!container) return null;
  if (!window.google || !google.maps || typeof google.maps.Map !== 'function') return null;
  _inlineMap = new google.maps.Map(container, {
    center: { lat:-37.8136, lng:144.9631 }, zoom: 11, mapId: 'DEMO_MAP_ID',
    mapTypeControl: false, streetViewControl: false, fullscreenControl: false, clickableIcons: false, zoomControl: false,
  });
  return _inlineMap;
}

function _getInlineEntity() {
  var st = getState();
  if (st.leadDetailId)    return { e: (st.leads || []).find(function(x){return x.id===st.leadDetailId;}),    type: 'lead' };
  if (st.dealDetailId)    return { e: (st.deals || []).find(function(x){return x.id===st.dealDetailId;}),    type: 'deal' };
  if (st.contactDetailId) return { e: (st.contacts || []).find(function(x){return x.id===st.contactDetailId;}), type: 'contact' };
  return { e: null, type: null };
}

function refreshInlineGoogleMapData() {
  if (!_inlineMap) return;
  if (!google.maps.marker || typeof google.maps.marker.AdvancedMarkerElement !== 'function') return;
  var AdvancedMarker = google.maps.marker.AdvancedMarkerElement;
  var Pin = google.maps.marker.PinElement;

  _inlineMapMarkers.forEach(function(m) { try { m.map = null; } catch(e) {} });
  _inlineMapMarkers = [];

  var got = _getInlineEntity();
  var entity = got.e;
  var entityType = got.type;
  if (!entity) return;

  var spread = _makeSpreader();

  // Rep bases for the entity's branch — helps users see who's closest.
  if (typeof REP_BASES !== 'undefined') {
    REP_BASES.forEach(function(rep) {
      if (entity.branch && rep.branch !== entity.branch) return;
      var pin = new Pin({ background: (typeof getRepColor === 'function' ? getRepColor(rep.name) : rep.col), borderColor: '#fff', glyphText: '\u2605', glyphColor: '#fff', scale: 1.0 });
      var m = new AdvancedMarker({
        position: { lat: rep.lat, lng: rep.lng }, map: _inlineMap,
        title: rep.name, content: pin.element, zIndex: 5,
      });
      _inlineMapMarkers.push(m);
    });
  }

  // The entity itself.
  var coords = resolveEntityCoords(entity);
  if (coords) {
    coords = spread(coords);
    var name = (entity.fn || entity.title || '') + ' ' + (entity.ln || '');
    var initials = ((entity.fn || entity.title || '?').charAt(0) + (entity.ln || '').charAt(0)).toUpperCase();
    var pin = new Pin({ background: '#c41230', borderColor: '#fff', glyphText: initials || '•', glyphColor: '#fff', scale: 1.2 });
    var marker = new AdvancedMarker({
      position: coords, map: _inlineMap,
      title: name.trim() + ' (' + entityType + ')',
      content: pin.element, zIndex: 10,
    });
    _inlineMapMarkers.push(marker);

    // Re-centre on the entity only when the entity itself changed (navigating
    // between details). If we re-centred every render, the map would jump
    // back to the entity every time the user typed in the activity form.
    var key = entityType + ':' + entity.id;
    if (key !== _inlineMapEntityKey) {
      _inlineMapEntityKey = key;
      _inlineMap.setCenter(coords);
      _inlineMap.setZoom(12);
    }
  }
}

function mountInlineGoogleMap() {
  var slot = document.getElementById('inlineMapSlot');
  if (!slot) return;
  if (!window.google || !google.maps) return;
  if (!_inlineMapEl) {
    slot.innerHTML = '';
    _inlineMapEl = document.createElement('div');
    _inlineMapEl.id = 'inline-google-map';
    _inlineMapEl.style.cssText = 'height:100%;width:100%';
    slot.appendChild(_inlineMapEl);
    initInlineGoogleMap('inline-google-map');
  } else if (_inlineMapEl.parentNode !== slot) {
    slot.appendChild(_inlineMapEl);
  }
  refreshInlineGoogleMapData();
}
window.mountInlineGoogleMap = mountInlineGoogleMap;

// Extend the existing onGoogleMapsLoaded callback from 11-email-page.js.
// When the SDK finishes loading, swap mock exports for real and re-mount.
(function() {
  var prev = window.onGoogleMapsLoaded;
  window.onGoogleMapsLoaded = function() {
    try { if (typeof prev === 'function') prev(); } catch(e) { console.warn('[Real Maps] prev onGoogleMapsLoaded threw', e); }

    window.initGoogleMaps = initRealGoogleMap;
    window.refreshMapData = refreshRealMapData;

    // Discard the mock's cached slot element so the next mount creates a
    // fresh real map rather than re-parenting the mock DOM.
    window._leadsMapEl = null;
    _realLeadsMap = null;
    _realLeadsMarkers = [];
    _scheduleMap = null;
    _scheduleMarkers = [];
    _scheduleMapEl = null;
    _serviceMap = null; _serviceMarkers = []; _serviceMapEl = null;
    _cmMap = null; _cmMarkers = []; _cmMapEl = null;
    _inlineMap = null; _inlineMapMarkers = []; _inlineMapEl = null; _inlineMapEntityKey = '';

    console.log('[Real Maps] Swapped in real implementation');

    // If we're currently on any map-bearing page, re-mount immediately so the
    // user sees the real map without needing to navigate away and back.
    setTimeout(function() {
      [mountLeadsGoogleMap, mountScheduleGoogleMap, mountServiceGoogleMap, mountCMGoogleMap, mountInlineGoogleMap]
        .forEach(function(fn) {
          if (typeof fn !== 'function') return;
          try { fn(); } catch(e) { console.warn('[Real Maps] remount failed', e); }
        });
    }, 50);
  };
})();
