/**
 * Digital Superhighway ROI Predictor — Main App Orchestrator
 * ==========================================================
 * Connects the UI, Map, Charts, and Engine.
 */

window.APP_STATE = {
    geojsonData: null,
    filteredFeatures: null,
    weights: { ...ROIEngine.DEFAULT_WEIGHTS },
    topN: 100,
    countyFilter: '',
    selectedWardId: null,
    theme: 'dark'
};

const APP = (() => {
    'use strict';

    // UI Elements
    const els = {
        loading: document.getElementById('map-loading'),
        weightSliders: document.querySelectorAll('.weight-slider'),
        weightTotal: document.getElementById('weight-total-value'),
        topnBtns: document.querySelectorAll('.topn-btn'),
        countySelect: document.getElementById('filter-county'),
        layerBtns: document.querySelectorAll('.layer-btn'),
        btnExport: document.getElementById('btn-export'),
        btnResetWeights: document.getElementById('btn-reset-weights'),
        btnTheme: document.getElementById('btn-theme'),
        
        // Ward detail panel
        panelWardDetail: document.getElementById('panel-ward-detail'),
        btnCloseDetail: document.getElementById('btn-close-detail'),
        detailName: document.getElementById('detail-ward-name'),
        detailCounty: document.getElementById('detail-county'),
        detailSubcounty: document.getElementById('detail-subcounty'),
        detailRank: document.getElementById('detail-rank'),
        detailPop: document.getElementById('detail-pop'),
        detailArea: document.getElementById('detail-area'),
        detailScore: document.getElementById('detail-score-value'),
        scoreRing: document.getElementById('score-ring-progress'),
        aiSummaryText: document.getElementById('ai-summary-text'),
        btnAiOptimize: document.getElementById('btn-ai-optimize'),
        
        // Metrics
        barYu: document.getElementById('bar-yu'),
        barElec: document.getElementById('bar-elec'),
        barYr: document.getElementById('bar-yr'),
        barCg: document.getElementById('bar-cg'),
        valYu: document.getElementById('detail-yu'),
        valElec: document.getElementById('detail-elec'),
        valYr: document.getElementById('detail-yr'),
        valCg: document.getElementById('detail-cg'),
        
        // Analytics
        tabs: document.querySelectorAll('.analytics-tab'),
        panels: document.querySelectorAll('.analytics-panel'),
        
        // Stats
        statTotalWards: document.getElementById('stat-total-wards'),
        statTopCount: document.getElementById('stat-top-count'),
    };

    /**
     * Initialize application.
     */
    async function init() {
        console.log("🚀 Initializing Digital Superhighway ROI Predictor...");
        
        // Init Map
        MapRenderer.init();
        
        // Bind UI events
        bindEvents();
        
        // Load Data
        try {
            const response = await fetch('Data/kenya_wards_roi.geojson');
            if (!response.ok) throw new Error("Failed to load geojson");
            
            APP_STATE.geojsonData = await response.json();
            APP_STATE.filteredFeatures = [...APP_STATE.geojsonData.features];
            
            console.log(`✅ Loaded ${APP_STATE.geojsonData.features.length} wards`);
            
            // Run K-Means Clustering for the Management Zones
            MLEngine.kMeansCluster(APP_STATE.geojsonData.features, 5);
            console.log(`✅ K-Means clustering completed`);
            
            // Populate county filter
            populateCounties(APP_STATE.geojsonData.features);
            
            // Initial render
            updateApp();
            
            // Hide loading
            els.loading.classList.add('hidden');
            
        } catch (error) {
            console.error("Error loading data:", error);
            els.loading.innerHTML = `<p style="color:var(--accent-tertiary)">Failed to load data. Please run process_shapefile.py first.</p>`;
        }
    }

    /**
     * Bind all DOM events.
     */
    function bindEvents() {
        // Weight sliders
        els.weightSliders.forEach(slider => {
            slider.addEventListener('input', (e) => {
                const weightKey = e.target.getAttribute('data-weight');
                const val = parseInt(e.target.value);
                
                // Update display value
                e.target.parentElement.querySelector('.slider-value').textContent = val + '%';
                
                // Update state
                APP_STATE.weights[weightKey] = val / 100;
                
                updateWeightTotal();
            });
            
            slider.addEventListener('change', () => {
                // Only re-calculate on release for performance
                recalculateScores();
            });
        });
        
        // Reset weights
        els.btnResetWeights.addEventListener('click', () => {
            APP_STATE.weights = { ...ROIEngine.DEFAULT_WEIGHTS };
            
            els.weightSliders.forEach(slider => {
                const key = slider.getAttribute('data-weight');
                const val = Math.round(APP_STATE.weights[key] * 100);
                slider.value = val;
                slider.parentElement.querySelector('.slider-value').textContent = val + '%';
            });
            
            updateWeightTotal();
            recalculateScores();
        });

        // AI Auto-Optimize
        if (els.btnAiOptimize) {
            els.btnAiOptimize.addEventListener('click', () => {
                els.btnAiOptimize.innerHTML = '✨ Optimizing...';
                els.btnAiOptimize.style.opacity = '0.7';
                
                // Use setTimeout to allow UI to update before heavy computation
                setTimeout(() => {
                    const bestWeights = MLEngine.optimizeWeights(APP_STATE.geojsonData.features, APP_STATE.topN, 250);
                    APP_STATE.weights = bestWeights;
                    
                    els.weightSliders.forEach(slider => {
                        const key = slider.getAttribute('data-weight');
                        const val = Math.round(APP_STATE.weights[key] * 100);
                        slider.value = val;
                        slider.parentElement.querySelector('.slider-value').textContent = val + '%';
                    });
                    
                    updateWeightTotal();
                    recalculateScores();
                    
                    els.btnAiOptimize.innerHTML = 'Auto-Optimize Parameters';
                    els.btnAiOptimize.style.opacity = '1';
                }, 50);
            });
        }

        // Top N Filter
        els.topnBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                els.topnBtns.forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                
                APP_STATE.topN = parseInt(e.target.getAttribute('data-n'));
                els.statTopCount.textContent = APP_STATE.topN === 0 ? 'All' : APP_STATE.topN;
                
                updateMapMarkers();
                updateCharts();
            });
        });
        
        // County Filter
        els.countySelect.addEventListener('change', (e) => {
            APP_STATE.countyFilter = e.target.value;
            applyFilters();
        });

        // Layer Toggle
        els.layerBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                els.layerBtns.forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                
                const layer = e.target.getAttribute('data-layer');
                MapRenderer.setLayer(layer);
            });
        });

        // Ward Detail Close
        els.btnCloseDetail.addEventListener('click', () => {
            els.panelWardDetail.style.display = 'none';
            MapRenderer.deselect();
            APP_STATE.selectedWardId = null;
        });

        // Analytics Tabs
        els.tabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                els.tabs.forEach(t => t.classList.remove('active'));
                els.panels.forEach(p => p.classList.remove('active'));
                
                e.target.classList.add('active');
                const targetId = `tab-${e.target.getAttribute('data-tab')}`;
                document.getElementById(targetId).classList.add('active');
                
                // Redraw charts if tab is shown (D3 needs visible container)
                setTimeout(updateCharts, 50);
            });
        });
        
        // Export CSV
        els.btnExport.addEventListener('click', () => {
            const csv = ROIEngine.exportCSV(APP_STATE.filteredFeatures, APP_STATE.topN);
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.setAttribute("href", url);
            link.setAttribute("download", "ROI_Top_Digital_Hubs.csv");
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        });
        
        // Theme Toggle
        els.btnTheme.addEventListener('click', () => {
            APP_STATE.theme = APP_STATE.theme === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', APP_STATE.theme);
            
            // Re-render charts for new colors
            updateCharts();
            if (APP_STATE.selectedWardId) {
                const feature = APP_STATE.geojsonData.features.find(f => f.properties.gid === APP_STATE.selectedWardId);
                Charts.drawRadarChart('detail-radar', feature);
            }
        });
        
        // Table search
        document.getElementById('table-search').addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            const rows = document.querySelectorAll('.data-table tbody tr');
            rows.forEach(row => {
                const text = row.textContent.toLowerCase();
                row.style.display = text.includes(term) ? '' : 'none';
            });
        });
        
        // Handle window resize
        window.addEventListener('resize', () => {
            clearTimeout(window.resizeTimer);
            window.resizeTimer = setTimeout(() => {
                updateCharts();
                if (APP_STATE.selectedWardId) {
                    const feature = APP_STATE.geojsonData.features.find(f => f.properties.gid === APP_STATE.selectedWardId);
                    Charts.drawRadarChart('detail-radar', feature);
                }
            }, 250);
        });
    }

    /**
     * Update weight total indicator.
     */
    function updateWeightTotal() {
        const sum = Object.values(APP_STATE.weights).reduce((a, b) => a + b, 0);
        const percent = Math.round(sum * 100);
        
        els.weightTotal.textContent = percent + '%';
        
        els.weightTotal.className = 'weight-total-num';
        if (percent < 100) els.weightTotal.classList.add('warning');
        else if (percent > 100) els.weightTotal.classList.add('error');
        else els.weightTotal.classList.add('valid');
    }

    /**
     * Populate county dropdown.
     */
    function populateCounties(features) {
        const counties = new Set();
        features.forEach(f => counties.add(f.properties.county));
        
        const sorted = Array.from(counties).sort();
        
        sorted.forEach(county => {
            const option = document.createElement('option');
            option.value = county;
            option.textContent = county;
            els.countySelect.appendChild(option);
        });
    }

    /**
     * Recalculate scores and update everything.
     */
    function recalculateScores() {
        // Run engine
        ROIEngine.recalculate(APP_STATE.geojsonData.features, APP_STATE.weights);
        
        // Re-apply filters
        applyFilters();
    }

    /**
     * Apply county filter and update map/charts.
     */
    function applyFilters() {
        if (APP_STATE.countyFilter === '') {
            APP_STATE.filteredFeatures = [...APP_STATE.geojsonData.features];
        } else {
            APP_STATE.filteredFeatures = APP_STATE.geojsonData.features.filter(
                f => f.properties.county === APP_STATE.countyFilter
            );
        }
        
        els.statTotalWards.textContent = APP_STATE.filteredFeatures.length.toLocaleString();
        
        updateApp();
    }

    /**
     * Main update sequence.
     */
    function updateApp() {
        // Update map polygons
        MapRenderer.renderWards(
            { type: "FeatureCollection", features: APP_STATE.filteredFeatures }, 
            handleWardClick
        );
        
        // Update top markers
        updateMapMarkers();
        
        // Update charts
        updateCharts();
        
        // Update selected ward if exists
        if (APP_STATE.selectedWardId) {
            const feature = APP_STATE.geojsonData.features.find(f => f.properties.gid === APP_STATE.selectedWardId);
            if (feature) updateWardDetailPanel(feature);
        }
    }

    /**
     * Update markers based on current top N.
     */
    function updateMapMarkers() {
        MapRenderer.renderTopMarkers(APP_STATE.filteredFeatures, APP_STATE.topN);
    }

    /**
     * Update all charts.
     */
    function updateCharts() {
        const feats = APP_STATE.filteredFeatures;
        
        // Only draw if the tab is visible
        if (document.getElementById('tab-top-wards').classList.contains('active')) {
            Charts.drawTopWardsChart('chart-top-wards', feats, 20);
        }
        if (document.getElementById('tab-scatter').classList.contains('active')) {
            Charts.drawScatterPlot('chart-scatter', feats);
        }
        if (document.getElementById('tab-county-dist').classList.contains('active')) {
            Charts.drawCountyDistribution('chart-county-dist', feats, APP_STATE.topN);
        }
        if (document.getElementById('tab-data-table').classList.contains('active')) {
            Charts.renderDataTable('data-table-wrapper', feats, APP_STATE.topN);
        }
    }

    /**
     * Handler for clicking a ward on the map.
     */
    function handleWardClick(feature) {
        APP_STATE.selectedWardId = feature.properties.gid;
        updateWardDetailPanel(feature);
        MapRenderer.zoomToFeature(feature);
    }

    /**
     * Select a ward by ID (used by charts).
     */
    function selectWard(gid) {
        const feature = APP_STATE.geojsonData.features.find(f => f.properties.gid === gid);
        if (feature) {
            APP_STATE.selectedWardId = gid;
            MapRenderer.refreshStyles(); // Highlights map
            updateWardDetailPanel(feature);
            MapRenderer.zoomToFeature(feature);
        }
    }

    /**
     * Update the detail panel UI.
     */
    function updateWardDetailPanel(feature) {
        const p = feature.properties;
        
        els.detailName.textContent = p.ward;
        els.detailCounty.textContent = p.county;
        els.detailSubcounty.textContent = p.subcounty;
        els.detailRank.textContent = `#${p.roi_rank}`;
        els.detailPop.textContent = (p.pop2024 || 0).toLocaleString();
        els.detailArea.textContent = `${(p.area_km2 || 0).toFixed(1)} km²`;
        
        // Score ring
        const score = p.roi_score || 0;
        els.detailScore.textContent = score.toFixed(1);
        
        // Circumference of r=52 is ~326.7
        const offset = 326.7 - (score / 100) * 326.7;
        els.scoreRing.style.strokeDashoffset = offset;
        els.detailScore.style.fill = ROIEngine.getScoreColor(score);
        
        // Metric bars
        els.valYu.textContent = `${p.youth_unemployment}%`;
        els.valElec.textContent = `${p.electrification}%`;
        els.valYr.textContent = `${p.youth_ratio}%`;
        els.valCg.textContent = `${p.connectivity_gap}`;
        
        els.barYu.style.width = `${p.norm_youth_unemployment}%`;
        els.barElec.style.width = `${p.norm_electrification}%`;
        els.barYr.style.width = `${p.norm_youth_ratio}%`;
        els.barCg.style.width = `${p.norm_connectivity_gap}%`;
        
        // AI Insights
        const insights = MLEngine.generateInsights(feature);
        els.aiSummaryText.innerHTML = insights.summary;
        
        // Radar chart
        Charts.drawRadarChart('detail-radar', feature);
        
        // Show panel
        els.panelWardDetail.style.display = 'block';
    }

    // Expose public methods
    return {
        init,
        selectWard
    };
})();

// Start app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Add initial setup for weights sum check
    const initialSum = Object.values(APP_STATE.weights).reduce((a, b) => a + b, 0);
    document.getElementById('weight-total-value').textContent = Math.round(initialSum * 100) + '%';
    
    // Init main app
    window.APP = APP;
    APP.init();
});
