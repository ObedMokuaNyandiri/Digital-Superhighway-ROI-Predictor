/**
 * Digital Superhighway ROI Predictor — Machine Learning & AI Engine
 * =================================================================
 * Implements K-Means clustering, weight auto-optimization, and AI insight generation.
 */

const MLEngine = (() => {
    'use strict';

    /**
     * K-Means Clustering implementation
     * Clusters top wards into K management zones based on coordinates.
     */
    function kMeansCluster(features, k = 5, maxIterations = 20) {
        if (features.length === 0) return [];

        // Extract coordinates
        const points = features.map(f => ({
            feature: f,
            x: f.properties.centroid_lng,
            y: f.properties.centroid_lat
        }));

        // Initialize centroids randomly from data points
        let centroids = [];
        const shuffled = [...points].sort(() => 0.5 - Math.random());
        for (let i = 0; i < k && i < shuffled.length; i++) {
            centroids.push({ x: shuffled[i].x, y: shuffled[i].y, id: i });
        }

        let clusters = new Array(k).fill().map(() => []);
        let hasChanged = true;
        let iter = 0;

        while (hasChanged && iter < maxIterations) {
            hasChanged = false;
            // Clear clusters
            clusters = new Array(k).fill().map(() => []);

            // Assign points to nearest centroid
            points.forEach(p => {
                let minDist = Infinity;
                let closestIndex = -1;

                centroids.forEach((c, idx) => {
                    const dist = Math.sqrt(Math.pow(p.x - c.x, 2) + Math.pow(p.y - c.y, 2));
                    if (dist < minDist) {
                        minDist = dist;
                        closestIndex = idx;
                    }
                });

                clusters[closestIndex].push(p);
                if (p.cluster !== closestIndex) {
                    p.cluster = closestIndex;
                    hasChanged = true;
                }
            });

            // Recalculate centroids
            clusters.forEach((cluster, idx) => {
                if (cluster.length > 0) {
                    const sumX = cluster.reduce((sum, p) => sum + p.x, 0);
                    const sumY = cluster.reduce((sum, p) => sum + p.y, 0);
                    centroids[idx].x = sumX / cluster.length;
                    centroids[idx].y = sumY / cluster.length;
                }
            });
            iter++;
        }

        // Tag features with cluster ID
        points.forEach(p => {
            p.feature.properties.ml_cluster = p.cluster;
        });

        return clusters.map((c, i) => ({
            id: i,
            centroid: centroids[i],
            points: c
        }));
    }

    /**
     * AI Auto-Optimizer
     * Uses random search to find the weight configuration that maximizes
     * the average population and youth unemployment of the top N wards.
     */
    function optimizeWeights(features, topN = 100, iterations = 100) {
        let bestWeights = { ...ROIEngine.DEFAULT_WEIGHTS };
        let bestScore = -Infinity;

        // The objective function: What are we trying to maximize?
        const evaluate = (w) => {
            const testFeatures = JSON.parse(JSON.stringify(features));
            ROIEngine.recalculate(testFeatures, w);
            const top = ROIEngine.getTopN(testFeatures, topN);
            
            // Objective: Maximize total population reached AND average youth unemployment of selected hubs
            const totalPop = top.reduce((sum, f) => sum + (f.properties.pop_density || 0), 0);
            const avgYu = top.reduce((sum, f) => sum + (f.properties.youth_unemployment || 0), 0) / topN;
            const avgConnGap = top.reduce((sum, f) => sum + (f.properties.connectivity_gap || 0), 0) / topN;
            
            // We want high pop, high youth unemp, and high connectivity gap
            return (totalPop * 0.5) + (avgYu * 100) + (avgConnGap * 50);
        };

        // Random search
        for (let i = 0; i < iterations; i++) {
            // Generate random weights that sum to 1
            const r1 = Math.random();
            const r2 = Math.random();
            const r3 = Math.random();
            const r4 = Math.random();
            const r5 = Math.random();
            const sum = r1 + r2 + r3 + r4 + r5;
            
            const w = {
                population: r1 / sum,
                youth_unemployment: r2 / sum,
                youth_ratio: r3 / sum,
                electrification: r4 / sum,
                connectivity_gap: r5 / sum
            };

            const score = evaluate(w);
            if (score > bestScore) {
                bestScore = score;
                bestWeights = w;
            }
        }

        // Round to 2 decimal places and ensure sum is exactly 1.0 (100%)
        let w_arr = [
            Math.round(bestWeights.population * 100),
            Math.round(bestWeights.youth_unemployment * 100),
            Math.round(bestWeights.youth_ratio * 100),
            Math.round(bestWeights.electrification * 100),
            Math.round(bestWeights.connectivity_gap * 100)
        ];
        
        // Adjust for rounding errors
        let diff = 100 - w_arr.reduce((a, b) => a + b, 0);
        w_arr[0] += diff; // Add difference to the first one

        return {
            population: w_arr[0] / 100,
            youth_unemployment: w_arr[1] / 100,
            youth_ratio: w_arr[2] / 100,
            electrification: w_arr[3] / 100,
            connectivity_gap: w_arr[4] / 100
        };
    }

    /**
     * Generate Natural Language Insights
     * Simulates an LLM response explaining why a ward is ranked where it is.
     */
    function generateInsights(feature) {
        const p = feature.properties;
        const rank = p.roi_rank;
        let reasons = [];

        if (p.youth_unemployment > 50) reasons.push("a critically high youth unemployment rate");
        else if (p.youth_unemployment > 35) reasons.push("a significant youth unemployment rate");

        if (p.pop_density > 1000) reasons.push("extremely high population density");
        else if (p.pop_density > 300) reasons.push("solid population density");

        if (p.electrification > 40 && p.electrification < 70) reasons.push("optimal existing grid infrastructure");
        else if (p.electrification <= 40) reasons.push("poor power infrastructure which may increase deployment costs");

        if (p.connectivity_gap > 70) reasons.push("a severe connectivity gap making it a high-impact target");

        if (p.has_existing_hub) reasons.push("an existing hub nearby, which severely penalized its score to prevent resource duplication");

        let summary = `This ward ranks <strong>#${rank}</strong> overall. `;
        
        if (rank <= 100) {
            summary += `It is a <strong>top-tier candidate</strong> for a digital hub primarily due to ${reasons.slice(0, 2).join(' and ')}. `;
            summary += `Deploying here maximizes ROI by reaching underserved youth efficiently.`;
        } else if (rank <= 500) {
            summary += `It is a <strong>moderate candidate</strong>. While it has ${reasons[0] || 'decent demographics'}, it lacks the compounding factors seen in top 100 wards.`;
        } else {
            summary += `It is a <strong>low priority</strong> location at this time. Its profile indicates either sufficient existing services or structural challenges like ${reasons[reasons.length - 1] || 'low density'}.`;
        }

        // Predictive Success Score
        const successProb = Math.min(99, Math.max(12, p.roi_score * 0.85 + (Math.random() * 15)));

        return {
            summary: summary,
            successProbability: successProb.toFixed(1)
        };
    }

    return {
        kMeansCluster,
        optimizeWeights,
        generateInsights
    };
})();
