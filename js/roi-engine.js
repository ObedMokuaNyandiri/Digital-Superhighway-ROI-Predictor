/**
 * Digital Superhighway ROI Predictor — ROI Scoring Engine
 * ========================================================
 * Pure-function scoring engine. No DOM dependencies.
 * Handles normalization, MCDA calculation, ranking, and sensitivity analysis.
 */

const ROIEngine = (() => {
    'use strict';

    // Default weights
    const DEFAULT_WEIGHTS = {
        population: 0.25,
        youth_unemployment: 0.30,
        youth_ratio: 0.15,
        electrification: 0.15,
        connectivity_gap: 0.15,
    };

    const HUB_PENALTY = 15;

    /**
     * Min-max normalize an array of values to [0, 100].
     */
    function minMaxNormalize(values) {
        const min = Math.min(...values);
        const max = Math.max(...values);
        if (max === min) return values.map(() => 0);
        return values.map(v => ((v - min) / (max - min)) * 100);
    }

    /**
     * Electrification scoring: moderate electrification (~55%) scores highest.
     * Very low = no power for hub; very high = already well-served.
     */
    function electrificationScore(rate) {
        return 100 - Math.abs(rate - 55) * 2;
    }

    /**
     * Recalculate all ROI scores for a set of ward features.
     * @param {Array} features - GeoJSON feature array
     * @param {Object} weights - Weight object {population, youth_unemployment, ...}
     * @returns {Array} features with updated roi_score and roi_rank
     */
    function recalculate(features, weights = DEFAULT_WEIGHTS) {
        const w = { ...DEFAULT_WEIGHTS, ...weights };

        // Extract raw values
        const popDensity = features.map(f => f.properties.pop_density || 0);
        const youthUnemp = features.map(f => f.properties.youth_unemployment || 0);
        const youthRatio = features.map(f => f.properties.youth_ratio || 0);
        const electrification = features.map(f => electrificationScore(f.properties.electrification || 0));
        const connectivityGap = features.map(f => f.properties.connectivity_gap || 0);

        // Normalize each
        const normPop = minMaxNormalize(popDensity);
        const normYU = minMaxNormalize(youthUnemp);
        const normYR = minMaxNormalize(youthRatio);
        const normElec = minMaxNormalize(electrification);
        const normCG = minMaxNormalize(connectivityGap);

        // Calculate composite score
        const scores = features.map((f, i) => {
            let score = (
                w.population * normPop[i] +
                w.youth_unemployment * normYU[i] +
                w.youth_ratio * normYR[i] +
                w.electrification * normElec[i] +
                w.connectivity_gap * normCG[i]
            );

            // Penalty for existing hubs
            if (f.properties.has_existing_hub) {
                score -= HUB_PENALTY;
            }

            return Math.max(0, Math.min(100, score));
        });

        // Assign scores
        features.forEach((f, i) => {
            f.properties.roi_score = Math.round(scores[i] * 100) / 100;
            f.properties.norm_population = Math.round(normPop[i] * 100) / 100;
            f.properties.norm_youth_unemployment = Math.round(normYU[i] * 100) / 100;
            f.properties.norm_youth_ratio = Math.round(normYR[i] * 100) / 100;
            f.properties.norm_electrification = Math.round(normElec[i] * 100) / 100;
            f.properties.norm_connectivity_gap = Math.round(normCG[i] * 100) / 100;
        });

        // Rank
        const sorted = [...features].sort((a, b) => b.properties.roi_score - a.properties.roi_score);
        sorted.forEach((f, i) => {
            f.properties.roi_rank = i + 1;
        });

        return features;
    }

    /**
     * Get top N wards sorted by ROI score.
     */
    function getTopN(features, n) {
        return [...features]
            .sort((a, b) => b.properties.roi_score - a.properties.roi_score)
            .slice(0, n);
    }

    /**
     * Get statistics for a set of features.
     */
    function getStats(features) {
        const scores = features.map(f => f.properties.roi_score);
        const pop = features.map(f => f.properties.pop2024);
        return {
            count: features.length,
            scoreMin: Math.min(...scores),
            scoreMax: Math.max(...scores),
            scoreMean: scores.reduce((a, b) => a + b, 0) / scores.length,
            totalPop: pop.reduce((a, b) => a + b, 0),
        };
    }

    /**
     * Get county distribution of top N wards.
     */
    function getCountyDistribution(features, topN = 100) {
        const top = getTopN(features, topN);
        const dist = {};
        top.forEach(f => {
            const county = f.properties.county;
            dist[county] = (dist[county] || 0) + 1;
        });
        return Object.entries(dist)
            .map(([county, count]) => ({ county, count }))
            .sort((a, b) => b.count - a.count);
    }

    /**
     * Sensitivity analysis: how does changing one weight ±10% affect a ward's score?
     */
    function sensitivityAnalysis(feature, features, weights) {
        const result = {};
        const weightKeys = Object.keys(weights);
        const baseScore = feature.properties.roi_score;

        weightKeys.forEach(key => {
            const wPlus = { ...weights, [key]: Math.min(1, weights[key] + 0.10) };
            const wMinus = { ...weights, [key]: Math.max(0, weights[key] - 0.10) };

            // Recalc with shifted weights
            const featCopyPlus = JSON.parse(JSON.stringify(features));
            const featCopyMinus = JSON.parse(JSON.stringify(features));
            recalculate(featCopyPlus, wPlus);
            recalculate(featCopyMinus, wMinus);

            const idx = features.indexOf(feature);
            const scorePlus = featCopyPlus[idx]?.properties.roi_score || baseScore;
            const scoreMinus = featCopyMinus[idx]?.properties.roi_score || baseScore;

            result[key] = {
                base: baseScore,
                plus10: scorePlus,
                minus10: scoreMinus,
                sensitivity: Math.abs(scorePlus - scoreMinus),
            };
        });

        return result;
    }

    /**
     * Color scale for ROI scores.
     */
    function getScoreColor(score, maxScore = 50) {
        const t = Math.min(score / maxScore, 1);
        // Red → Yellow → Green gradient
        if (t < 0.33) {
            const s = t / 0.33;
            return `rgb(${Math.round(180 + 75 * s)}, ${Math.round(40 + 140 * s)}, ${Math.round(40)})`;
        } else if (t < 0.66) {
            const s = (t - 0.33) / 0.33;
            return `rgb(${Math.round(255 - 120 * s)}, ${Math.round(180 + 40 * s)}, ${Math.round(40 + 20 * s)})`;
        } else {
            const s = (t - 0.66) / 0.34;
            return `rgb(${Math.round(135 - 105 * s)}, ${Math.round(220 - 10 * s)}, ${Math.round(60 + 100 * s)})`;
        }
    }

    /**
     * Color scale for other metrics.
     */
    function getMetricColor(value, metric) {
        const t = value / 100;
        switch (metric) {
            case 'pop_density': {
                // Blue gradient
                return `rgb(${Math.round(30 + 30 * t)}, ${Math.round(100 + 100 * t)}, ${Math.round(180 + 70 * t)})`;
            }
            case 'youth_unemployment': {
                // Green to red
                return `rgb(${Math.round(50 + 200 * t)}, ${Math.round(200 - 150 * t)}, ${Math.round(80 - 40 * t)})`;
            }
            case 'electrification': {
                // Purple gradient
                return `rgb(${Math.round(80 + 100 * t)}, ${Math.round(40 + 60 * t)}, ${Math.round(120 + 135 * t)})`;
            }
            default:
                return getScoreColor(value * 50 / 100);
        }
    }

    /**
     * Export top N wards as CSV string.
     */
    function exportCSV(features, topN = 100) {
        const top = getTopN(features, topN);
        const headers = [
            'Rank', 'Ward', 'County', 'Sub-County',
            'ROI Score', 'Population 2024', 'Area (km²)', 'Pop. Density',
            'Youth Unemployment (%)', 'Electrification (%)',
            'Youth Ratio (%)', 'Connectivity Gap',
            'Existing Hub', 'Latitude', 'Longitude'
        ];

        const rows = top.map(f => {
            const p = f.properties;
            return [
                p.roi_rank, `"${p.ward}"`, `"${p.county}"`, `"${p.subcounty}"`,
                p.roi_score, p.pop2024, p.area_km2, p.pop_density?.toFixed(1),
                p.youth_unemployment, p.electrification,
                p.youth_ratio, p.connectivity_gap,
                p.has_existing_hub ? 'Yes' : 'No',
                p.centroid_lat?.toFixed(4), p.centroid_lng?.toFixed(4)
            ].join(',');
        });

        return [headers.join(','), ...rows].join('\n');
    }

    // Public API
    return {
        DEFAULT_WEIGHTS,
        recalculate,
        getTopN,
        getStats,
        getCountyDistribution,
        sensitivityAnalysis,
        getScoreColor,
        getMetricColor,
        exportCSV,
    };
})();
