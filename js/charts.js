/**
 * Digital Superhighway ROI Predictor — Charts & Analytics
 * =======================================================
 * D3.js based data visualizations for the analytics dashboard and radar charts.
 */

const Charts = (() => {
    'use strict';

    const MARGIN = { top: 20, right: 20, bottom: 30, left: 40 };

    /**
     * Clear an SVG container.
     */
    function clearChart(containerId) {
        const container = d3.select(`#${containerId}`);
        container.selectAll('*').remove();
        return container;
    }

    /**
     * Draw a bar chart of the top N wards.
     */
    function drawTopWardsChart(containerId, features, topN = 20) {
        const container = clearChart(containerId);
        const data = ROIEngine.getTopN(features, topN).map(f => f.properties);

        if (data.length === 0) return;

        const el = document.getElementById(containerId);
        const width = el.clientWidth - MARGIN.left - MARGIN.right;
        const height = el.clientHeight - MARGIN.top - MARGIN.bottom;

        const svg = container.append('svg')
            .attr('width', width + MARGIN.left + MARGIN.right)
            .attr('height', height + MARGIN.top + MARGIN.bottom)
            .append('g')
            .attr('transform', `translate(${MARGIN.left},${MARGIN.top})`);

        // Scales
        const x = d3.scaleBand()
            .range([0, width])
            .padding(0.2)
            .domain(data.map(d => d.ward));

        const y = d3.scaleLinear()
            .range([height, 0])
            .domain([0, d3.max(data, d => d.roi_score) * 1.1]);

        // Axes
        svg.append('g')
            .attr('transform', `translate(0,${height})`)
            .attr('class', 'chart-axis')
            .call(d3.axisBottom(x).tickSizeOuter(0))
            .selectAll('text')
            .attr('transform', 'rotate(-45)')
            .style('text-anchor', 'end')
            .style('font-size', '8px');

        svg.append('g')
            .attr('class', 'chart-axis')
            .call(d3.axisLeft(y).ticks(5));

        // Bars
        svg.selectAll('.bar')
            .data(data)
            .enter().append('rect')
            .attr('class', 'bar')
            .attr('x', d => x(d.ward))
            .attr('y', height)
            .attr('width', x.bandwidth())
            .attr('height', 0)
            .attr('fill', d => ROIEngine.getScoreColor(d.roi_score))
            .on('click', (event, d) => {
                if (window.APP) window.APP.selectWard(d.gid);
            })
            .transition()
            .duration(800)
            .delay((d, i) => i * 30)
            .attr('y', d => y(d.roi_score))
            .attr('height', d => height - y(d.roi_score));

        // Labels
        svg.selectAll('.chart-label')
            .data(data)
            .enter().append('text')
            .attr('class', 'chart-label')
            .attr('x', d => x(d.ward) + x.bandwidth() / 2)
            .attr('y', d => y(d.roi_score) - 5)
            .attr('text-anchor', 'middle')
            .text(d => d.roi_score.toFixed(1))
            .attr('opacity', 0)
            .transition()
            .duration(800)
            .delay(500)
            .attr('opacity', 1);
    }

    /**
     * Draw a scatter plot: Population vs Youth Unemployment.
     */
    function drawScatterPlot(containerId, features) {
        const container = clearChart(containerId);
        const data = features.map(f => f.properties);

        const el = document.getElementById(containerId);
        const width = el.clientWidth - MARGIN.left - MARGIN.right;
        const height = el.clientHeight - MARGIN.top - MARGIN.bottom;

        const svg = container.append('svg')
            .attr('width', width + MARGIN.left + MARGIN.right)
            .attr('height', height + MARGIN.top + MARGIN.bottom)
            .append('g')
            .attr('transform', `translate(${MARGIN.left},${MARGIN.top})`);

        // Scales
        const x = d3.scaleLinear()
            .range([0, width])
            .domain([0, d3.max(data, d => d.pop_density)]);

        const y = d3.scaleLinear()
            .range([height, 0])
            .domain([0, 100]); // Unemployment 0-100%

        const size = d3.scaleLinear()
            .range([2, 10])
            .domain([0, 50]); // ROI score

        // Axes
        svg.append('g')
            .attr('transform', `translate(0,${height})`)
            .attr('class', 'chart-axis')
            .call(d3.axisBottom(x).ticks(5).tickFormat(d => d > 1000 ? (d/1000).toFixed(0)+'k' : d));
            
        svg.append('text')
            .attr('x', width)
            .attr('y', height - 5)
            .style('text-anchor', 'end')
            .style('font-size', '9px')
            .style('fill', 'var(--text-muted)')
            .text('Pop. Density');

        svg.append('g')
            .attr('class', 'chart-axis')
            .call(d3.axisLeft(y).ticks(5));
            
        svg.append('text')
            .attr('transform', 'rotate(-90)')
            .attr('y', 15)
            .attr('x', 0)
            .style('text-anchor', 'end')
            .style('font-size', '9px')
            .style('fill', 'var(--text-muted)')
            .text('Youth Unemp. %');

        // Dots
        svg.selectAll('.scatter-dot')
            .data(data)
            .enter().append('circle')
            .attr('class', 'scatter-dot')
            .attr('cx', d => x(d.pop_density))
            .attr('cy', d => y(d.youth_unemployment))
            .attr('r', 0)
            .attr('fill', d => {
                const color = ROIEngine.getScoreColor(d.roi_score);
                // Convert rgb to rgba
                return color.replace('rgb', 'rgba').replace(')', ', 0.6)');
            })
            .on('click', (event, d) => {
                if (window.APP) window.APP.selectWard(d.gid);
            })
            .append('title')
            .text(d => `${d.ward}: ROI ${d.roi_score.toFixed(1)}`);

        // Animate in
        svg.selectAll('.scatter-dot')
            .transition()
            .duration(800)
            .delay((d, i) => Math.random() * 500)
            .attr('r', d => size(d.roi_score));
    }

    /**
     * Draw a donut chart of county distribution for top wards.
     */
    function drawCountyDistribution(containerId, features, topN = 100) {
        const container = clearChart(containerId);
        const dist = ROIEngine.getCountyDistribution(features, topN).slice(0, 8); // Top 8 counties
        
        if (dist.length === 0) return;

        const el = document.getElementById(containerId);
        const width = el.clientWidth;
        const height = el.clientHeight;
        const radius = Math.min(width, height) / 2 - 20;

        const svg = container.append('svg')
            .attr('width', width)
            .attr('height', height)
            .append('g')
            .attr('transform', `translate(${width / 2},${height / 2})`);

        const color = d3.scaleOrdinal()
            .domain(dist.map(d => d.county))
            .range(['#00f5d4', '#7b61ff', '#f72585', '#38bdf8', '#fbbf24', '#4ade80', '#c084fc', '#f472b6']);

        const pie = d3.pie()
            .value(d => d.count)
            .sort(null);

        const arc = d3.arc()
            .innerRadius(radius * 0.6)
            .outerRadius(radius);
            
        const arcHover = d3.arc()
            .innerRadius(radius * 0.6)
            .outerRadius(radius * 1.1);

        const data_ready = pie(dist);

        // Center text
        const centerGroup = svg.append('g');
        const centerValue = centerGroup.append('text')
            .attr('class', 'donut-center-value')
            .attr('text-anchor', 'middle')
            .attr('y', 0)
            .text(dist[0].count);
            
        const centerLabel = centerGroup.append('text')
            .attr('class', 'donut-center-label')
            .attr('text-anchor', 'middle')
            .attr('y', 15)
            .text(dist[0].county);

        // Slices
        const slices = svg.selectAll('.donut-arc')
            .data(data_ready)
            .enter()
            .append('path')
            .attr('class', 'donut-arc')
            .attr('d', arc)
            .attr('fill', d => color(d.data.county))
            .on('mouseover', function(event, d) {
                d3.select(this).transition().duration(200).attr('d', arcHover);
                centerValue.text(d.data.count);
                centerLabel.text(d.data.county);
            })
            .on('mouseout', function(event, d) {
                d3.select(this).transition().duration(200).attr('d', arc);
                centerValue.text(dist[0].count);
                centerLabel.text(dist[0].county);
            });

        // Legend (simplified)
        const legendGroup = svg.append('g')
            .attr('transform', `translate(${radius + 20}, ${-radius + 10})`);
            
        // Animation
        slices.transition()
            .duration(1000)
            .attrTween('d', function(d) {
                const i = d3.interpolate({startAngle: 0, endAngle: 0}, d);
                return function(t) { return arc(i(t)); };
            });
    }

    /**
     * Draw radar chart for a specific ward's metrics.
     */
    function drawRadarChart(containerId, feature) {
        const container = clearChart(containerId);
        if (!feature) return;

        const p = feature.properties;
        const metrics = [
            { axis: 'Population', value: p.norm_population / 100 },
            { axis: 'Youth Unemp.', value: p.norm_youth_unemployment / 100 },
            { axis: 'Youth Ratio', value: p.norm_youth_ratio / 100 },
            { axis: 'Electrification', value: p.norm_electrification / 100 },
            { axis: 'Conn. Gap', value: p.norm_connectivity_gap / 100 }
        ];

        const el = document.getElementById(containerId);
        const width = el.clientWidth;
        const height = el.clientHeight;
        const radius = Math.min(width, height) / 2 - 25;
        
        const angleSlice = Math.PI * 2 / metrics.length;
        const rScale = d3.scaleLinear().range([0, radius]).domain([0, 1]);

        const svg = container.append('svg')
            .attr('width', width)
            .attr('height', height)
            .append('g')
            .attr('transform', `translate(${width / 2},${height / 2})`);

        // Circular grid
        const axisGrid = svg.append('g');
        for (let j = 0; j < 4; j++) {
            const levelFactor = radius * ((j + 1) / 4);
            axisGrid.selectAll(`.levels-${j}`)
                .data([1])
                .enter().append('circle')
                .attr('r', levelFactor)
                .style('fill', 'none')
                .style('stroke', 'var(--glass-border)')
                .style('stroke-width', '1px');
        }

        // Axes
        const axis = axisGrid.selectAll('.axis')
            .data(metrics)
            .enter().append('g')
            .attr('class', 'axis');

        axis.append('line')
            .attr('x1', 0)
            .attr('y1', 0)
            .attr('x2', (d, i) => rScale(1.1) * Math.cos(angleSlice * i - Math.PI / 2))
            .attr('y2', (d, i) => rScale(1.1) * Math.sin(angleSlice * i - Math.PI / 2))
            .style('stroke', 'var(--glass-border)')
            .style('stroke-width', '1px');

        axis.append('text')
            .attr('class', 'chart-label')
            .style('font-size', '8px')
            .attr('text-anchor', 'middle')
            .attr('dy', '0.35em')
            .attr('x', (d, i) => rScale(1.25) * Math.cos(angleSlice * i - Math.PI / 2))
            .attr('y', (d, i) => rScale(1.25) * Math.sin(angleSlice * i - Math.PI / 2))
            .text(d => d.axis);

        // Radar Area
        const radarLine = d3.lineRadial()
            .curve(d3.curveLinearClosed)
            .angle((d, i) => i * angleSlice)
            .radius(d => rScale(d.value));

        const baseColor = ROIEngine.getScoreColor(p.roi_score);
        
        // Background area
        svg.append('path')
            .datum(metrics)
            .attr('d', radarLine)
            .style('fill', baseColor)
            .style('fill-opacity', 0.2)
            .style('stroke', baseColor)
            .style('stroke-width', 2);
            
        // Dots
        svg.selectAll('.radar-dot')
            .data(metrics)
            .enter().append('circle')
            .attr('class', 'radar-dot')
            .attr('r', 3)
            .attr('cx', (d, i) => rScale(d.value) * Math.cos(angleSlice * i - Math.PI / 2))
            .attr('cy', (d, i) => rScale(d.value) * Math.sin(angleSlice * i - Math.PI / 2))
            .style('fill', '#fff')
            .style('stroke', baseColor)
            .style('stroke-width', 1.5);
    }

    /**
     * Render the HTML data table.
     */
    function renderDataTable(containerId, features, topN = 100) {
        const container = document.getElementById(containerId);
        const top = topN === 0 ? features : ROIEngine.getTopN(features, topN);
        
        let html = `
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Rank</th>
                        <th>Ward</th>
                        <th>County</th>
                        <th>ROI Score</th>
                        <th>Pop 2024</th>
                        <th>Youth Unemp</th>
                        <th>Elec %</th>
                    </tr>
                </thead>
                <tbody>
        `;
        
        top.forEach(f => {
            const p = f.properties;
            const scoreColor = ROIEngine.getScoreColor(p.roi_score);
            html += `
                <tr data-gid="${p.gid}" class="${p.roi_rank <= 100 ? 'top-ward' : ''}">
                    <td class="rank-cell">#${p.roi_rank}</td>
                    <td>
                        <strong>${p.ward}</strong>
                        ${p.has_existing_hub ? '<br><span class="hub-badge">Existing Hub</span>' : ''}
                    </td>
                    <td>${p.county}</td>
                    <td class="score-cell" style="color:${scoreColor}">${p.roi_score.toFixed(1)}</td>
                    <td>${(p.pop2024 || 0).toLocaleString()}</td>
                    <td>${p.youth_unemployment}%</td>
                    <td>${p.electrification}%</td>
                </tr>
            `;
        });
        
        html += `</tbody></table>`;
        container.innerHTML = html;
        
        // Add click events to rows
        container.querySelectorAll('tbody tr').forEach(row => {
            row.addEventListener('click', () => {
                const gid = parseInt(row.getAttribute('data-gid'));
                if (window.APP) window.APP.selectWard(gid);
            });
        });
    }

    return {
        drawTopWardsChart,
        drawScatterPlot,
        drawCountyDistribution,
        drawRadarChart,
        renderDataTable,
    };
})();
