// components/worker/CustomerMap.jsx
//
// ⬇️ Phase 4 (Route Intelligence) — একটা straight-line "route shape" preview
// যোগ হলো (visit_order অনুযায়ী বিন্দুগুলো জোড়া লাগানো, dashed line)।
// ⚠️ এটা real road-based route না — কোনো Directions/OSRM API ছাড়া শুধু
// সরলরেখায় ক্রম দেখানো, যাতে SR একনজরে আজকের ভ্রমণের সামগ্রিক shape বুঝতে পারে।
//
// ── Phase 3-এ যা হয়েছিল ──
// ১) Marker icon memoization (Phase 0 audit-এ ধরা পড়া বাগ) — আগে
//    makePinIcon()/makeNextStopIcon() প্রতিটা render-এ প্রতিটা marker-এর
//    জন্য নতুন L.divIcon() বানাত। এখন মাত্র ৩টা icon instance module-load-এ
//    একবারই বানানো হয়।
// ২) Resizable height — map↔list split view-এর জন্য tap-to-toggle drag-handle।
import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { FiMap } from 'react-icons/fi';

// ── Leaflet default icon fix (Vite/Webpack build issue) ───────
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// ── আইকন — মাত্র ৩টা variant সম্ভব, তাই module load-এ একবারই বানানো ──
const NEXT_STOP_ICON = L.divIcon({
  className: '',
  html: `
    <div style="position: relative; width: 36px; height: 36px;">
      <div style="
        background: #2563eb;
        width: 36px; height: 36px;
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        border: 3px solid white;
        box-shadow: 0 3px 10px rgba(37,99,235,0.5);
      "></div>
      <div style="
        position: absolute; top: 50%; left: 50%;
        transform: translate(-50%, -60%);
        font-size: 14px; line-height: 1;
      ">⭐</div>
    </div>
  `,
  iconSize:   [36, 36],
  iconAnchor: [18, 36],
  popupAnchor:[0, -38],
});

const makeStaticPinIcon = (visited) => L.divIcon({
  className: '',
  html: `
    <div style="
      background: ${visited ? '#22c55e' : '#ef4444'};
      width: 28px; height: 28px;
      border-radius: 50% 50% 50% 0;
      transform: rotate(-45deg);
      border: 3px solid white;
      box-shadow: 0 2px 6px rgba(0,0,0,0.3);
    "></div>
  `,
  iconSize:   [28, 28],
  iconAnchor: [14, 28],
  popupAnchor:[0, -30],
});
const PIN_ICON_VISITED   = makeStaticPinIcon(true);
const PIN_ICON_UNVISITED = makeStaticPinIcon(false);

const MY_LOCATION_ICON = L.divIcon({
  className: '',
  html: `
    <div style="
      width: 18px; height: 18px;
      background: #3b82f6;
      border-radius: 50%;
      border: 3px solid white;
      box-shadow: 0 0 0 4px rgba(59,130,246,0.3);
    "></div>
  `,
  iconSize:   [18, 18],
  iconAnchor: [9, 9],
});

// ── Map auto-fit: সব pin দেখা যায় ───────────────────────────
function FitBounds({ customers, userLocation }) {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    map.whenReady(() => {
      const points = customers
        .filter(c => c.latitude && c.longitude)
        .map(c => [parseFloat(c.latitude), parseFloat(c.longitude)]);
      if (userLocation) points.push([userLocation.lat, userLocation.lng]);
      if (points.length === 0) return;
      if (points.length === 1) { map.setView(points[0], 15); return; }
      map.fitBounds(points, { padding: [40, 40] });
    });
  }, [customers, userLocation, map]);
  return null;
}

// ── ⬇️ নতুন — container height CSS দিয়ে বদলালে Leaflet-কে জানানো ──────
function MapResizeHandler({ height }) {
  const map = useMap();
  useEffect(() => {
    // CSS transition (250ms) শেষ হওয়ার পর invalidateSize — নাহলে মাঝপথের
    // মাপ ধরে ফেলবে আর tile ভুল জায়গায় থেকে যাবে।
    const t = setTimeout(() => map.invalidateSize(), 260);
    return () => clearTimeout(t);
  }, [height, map]);
  return null;
}

/**
 * @param {Array} customers - পুরো কাস্টমার লিস্ট (GPS আছে/নেই দুটোই দিলেই চলবে, ভেতরেই ফিল্টার হয়)
 * @param {{lat:number,lng:number}|null} userLocation - SR-এর লাইভ অবস্থান (useWatchPosition থেকে)
 * @param {{customer:object,distanceMeters:number}|null} nextStop - useNextStop থেকে
 * @param {number} visitedCount
 * @param {string|number} routeId - MapContainer-কে key দেওয়ার জন্য (রুট বদলালে Leaflet ঠিকমতো re-center করতে fresh mount দরকার)
 * @param {(customerId: any) => void} onPinClick
 * @param {number} [height=280] - ম্যাপের উচ্চতা (px) — split-view resize-এর জন্য parent থেকে আসে
 * @param {() => void} [onToggleHeight] - দেওয়া হলে নিচে একটা drag-handle বাটন দেখাবে
 */
export default function CustomerMap({ customers, userLocation, nextStop, visitedCount, routeId, onPinClick, height = 280, onToggleHeight }) {
  const mappableCustomers = customers.filter(c => c.latitude && c.longitude);

  const mapCenter = mappableCustomers.length > 0
    ? [parseFloat(mappableCustomers[0].latitude), parseFloat(mappableCustomers[0].longitude)]
    : [23.8103, 90.4125];

  // ⬇️ নতুন — Phase 4: visit_order অনুযায়ী সাজিয়ে একটা সরলরেখার "shape" —
  // real road path না, শুধু ক্রম বোঝার জন্য। userLocation জানা থাকলে
  // "এখন আপনি এখানে" থেকে শুরু করে দেখানো হয়।
  const routePathPoints = [...mappableCustomers]
    .sort((a, b) => (a.visit_order ?? Infinity) - (b.visit_order ?? Infinity))
    .map(c => [parseFloat(c.latitude), parseFloat(c.longitude)]);
  if (userLocation) routePathPoints.unshift([userLocation.lat, userLocation.lng]);

  return (
    <div style={{ height, position: 'relative', flexShrink: 0, transition: 'height 0.25s ease' }}>

      {/* Progress badge — map এর উপরে float করে */}
      <div style={{
        position: 'absolute', top: 10, left: 10, zIndex: 999,
        background: 'white', borderRadius: 20,
        padding: '5px 12px', fontSize: 12, fontWeight: 700,
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        display: 'flex', alignItems: 'center', gap: 6
      }}>
        <span style={{ color: '#22c55e' }}>●</span>
        <span style={{ color: '#374151' }}>{visitedCount}/{customers.length} ভিজিট</span>
      </div>

      {/* Legend — উপরে ডানে */}
      <div style={{
        position: 'absolute', top: 10, right: 10, zIndex: 999,
        background: 'white', borderRadius: 12,
        padding: '6px 10px', fontSize: 11,
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        display: 'flex', flexDirection: 'column', gap: 3
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#22c55e' }} />
          <span style={{ color: '#374151' }}>ভিজিট হয়েছে</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ef4444' }} />
          <span style={{ color: '#374151' }}>বাকি আছে</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#3b82f6' }} />
          <span style={{ color: '#374151' }}>আপনি</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ fontSize: 10 }}>⭐</span>
          <span style={{ color: '#374151' }}>Next Stop</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ width: 12, height: 0, borderTop: '2px dashed #1e3a8a' }} />
          <span style={{ color: '#374151' }}>ক্রম (আনুমানিক)</span>
        </div>
      </div>

      {mappableCustomers.length === 0 ? (
        <div style={{
          height: '100%', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          background: '#f9fafb', color: '#9ca3af', fontSize: 13
        }}>
          <FiMap size={32} style={{ marginBottom: 8 }} />
          <p>কোনো কাস্টমারের GPS লোকেশন নেই</p>
        </div>
      ) : (
        <MapContainer
          key={routeId}
          center={mapCenter}
          zoom={14}
          style={{ height: '100%', width: '100%' }}
          zoomControl={true}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <FitBounds customers={mappableCustomers} userLocation={userLocation} />
          <MapResizeHandler height={height} />

          {/* ⬇️ নতুন — Phase 4: straight-line route shape (dashed, স্পষ্টভাবে
              "আনুমানিক" বোঝাতে — যাতে real road route বলে ভুল না হয়) */}
          {routePathPoints.length > 1 && (
            <Polyline
              positions={routePathPoints}
              pathOptions={{ color: '#1e3a8a', weight: 3, opacity: 0.55, dashArray: '6 8' }}
            />
          )}

          {userLocation && (
            <Marker position={[userLocation.lat, userLocation.lng]} icon={MY_LOCATION_ICON}>
              <Popup>
                <div style={{ fontSize: 13, fontWeight: 600 }}>📍 আপনার অবস্থান</div>
              </Popup>
            </Marker>
          )}

          {mappableCustomers.map(c => {
            const isNext = nextStop?.customer?.id === c.id;
            const icon = isNext ? NEXT_STOP_ICON : (c.visited_today ? PIN_ICON_VISITED : PIN_ICON_UNVISITED);
            return (
            <Marker
              key={c.id}
              position={[parseFloat(c.latitude), parseFloat(c.longitude)]}
              icon={icon}
              eventHandlers={{ click: () => onPinClick(c.id) }}
            >
              <Popup>
                <div style={{ minWidth: 140 }}>
                  {isNext && (
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      background: '#eff6ff', borderRadius: 8,
                      padding: '3px 8px', marginBottom: 6,
                      fontSize: 11, fontWeight: 700, color: '#2563eb'
                    }}>
                      ⭐ Next Stop
                    </div>
                  )}
                  {c.visit_order != null && (
                    <span style={{
                      display: 'inline-block', background: '#eff6ff', color: '#2563eb',
                      borderRadius: 99, padding: '1px 8px', fontSize: 11, fontWeight: 700,
                      marginBottom: 4
                    }}>
                      #{c.visit_order}
                    </span>
                  )}
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#111827', marginBottom: 2 }}>
                    {c.shop_name}
                  </div>
                  <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>
                    {c.owner_name}
                  </div>
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${c.latitude},${c.longitude}&travelmode=driving`}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      background: '#2563eb', color: 'white',
                      borderRadius: 8, padding: '5px 10px',
                      fontSize: 12, fontWeight: 600,
                      textDecoration: 'none'
                    }}
                  >
                    🧭 Navigate করুন
                  </a>
                </div>
              </Popup>
            </Marker>
            );
          })}
        </MapContainer>
      )}

      {/* ⬇️ নতুন — drag-handle, map বড়/ছোট করার টগল */}
      {onToggleHeight && (
        <button
          type="button"
          onClick={onToggleHeight}
          aria-label="ম্যাপের আকার বদলান"
          style={{
            position: 'absolute', bottom: 6, left: '50%', transform: 'translateX(-50%)',
            zIndex: 999, background: 'transparent', border: 'none', padding: 8, cursor: 'pointer',
          }}
        >
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.95)', boxShadow: '0 1px 4px rgba(0,0,0,0.35)' }} />
        </button>
      )}
    </div>
  );
}
