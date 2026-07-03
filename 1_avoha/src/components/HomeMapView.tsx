import { useEffect, useRef } from "react";
import { MapContainer, TileLayer, Marker, Circle, useMap } from "react-leaflet";
import { Link } from "react-router-dom";
import { Plus, MapPin } from "lucide-react";
import L from "leaflet";
import { useSohwakhaengStore } from "@/store/sohwakhaeng-store";
import { mockMarkers, mockRecords, mockLocationRecalls } from "@/data/mock-data";
import { RecordDetailSheet } from "./RecordDetailSheet";
import LocationRecallPopup from "./LocationRecallPopup";

const USER_LOCATION: [number, number] = [37.5665, 126.978];
const RADIUS_3KM = 3000;

function createEmojiIcon(emoji: string, delay: string) {
  return L.divIcon({
    className: "emoji-marker",
    html: `
      <div class="animate-float" style="animation-delay: ${delay};">
        <div style="width:40px;height:40px;background:#FEFCFA;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:18px;box-shadow:0 2px 8px rgba(45,37,32,0.1);">
          ${emoji}
        </div>
      </div>
    `,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });
}

function userLocationIcon() {
  return L.divIcon({
    className: "user-location-marker",
    html: `
      <div class="user-dot-pulse"></div>
      <div class="user-dot"></div>
    `,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
}

/** Fit the map to show the 3km radius on first render, then free zoom */
function InitialFit() {
  const map = useMap();
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;

    // Wait for the container to have its final size before fitting
    const frame = requestAnimationFrame(() => {
      map.invalidateSize();
      const center = L.latLng(USER_LOCATION);
      // Build a circle-fitting bounding box manually
      const earthRadius = 6371000; // meters
      const latDelta = (RADIUS_3KM / earthRadius) * (180 / Math.PI);
      const lngDelta =
        (RADIUS_3KM / (earthRadius * Math.cos((center.lat * Math.PI) / 180))) *
        (180 / Math.PI);
      const bounds = L.latLngBounds(
        [center.lat - latDelta, center.lng - lngDelta],
        [center.lat + latDelta, center.lng + lngDelta]
      );
      map.fitBounds(bounds, { padding: [30, 30], animate: false });
    });

    return () => cancelAnimationFrame(frame);
  }, [map]);

  return null;
}

function RecentCardItem({
  record,
  onClick,
}: {
  record: (typeof mockRecords)[0];
  onClick: () => void;
}) {
  return (
    <div
      className="flex-shrink-0 w-[220px] bg-surface-container-lowest rounded-2xl overflow-hidden shadow-[var(--elevation-1)] snap-center cursor-pointer active:scale-[0.97] transition-transform"
      onClick={onClick}
    >
      <div className="relative h-28 overflow-hidden">
        <img
          className="w-full h-full object-cover"
          src={record.imageUrl}
          alt={record.rawUserText ?? "기록 사진"}
        />
        <span className="absolute top-2.5 left-2.5 bg-surface-container-lowest/90 px-2 py-0.5 rounded-lg text-[10px] font-semibold text-on-surface">
          {record.emotionTags[0]}
        </span>
      </div>
      <div className="p-3 pt-2.5">
        <div className="flex items-center gap-1 mb-1.5">
          <MapPin size={10} className="text-primary" />
          <span className="text-[10px] text-on-surface-variant">
            {record.contextKeywords[0]}
          </span>
        </div>
        <p className="text-[13px] leading-snug text-on-surface line-clamp-2">
          {record.rawUserText}
        </p>
      </div>
    </div>
  );
}

export default function HomeMapView() {
  const { selectedRecord, setSelectedRecord, locationRecallVisible, triggerLocationRecall } =
    useSohwakhaengStore();
  const recallTriggered = useRef(false);

  useEffect(() => {
    if (recallTriggered.current) return;
    recallTriggered.current = true;
    const timer = setTimeout(() => {
      const first = mockLocationRecalls[0];
      if (first) triggerLocationRecall(first);
    }, 3000);
    return () => clearTimeout(timer);
  }, [triggerLocationRecall]);

  const handleMarkerClick = (markerId: string) => {
    const record = mockRecords.find((r) => r.id === markerId);
    if (record) setSelectedRecord(record);
  };

  return (
    <main className="relative h-full flex flex-col overflow-hidden">
      {/* Map */}
      <div className="absolute inset-0 z-0">
        <MapContainer
          center={USER_LOCATION}
          zoom={14}
          zoomControl={false}
          className="w-full h-full"
          style={{ background: "#F5F0EC" }}
        >
          <TileLayer
            attribution="&copy; OpenStreetMap"
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
          />
          <InitialFit />

          {/* 3km radius circle */}
          <Circle
            center={USER_LOCATION}
            radius={RADIUS_3KM}
            pathOptions={{
              color: "#E8614D",
              weight: 1.5,
              fillColor: "#E8614D",
              fillOpacity: 0.04,
              dashArray: "6 4",
            }}
          />

          {/* User red dot */}
          <Marker position={USER_LOCATION} icon={userLocationIcon()} />

          {/* Record markers */}
          {mockMarkers.map((marker) => (
            <Marker
              key={marker.id}
              position={marker.position}
              icon={createEmojiIcon(marker.emoji, marker.delay)}
              eventHandlers={{ click: () => handleMarkerClick(marker.id) }}
            />
          ))}
        </MapContainer>
      </div>

      {/* Floating record button — always visible above cards */}
      <div
        className="fixed z-40 pointer-events-auto"
        style={{ bottom: "calc(260px + var(--frame-inset-bottom))", right: 20 }}
      >
        <Link
          to="/capture"
          aria-label="소확행 기록하기"
          className="flex items-center gap-1.5 bg-on-surface text-surface pl-3.5 pr-4 py-2.5 rounded-full shadow-[var(--elevation-3)] active:scale-95 transition-transform"
        >
          <Plus size={18} strokeWidth={2.5} />
          <span className="text-[13px] font-semibold">기록</span>
        </Link>
      </div>

      {/* Bottom cards area */}
      <section className="pointer-events-auto mt-auto z-20 pb-20">
        <div className="px-5 mb-2 flex justify-between items-end">
          <span className="text-xs font-semibold text-on-surface">주변 기록</span>
          <span className="text-[10px] text-on-surface-variant">3km 이내</span>
        </div>
        <div className="flex overflow-x-auto gap-3 px-5 pb-3 no-scrollbar scroll-smooth snap-x">
          {mockRecords.slice(0, 4).map((record) => (
            <RecentCardItem
              key={record.id}
              record={record}
              onClick={() => setSelectedRecord(record)}
            />
          ))}
        </div>
      </section>

      {/* Location Recall Popup */}
      {locationRecallVisible && <LocationRecallPopup />}

      {/* Record Detail Bottom Sheet */}
      {selectedRecord && (
        <RecordDetailSheet
          record={selectedRecord}
          onClose={() => setSelectedRecord(null)}
        />
      )}
    </main>
  );
}
