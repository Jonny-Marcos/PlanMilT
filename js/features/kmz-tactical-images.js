/**
 * @fileoverview Rasteriza gráficos táticos em imagens geográficas para exportação KMZ.
 * @exports window.PlanMilT.kmzTacticalImages
 * @requires Canvas e projeção Web Mercator do mapa Leaflet.
 */
window.PlanMilT = window.PlanMilT || {};

window.PlanMilT.kmzTacticalImages = Object.freeze({
    /**
     * Gera imagens transparentes em blocos, na escala atual do mapa.
     * @param {Object[]} features - Feições táticas GeoJSON.
     * @param {Object} map - Mapa Leaflet usado para projeção.
     * @param {Function} boundaryLayout - Calcula as lacunas dos limites.
     * @returns {Promise<Object[]>} PNGs e seus limites geográficos.
     */
    async render(features, map, boundaryLayout) {
        const tileSize = 1024;
        const maxPixels = 64 * tileSize * tileSize;
        const zoom = map.getZoom();
        const images = [];
        let totalPixels = 0;
        const measureCanvas = document.createElement('canvas');
        const measure = measureCanvas.getContext('2d');
        if (!measure) throw new Error('O navegador não permite criar imagens dos gráficos táticos.');
        measure.font = '700 12px sans-serif';

        for (const feature of features) {
            const properties = feature.properties;
            const geometry = feature.geometry;
            const points = [];
            const collect = item => {
                if (!item) return;
                if (item.type === 'GeometryCollection') {
                    item.geometries.forEach(collect);
                    return;
                }
                const visit = coordinates => {
                    if (typeof coordinates[0] === 'number') points.push(coordinates);
                    else coordinates.forEach(visit);
                };
                visit(item.coordinates);
            };
            collect(geometry);
            if (!points.length || points.some(point => !Number.isFinite(point[0]) || !Number.isFinite(point[1])
                || Math.abs(point[0]) > 180 || Math.abs(point[1]) > 85)) {
                throw new Error('Um gráfico tático possui coordenadas fora da área suportada para imagens KMZ.');
            }
            const longitudeBounds = points.reduce((bounds, point) => [
                Math.min(bounds[0], point[0]), Math.max(bounds[1], point[0])
            ], [Infinity, -Infinity]);
            if (longitudeBounds[1] - longitudeBounds[0] > 180) {
                throw new Error('Gráficos táticos que cruzam o antimeridiano não podem ser exportados como imagens.');
            }
            const projected = points.map(point => map.project([point[1], point[0]], zoom));
            let text = String(properties.text || '');
            if (properties.tacticalGraphic.name !== 'Boundary' && text) {
                const entities = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" };
                text = text.replace(/<[^>]*>/g, '').replace(/&(amp|lt|gt|quot|#39);/g,
                    (match, entity) => entities[entity]);
            }
            const offset = Array.isArray(properties.boundaryOffset) ? properties.boundaryOffset : [0, 0];
            const padding = Math.ceil(Math.max(32, measure.measureText(text).width + Math.abs(offset[0]) + 16,
                Math.abs(offset[1]) + 32));
            const extent = projected.reduce((bounds, point) => ({
                left: Math.min(bounds.left, point.x), top: Math.min(bounds.top, point.y),
                right: Math.max(bounds.right, point.x), bottom: Math.max(bounds.bottom, point.y)
            }), { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity });
            const left = Math.floor(extent.left - padding);
            const top = Math.floor(extent.top - padding);
            const width = Math.ceil(extent.right + padding) - left;
            const height = Math.ceil(extent.bottom + padding) - top;
            const columns = Math.ceil(width / tileSize);
            const rows = Math.ceil(height / tileSize);
            totalPixels += width * height;
            if (totalPixels > maxPixels) {
                throw new Error('Os gráficos táticos ocupam uma área grande demais para exportação. Afaste o zoom do mapa e tente novamente.');
            }

            const layout = properties.tacticalGraphic.name === 'Boundary'
                && properties.role === 'graphic' && geometry.type === 'LineString'
                ? boundaryLayout(geometry, properties.tacticalGraphic.boundary?.count ?? 1, zoom)
                : null;
            if (properties.tacticalGraphic.name === 'Boundary' && properties.role === 'graphic'
                && geometry.type === 'LineString' && !layout) {
                throw new Error('Não foi possível calcular as lacunas de um limite para o KMZ.');
            }

            for (let row = 0; row < rows; row++) {
                for (let column = 0; column < columns; column++) {
                    const x = left + column * tileSize;
                    const y = top + row * tileSize;
                    const w = Math.min(tileSize, width - column * tileSize);
                    const h = Math.min(tileSize, height - row * tileSize);
                    const northwest = map.unproject([x, y], zoom);
                    const southeast = map.unproject([x + w, y + h], zoom);
                    if (northwest.lng < -180 || southeast.lng > 180 || northwest.lat > 85 || southeast.lat < -85) {
                        throw new Error('Um gráfico tático está próximo demais do limite da projeção para exportação KMZ.');
                    }
                    const source = document.createElement('canvas');
                    source.width = w;
                    source.height = h;
                    const context = source.getContext('2d');
                    if (!context) throw new Error('O navegador não permite criar imagens dos gráficos táticos.');
                    context.translate(-x, -y);
                    context.strokeStyle = properties.color || '#1f2933';
                    context.fillStyle = properties.fillColor || properties.color || '#1f2933';
                    context.lineWidth = 3;
                    context.lineCap = layout ? 'butt' : 'round';
                    context.lineJoin = 'round';
                    if (layout) context.setLineDash(layout.dashArray.split(/\s+/).map(Number));
                    const drawLine = (coordinates, close) => {
                        coordinates.forEach((point, index) => {
                            const projectedPoint = map.project([point[1], point[0]], zoom);
                            if (index === 0) context.moveTo(projectedPoint.x, projectedPoint.y);
                            else context.lineTo(projectedPoint.x, projectedPoint.y);
                        });
                        if (close) context.closePath();
                    };
                    const draw = item => {
                        if (item.type === 'GeometryCollection') {
                            item.geometries.forEach(draw);
                        } else if (item.type === 'Point' || item.type === 'MultiPoint') {
                            const coordinates = item.type === 'Point' ? [item.coordinates] : item.coordinates;
                            coordinates.forEach(point => {
                                const position = map.project([point[1], point[0]], zoom);
                                if (text) {
                                    context.font = '700 12px sans-serif';
                                    context.textAlign = 'center';
                                    context.textBaseline = 'middle';
                                    context.fillStyle = properties.color || '#1f2933';
                                    const textWidth = context.measureText(text).width;
                                    context.fillText(text, position.x + offset[0] + Math.sign(offset[0]) * textWidth / 2,
                                        position.y + offset[1] + Math.sign(offset[1]) * 6);
                                } else {
                                    context.beginPath();
                                    context.arc(position.x, position.y, 5, 0, Math.PI * 2);
                                    context.stroke();
                                    context.globalAlpha = 0.2;
                                    context.fill();
                                    context.globalAlpha = 1;
                                }
                            });
                        } else {
                            context.beginPath();
                            if (item.type === 'LineString') drawLine(item.coordinates, false);
                            else if (item.type === 'MultiLineString') item.coordinates.forEach(line => drawLine(line, false));
                            else if (item.type === 'Polygon') item.coordinates.forEach(ring => drawLine(ring, true));
                            else if (item.type === 'MultiPolygon') item.coordinates.forEach(polygon => polygon.forEach(ring => drawLine(ring, true)));
                            else throw new Error(`Geometria tática não suportada para o KMZ: ${item.type}.`);
                            if (item.type === 'Polygon' || item.type === 'MultiPolygon') {
                                context.globalAlpha = 0.2;
                                context.fill('evenodd');
                                context.globalAlpha = 1;
                            }
                            context.stroke();
                        }
                    };
                    draw(geometry);

                    const geographic = document.createElement('canvas');
                    geographic.width = w;
                    geographic.height = h;
                    const target = geographic.getContext('2d');
                    if (!target) throw new Error('O navegador não permite criar imagens dos gráficos táticos.');
                    for (let line = 0; line < h; line++) {
                        const latitude = northwest.lat + (southeast.lat - northwest.lat) * (line + 0.5) / h;
                        const sourceY = Math.max(0, Math.min(h - 1, Math.floor(map.project([latitude, 0], zoom).y - y)));
                        target.drawImage(source, 0, sourceY, w, 1, 0, line, w, 1);
                    }
                    const blob = await new Promise(resolve => geographic.toBlob(resolve, 'image/png'));
                    if (!blob) throw new Error('Não foi possível gerar uma imagem de gráfico tático.');
                    images.push({ blob, bounds: { north: northwest.lat, west: northwest.lng,
                        south: southeast.lat, east: southeast.lng } });
                }
            }
        }
        return images;
    }
});
