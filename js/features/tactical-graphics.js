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
                + offsetX + 'px,' + offsetY + 'px) translate('
                + Math.sign(offsetX) * 50 + '%,' + Math.sign(offsetY) * 50 + '%);color:' + color
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
         * Desenha a circunferência e duas diagonais contínuas, sem traços extras.
         * @param {Object} feature - Ponto central e diâmetro em metros.
         * @returns {Object} Geometria e rótulos compatíveis com o renderizador.
         */
        function renderCoordinationPoint(feature) {
            const [lng, lat] = feature.geometry.coordinates;
            const diameter = feature.properties.tacticalGraphic.diameter;
            if (!Number.isFinite(diameter) || diameter < 1 || diameter > 100000) {
                throw new Error('Desenhe um ponto de coordenação com diâmetro entre 1 e 100.000 metros.');
            }
            const ring = window.PlanMilT.drawingGeometry.createCirclePolygon({ lat, lng }, diameter / 2, 64)[0]
                .map(([latitude, longitude]) => [longitude, latitude]);
            if (ring.some(([longitude, latitude]) => Math.abs(longitude) > 180 || Math.abs(latitude) > 85)) {
                throw new Error('O ponto de coordenação excede os limites geográficos suportados.');
            }
            const start = 8;
            const circle = Array.from({ length: 65 }, (_, index) => ring[(start + index) % 64]);
            const coordinates = [...circle, ring[40], ...Array.from({ length: 17 }, (_, index) => ring[(40 + index) % 64]), ring[24]];
            return {
                graphic: { type: 'Feature', geometry: { type: 'LineString', coordinates },
                    properties: { ...feature.properties, role: 'graphic' } },
                labels: { type: 'Feature', geometry: { type: 'MultiPoint', coordinates: [[lng, lat]] },
                    properties: { tacticalGraphic: feature.properties.tacticalGraphic, role: 'label' } }
            };
        }

        /**
         * Renderiza o gráfico local ou delega à biblioteca tática.
         * @param {Object} feature - Feição de entrada.
         * @returns {Object} Geometria e rótulos do gráfico.
         */
        function renderGraphic(feature) {
            return feature.properties.tacticalGraphic.name === 'CoordinationPoint'
                ? renderCoordinationPoint(feature)
                : library.renderTacticalGraphic(feature);
        }

        /**
         * Obtém o nome localizado, incluindo o gráfico definido pela aplicação.
         * @param {string} name - Identificador do gráfico.
         * @returns {string} Nome exibido.
         */
        function graphicDisplayName(name) {
            return name === 'CoordinationPoint' ? 'Ponto de coordenação'
                : catalog.translateName(library.getDisplayName(name), name);
        }

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
            const geometryType = name === 'CoordinationPoint' ? 'Point' : library.baseGeometryFor(name);
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
                        ...(name === 'CoordinationPoint' ? { diameter: 500 }
                            : geometryType === 'Point' ? { radius: 500 } : {})
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
                `${includeDesignation ? 'Exemplo' : 'Símbolo'}: ${graphicDisplayName(name)}`
            );

            try {
                const rendered = renderGraphic(createSampleFeature(name, includeDesignation));
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
            if (pendingGraphic.geometryType === 'Circle') return;

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
                const rendered = renderGraphic(baseFeature);
                const graphicFeature = {
                    ...rendered.graphic,
                    ...(boundaryData ? { geometry } : {}),
                    properties: {
                        ...rendered.graphic.properties,
                        name: pendingGraphic.designation || pendingGraphic.displayName,
                        color: pendingGraphic.color,
                        fillColor: pendingGraphic.color
                    }
                };
                const features = [graphicFeature];

                if (pendingGraphic.designation && !boundaryData) {
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
                    features.push(...createBoundaryFeatures(geometry, boundaryData, pendingGraphic.color, undefined, pendingGraphic.designation));
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
                        weight: 3,
                        ...(boundaryData && feature.properties.role === 'graphic' ? {
                            noClip: true,
                            lineCap: 'butt',
                            dashArray: getBoundaryLayout(geometry, boundaryData.count)?.dashArray
                        } : {})
                    }),
                    pointToLayer: (feature, latlng) => {
                        if (feature.properties.role === 'boundaryLabel' || feature.properties.role === 'boundaryDesignation') {
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
            const count = boundary.count === undefined ? 1 : Number(boundary.count);
            return { type, leftText, rightText, count };
        }

        function createBoundaryId() {
            return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        }

        /**
         * Associa as anotações contíguas de limites antigos à respectiva linha.
         * @param {Object} collection - Coleção carregada para edição.
         * @returns {Set<string>} Identificadores dos limites convertidos em memória.
         */
        function prepareLegacyBoundaries(collection) {
            const migrated = new Set();
            const features = collection.features;
            for (let index = 0; index < features.length; index += 1) {
                const line = features[index];
                const properties = line.properties;
                const boundary = normalizeBoundaryData(properties?.tacticalGraphic?.boundary);
                if (line.geometry?.type !== 'LineString' || properties?.tacticalGraphic?.name !== 'Boundary'
                    || properties.boundaryId || !boundary) continue;

                const annotations = [];
                for (let next = index + 1; next < features.length; next += 1) {
                    const candidate = features[next];
                    const candidateProperties = candidate.properties;
                    const candidateBoundary = normalizeBoundaryData(candidateProperties?.tacticalGraphic?.boundary);
                    if (candidate.geometry?.type !== 'Point' || !candidateBoundary
                        || candidateBoundary.type !== boundary.type
                        || candidateBoundary.leftText !== boundary.leftText
                        || candidateBoundary.rightText !== boundary.rightText
                        || !['boundaryMark', 'boundaryLabel', 'label'].includes(candidateProperties.role)) break;
                    annotations.push(candidate);
                }
                if (!annotations.some(item => item.properties.role === 'boundaryMark')) continue;
                const id = createBoundaryId();
                properties.boundaryId = id;
                annotations.forEach(item => { item.properties.boundaryId = id; });
                migrated.add(id);
            }
            return migrated;
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

        /**
         * Calcula os símbolos e as lacunas na projeção do mapa, ao longo de toda a linha.
         * @param {Object} geometry - Geometria linear GeoJSON do limite.
         * @param {number} count - Quantidade de símbolos.
         * @param {number} [zoom] - Escala opcional usada para projeção estável.
         * @returns {Object|null} Posições, deslocamentos e padrão de linha em pixels.
         */
        function getBoundaryLayout(geometry, count, zoom) {
            if (!Number.isInteger(count) || count < 1 || count > 100) {
                throw new Error('A quantidade de símbolos do limite deve estar entre 1 e 100.');
            }
            const points = flattenBoundaryLine(geometry);
            if (points.length < 2) return null;
            const projected = points.map(([lng, lat]) => map.project([lat, lng], zoom));
            const segments = projected.slice(1).map((end, index) => {
                const start = projected[index];
                return {
                    start,
                    end,
                    length: Math.hypot(end.x - start.x, end.y - start.y)
                };
            });
            const totalDistance = segments.reduce((sum, segment) => sum + segment.length, 0);
            if (!totalDistance) return null;

            const interval = totalDistance / count;
            const gaps = [];
            const placements = [];
            for (let index = 0; index < count; index += 1) {
                const distance = (index + 0.5) * interval;
                let travelled = 0;
                const segment = segments.find(item => {
                    if (item.length && distance <= travelled + item.length) return true;
                    travelled += item.length;
                    return false;
                });
                if (!segment) return null;
                const ratio = (distance - travelled) / segment.length;
                const latlng = map.unproject([
                    segment.start.x + (segment.end.x - segment.start.x) * ratio,
                    segment.start.y + (segment.end.y - segment.start.y) * ratio
                ], zoom);
                const leftOffset = [
                    (segment.end.y - segment.start.y) / segment.length * 14,
                    -(segment.end.x - segment.start.x) / segment.length * 14
                ];
                placements.push({
                    coordinates: [latlng.lng, latlng.lat],
                    leftOffset,
                    rightOffset: [-leftOffset[0], -leftOffset[1]]
                });
                const start = Math.max(0, distance - 18);
                const end = Math.min(totalDistance, distance + 18);
                const previous = gaps[gaps.length - 1];
                if (previous && start <= previous.end) previous.end = end;
                else gaps.push({ start, end });
            }
            const dash = [];
            let previousEnd = 0;
            gaps.forEach(gap => {
                dash.push(gap.start - previousEnd, gap.end - gap.start);
                previousEnd = gap.end;
            });
            dash.push(totalDistance - previousEnd, 0);
            return { placements, dashArray: dash.join(' ') };
        }

        function createBoundaryFeatures(geometry, boundaryData, color, boundaryId, designation = '') {
            const layout = getBoundaryLayout(geometry, boundaryData.count);
            if (!layout) return [];
            const text = getBoundaryPattern(boundaryData.type);
            const annotations = layout.placements.flatMap(placement => [
                { text, role: 'boundaryMark', offset: [0, 0] },
                { text: boundaryData.leftText, role: 'boundaryLabel', offset: placement.leftOffset },
                { text: boundaryData.rightText, role: 'boundaryLabel', offset: placement.rightOffset }
            ].filter(item => item.text).map(item => ({
                type: 'Feature',
                properties: {
                    tacticalGraphic: { name: 'Boundary', boundary: boundaryData },
                    boundaryId,
                    name: item.text,
                    text: item.text,
                    color,
                    role: item.role,
                    boundaryOffset: item.offset
                },
                geometry: { type: 'Point', coordinates: placement.coordinates }
            })));
            if (designation) {
                const points = flattenBoundaryLine(geometry);
                [points[0], points[points.length - 1]].forEach(coordinates => {
                    annotations.push({
                        type: 'Feature',
                        properties: {
                            tacticalGraphic: { name: 'Boundary', boundary: boundaryData },
                            boundaryId,
                            name: designation,
                            text: designation,
                            color,
                            role: 'boundaryDesignation',
                            boundaryOffset: [0, 8]
                        },
                        geometry: { type: 'Point', coordinates }
                    });
                });
            }
            return annotations;
        }

        function createBoundaryLabelMarker(latlng, text, offset, color = '#1a1a1a') {
            return leaflet.marker(latlng, {
                icon: window.PlanMilT.tacticalGraphics.createBoundaryLabelIcon(leaflet, text, offset, color)
            });
        }

        /**
         * Atualiza as lacunas visíveis sem alterar a geometria persistida do limite.
         * @param {Object} layer - Linha Leaflet do limite.
         */
        function styleBoundaryLine(layer) {
            const feature = layer.toGeoJSON(false);
            const boundary = normalizeBoundaryData(feature.properties.tacticalGraphic.boundary);
            const layout = getBoundaryLayout(feature.geometry, boundary.count);
            layer.setStyle({ noClip: true, lineCap: 'butt', dashArray: layout ? layout.dashArray : null });
        }

        /**
         * Regenera os rótulos associados após alterar os dados ou a geometria do limite.
         * @param {Object} layer - Linha Leaflet do limite.
         */
        function refreshBoundary(layer) {
            const feature = layer.toGeoJSON(false);
            const properties = layer.feature.properties;
            const boundary = normalizeBoundaryData(properties.tacticalGraphic.boundary);
            const annotations = createBoundaryFeatures(
                feature.geometry, boundary, properties.color, properties.boundaryId, properties.tacticalGraphic.designation
            );
            const oldLayers = [];
            drawnItems.eachLayer(item => {
                if (item !== layer && item.feature?.properties?.boundaryId === properties.boundaryId
                    && ['boundaryMark', 'boundaryLabel', 'boundaryDesignation', 'label'].includes(item.feature.properties.role)) {
                    oldLayers.push(item);
                }
            });
            oldLayers.forEach(item => drawnItems.removeLayer(item));
            annotations.forEach(annotation => {
                const marker = createBoundaryLabelMarker(
                    [annotation.geometry.coordinates[1], annotation.geometry.coordinates[0]],
                    annotation.properties.text,
                    annotation.properties.boundaryOffset,
                    annotation.properties.color
                );
                marker.feature = annotation;
                drawnItems.addLayer(marker);
            });
            styleBoundaryLine(layer);
        }

        /**
         * Conecta edição e atualização de escala à linha de limite.
         * @param {Object} layer - Linha Leaflet do limite.
         * @param {boolean} editable - Permite editar a linha e suas anotações.
         */
        function registerBoundaryLayer(layer, editable = false) {
            if (layer._planmiltBoundaryRegistered) return;
            layer._planmiltBoundaryRegistered = true;
            layer.options.noClip = true;
            layer.options.smoothFactor = 0;
            const updateStyle = () => styleBoundaryLine(layer);
            layer.on('add', () => {
                map.on('zoomend', updateStyle);
                updateStyle();
            });
            layer.on('remove', () => {
                map.off('zoomend', updateStyle);
            });
            if (map.hasLayer(layer)) {
                map.on('zoomend', updateStyle);
                layer.redraw();
            }
            if (editable) {
                layer.on('click', () => {
                    editGraphic(layer.feature).then(updated => {
                        if (updated && layer.feature.properties.boundaryId) refreshBoundary(layer);
                        else if (updated) styleBoundaryLine(layer);
                    }).catch(showError);
                });
            }
        }

        /**
         * Exibe os seletores e inicia a ferramenta Leaflet adequada ao gráfico.
         */
        async function startDrawing() {
            const sections = catalog.buildSections(library, window.PlanMilT.localHistory.graphics());
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
            let boundaryCountInput;

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
                    + '<label class="tactical-graphic-field" for="tacticalGraphicBoundaryCount"><span>Quantidade de símbolos (1 a 100)</span><input id="tacticalGraphicBoundaryCount" type="number" min="1" max="100" step="1" value="1"></label>'
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
                    boundaryCountInput = popup.querySelector('#tacticalGraphicBoundaryCount');
                    popup.classList.add('tactical-graphic-modal');

                    if (commonSection.graphics.length) {
                        const commonOption = document.createElement('option');
                        commonOption.value = commonSection.name;
                        commonOption.textContent = commonSection.label;
                        categorySelect.appendChild(commonOption);
                    }
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
                            rightText: boundaryRightInput?.value,
                            count: Number(boundaryCountInput.value)
                        })
                        : null;
                    if (selectedName === 'Boundary' && (!boundary || !boundary.leftText || !boundary.rightText)) {
                        sweetAlert.showValidationMessage('Preencha os nomes dos dois lados do limite.');
                        return false;
                    }
                    if (boundary && (!Number.isInteger(boundary.count) || boundary.count < 1 || boundary.count > 100)) {
                        sweetAlert.showValidationMessage('Informe uma quantidade inteira de símbolos entre 1 e 100.');
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
            const geometryType = name === 'CoordinationPoint' ? 'Circle' : library.baseGeometryFor(name);
            const drawToolByGeometry = {
                Point: leaflet.Draw.Marker,
                LineString: leaflet.Draw.Polyline,
                Polygon: leaflet.Draw.Polygon,
                Circle: leaflet.Draw.Circle
            };
            const DrawTool = drawToolByGeometry[geometryType];

            if (!DrawTool) {
                throw new Error(`Geometria de desenho não suportada: ${geometryType || 'indefinida'}.`);
            }

            const displayName = graphicDisplayName(name);
            const color = getDefaultColor();
            const options = geometryType === 'Circle'
                ? { shapeOptions: { color, fill: false } }
                : geometryType === 'Polygon' || geometryType === 'LineString'
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
                if (layer.feature.properties.tacticalGraphic.name === 'Boundary'
                    && layer.feature.geometry.type === 'LineString') {
                    registerBoundaryLayer(layer, true);
                } else {
                    layer.on('click', event => {
                        const target = event.target || layer;
                        if (target && target.feature && target.feature.properties && target.feature.properties.tacticalGraphic) {
                            editGraphic(target.feature).catch(showError);
                        }
                    });
                }
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
                            + '<select id="tacticalGraphicBoundaryType">' + BOUNDARY_ECHELONS.map(type => `<option value="${type}" ${(existingBoundary?.type || 'Companhia') === type ? 'selected' : ''}>${type}</option>`).join('') + '</select></label>'
                            + '<label class="tactical-graphic-field" for="tacticalGraphicBoundaryCount"><span>Quantidade de símbolos (1 a 100)</span><input id="tacticalGraphicBoundaryCount" type="number" min="1" max="100" step="1" value="' + (existingBoundary?.count || 1) + '"></label>'
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
                            rightText: popup.querySelector('#tacticalGraphicBoundaryRight')?.value,
                            count: Number(popup.querySelector('#tacticalGraphicBoundaryCount')?.value)
                        })
                        : null;
                    if (tacticalGraphic.name === 'Boundary' && (!nextBoundary || !nextBoundary.leftText || !nextBoundary.rightText)) {
                        sweetAlert.showValidationMessage('Preencha os nomes dos dois lados do limite.');
                        return false;
                    }
                    if (nextBoundary && (!Number.isInteger(nextBoundary.count) || nextBoundary.count < 1 || nextBoundary.count > 100)) {
                        sweetAlert.showValidationMessage('Informe uma quantidade inteira de símbolos entre 1 e 100.');
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
         * Configura uma linha já desenhada como limite, preservando sua geometria.
         * @param {Object} layer - Linha Leaflet criada pelo usuário.
         * @returns {Promise<boolean>} True quando o limite foi confirmado e adicionado.
         */
        async function convertLineToBoundary(layer) {
            const feature = layer.toGeoJSON(false);
            if (feature.geometry?.type !== 'LineString') {
                throw new Error('O limite precisa ser desenhado como uma linha.');
            }
            const color = layer.options.color || getDefaultColor();
            const draft = {
                ...feature,
                properties: {
                    ...feature.properties,
                    color,
                    fillColor: color,
                    role: 'graphic',
                    boundaryId: createBoundaryId(),
                    tacticalGraphic: { name: 'Boundary' }
                }
            };
            if (!await editGraphic(draft)) return false;
            const boundary = normalizeBoundaryData(draft.properties.tacticalGraphic.boundary);
            if (!boundary || !getBoundaryLayout(feature.geometry, boundary.count)) {
                throw new Error('Desenhe uma linha com pelo menos dois pontos distintos para criar um limite.');
            }
            layer.feature = draft;
            registerBoundaryLayer(layer, true);
            drawnItems.addLayer(layer);
            refreshBoundary(layer);
            window.PlanMilT.localHistory.recordGraphic('Boundary');
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
                const baseFeature = event.layer.toGeoJSON(graphic.name === 'CoordinationPoint' ? false : undefined);
                baseFeature.properties = {
                    ...(baseFeature.properties || {}),
                    name: graphic.designation || graphic.displayName,
                    color: graphic.color,
                    tacticalGraphic: {
                        name: graphic.name,
                        ...(graphic.designation ? { designation: graphic.designation } : {}),
                        ...(graphic.name === 'CoordinationPoint' ? { diameter: event.layer.getRadius() * 2 }
                            : graphic.geometryType === 'Point' ? { radius: 500 } : {}),
                        ...(boundaryData ? { boundary: boundaryData } : {})
                    }
                };

                const rendered = renderGraphic(baseFeature);
                const graphicFeature = {
                    ...rendered.graphic,
                    ...(boundaryData ? { geometry: baseFeature.geometry } : {}),
                    properties: {
                        ...rendered.graphic.properties,
                        name: graphic.designation || graphic.displayName,
                        color: graphic.color,
                        fillColor: graphic.color,
                        ...(boundaryData ? { boundaryId: createBoundaryId() } : {})
                    }
                };
                const graphicLayer = leaflet.geoJSON({
                    type: 'FeatureCollection',
                    features: [graphicFeature]
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
                if (boundaryData) {
                    let boundaryLine;
                    drawnItems.eachLayer(layer => {
                        if (layer.feature?.properties?.boundaryId === graphicFeature.properties.boundaryId) boundaryLine = layer;
                    });
                    if (!boundaryLine) throw new Error('Não foi possível criar a linha do limite.');
                    refreshBoundary(boundaryLine);
                }

                if (graphic.designation && !boundaryData) {
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
                window.PlanMilT.localHistory.recordGraphic(graphic.name);

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
        map.on('draw:edited', event => {
            event.layers.eachLayer(layer => {
                if (layer.feature?.properties?.tacticalGraphic?.name === 'Boundary'
                    && layer.feature.geometry?.type === 'LineString'
                    && layer.feature.properties.boundaryId) {
                    refreshBoundary(layer);
                }
            });
        });
        map.on('draw:deleted', event => {
            const ids = new Set();
            event.layers.eachLayer(layer => {
                if (layer.feature?.geometry?.type === 'LineString'
                    && layer.feature.properties?.tacticalGraphic?.name === 'Boundary'
                    && layer.feature.properties.boundaryId) {
                    ids.add(layer.feature.properties.boundaryId);
                }
            });
            const related = [];
            drawnItems.eachLayer(layer => {
                if (ids.has(layer.feature?.properties?.boundaryId)) related.push(layer);
            });
            related.forEach(layer => drawnItems.removeLayer(layer));
        });
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
            editGraphic,
            convertLineToBoundary,
            getBoundaryLayout,
            registerBoundaryLayer,
            prepareLegacyBoundaries,
            refreshBoundary
        });
    }
});
