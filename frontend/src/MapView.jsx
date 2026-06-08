import React, { useMemo, useEffect } from 'react';
import { MapContainer, TileLayer, GeoJSON, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Buffer } from 'buffer';
import wkx from 'wkx';

// A simple utility to guess if a string is Hex EWKB/WKB
function isHexWkb(str) {
  if (typeof str !== 'string') return false;
  // WKB usually starts with 00 or 01 (big/little endian) and is all hex
  return /^(00|01)[0-9A-Fa-f]+$/.test(str);
}

// Sub-component to fit map bounds to data automatically
function ChangeView({ bounds }) {
  const map = useMap();
  useEffect(() => {
    if (bounds) {
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 16 });
    }
  }, [bounds, map]);
  return null;
}

export default function MapView({ rows }) {
  // Optimized parsing: scan only the identified geometry columns of the rows
  const geoJsonData = useMemo(() => {
    const features = [];
    if (!rows || rows.length === 0) return { type: 'FeatureCollection', features };
    
    // Find the geometry keys by scanning the first row
    const geomKeys = [];
    const firstRow = rows[0];
    for (const key of Object.keys(firstRow)) {
      if (isHexWkb(firstRow[key])) {
        geomKeys.push(key);
      }
    }
    
    // Fall back to scanning all keys if first row has null or no geometries
    const keysToScan = geomKeys.length > 0 ? geomKeys : Object.keys(firstRow);
    
    for (const row of rows) {
      for (const key of keysToScan) {
        const val = row[key];
        if (isHexWkb(val)) {
          try {
            const buf = Buffer.from(val, 'hex');
            const geom = wkx.Geometry.parse(buf);
            features.push({
              type: 'Feature',
              geometry: geom.toGeoJSON(),
              properties: { ...row, [key]: undefined } // store rest of row as properties
            });
          } catch (e) {
            // Ignore parse errors
          }
        }
      }
    }
    
    return {
      type: 'FeatureCollection',
      features
    };
  }, [rows]);

  // Calculate bounding box of all geometries
  const bounds = useMemo(() => {
    if (geoJsonData.features.length === 0) return null;
    try {
      const layer = L.geoJSON(geoJsonData);
      const layerBounds = layer.getBounds();
      if (layerBounds.isValid()) {
        return layerBounds;
      }
    } catch (e) {}
    return null;
  }, [geoJsonData]);

  if (geoJsonData.features.length === 0) {
    return (
      <div style={{ padding: '1rem', color: 'var(--text-muted)' }}>
        No valid PostGIS geometries (WKB) found in the results. Try selecting a geometry column.
      </div>
    );
  }

  const onEachFeature = (feature, layer) => {
    if (feature.properties) {
      const props = feature.properties;
      let html = '<div style="max-height: 200px; overflow-y: auto; font-family: sans-serif; font-size: 12px; color: #1e293b;">';
      for (const [key, value] of Object.entries(props)) {
        if (value !== undefined && value !== null) {
          html += `<div><strong>${key}:</strong> <span>${String(value)}</span></div>`;
        }
      }
      html += '</div>';
      layer.bindPopup(html);
    }
  };

  // Render point features as sleek hardware-rendered circle markers
  const pointToLayer = (feature, latlng) => {
    return L.circleMarker(latlng, {
      radius: 6,
      fillColor: '#3b82f6',
      color: '#ffffff',
      weight: 1.5,
      opacity: 1,
      fillOpacity: 0.8
    });
  };

  return (
    <div style={{ height: '100%', width: '100%', borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1px solid var(--border-subtle)', position: 'relative' }}>
      <MapContainer 
        center={[0, 0]} 
        zoom={2} 
        preferCanvas={true} 
        style={{ height: '100%', width: '100%', backgroundColor: '#1e293b' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {bounds && <ChangeView bounds={bounds} />}
        <GeoJSON 
          data={geoJsonData} 
          onEachFeature={onEachFeature} 
          pointToLayer={pointToLayer} 
        />
      </MapContainer>
      <div style={{ position: 'absolute', bottom: 10, left: 10, zIndex: 1000, background: 'var(--bg-glass)', backdropFilter: 'blur(8px)', border: '1px solid var(--border-subtle)', padding: '0.4rem 0.6rem', borderRadius: 'var(--radius-md)', fontSize: '0.7rem', color: 'var(--text-secondary)', pointerEvents: 'none' }}>
        💡 Tip: If geometries appear off-map, transform them to WGS84 (e.g. <code>ST_Transform(geom, 4326)</code>).
      </div>
    </div>
  );
}
