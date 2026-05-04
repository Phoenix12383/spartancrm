// modules/14-google-maps-mock.js - Mock Google Maps for development
// Replace with real Google Maps when API key is available

console.log('[Mock Maps] Loading mock implementation...');

// Mock geocoder - returns coordinates based on suburb name
const MOCK_COORDINATES = {
    // VIC suburbs
    'Brighton': { lat: -37.9063, lng: 145.0023 },
    'Camberwell': { lat: -37.8466, lng: 145.0597 },
    'Toorak': { lat: -37.8407, lng: 145.0218 },
    'Richmond': { lat: -37.8236, lng: 144.9994 },
    'Hawthorn': { lat: -37.8226, lng: 145.0340 },
    'South Yarra': { lat: -37.8393, lng: 144.9920 },
    'Box Hill': { lat: -37.8199, lng: 145.1224 },
    'Docklands': { lat: -37.8144, lng: 144.9479 },
    'Fitzroy': { lat: -37.7995, lng: 144.9784 },
    'St Kilda': { lat: -37.8676, lng: 144.9808 },
    'Prahran': { lat: -37.8496, lng: 144.9919 },
    'Malvern': { lat: -37.8594, lng: 145.0313 },
    'Kew': { lat: -37.8091, lng: 145.0334 },
    'Essendon': { lat: -37.7471, lng: 144.9213 },
    'Northcote': { lat: -37.7745, lng: 144.9981 },
    'Brunswick': { lat: -37.7676, lng: 144.9619 },
    'Footscray': { lat: -37.8002, lng: 144.8998 },
    'Geelong': { lat: -38.1499, lng: 144.3617 },
    'Balwyn': { lat: -37.8139, lng: 145.0876 },
    'Glen Iris': { lat: -37.8633, lng: 145.0536 },
    'Oakleigh': { lat: -37.8989, lng: 145.0954 },
    'Coburg': { lat: -37.7434, lng: 144.9647 },
    // SA suburbs
    'Glenelg': { lat: -34.9802, lng: 138.5147 },
    'Burnside': { lat: -34.9426, lng: 138.6506 },
    'Prospect': { lat: -34.8866, lng: 138.5925 },
    'Norwood': { lat: -34.9226, lng: 138.6327 },
    'Unley': { lat: -34.9507, lng: 138.5971 },
    'Mitcham': { lat: -35.0005, lng: 138.6145 },
    'Henley Beach': { lat: -34.9195, lng: 138.4951 },
    'Walkerville': { lat: -34.8871, lng: 138.6336 },
    'Blackwood': { lat: -35.0209, lng: 138.6002 },
    'Stirling': { lat: -35.0243, lng: 138.7126 },
    // ACT suburbs
    'Braddon': { lat: -35.2777, lng: 149.1407 },
    'Kingston': { lat: -35.3200, lng: 149.1530 },
    'Tuggeranong': { lat: -35.4244, lng: 149.0662 },
    'Canberra': { lat: -35.2809, lng: 149.1300 },
    'Belconnen': { lat: -35.2389, lng: 149.0612 },
    'Woden': { lat: -35.3484, lng: 149.0891 },
    'Gungahlin': { lat: -35.1832, lng: 149.1326 },
    'Dickson': { lat: -35.2503, lng: 149.1434 },
    // Default fallbacks by branch
    'VIC': { lat: -37.8136, lng: 144.9631 },
    'SA': { lat: -34.9287, lng: 138.5999 },
    'ACT': { lat: -35.2809, lng: 149.1300 }
};

// Mock geocoding function
async function mockGeocodeAddress(address, suburb, state, postcode) {
    return new Promise((resolve) => {
        setTimeout(() => {
            // Try to find by suburb first
            let coords = MOCK_COORDINATES[suburb];
            if (!coords && state) {
                coords = MOCK_COORDINATES[state];
            }
            if (!coords) {
                coords = MOCK_COORDINATES['VIC'];
            }
            
            resolve({
                lat: coords.lat,
                lng: coords.lng,
                formattedAddress: `${suburb || 'Unknown'}, ${state || 'VIC'}, Australia`
            });
        }, 100); // Simulate network delay
    });
}

// Mock map container
let mockMapContainer = null;
let mockMarkers = [];

// Mock map initialization
function initMockMap(containerId) {
    console.log('[Mock Maps] Initializing mock map');
    
    const container = document.getElementById(containerId);
    if (!container) return;
    
    // Create a canvas-based mock map
    mockMapContainer = document.createElement('div');
    mockMapContainer.style.width = '100%';
    mockMapContainer.style.height = '100%';
    mockMapContainer.style.backgroundColor = '#e8f4f8';
    mockMapContainer.style.position = 'relative';
    mockMapContainer.style.overflow = 'hidden';
    mockMapContainer.style.borderRadius = '8px';
    mockMapContainer.style.border = '1px solid #e5e7eb';
    
    // Add grid lines (like a map)
    const gridPattern = document.createElement('div');
    gridPattern.style.position = 'absolute';
    gridPattern.style.top = '0';
    gridPattern.style.left = '0';
    gridPattern.style.right = '0';
    gridPattern.style.bottom = '0';
    gridPattern.style.backgroundImage = 'linear-gradient(#d1d5db 1px, transparent 1px), linear-gradient(90deg, #d1d5db 1px, transparent 1px)';
    gridPattern.style.backgroundSize = '40px 40px';
    gridPattern.style.opacity = '0.3';
    mockMapContainer.appendChild(gridPattern);
    
    // Add a fake "map" label
    const mapLabel = document.createElement('div');
    mapLabel.textContent = '🗺️ Mock Map (Google Maps API pending)';
    mapLabel.style.position = 'absolute';
    mapLabel.style.top = '10px';
    mapLabel.style.left = '10px';
    mapLabel.style.backgroundColor = 'white';
    mapLabel.style.padding = '4px 12px';
    mapLabel.style.borderRadius = '20px';
    mapLabel.style.fontSize = '11px';
    mapLabel.style.fontWeight = '500';
    mapLabel.style.boxShadow = '0 1px 4px rgba(0,0,0,0.1)';
    mapLabel.style.zIndex = '10';
    mockMapContainer.appendChild(mapLabel);
    
    container.innerHTML = '';
    container.appendChild(mockMapContainer);
    
    return mockMapContainer;
}

// Mock marker addition
function addMockMarker(type, data, position) {
    if (!mockMapContainer) return null;
    
    const marker = document.createElement('div');
    marker.style.position = 'absolute';
    marker.style.cursor = 'pointer';
    marker.style.zIndex = '20';
    
    // Calculate position percentage based on lat/lng bounds
    // Mock bounds: roughly -38.5 to -34.5 lat, 138 to 150 lng
    const bounds = { lat: { min: -38.5, max: -34.5 }, lng: { min: 138, max: 150 } };
    const x = ((position.lng - bounds.lng.min) / (bounds.lng.max - bounds.lng.min)) * 100;
    const y = ((position.lat - bounds.lat.min) / (bounds.lat.max - bounds.lat.min)) * 100;
    
    marker.style.left = `${x}%`;
    marker.style.top = `${y}%`;
    marker.style.transform = 'translate(-50%, -50%)';
    
    if (type === 'salesperson') {
        marker.innerHTML = `
            <div style="width: 32px; height: 32px; border-radius: 50%; background: ${data.col}; border: 2px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.2); display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 12px;">
                ${data.avatar}
            </div>
        `;
        marker.title = data.name;
    } else if (type === 'lead') {
        const statusColors = {
            'New': '#3b82f6',
            'Contacted': '#f59e0b',
            'Qualified': '#22c55e',
            'Unqualified': '#9ca3af'
        };
        const color = statusColors[data.status] || '#9ca3af';
        marker.innerHTML = `
            <div style="width: 28px; height: 28px; border-radius: 50%; background: ${color}; border: 2px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.2); display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 10px;">
                ${data.fn.charAt(0)}${data.ln.charAt(0)}
            </div>
        `;
        marker.title = `${data.fn} ${data.ln}`;
    }
    
    marker.onclick = () => {
        console.log(`[Mock Maps] Clicked: ${marker.title}`);
        // Show tooltip
        const tooltip = document.createElement('div');
        tooltip.style.position = 'absolute';
        tooltip.style.bottom = '100%';
        tooltip.style.left = '50%';
        tooltip.style.transform = 'translateX(-50%)';
        tooltip.style.backgroundColor = '#1f2937';
        tooltip.style.color = 'white';
        tooltip.style.padding = '6px 10px';
        tooltip.style.borderRadius = '6px';
        tooltip.style.fontSize = '11px';
        tooltip.style.whiteSpace = 'nowrap';
        tooltip.style.marginBottom = '4px';
        tooltip.textContent = marker.title;
        
        const existingTooltip = marker.querySelector('.tooltip');
        if (existingTooltip) existingTooltip.remove();
        
        tooltip.className = 'tooltip';
        marker.appendChild(tooltip);
        
        setTimeout(() => tooltip.remove(), 2000);
    };
    
    mockMapContainer.appendChild(marker);
    mockMarkers.push(marker);
    return marker;
}

// Mock distance calculation
async function mockCalculateDistance(origin, destination) {
    return new Promise((resolve) => {
        setTimeout(() => {
            // Random distance between 2 and 30 km
            const distanceKm = Math.random() * 28 + 2;
            const durationMin = Math.round(distanceKm * 1.5); // ~40 km/h average
            resolve({
                distance: `${distanceKm.toFixed(1)} km`,
                distanceMeters: distanceKm * 1000,
                duration: `${durationMin} mins`,
                durationSeconds: durationMin * 60
            });
        }, 50);
    });
}

// Mock route drawing
function mockDrawRoute(waypoints, color = '#c41230') {
    console.log('[Mock Maps] Drawing route with waypoints:', waypoints);
    // In mock version, just log the route
    if (mockMapContainer) {
        // Draw a dashed line between points (simplified)
        const line = document.createElement('div');
        line.style.position = 'absolute';
        line.style.top = '50%';
        line.style.left = '0';
        line.style.right = '0';
        line.style.height = '2px';
        line.style.background = `linear-gradient(90deg, ${color}, ${color})`;
        line.style.backgroundSize = '10px 2px';
        line.style.opacity = '0.5';
        line.style.pointerEvents = 'none';
        mockMapContainer.appendChild(line);
        setTimeout(() => line.remove(), 3000);
    }
    return Promise.resolve(null);
}

// Mock autocomplete
function mockAttachAutocomplete(inputElement, callback) {
    console.log('[Mock Maps] Attaching mock autocomplete to', inputElement);
    
    const mockPlaces = [
        '123 Collins St, Melbourne VIC',
        '456 Bourke St, Melbourne VIC',
        '789 Chapel St, South Yarra VIC',
        '1 King William St, Adelaide SA',
        '2 London Circuit, Canberra ACT'
    ];
    
    let currentIndex = 0;
    
    inputElement.addEventListener('input', () => {
        const value = inputElement.value.toLowerCase();
        if (value.length > 2 && callback) {
            // Simulate place selection
            const mockPlace = {
                formatted_address: mockPlaces[currentIndex % mockPlaces.length],
                geometry: {
                    location: {
                        lat: () => MOCK_COORDINATES['VIC'].lat,
                        lng: () => MOCK_COORDINATES['VIC'].lng
                    }
                }
            };
            callback(mockPlace);
            currentIndex++;
        }
    });
    
    return { mock: true };
}

// Refresh map data
async function refreshMockMapData() {
    console.log('[Mock Maps] Refreshing data...');
    
    // Clear existing markers
    mockMarkers.forEach(m => m.remove());
    mockMarkers = [];
    
    // Add salespeople
    for (const rep of REP_BASES) {
        const coords = MOCK_COORDINATES[rep.suburb] || MOCK_COORDINATES[rep.branch];
        if (coords) {
            addMockMarker('salesperson', rep, coords);
        }
    }
    
    // Add leads
    const leads = getState().leads.filter(l => 
        !l.converted && l.status !== 'Archived' && l.status !== 'Unqualified'
    );
    
    for (const lead of leads.slice(0, 20)) { // Limit for performance
        const coords = MOCK_COORDINATES[lead.suburb] || MOCK_COORDINATES[lead.branch];
        if (coords) {
            addMockMarker('lead', lead, coords);
        }
    }
    
    console.log(`[Mock Maps] Added ${mockMarkers.length} markers`);
}

// ============================================
// EXPORTS (same API as real Google Maps)
// ============================================

// Create a mock Google namespace.
// CRITICAL: merge into window.google instead of overwriting it. The Google
// Identity Services library (loaded earlier from accounts.google.com/gsi/client)
// sets window.google.accounts, which would be wiped if we did the naive
// `window.google = {maps: …}` assignment. Same for the real Google Maps SDK
// when it eventually loads — only mock if real maps isn't already there.
window.google = window.google || {};
if (!window.google.maps || !window.google.maps.Map) {
    window.google.maps = {
        Map: class { constructor() { console.log('Mock Map created'); } },
        Marker: class { setMap() {} },
        InfoWindow: class {},
        event: { addListener: () => {} }
    };
}

// Expose functions with same names as real implementation
window.initGoogleMaps = (containerId) => initMockMap(containerId);
window.refreshMapData = refreshMockMapData;
window.geocodeAddress = mockGeocodeAddress;
window.calculateDistance = mockCalculateDistance;
window.drawRoute = mockDrawRoute;
window.attachGoogleAutocomplete = mockAttachAutocomplete;

console.log('[Mock Maps] Ready - Replace with real Google Maps when API key is available');
