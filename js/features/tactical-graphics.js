/**
 * @fileoverview Integra os gráficos táticos da biblioteca com as ferramentas nativas do Leaflet Draw.
 * @exports window.PlanMilT.tacticalGraphics
 * @requires Leaflet Draw, biblioteca @zaes/tactical-graphics, SweetAlert2 e grupo de desenhos.
 */
window.PlanMilT = window.PlanMilT || {};

window.PlanMilT.tacticalGraphics = Object.freeze({
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
         * Exibe os seletores e inicia a ferramenta Leaflet adequada ao gráfico.
         */
        async function startDrawing() {
            const sections = catalog.buildSections(library);
            let graphicSelect;

            const selection = await sweetAlert.fire({
                title: 'Selecionar gráfico tático',
                html: '<label for="tactical-graphic-select">Gráfico</label><select id="tactical-graphic-select" class="swal2-select"><option value="">Selecione um gráfico</option></select>',
                showCancelButton: true,
                confirmButtonText: 'Continuar',
                cancelButtonText: 'Cancelar',
                didOpen: () => {
                    graphicSelect = sweetAlert.getPopup().querySelector('#tactical-graphic-select');
                    sections.forEach(section => {
                        const optionGroup = document.createElement('optgroup');
                        optionGroup.label = section.label;
                        section.graphics.forEach(graphic => {
                            const option = document.createElement('option');
                            option.value = graphic.name;
                            option.textContent = graphic.label;
                            optionGroup.appendChild(option);
                        });
                        graphicSelect.appendChild(optionGroup);
                    });
                },
                preConfirm: () => {
                    if (!graphicSelect.value) {
                        sweetAlert.showValidationMessage('Selecione um gráfico tático.');
                        return false;
                    }
                    return graphicSelect.value;
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
            if (typeof layer.eachLayer === 'function' && typeof layer.setStyle !== 'function') {
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

        map.on('draw:drawstop', () => {
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
