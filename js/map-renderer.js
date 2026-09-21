/**
 * Digital Superhighway ROI Predictor — Map Renderer
 * ==================================================
 * Manages Leaflet map: choropleth, markers, tooltips, legend, and layer switching.
 */

const MapRenderer = (() => {
    'use strict';

    let map = null;
    let wardLayer = null;
    let markerLayer = null;
    let heatLayer = null;
    let gridLayer = null;
    let currentLayer = 'roi_score';
    let selectedWardId = null;

    function loadPowerGrid() {
        fetch('data/kenya_power_grid.geojson')
            .then(res => res.json())
            .then(data => {
                gridLayer = L.geoJSON(data, {
                    style: function(feature) {
                        return {
                            color: '#00f5d4', // Bright cyan
                            weight: 3,
                            opacity: 0.9,
                            dashArray: feature.properties.voltage === '400kV' ? '' : '5, 5'
                        };
                    },
                    onEachFeature: function (feature, layer) {
                        layer.bindTooltip(`
                            <div class="tooltip-name">${feature.properties.name}</div>
                            <div class="tooltip-county">${feature.properties.operator} · ${feature.properties.voltage}</div>
                        `, { className: 'ward-tooltip', direction: 'top' });
                    }
                }).addTo(map);
            })
            .catch(err => console.error("Error loading power grid", err));
    }

    // Expose public methods
    const KENYA_CENTER = [0.5, 37.8];
    const KENYA_BOUNDS = [[-5.0, 33.5], [5.5, 42.0]];

    /**
     * Initialize the Leaflet map.
     */
    function init() {
        map = L.map('map', {
            center: KENYA_CENTER,
            zoom: 6.5,
            minZoom: 5,
            maxZoom: 14,
            maxBounds: [[-8, 30], [8, 45]],
            zoomControl: true,
            attributionControl: true,
        });

        // Dark tile layer
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
            attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ',
            maxZoom: 16,
        }).addTo(map);

        // Initialize marker layer group
        markerLayer = L.layerGroup().addTo(map);

        return map;
    }

    /**
     * Get style for a ward feature based on current layer.
     */
    function getWardStyle(feature) {
        const props = feature.properties;
        let color;
        const score = props[currentLayer] || 0;

        if (currentLayer === 'roi_score') {
            color = ROIEngine.getScoreColor(score);
        } else if (currentLayer === 'pop_density') {
            const normVal = Math.min(score / 2000, 1) * 100;
            color = ROIEngine.getMetricColor(normVal, currentLayer);
        } else if (currentLayer === 'clusters') {
            const clusterColors = ['#00f5d4', '#7b61ff', '#f72585', '#fbbf24', '#38bdf8', '#4ade80', '#c084fc', '#f472b6'];
            color = clusterColors[props.ml_cluster % clusterColors.length] || '#555';
        } else if (currentLayer === 'heatmap' || currentLayer === 'power_grid') {
            return { weight: 0.5, color: 'rgba(255,255,255,0.1)', fillOpacity: 0.05, fillColor: '#222' }; // Fade out polys when heatmap/grid is active
        } else {
            color = ROIEngine.getScoreColor(score);
        }

        const isSelected = props.gid === selectedWardId;
        const isTopWard = props.roi_rank <= (window.APP_STATE?.topN || 100);
        
        // Lower opacity for clusters so we can see the map
        const defaultFillOpacity = currentLayer === 'clusters' ? 0.35 : 0.55;
        const topFillOpacity = currentLayer === 'clusters' ? 0.7 : 0.78;

        return {
            fillColor: color,
            weight: isSelected ? 3 : (isTopWard ? 1.5 : 0.5),
            opacity: (currentLayer === 'heatmap' || currentLayer === 'power_grid') ? 0.3 : 1,
            color: isSelected ? '#00f5d4' : (isTopWard ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.12)'),
            fillOpacity: isSelected ? 0.9 : (isTopWard ? topFillOpacity : defaultFillOpacity),
        };
    }

    /**
     * Create tooltip content for a ward.
     */
    function createTooltip(props) {
        const scoreColor = ROIEngine.getScoreColor(props.roi_score);
        return `
            <div class="tooltip-name">${props.ward}</div>
            <div class="tooltip-county">${props.county} County · ${props.subcounty}</div>
            <div class="tooltip-score" style="color:${scoreColor}">
                ROI: ${props.roi_score.toFixed(1)} <span style="font-size:0.7em; opacity:0.7">#${props.roi_rank}</span>
            </div>
            <div class="tooltip-metrics">
                <span>👥 Pop: ${(props.pop2024 || 0).toLocaleString()} · Density: ${(props.pop_density || 0).toFixed(0)}/km²</span>
                <span>📉 Youth Unemp: ${props.youth_unemployment}% · ⚡ Elec: ${props.electrification}%</span>
                ${props.has_existing_hub ? '<span style="color:#f72585">🏛️ Existing Hub</span>' : ''}
            </div>
        `;
    }

    /**
     * Render ward boundaries as choropleth.
     */
    function renderWards(geojsonData, onWardClick) {
        if (wardLayer) {
            map.removeLayer(wardLayer);
        }

        wardLayer = L.geoJSON(geojsonData, {
            style: getWardStyle,
            onEachFeature: (feature, layer) => {
                // Tooltip
                layer.bindTooltip(() => createTooltip(feature.properties), {
                    className: 'ward-tooltip',
                    sticky: true,
                    direction: 'top',
                    offset: [0, -10],
                });

                // Click handler
                layer.on('click', () => {
                    selectedWardId = feature.properties.gid;
                    refreshStyles();
                    if (onWardClick) onWardClick(feature);
                });

                // Hover effect
                layer.on('mouseover', () => {
                    layer.setStyle({
                        weight: 2.5,
                        color: '#00f5d4',
                        fillOpacity: 0.85,
                    });
                    layer.bringToFront();
                });

                layer.on('mouseout', () => {
                    if (feature.properties.gid !== selectedWardId) {
                        wardLayer.resetStyle(layer);
                    }
                });
            },
        }).addTo(map);

        // Fit bounds
        map.fitBounds(wardLayer.getBounds(), { padding: [20, 20] });
        
        // Manage heatmap layer
        if (currentLayer === 'heatmap') {
            updateHeatmap(geojsonData.features);
        } else if (heatLayer) {
            map.removeLayer(heatLayer);
            heatLayer = null;
        }
    }

    /**
     * Render Heatmap
     */
    function updateHeatmap(features) {
        if (heatLayer) {
            map.removeLayer(heatLayer);
        }
        
        if (typeof L.heatLayer !== 'function') return; // Not loaded yet
        
        // Heatmap points based on population and youth unemployment
        const heatPoints = features
            .filter(f => f.properties.centroid_lat && f.properties.centroid_lng)
            .map(f => {
                // Intensity based on pop density and youth unemployment
                const intensity = (f.properties.norm_population * 0.5) + (f.properties.norm_youth_unemployment * 0.5);
                return [f.properties.centroid_lat, f.properties.centroid_lng, intensity];
            });

        heatLayer = L.heatLayer(heatPoints, {
            radius: 25,
            blur: 15,
            maxZoom: 10,
            max: 100,
            gradient: {0.4: '#00f5d4', 0.65: '#7b61ff', 1: '#f72585'}
        }).addTo(map);
    }

    /**
     * Add pulsing markers for top N wards.
     */
    function renderTopMarkers(features, topN = 100) {
        markerLayer.clearLayers();

        const topWards = ROIEngine.getTopN(features, topN);

        topWards.forEach((f, i) => {
            const p = f.properties;
            if (!p.centroid_lat || !p.centroid_lng) return;

            const isTop10 = i < 10;
            const size = isTop10 ? 16 : 10;

            const icon = L.divIcon({
                className: `top-ward-marker ${isTop10 ? 'rank-top10' : ''}`,
                iconSize: [size, size],
                iconAnchor: [size / 2, size / 2],
            });

            const marker = L.marker([p.centroid_lat, p.centroid_lng], { icon })
                .bindTooltip(() => createTooltip(p), {
                    className: 'ward-tooltip',
                    direction: 'top',
                    offset: [0, -12],
                });

            markerLayer.addLayer(marker);
        });
    }

    /**
     * Refresh styles (e.g., after weight changes or layer switch).
     */
    function refreshStyles() {
        if (wardLayer) {
            wardLayer.setStyle(getWardStyle);
        }
    }

    /**
     * Switch the active visualization layer.
     */
    function setLayer(layerName) {
        currentLayer = layerName;
        
        if (layerName === 'heatmap') {
            if (window.APP_STATE && window.APP_STATE.filteredFeatures) {
                updateHeatmap(window.APP_STATE.filteredFeatures);
            }
        } else if (heatLayer) {
            map.removeLayer(heatLayer);
            heatLayer = null;
        }

        if (layerName === 'power_grid') {
            if (!gridLayer) {
                loadPowerGrid();
            } else {
                map.addLayer(gridLayer);
            }
        } else if (gridLayer) {
            map.removeLayer(gridLayer);
        }
        
        refreshStyles();
        updateLegend(layerName);
    }

    /**
     * Update the legend for the current layer.
     */
    function updateLegend(layerName) {
        const legendTitle = document.getElementById('legend-title');
        const legendGradient = document.getElementById('legend-gradient');
        const legendMin = document.getElementById('legend-min');
        const legendMax = document.getElementById('legend-max');

        const configs = {
            roi_score: {
                title: 'ROI Score',
                gradient: 'linear-gradient(to right, rgb(180,40,40), rgb(255,180,40), rgb(30,210,160))',
                min: '0', max: '50',
            },
            pop_density: {
                title: 'Population Density',
                gradient: 'linear-gradient(to right, rgb(30,100,180), rgb(60,200,250))',
                min: 'Low', max: 'High',
            },
            clusters: {
                title: 'AI Management Zones',
                gradient: 'linear-gradient(to right, #00f5d4, #7b61ff, #f72585, #fbbf24)',
                min: 'Zone 1', max: 'Zone K',
            },
            heatmap: {
                title: 'Target Heatmap',
                gradient: 'linear-gradient(to right, transparent, #00f5d4, #7b61ff, #f72585)',
                min: 'Low', max: 'Hot',
            },
            power_grid: {
                title: 'National Power Grid',
                gradient: 'linear-gradient(to right, #00f5d4, #00f5d4)',
                min: 'Active Lines', max: 'High Voltage',
            }
        };

        const cfg = configs[layerName] || configs.roi_score;
        legendTitle.textContent = cfg.title;
        legendGradient.style.background = cfg.gradient;
        legendMin.textContent = cfg.min;
        legendMax.textContent = cfg.max;
    }

    /**
     * Deselect the current ward.
     */
    function deselect() {
        selectedWardId = null;
        refreshStyles();
    }

    /**
     * Zoom to a specific feature.
     */
    function zoomToFeature(feature) {
        if (feature.properties.centroid_lat && feature.properties.centroid_lng) {
            map.setView([feature.properties.centroid_lat, feature.properties.centroid_lng], 11, {
                animate: true,
                duration: 0.5,
            });
        }
    }

    /**
     * Get the map instance.
     */
    function getMap() {
        return map;
    }

    return {
        init,
        renderWards,
        renderTopMarkers,
        refreshStyles,
        setLayer,
        updateLegend,
        deselect,
        zoomToFeature,
        getMap,
    };
})();
