/**
 * @fileoverview Integra os gráficos táticos da biblioteca com as ferramentas nativas do Leaflet Draw.
 * @exports window.PlanMilT.tacticalGraphics
 * @requires Leaflet Draw, biblioteca @zaes/tactical-graphics, SweetAlert2 e grupo de desenhos.
 */
window.PlanMilT = window.PlanMilT || {};

window.PlanMilT.tacticalGraphics = Object.freeze({
    /**
     * Cria o controle Leaflet de simbologia militar, posicionado abaixo do desenho à mão livre.
     * @param {Object} dependencies - Dependências externas do controle.
     * @param {Object} dependencies.leaflet - Namespace Leaflet usado para criar o controle.
     * @returns {Object} Controle Leaflet; seu container é o botão que abre o seletor.
     */
    createControl({ leaflet }) {
        const TacticalGraphicControl = leaflet.Control.extend({
            options: { position: 'topleft' },
            /**
             * Cria o botão do controle; o título exibe "Simbologia militar" ao passar o mouse.
             * @returns {HTMLElement} Elemento do botão.
             */
            onAdd() {
                const container = leaflet.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-custom leaflet-control-tactical-graphic');
                container.innerHTML = '<i class="fas fa-shield-alt"></i>';
                container.title = 'Simbologia militar';
                container.setAttribute('role', 'button');
                container.setAttribute('aria-label', 'Simbologia militar');
                return container;
            }
        });

        return new TacticalGraphicControl();
    },

    /**
     * Cria um ícone de texto ancorado no centro com deslocamento lateral em pixels.
     * @param {Object} leaflet - Namespace Leaflet usado para criar o ícone.
     * @param {string} text - Texto do rótulo.
     * @param {number[]} offset - Deslocamento horizontal e vertical em pixels.
     * @param {string} color - Cor CSS aplicada ao texto.
     * @returns {Object} Ícone Leaflet para um rótulo de limite.
     */
    createBoundaryLabelIcon(leaflet, text, offset, color = '#1f2933') {
        const [offsetX, offsetY] = Array.isArray(offset) ? offset : [0, 0];
        const escapedText = String(text).replace(/[&<>"']/g, character => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        })[character]);
        return leaflet.divIcon({
            className: 'tactical-graphic-label',
            html: '<span style="display:block;position:absolute;left:0;top:0;transform:translate(-50%,-50%) translate('
                + offsetX + 'px,' + offsetY + 'px);color:' + color
                + ';font-size:12px;font-weight:700;white-space:nowrap;line-height:1;">' + escapedText + '</span>',
            iconSize: [0, 0],
            iconAnchor: [0, 0]
        });
    },

    /**
     * Conecta o seletor de gráficos táticos ao mapa e ao grupo de desenhos.
     * @param {Object} dependencies - Dependências externas do recurso.
     * @param {Object} dependencies.map - Instância Leaflet do mapa.
     * @param {Object} dependencies.leaflet - Namespace Leaflet com Leaflet Draw.
     * @param {Object} dependencies.library - API compilada de @zaes/tactical-graphics.
     * @param {Object} dependencies.catalog - Catálogo localizado de gráficos e categorias.
     * @param {Object} dependencies.drawnItems - Grupo Leaflet que recebe os resultados.
     * @param {HTMLElement} dependencies.button - Botão para selecionar um gráfico.
     * @param {Object} dependencies.sweetAlert - Interface SweetAlert2.
     * @param {Function} dependencies.getDefaultColor - Retorna a cor atual dos desenhos.
     */
    attach({ map, leaflet, library, catalog, drawnItems, button, sweetAlert, getDefaultColor }) {
        let pendingGraphic = null;
        let drawingVertices = [];
        let previewLayer = null;
        let previewErrorReported = false;

        /**
         * Remove a prévia temporária sem alterar o grupo de desenhos persistentes.
         */
        function removePreview() {
            if (previewLayer) {
                map.removeLayer(previewLayer);
                previewLayer = null;
            }
        }

        /**
         * Remove a prévia e reinicia o esboço ativo.
         */
        function clearPreview() {
            removePreview();
            drawingVertices = [];
        }

        /**
         * Exibe erros de desenho sem ocultar o motivo informado pela biblioteca.
         * @param {Error} error - Erro ocorrido ao preparar ou gerar o gráfico.
         */
        function showError(error) {
            console.error('[PlanMilT][Gráficos táticos] Falha ao gerar gráfico.', {
                message: error.message
            });
            sweetAlert.fire({
                title: 'Não foi possível gerar o gráfico',
                text: error.message,
                icon: 'error',
                confirmButtonText: 'OK'
            });
        }

        /**
         * Codifica texto antes de inseri-lo no HTML do ícone Leaflet.
         * @param {string} value - Texto fornecido pelo usuário.
         * @returns {string} Texto seguro para uso em HTML.
         */
        function escapeHtml(value) {
            return String(value).replace(/[&<>"']/g, character => ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;'
            })[character]);
        }

        /**
         * Percorre recursivamente as posições de uma geometria GeoJSON.
         * @param {Object} geometry - Geometria GeoJSON.
         * @param {number[][]} positions - Acumulador de posições [lon, lat].
         * @returns {number[][]} Posições encontradas.
         */
        function collectGeometryPositions(geometry, positions = []) {
            if (!geometry) return positions;
            if (geometry.type === 'GeometryCollection') {
                geometry.geometries.forEach(child => collectGeometryPositions(child, positions));
                return positions;
            }

            function visit(value) {
                if (typeof value[0] === 'number' && typeof value[1] === 'number') {
                    positions.push(value);
                    return;
                }
                value.forEach(visit);
            }

            visit(geometry.coordinates);
            return positions;
        }

        /**
         * Cria um exemplo do gráfico para exibição no seletor.
         * @param {string} name - Identificador do gráfico.
         * @returns {Object} Feature GeoJSON de exemplo.
         */
        function createSampleFeature(name, includeDesignation = true) {
            const geometryType = library.baseGeometryFor(name);
            const sampleGeometries = {
                Point: { type: 'Point', coordinates: [-50, -20] },
                LineString: {
                    type: 'LineString',
                    coordinates: [[-50, -20], [-49.995, -19.998], [-49.99, -20.002]]
                },
                Polygon: {
                    type: 'Polygon',
                    coordinates: [[
                        [-50, -20],
                        [-49.99, -20],
                        [-49.99, -20.01],
                        [-50, -20.01],
                        [-50, -20]
                    ]]
                }
            };
            const geometry = sampleGeometries[geometryType];
            if (!geometry) {
                throw new Error(`Geometria de exemplo não suportada: ${geometryType || 'indefinida'}.`);
            }

            return {
                type: 'Feature',
                geometry,
                properties: {
                    tacticalGraphic: {
                        name,
                        ...(includeDesignation ? { designation: 'Exemplo' } : {}),
                        ...(geometryType === 'Point' ? { radius: 500 } : {})
                    }
                }
            };
        }

        /**
         * Desenha geometria GeoJSON em coordenadas SVG ajustadas ao quadro da prévia.
         * @param {Object} geometry - Geometria GeoJSON renderizada.
         * @param {Function} project - Projeta [lon, lat] para [x, y] no SVG.
         * @param {SVGElement} svg - SVG que recebe o desenho.
         */
        function appendPreviewGeometry(geometry, project, svg) {
            if (!geometry) return;
            const svgNamespace = 'http://www.w3.org/2000/svg';
            const appendPath = (coordinates, closePath) => {
                if (!coordinates.length) return;
                const path = document.createElementNS(svgNamespace, 'path');
                const points = coordinates.map(project);
                const pathData = points.map(([x, y], index) =>
                    `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`
                ).join(' ');
                path.setAttribute('d', `${pathData}${closePath ? ' Z' : ''}`);
                path.setAttribute('fill', closePath ? 'rgba(53, 79, 121, 0.10)' : 'none');
                path.setAttribute('fill-rule', 'evenodd');
                path.setAttribute('stroke', '#354f79');
                path.setAttribute('stroke-width', '3');
                path.setAttribute('stroke-linecap', 'round');
                path.setAttribute('stroke-linejoin', 'round');
                svg.appendChild(path);
            };

            switch (geometry.type) {
                case 'Point': {
                    const [x, y] = project(geometry.coordinates);
                    const marker = document.createElementNS(svgNamespace, 'circle');
                    marker.setAttribute('cx', x);
                    marker.setAttribute('cy', y);
                    marker.setAttribute('r', '6');
                    marker.setAttribute('fill', '#354f79');
                    svg.appendChild(marker);
                    break;
                }
                case 'MultiPoint':
                    geometry.coordinates.forEach(point => appendPreviewGeometry({ type: 'Point', coordinates: point }, project, svg));
                    break;
                case 'LineString':
                case 'LinearRing':
                    appendPath(geometry.coordinates, geometry.type === 'LinearRing');
                    break;
                case 'MultiLineString':
                    geometry.coordinates.forEach(line => appendPath(line, false));
                    break;
                case 'Polygon':
                    geometry.coordinates.forEach(ring => appendPath(ring, true));
                    break;
                case 'MultiPolygon':
                    geometry.coordinates.forEach(polygon => polygon.forEach(ring => appendPath(ring, true)));
                    break;
                case 'GeometryCollection':
                    geometry.geometries.forEach(child => appendPreviewGeometry(child, project, svg));
                    break;
                default:
                    throw new Error(`Geometria de prévia não suportada: ${geometry.type}.`);
            }
        }

        /**
         * Renderiza o símbolo em SVG para a lista do seletor.
         * @param {string} name - Identificador do gráfico.
         * @param {HTMLElement} preview - Contêiner da prévia.
         * @param {boolean} includeDesignation - Inclui o rótulo ilustrativo no desenho.
         */
        function renderGraphicExample(name, preview, includeDesignation = true) {
            const svgNamespace = 'http://www.w3.org/2000/svg';
            const svg = document.createElementNS(svgNamespace, 'svg');
            svg.setAttribute('viewBox', '0 0 360 220');
            svg.setAttribute('role', 'img');
            svg.setAttribute(
                'aria-label',
                `${includeDesignation ? 'Exemplo' : 'Símbolo'}: ${catalog.translateName(library.getDisplayName(name), name)}`
            );

            try {
                const rendered = library.renderTacticalGraphic(createSampleFeature(name, includeDesignation));
                const positions = collectGeometryPositions(rendered.graphic.geometry);
                const labelPositions = collectPointCoordinates(rendered.labels.geometry);
                positions.push(...labelPositions);
                if (!positions.length) throw new Error('O gráfico não contém posições para a prévia.');
                const bounds = positions.reduce((result, [x, y]) => ({
                    minX: Math.min(result.minX, x),
                    maxX: Math.max(result.maxX, x),
                    minY: Math.min(result.minY, y),
                    maxY: Math.max(result.maxY, y)
                }), {
                    minX: Infinity,
                    maxX: -Infinity,
                    minY: Infinity,
                    maxY: -Infinity
                });
                const width = bounds.maxX - bounds.minX || 1;
                const height = bounds.maxY - bounds.minY || 1;
                const scale = Math.min(300 / width, 160 / height);
                const project = ([x, y]) => [
                    180 + (x - (bounds.minX + bounds.maxX) / 2) * scale,
                    105 - (y - (bounds.minY + bounds.maxY) / 2) * scale
                ];

                appendPreviewGeometry(rendered.graphic.geometry, project, svg);
                const labelPosition = labelPositions[0];
                if (includeDesignation && labelPosition) {
                    const [x, y] = project(labelPosition);
                    const label = document.createElementNS(svgNamespace, 'text');
                    label.setAttribute('x', x);
                    label.setAttribute('y', y - 10);
                    label.setAttribute('text-anchor', 'middle');
                    label.setAttribute('class', 'tactical-graphic-example-label');
                    label.textContent = 'Exemplo';
                    svg.appendChild(label);
                }

                preview.replaceChildren(svg);
            } catch (error) {
                console.error('[PlanMilT][Gráficos táticos] Falha ao criar exemplo do gráfico.', {
                    graphicName: name,
                    message: error.message
                });
                preview.textContent = 'Não foi possível exibir o exemplo deste gráfico.';
            }
        }

        /**
         * Atualiza a simbologia provisória a partir dos vértices e da posição do cursor.
         * @param {Object} event - Evento de movimento do mouse do Leaflet.
         * @param {boolean} includeCursor - Inclui o vértice flutuante do cursor no esboço.
         */
        function updatePreview(event, includeCursor = true) {
            if (!pendingGraphic || !event.latlng) return;

            const cursor = [event.latlng.lng, event.latlng.lat];
            let geometry;

            if (pendingGraphic.geometryType === 'Point') {
                geometry = { type: 'Point', coordinates: cursor };
            } else if (pendingGraphic.geometryType === 'LineString') {
                const coordinates = [...drawingVertices];
                const lastVertex = coordinates[coordinates.length - 1];
                if (includeCursor && lastVertex && (lastVertex[0] !== cursor[0] || lastVertex[1] !== cursor[1])) {
                    coordinates.push(cursor);
                }
                if (coordinates.length < 2) {
                    removePreview();
                    return;
                }
                geometry = { type: 'LineString', coordinates };
            } else {
                const coordinates = [...drawingVertices];
                const lastVertex = coordinates[coordinates.length - 1];
                if (includeCursor && lastVertex && (lastVertex[0] !== cursor[0] || lastVertex[1] !== cursor[1])) {
                    coordinates.push(cursor);
                }
                if (coordinates.length < 3) {
                    removePreview();
                    return;
                }
                const area = coordinates.reduce((sum, point, index) => {
                    const next = coordinates[(index + 1) % coordinates.length];
                    return sum + point[0] * next[1] - next[0] * point[1];
                }, 0);
                if (area === 0) {
                    removePreview();
                    return;
                }
                geometry = {
                    type: 'Polygon',
                    coordinates: [[...coordinates, coordinates[0]]]
                };
            }

            const boundaryData = normalizeBoundaryData(pendingGraphic.boundary);
            const baseFeature = {
                type: 'Feature',
                geometry,
                properties: {
                    tacticalGraphic: {
                        name: pendingGraphic.name,
                        ...(pendingGraphic.designation ? { designation: pendingGraphic.designation } : {}),
                        ...(pendingGraphic.geometryType === 'Point' ? { radius: 500 } : {}),
                        ...(boundaryData ? { boundary: boundaryData } : {})
                    }
                }
            };

            try {
                const rendered = library.renderTacticalGraphic(baseFeature);
                const graphicFeature = {
                    ...rendered.graphic,
                    properties: {
                        ...rendered.graphic.properties,
                        name: pendingGraphic.designation || pendingGraphic.displayName,
                        color: pendingGraphic.color,
                        fillColor: pendingGraphic.color
                    }
                };
                const features = [graphicFeature];

                if (pendingGraphic.designation) {
                    features.push({
                        ...rendered.labels,
                        properties: {
                            ...rendered.labels.properties,
                            name: pendingGraphic.designation,
                            text: pendingGraphic.designation,
                            color: pendingGraphic.color,
                            role: 'label'
                        }
                    });
                }

                if (boundaryData) {
                    const boundaryPlacement = getBoundaryPlacement(rendered.graphic.geometry || geometry);
                    features.push(...createBoundaryMarkFeatures(rendered.graphic.geometry || geometry, boundaryData, pendingGraphic.color));
                    const boundaryLabels = [
                        { text: boundaryData.leftText, offset: boundaryPlacement?.leftOffset },
                        { text: boundaryData.rightText, offset: boundaryPlacement?.rightOffset }
                    ];
                    boundaryLabels.forEach(({ text, offset }) => {
                        if (!boundaryPlacement || !text || !offset) return;
                        features.push({
                            type: 'Feature',
                            properties: {
                                tacticalGraphic: {
                                    ...(rendered.labels.properties?.tacticalGraphic || {}),
                                    boundary: boundaryData,
                                    designation: text
                                },
                                name: text,
                                text,
                                color: pendingGraphic.color,
                                role: 'boundaryLabel',
                                boundaryOffset: offset
                            },
                            geometry: {
                                type: 'Point',
                                coordinates: boundaryPlacement.coordinates
                            }
                        });
                    });
                }

                if (previewLayer) map.removeLayer(previewLayer);
                previewLayer = leaflet.geoJSON({
                    type: 'FeatureCollection',
                    features
                }, {
                    style: feature => ({
                        color: feature.properties.color,
                        fillColor: feature.properties.fillColor,
                        fillOpacity: 0.2,
                        weight: 3
                    }),
                    pointToLayer: (feature, latlng) => {
                        if (feature.properties.role === 'boundaryLabel') {
                            return createBoundaryLabelMarker(latlng, feature.properties.text, feature.properties.boundaryOffset, feature.properties.color || '#1a1a1a');
                        }
                        if (feature.properties.role === 'label') {
                            return createBoundaryLabelMarker(latlng, feature.properties.text, [0, 8], feature.properties.color || '#1a1a1a');
                        }
                        if (feature.properties.role === 'boundaryMark') {
                            return createBoundaryLabelMarker(latlng, feature.properties.text, [0, 0], feature.properties.color || '#1a1a1a');
                        }
                        return leaflet.circleMarker(latlng, {
                            color: feature.properties.color,
                            fillColor: feature.properties.fillColor,
                            fillOpacity: 0.2,
                            radius: 5
                        });
                    }
                });
                map.addLayer(previewLayer);
            } catch (error) {
                removePreview();
                if (!previewErrorReported) {
                    previewErrorReported = true;
                    console.error('[PlanMilT][Gráficos táticos] Falha ao atualizar a prévia.', {
                        graphicName: pendingGraphic.name,
                        message: error.message
                    });
                }
            }
        }

        // Estilos embutidos, como no catálogo de camadas, para não depender de CSS externo em cache.
        const PICKER_STYLES = `
            .swal2-popup.tactical-graphic-modal{width:min(820px,calc(100vw - 28px))!important;max-width:calc(100vw - 28px)!important;padding:20px!important;font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif}
            .tactical-graphic-modal .swal2-title{font-family:inherit;font-size:22px;font-weight:600;color:#243b5a;padding:0 0 10px;margin:0;text-align:center}
            .tactical-graphic-modal .swal2-html-container{margin:0;padding:0 2px;overflow-x:hidden}
            #tacticalGraphicPicker{display:grid;gap:12px;text-align:left;width:100%;font-size:14px;font-family:inherit}
            #tacticalGraphicPicker .tactical-graphic-browser{display:grid;gap:12px;min-width:0}
            #tacticalGraphicPicker .tactical-graphic-field{display:grid;gap:5px;min-width:0;margin:0}
            #tacticalGraphicPicker .tactical-graphic-field>span{display:block;margin:0;font-size:13px;font-weight:600;color:#36404f;text-align:left}
            #tacticalGraphicPicker .tactical-graphic-field>input,#tacticalGraphicPicker .tactical-graphic-field>select{display:block;width:100%;height:40px;margin:0;padding:6px 10px;border:1px solid #c5cad2;border-radius:6px;box-sizing:border-box;font:inherit;background:#fff;color:#242a33}
            #tacticalGraphicPicker .tactical-graphic-results{display:block;height:min(45vh,380px);overflow-y:auto;overflow-x:hidden;border:1px solid #d3d8e0;border-radius:6px;background:#fff}
            #tacticalGraphicPicker .tactical-graphic-section-title{margin:0;padding:8px 12px;border-bottom:1px solid #e1e5eb;background:#f4f6f9;color:#596273;font-family:inherit;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.035em;text-align:left;position:sticky;top:0;z-index:1}
            #tacticalGraphicPicker .tactical-graphic-result{display:flex;align-items:center;gap:12px;padding:10px 12px;margin:0;border-bottom:1px solid #e1e5eb;cursor:pointer;text-align:left;background:#fff}
            #tacticalGraphicPicker .tactical-graphic-result:last-child{border-bottom:0}
            #tacticalGraphicPicker .tactical-graphic-result:hover{background:#f3f6fa}
            #tacticalGraphicPicker .tactical-graphic-result.is-selected{background:#e6edf7;box-shadow:inset 3px 0 0 #435f88}
            #tacticalGraphicPicker .tactical-graphic-result>input{flex:none;width:17px;height:17px;margin:0;accent-color:#435f88}
            #tacticalGraphicPicker .tactical-graphic-result-content{display:flex;align-items:center;justify-content:space-between;gap:12px;min-width:0;flex:1}
            #tacticalGraphicPicker .tactical-graphic-result-title{font-size:14px;font-weight:600;line-height:1.35;color:#242a33;overflow-wrap:anywhere;min-width:0}
            #tacticalGraphicPicker .tactical-graphic-result-preview{flex:none;display:flex;align-items:center;justify-content:center;width:64px;height:40px;border:1px solid #e1e5eb;border-radius:4px;background:#fff;overflow:hidden}
            #tacticalGraphicPicker .tactical-graphic-result-preview svg{display:block;width:60px;height:36px;overflow:hidden}
            #tacticalGraphicPicker .tactical-graphic-empty{padding:24px;text-align:center;color:#596273}
            #tacticalGraphicPicker .tactical-graphic-selection{padding:8px 10px;border-radius:6px;background:#eef1f5;color:#36404f;font-size:13px;font-weight:600}
            #tacticalGraphicPicker             #tacticalGraphicPicker .tactical-graphic-designation{margin-top:-6px}
            #tacticalGraphicPicker .tactical-graphic-boundary-edit{display:grid;gap:8px;padding:10px 0 6px}
            #tacticalGraphicPicker .tactical-graphic-boundary-edit .tactical-graphic-boundary-row{display:grid;grid-template-columns:1fr 1fr;gap:8px}
            #tacticalGraphicPicker .tactical-graphic-boundary-edit .tactical-graphic-boundary-row>label{display:grid;gap:5px;min-width:0}
        `;

        const BOUNDARY_ECHELONS = ['Pelotão', 'Companhia', 'Batalhão', 'Regimento', 'Brigada', 'Divisão', 'Exército'];

        function getBoundaryPattern(type) {
            const boundaryType = BOUNDARY_ECHELONS.includes(type) ? type : 'Companhia';
            const patterns = {
                Pelotão: '●●●',
                Companhia: 'I',
                Batalhão: 'II',
                Regimento: 'III',
                Brigada: 'X',
                Divisão: 'XX',
                Exército: 'XXX'
            };
            return patterns[boundaryType] || 'I';
        }

        function normalizeBoundaryData(boundary) {
            if (!boundary || typeof boundary !== 'object') return null;
            const type = BOUNDARY_ECHELONS.includes(boundary.type) ? boundary.type : (boundary.type || 'Companhia');
            const leftText = String(boundary.leftText || '').trim();
            const rightText = String(boundary.rightText || '').trim();
            if (!leftText && !rightText) return null;
            return { type, leftText, rightText };
        }

        function flattenBoundaryLine(geometry) {
            if (!geometry) return [];
            if (geometry.type === 'LineString') return geometry.coordinates;
            if (geometry.type === 'MultiLineString') return geometry.coordinates.flat();
            if (geometry.type === 'GeometryCollection') {
                return geometry.geometries.flatMap(item => flattenBoundaryLine(item));
            }
            return [];
        }

        function getPointAlongLine(points, targetDistance) {
            if (points.length < 2) return null;
            let distanceTravelled = 0;
            for (let index = 0; index < points.length - 1; index += 1) {
                const start = points[index];
                const end = points[index + 1];
                const segmentLength = Math.hypot(end[0] - start[0], end[1] - start[1]);
                const nextDistance = distanceTravelled + segmentLength;
                if (targetDistance <= nextDistance || index === points.length - 2) {
                    if (segmentLength === 0) return [...start];
                    const ratio = segmentLength === 0 ? 0 : (targetDistance - distanceTravelled) / segmentLength;
                    return [
                        start[0] + (end[0] - start[0]) * ratio,
                        start[1] + (end[1] - start[1]) * ratio
                    ];
                }
                distanceTravelled = nextDistance;
            }
            return null;
        }

        /**
         * Calcula o ponto central do limite e os deslocamentos laterais no plano do mapa.
         * @param {Object} geometry - Geometria linear GeoJSON do limite.
         * @returns {Object|null} Ponto central e deslocamentos em pixels para os dois lados.
         */
        function getBoundaryPlacement(geometry) {
            const points = flattenBoundaryLine(geometry);
            if (points.length < 2) return null;

            const segments = points.slice(1).map((end, index) => {
                const start = points[index];
                return {
                    start,
                    end,
                    length: Math.hypot(end[0] - start[0], end[1] - start[1])
                };
            });
            const totalDistance = segments.reduce((sum, segment) => sum + segment.length, 0);
            if (!totalDistance) return null;

            const midpointDistance = totalDistance / 2;
            let distanceTravelled = 0;
            const midpointSegment = segments.find((segment, index) => {
                const containsMidpoint = midpointDistance <= distanceTravelled + segment.length
                    || index === segments.length - 1;
                distanceTravelled += segment.length;
                return containsMidpoint && segment.length > 0;
            });
            if (!midpointSegment) return null;

            const coordinates = getPointAlongLine(points, midpointDistance);
            if (!coordinates) return null;

            const latitudeRadians = ((midpointSegment.start[1] + midpointSegment.end[1]) / 2) * Math.PI / 180;
            const tangentX = midpointSegment.end[0] - midpointSegment.start[0];
            const tangentY = -(midpointSegment.end[1] - midpointSegment.start[1]) / Math.cos(latitudeRadians);
            const tangentLength = Math.hypot(tangentX, tangentY);
            if (!tangentLength) return null;

            const offset = 14;
            const leftOffset = [tangentY / tangentLength * offset, -tangentX / tangentLength * offset];
            return {
                coordinates,
                leftOffset,
                rightOffset: [-leftOffset[0], -leftOffset[1]]
            };
        }

        function createBoundaryMarkFeatures(geometry, boundaryData, color) {
            if (!geometry || !boundaryData) return [];
            const placement = getBoundaryPlacement(geometry);
            if (!placement) return [];
            const text = getBoundaryPattern(boundaryData.type);
            return [{
                type: 'Feature',
                properties: {
                    tacticalGraphic: { boundary: boundaryData, designation: text },
                    name: text,
                    text,
                    color,
                    role: 'boundaryMark'
                },
                geometry: {
                    type: 'Point',
                    coordinates: placement.coordinates
                }
            }];
        }

        function createBoundaryLabelMarker(latlng, text, offset, color = '#1a1a1a') {
            return leaflet.marker(latlng, {
                icon: window.PlanMilT.tacticalGraphics.createBoundaryLabelIcon(leaflet, text, offset, color)
            });
        }

        /**
         * Exibe os seletores e inicia a ferramenta Leaflet adequada ao gráfico.
         */
        async function startDrawing() {
            const sections = catalog.buildSections(library);
            const categorizedSections = sections.slice(1);
            const commonSection = sections[0];
            let selectedName = commonSection.graphics[0]?.name || categorizedSections[0]?.graphics[0]?.name || '';
            let categorySelect;
            let searchInput;
            let resultsContainer;
            let selectionStatus;
            let designationInput;
            let boundaryTypeInput;
            let boundaryLeftInput;
            let boundaryRightInput;

            const selection = await sweetAlert.fire({
                title: 'Adicionar gráfico tático',
                html: '<style>' + PICKER_STYLES + '</style>'
                    + '<div id="tacticalGraphicPicker" class="tactical-graphic-picker">'
                    + '<div class="tactical-graphic-browser">'
                    + '<div class="tactical-graphic-filters tactical-graphic-category-filter">'
                    + '<label class="tactical-graphic-field" for="tacticalGraphicCategory"><span>Categoria</span>'
                    + '<select id="tacticalGraphicCategory"><option value="all">Todas as categorias</option></select></label>'
                    + '</div>'
                    + '<label class="tactical-graphic-field tactical-graphic-search" for="tacticalGraphicSearch"><span>Buscar gráficos</span>'
                    + '<input id="tacticalGraphicSearch" type="search" autocomplete="off" placeholder="Nome do gráfico"></label>'
                    + '<div id="tacticalGraphicResults" class="tactical-graphic-results" role="radiogroup" aria-label="Gráficos táticos"></div>'
                    + '<div id="tacticalGraphicSelection" class="tactical-graphic-selection" role="status"></div>'
                    + '<label class="tactical-graphic-field tactical-graphic-designation" for="tacticalGraphicDesignation"><span>Designação (opcional)</span>'
                    + '<input id="tacticalGraphicDesignation" type="text" autocomplete="off" placeholder="Ex.: 1ª Cia"></label>'
                    + '<div id="tacticalGraphicBoundaryEditor" class="tactical-graphic-boundary-edit" style="display:none">'
                    + '<label class="tactical-graphic-field" for="tacticalGraphicBoundaryType"><span>Tipo de limite</span>'
                    + '<select id="tacticalGraphicBoundaryType">' + BOUNDARY_ECHELONS.map(type => `<option value="${type}">${type}</option>`).join('') + '</select></label>'
                    + '<div class="tactical-graphic-boundary-row">'
                    + '<label class="tactical-graphic-field" for="tacticalGraphicBoundaryLeft"><span>Nome à esquerda</span><input id="tacticalGraphicBoundaryLeft" type="text" autocomplete="off" placeholder="Ex.: 1ª Cia"></label>'
                    + '<label class="tactical-graphic-field" for="tacticalGraphicBoundaryRight"><span>Nome à direita</span><input id="tacticalGraphicBoundaryRight" type="text" autocomplete="off" placeholder="Ex.: 2ª Cia"></label>'
                    + '</div>'
                    + '</div>'
                    + '</div>'
                    + '</div>',
                showCancelButton: true,
                confirmButtonText: 'Continuar',
                cancelButtonText: 'Cancelar',
                customClass: { popup: 'tactical-graphic-modal' },
                didOpen: () => {
                    const popup = sweetAlert.getPopup();
                    categorySelect = popup.querySelector('#tacticalGraphicCategory');
                    searchInput = popup.querySelector('#tacticalGraphicSearch');
                    resultsContainer = popup.querySelector('#tacticalGraphicResults');
                    selectionStatus = popup.querySelector('#tacticalGraphicSelection');
                    designationInput = popup.querySelector('#tacticalGraphicDesignation');
                    boundaryTypeInput = popup.querySelector('#tacticalGraphicBoundaryType');
                    boundaryLeftInput = popup.querySelector('#tacticalGraphicBoundaryLeft');
                    boundaryRightInput = popup.querySelector('#tacticalGraphicBoundaryRight');
                    popup.classList.add('tactical-graphic-modal');

                    const commonOption = document.createElement('option');
                    commonOption.value = commonSection.name;
                    commonOption.textContent = commonSection.label;
                    categorySelect.appendChild(commonOption);
                    categorizedSections.forEach(section => {
                        const option = document.createElement('option');
                        option.value = section.name;
                        option.textContent = section.label;
                        categorySelect.appendChild(option);
                    });

                    const normalizeSearch = value => value.normalize('NFD')
                        .replace(/[\u0300-\u036f]/g, '')
                        .toLocaleLowerCase('pt-BR');
                    const commonGraphicNames = new Set(commonSection.graphics.map(graphic => graphic.name));
                    const renderBoundaryFields = () => {
                        const editor = popup.querySelector('#tacticalGraphicBoundaryEditor');
                        if (!editor || !editor.style) return;
                        const isBoundary = selectedName === 'Boundary';
                        editor.style.display = isBoundary ? 'grid' : 'none';
                        if (isBoundary && boundaryTypeInput && !boundaryTypeInput.value) boundaryTypeInput.value = 'Companhia';
                    };
                    const renderResults = () => {
                        const query = normalizeSearch(searchInput.value.trim());
                        const showAllCategories = categorySelect.value === 'all';
                        const visibleSections = showAllCategories
                            ? sections
                            : sections.filter(section => section.name === categorySelect.value);
                        resultsContainer.replaceChildren();
                        let resultCount = 0;

                        visibleSections.forEach(section => {
                            const graphics = section.graphics.filter(graphic =>
                                normalizeSearch(graphic.label).includes(query)
                                && (!showAllCategories || section === commonSection || !commonGraphicNames.has(graphic.name))
                            );
                            if (!graphics.length) return;

                            const heading = document.createElement('h4');
                            heading.className = 'tactical-graphic-section-title';
                            heading.textContent = section.label;
                            resultsContainer.appendChild(heading);

                            graphics.forEach(graphic => {
                                const option = document.createElement('label');
                                option.className = 'tactical-graphic-result';
                                const radio = document.createElement('input');
                                radio.type = 'radio';
                                radio.name = 'tacticalGraphicSelection';
                                radio.value = graphic.name;
                                radio.checked = graphic.name === selectedName;
                                radio.setAttribute('aria-label', graphic.label);
                                if (graphic.name === selectedName) option.classList.add('is-selected');
                                const content = document.createElement('span');
                                content.className = 'tactical-graphic-result-content';
                                const label = document.createElement('span');
                                label.className = 'tactical-graphic-result-title';
                                label.textContent = graphic.label;
                                const thumbnail = document.createElement('span');
                                thumbnail.className = 'tactical-graphic-result-preview';
                                thumbnail.setAttribute('aria-hidden', 'true');
                                renderGraphicExample(graphic.name, thumbnail, false);
                                option.appendChild(radio);
                                option.appendChild(content);
                                content.appendChild(label);
                                content.appendChild(thumbnail);
                                radio.addEventListener('change', () => {
                                    if (!radio.checked) return;
                                    selectedName = graphic.name;
                                    selectionStatus.textContent = `Selecionado: ${graphic.label}`;
                                    renderBoundaryFields();
                                    Array.from(resultsContainer.children)
                                        .filter(result => result.classList.contains('tactical-graphic-result'))
                                        .forEach(result => {
                                            const resultRadio = result.children[0];
                                            const isSelected = resultRadio.value === selectedName;
                                            resultRadio.checked = isSelected;
                                            result.className = isSelected
                                                ? 'tactical-graphic-result is-selected'
                                                : 'tactical-graphic-result';
                                        });
                                });
                                resultsContainer.appendChild(option);
                                resultCount++;
                            });
                        });

                        if (!resultCount) {
                            const empty = document.createElement('div');
                            empty.className = 'tactical-graphic-empty';
                            empty.textContent = 'Nenhum gráfico encontrado.';
                            resultsContainer.appendChild(empty);
                        }
                    };

                    const initialGraphic = [...commonSection.graphics, ...categorizedSections.flatMap(section => section.graphics)]
                        .find(graphic => graphic.name === selectedName);
                    selectionStatus.textContent = initialGraphic
                        ? `Selecionado: ${initialGraphic.label}`
                        : 'Selecione um gráfico';
                    categorySelect.value = 'all';
                    categorySelect.addEventListener('change', renderResults);
                    searchInput.addEventListener('input', renderResults);
                    renderBoundaryFields();
                    renderResults();
                },
                preConfirm: () => {
                    if (!selectedName) {
                        sweetAlert.showValidationMessage('Selecione um gráfico tático.');
                        return false;
                    }
                    const boundary = selectedName === 'Boundary'
                        ? normalizeBoundaryData({
                            type: boundaryTypeInput?.value || 'Companhia',
                            leftText: boundaryLeftInput?.value,
                            rightText: boundaryRightInput?.value
                        })
                        : null;
                    if (selectedName === 'Boundary' && (!boundary || !boundary.leftText || !boundary.rightText)) {
                        sweetAlert.showValidationMessage('Preencha os nomes dos dois lados do limite.');
                        return false;
                    }
                    return {
                        name: selectedName,
                        designation: designationInput.value.trim(),
                        boundary
                    };
                }
            });

            if (!selection.isConfirmed || !selection.value) return;

            const { name, designation, boundary } = selection.value;
            const geometryType = library.baseGeometryFor(name);
            const drawToolByGeometry = {
                Point: leaflet.Draw.Marker,
                LineString: leaflet.Draw.Polyline,
                Polygon: leaflet.Draw.Polygon
            };
            const DrawTool = drawToolByGeometry[geometryType];

            if (!DrawTool) {
                throw new Error(`Geometria de desenho não suportada: ${geometryType || 'indefinida'}.`);
            }

            const displayName = catalog.translateName(library.getDisplayName(name), name);
            const color = getDefaultColor();
            const options = geometryType === 'Polygon' || geometryType === 'LineString'
                ? { shapeOptions: { color } }
                : {};

            pendingGraphic = {
                name,
                displayName,
                geometryType,
                designation,
                boundary,
                color
            };
            drawingVertices = [];
            previewErrorReported = false;

            try {
                new DrawTool(map, options).enable();
            } catch (error) {
                pendingGraphic = null;
                throw error;
            }
        }

        /**
         * Converte as ancoragens do GeoJSON para coordenadas [lon, lat].
         * @param {Object} geometry - Geometria GeoJSON.
         * @param {number[][]} coordinates - Acumulador de coordenadas.
         * @returns {number[][]} Coordenadas encontradas.
         */
        function collectPointCoordinates(geometry, coordinates = []) {
            if (!geometry) return coordinates;

            if (geometry.type === 'Point') {
                coordinates.push(geometry.coordinates);
            } else if (geometry.type === 'MultiPoint') {
                coordinates.push(...geometry.coordinates);
            } else if (geometry.type === 'GeometryCollection') {
                geometry.geometries.forEach(child => collectPointCoordinates(child, coordinates));
            }

            return coordinates;
        }

        /**
         * Adiciona recursivamente as camadas do GeoJSON ao grupo de edição.
         * @param {Object} layer - Camada Leaflet criada por L.geoJSON.
         */
        function addLeafletLayers(layer) {
            if (typeof layer.eachLayer === 'function') {
                layer.eachLayer(addLeafletLayers);
                return;
            }

            if (layer && typeof layer.on === 'function' && layer.feature && layer.feature.properties && layer.feature.properties.tacticalGraphic) {
                layer.on('click', event => {
                    const target = event.target || layer;
                    if (target && target.feature && target.feature.properties && target.feature.properties.tacticalGraphic) {
                        editGraphic(target.feature);
                    }
                });
            }

            drawnItems.addLayer(layer);
        }

        async function editGraphic(feature) {
            if (!feature || !feature.properties || !feature.properties.tacticalGraphic) return false;
            const tacticalGraphic = feature.properties.tacticalGraphic;
            const existingBoundary = normalizeBoundaryData(tacticalGraphic.boundary);
            const currentDesignation = tacticalGraphic.designation || '';
            const editor = await sweetAlert.fire({
                title: tacticalGraphic.name === 'Boundary' ? 'Editar limite' : 'Editar gráfico tático',
                html: '<style>' + PICKER_STYLES + '</style>'
                    + '<div id="tacticalGraphicPicker" class="tactical-graphic-picker">'
                    + '<div class="tactical-graphic-browser">'
                    + (tacticalGraphic.name === 'Boundary'
                        ? '<div id="tacticalGraphicBoundaryEditor" class="tactical-graphic-boundary-edit">'
                            + '<label class="tactical-graphic-field" for="tacticalGraphicBoundaryType"><span>Tipo de limite</span>'
                            + '<select id="tacticalGraphicBoundaryType">' + BOUNDARY_ECHELONS.map(type => `<option value="${type}" ${existingBoundary?.type === type ? 'selected' : ''}>${type}</option>`).join('') + '</select></label>'
                            + '<div class="tactical-graphic-boundary-row">'
                            + '<label class="tactical-graphic-field" for="tacticalGraphicBoundaryLeft"><span>Nome à esquerda</span><input id="tacticalGraphicBoundaryLeft" type="text" autocomplete="off" value="' + escapeHtml(existingBoundary?.leftText || '') + '" placeholder="Ex.: 1ª Cia"></label>'
                            + '<label class="tactical-graphic-field" for="tacticalGraphicBoundaryRight"><span>Nome à direita</span><input id="tacticalGraphicBoundaryRight" type="text" autocomplete="off" value="' + escapeHtml(existingBoundary?.rightText || '') + '" placeholder="Ex.: 2ª Cia"></label>'
                            + '</div>'
                            + '</div>'
                        : '')
                    + '<label class="tactical-graphic-field tactical-graphic-designation" for="tacticalGraphicDesignation"><span>Designação (opcional)</span>'
                    + '<input id="tacticalGraphicDesignation" type="text" autocomplete="off" value="' + escapeHtml(currentDesignation) + '" placeholder="Ex.: 1ª Cia"></label>'
                    + '</div>'
                    + '</div>',
                showCancelButton: true,
                confirmButtonText: 'Salvar',
                cancelButtonText: 'Cancelar',
                customClass: { popup: 'tactical-graphic-modal' },
                preConfirm: () => {
                    const popup = sweetAlert.getPopup ? sweetAlert.getPopup() : document;
                    const nextDesignation = popup.querySelector('#tacticalGraphicDesignation')?.value.trim() || '';
                    const nextBoundary = tacticalGraphic.name === 'Boundary'
                        ? normalizeBoundaryData({
                            type: popup.querySelector('#tacticalGraphicBoundaryType')?.value || 'Companhia',
                            leftText: popup.querySelector('#tacticalGraphicBoundaryLeft')?.value,
                            rightText: popup.querySelector('#tacticalGraphicBoundaryRight')?.value
                        })
                        : null;
                    if (tacticalGraphic.name === 'Boundary' && (!nextBoundary || !nextBoundary.leftText || !nextBoundary.rightText)) {
                        sweetAlert.showValidationMessage('Preencha os nomes dos dois lados do limite.');
                        return false;
                    }
                    return {
                        designation: nextDesignation,
                        boundary: nextBoundary
                    };
                }
            });

            if (!editor.isConfirmed || editor.value === undefined || editor.value === null) return false;
            const nextValue = typeof editor.value === 'object' && editor.value !== null
                ? editor.value
                : { designation: String(editor.value || '').trim() || '', boundary: tacticalGraphic.boundary || null };
            const designation = nextValue.designation ?? '';
            const boundary = nextValue.boundary ?? null;
            feature.properties.tacticalGraphic = {
                ...tacticalGraphic,
                ...(designation ? { designation } : { designation: undefined }),
                ...((boundary || tacticalGraphic.boundary) ? { boundary: boundary || tacticalGraphic.boundary } : {})
            };
            if (tacticalGraphic.name === 'Boundary' && (boundary || tacticalGraphic.boundary)) {
                const nextBoundary = normalizeBoundaryData(boundary || tacticalGraphic.boundary);
                if (nextBoundary) {
                    feature.properties.name = `${nextBoundary.leftText} / ${nextBoundary.rightText}`;
                }
            } else if (designation) {
                feature.properties.name = designation;
            }
            return true;
        }

        /**
         * Consome draw:created quando um gráfico tático está em desenho.
         * @param {Object} event - Evento criado pelo Leaflet Draw.
         * @returns {boolean} True quando o evento foi consumido por este módulo.
         */
        function handleCreated(event) {
            if (!pendingGraphic) return false;

            const graphic = pendingGraphic;
            pendingGraphic = null;

            try {
                const boundaryData = normalizeBoundaryData(graphic.boundary);
                const baseFeature = event.layer.toGeoJSON();
                baseFeature.properties = {
                    ...(baseFeature.properties || {}),
                    name: graphic.designation || graphic.displayName,
                    color: graphic.color,
                    tacticalGraphic: {
                        name: graphic.name,
                        ...(graphic.designation ? { designation: graphic.designation } : {}),
                        ...(graphic.geometryType === 'Point' ? { radius: 500 } : {}),
                        ...(boundaryData ? { boundary: boundaryData } : {})
                    }
                };

                const rendered = library.renderTacticalGraphic(baseFeature);
                const graphicFeature = {
                    ...rendered.graphic,
                    properties: {
                        ...rendered.graphic.properties,
                        name: graphic.designation || graphic.displayName,
                        color: graphic.color,
                        fillColor: graphic.color
                    }
                };
                const boundaryMarkFeatures = boundaryData ? createBoundaryMarkFeatures(rendered.graphic.geometry || baseFeature.geometry, boundaryData, graphic.color) : [];
                const graphicLayer = leaflet.geoJSON({
                    type: 'FeatureCollection',
                    features: [graphicFeature, ...boundaryMarkFeatures]
                }, {
                    style: feature => ({
                        color: feature.properties.color,
                        fillColor: feature.properties.fillColor,
                        fillOpacity: 0.2,
                        weight: 3
                    }),
                    pointToLayer: (feature, latlng) => {
                        if (feature.properties.role === 'boundaryLabel') {
                            return createBoundaryLabelMarker(latlng, feature.properties.text, feature.properties.boundaryOffset, feature.properties.color || '#1a1a1a');
                        }
                        if (feature.properties.role === 'label') {
                            return createBoundaryLabelMarker(latlng, feature.properties.text, [0, 8], feature.properties.color || '#1a1a1a');
                        }
                        if (feature.properties.role === 'boundaryMark') {
                            return createBoundaryLabelMarker(latlng, feature.properties.text, [0, 0], feature.properties.color || '#1a1a1a');
                        }
                        return leaflet.circleMarker(latlng, {
                            color: feature.properties.color,
                            fillColor: feature.properties.fillColor,
                            fillOpacity: 0.2,
                            radius: 5
                        });
                    }
                });

                addLeafletLayers(graphicLayer);

                if (graphic.designation) {
                    const labelProperties = rendered.labels.properties || {};
                    collectPointCoordinates(rendered.labels.geometry).forEach(coordinates => {
                        const labelText = escapeHtml(graphic.designation);
                        const label = leaflet.marker(
                            [coordinates[1], coordinates[0]],
                            {
                                icon: leaflet.divIcon({
                                    className: 'tactical-graphic-label',
                                    html: labelText,
                                    iconAnchor: [0, 8]
                                })
                            }
                        );
                        label.feature = {
                            type: 'Feature',
                            properties: {
                                ...labelProperties,
                                name: graphic.designation,
                                text: labelText,
                                color: graphic.color
                            },
                            geometry: {
                                type: 'Point',
                                coordinates
                            }
                        };
                        drawnItems.addLayer(label);
                    });
                }

                if (boundaryData) {
                    const boundaryPlacement = getBoundaryPlacement(rendered.graphic.geometry || baseFeature.geometry);
                    [
                        { text: boundaryData.leftText, offset: boundaryPlacement?.leftOffset },
                        { text: boundaryData.rightText, offset: boundaryPlacement?.rightOffset }
                    ].forEach(({ text, offset }) => {
                        if (!boundaryPlacement || !text || !offset) return;
                        const coordinates = boundaryPlacement.coordinates;
                        const label = createBoundaryLabelMarker([coordinates[1], coordinates[0]], text, offset, graphic.color);
                        label.feature = {
                            type: 'Feature',
                            properties: {
                                ...rendered.labels.properties,
                                name: text,
                                text,
                                color: graphic.color,
                                role: 'boundaryLabel',
                                boundaryOffset: offset,
                                tacticalGraphic: {
                                    ...(rendered.labels.properties?.tacticalGraphic || {}),
                                    boundary: boundaryData,
                                    designation: text
                                }
                            },
                            geometry: {
                                type: 'Point',
                                coordinates
                            }
                        };
                        drawnItems.addLayer(label);
                    });
                }
            } catch (error) {
                showError(error);
            }

            return true;
        }

        button.addEventListener('click', () => {
            startDrawing().catch(showError);
        });

        map.on('draw:drawvertex', event => {
            if (!pendingGraphic || !event.layers) return;

            drawingVertices = [];
            event.layers.eachLayer(layer => {
                const latlng = layer.getLatLng();
                drawingVertices.push([latlng.lng, latlng.lat]);
            });
            const lastVertex = drawingVertices[drawingVertices.length - 1];
            if (lastVertex) {
                updatePreview({ latlng: { lng: lastVertex[0], lat: lastVertex[1] } }, false);
            }
        });
        map.on('mousemove', updatePreview);
        map.on('draw:created', clearPreview);
        map.on('draw:drawstop', () => {
            clearPreview();
            const stoppedGraphic = pendingGraphic;
            if (!stoppedGraphic) return;

            window.setTimeout(() => {
                if (pendingGraphic === stoppedGraphic) pendingGraphic = null;
            }, 0);
        });

        return Object.freeze({
            startDrawing,
            handleCreated,
            editGraphic
        });
    }
});
