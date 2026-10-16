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
                    coordinates: [[-50, -20], [-49.99, -20.002]]
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

            const baseFeature = {
                type: 'Feature',
                geometry,
                properties: {
                    tacticalGraphic: {
                        name: pendingGraphic.name,
                        ...(pendingGraphic.designation ? { designation: pendingGraphic.designation } : {}),
                        ...(pendingGraphic.geometryType === 'Point' ? { radius: 500 } : {})
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
                    pointToLayer: (feature, latlng) => feature.properties.role === 'label'
                        ? leaflet.marker(latlng, {
                            icon: leaflet.divIcon({
                                className: 'tactical-graphic-label',
                                html: escapeHtml(feature.properties.text),
                                iconAnchor: [0, 8]
                            })
                        })
                        : leaflet.circleMarker(latlng, {
                            color: feature.properties.color,
                            fillColor: feature.properties.fillColor,
                            fillOpacity: 0.2,
                            radius: 5
                        })
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
        `;

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
                    renderResults();
                },
                preConfirm: () => {
                    if (!selectedName) {
                        sweetAlert.showValidationMessage('Selecione um gráfico tático.');
                        return false;
                    }
                    return selectedName;
                }
            });

            if (!selection.isConfirmed || !selection.value) return;

            const geometryType = library.baseGeometryFor(selection.value);
            const drawToolByGeometry = {
                Point: leaflet.Draw.Marker,
                LineString: leaflet.Draw.Polyline,
                Polygon: leaflet.Draw.Polygon
            };
            const DrawTool = drawToolByGeometry[geometryType];

            if (!DrawTool) {
                throw new Error(`Geometria de desenho não suportada: ${geometryType || 'indefinida'}.`);
            }

            const details = await sweetAlert.fire({
                title: 'Designação do gráfico',
                input: 'text',
                inputPlaceholder: 'Opcional (por exemplo, 1ª Cia)',
                showCancelButton: true,
                confirmButtonText: 'Desenhar no mapa',
                cancelButtonText: 'Cancelar'
            });

            if (!details.isConfirmed) return;

            const name = selection.value;
            const displayName = catalog.translateName(library.getDisplayName(name), name);
            const color = getDefaultColor();
            const options = geometryType === 'Polygon' || geometryType === 'LineString'
                ? { shapeOptions: { color } }
                : {};

            pendingGraphic = {
                name,
                displayName,
                geometryType,
                designation: typeof details.value === 'string' ? details.value.trim() : '',
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

            drawnItems.addLayer(layer);
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
                const baseFeature = event.layer.toGeoJSON();
                baseFeature.properties = {
                    ...(baseFeature.properties || {}),
                    name: graphic.designation || graphic.displayName,
                    color: graphic.color,
                    tacticalGraphic: {
                        name: graphic.name,
                        ...(graphic.designation ? { designation: graphic.designation } : {}),
                        ...(graphic.geometryType === 'Point' ? { radius: 500 } : {})
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
                const graphicLayer = leaflet.geoJSON(graphicFeature, {
                    style: feature => ({
                        color: feature.properties.color,
                        fillColor: feature.properties.fillColor,
                        fillOpacity: 0.2,
                        weight: 3
                    }),
                    pointToLayer: (feature, latlng) => leaflet.circleMarker(latlng, {
                        color: feature.properties.color,
                        fillColor: feature.properties.fillColor,
                        fillOpacity: 0.2,
                        radius: 5
                    })
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
            handleCreated
        });
    }
});
