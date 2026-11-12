/**
 * @fileoverview Carrega desenhos persistidos e recria suas geometrias e estilos como camadas Leaflet editáveis.
 * @requires Leaflet, drawnItems, map, layerControl e SweetAlert disponíveis no escopo legado.
 */
            document.getElementById('loadDrawings').addEventListener('click', async function() {
                const { value: usuario } = await Swal.fire({
                    title: 'Insira seu usuário',
                    input: 'text',
                    inputPlaceholder: 'Digite o usuário',
                    showCancelButton: true,
                    cancelButtonText: 'Cancelar',
                    confirmButtonText: 'Confirmar',
                    inputValidator: (value) => {
                        if (!value) {
                            return 'Usuário é necessário para carregar os desenhos!';
                        }
                    }
                });

                if (!usuario) return;
                await window.PlanMilT.drawingLoading.load(usuario);
            });

            window.PlanMilT.drawingLoading = Object.freeze({
                /**
                 * Carrega um planejamento pelo identificador usado no servidor.
                 * @param {string} usuario - Identificador do planejamento.
                 */
                async load(usuario, localData) {
                const urlCompleta = window.location.href;
                const padraoDiretorio = /https:\/\/methodux\.online\/(.*?)\//;
                const resultado = padraoDiretorio.exec(urlCompleta);
                const diretorio = resultado ? resultado[1] : '';

                try {
                    let geoJsonData = localData;
                    if (!localData) {
                        const response = await window.PlanMilT.apiClient.request("/carregar.php", {
                            method: "POST",
                            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                            body: `usuario=${encodeURIComponent(usuario)}&link=${encodeURIComponent(diretorio)}`
                        });
                        if (!response.ok) throw new Error(`Erro HTTP: ${response.status}`);
                        geoJsonData = await response.json();
                    }

                    if (!isValidGeoJson(geoJsonData)) {
                        if (localData) throw new Error('Rascunho local inválido.');
                        console.error('[PlanMilT][Desenhos] Resposta inválida ao carregar desenhos.');
                        Swal.fire('Erro', 'Erro ao carregar os desenhos. Verifique o usuário e o link!', 'error');
                        return;
                    }

                    console.info('[PlanMilT][Desenhos] Desenhos carregados.', {
                        featureCount: geoJsonData.features.length
                    });

                    const { isConfirmed: escolha } = localData ? { isConfirmed: true } : await Swal.fire({
                        title: 'Como deseja carregar os desenhos?',
                        text: "Escolha 'Edição' para edição ou 'Camada não-editável' para carregá-los como uma nova camada.",
                        icon: 'question',
                        showCancelButton: true,
                        confirmButtonText: 'Edição',
                        cancelButtonText: 'Camada não-editável'
                    });

                    const coverageFeatures = geoJsonData.features.filter(feature => feature.properties && feature.properties.coverageImage);
                    const vectorData = { type: 'FeatureCollection', features: geoJsonData.features.filter(feature => !(feature.properties && feature.properties.coverageImage)) };
                    const coverageLayers = coverageFeatures.map(feature => window.PlanMilT.coverageImage.fromFeature(feature, L));
                    let loadedOverlay;

                    /**
                     * Recria rótulos de limite com os deslocamentos laterais persistidos.
                     * @param {Object} feature - Feição GeoJSON do rótulo.
                     * @returns {Object|null} Ícone Leaflet ou null para rótulos antigos sem deslocamento.
                     */
                    function createTextLabelIcon(feature) {
                        const properties = feature.properties || {};
                        const boundaryOffset = properties.boundaryOffset;
                        if (['boundaryLabel', 'boundaryMark', 'boundaryDesignation'].includes(properties.role)
                            && Array.isArray(boundaryOffset)
                            && boundaryOffset.length === 2
                            && boundaryOffset.every(Number.isFinite)) {
                            return window.PlanMilT.tacticalGraphics.createBoundaryLabelIcon(
                                L,
                                properties.text,
                                boundaryOffset,
                                properties.color || '#1f2933'
                            );
                        }
                        return L.divIcon({
                            className: 'custom-text-label',
                            html: properties.text,
                            iconSize: [100, 30],
                            iconAnchor: [15, 15]
                        });
                    }

                    if (!escolha) {
                        // Carrega como camada não-editável
                        const newLayerName = usuario;
                        const newLayer = L.geoJson(null).addTo(map);
                        loadedOverlay = newLayer;
                        coverageLayers.forEach(layer => newLayer.addLayer(layer));

                        L.geoJson(vectorData, {
                            onEachFeature: function(feature, layer) {
                                if (feature.geometry.type === 'Point' && Object.keys(feature.properties).length === 0) {
                                    var emptyIcon = L.divIcon({ html: '', className: 'empty-icon', iconSize: [0, 0] });
                                    layer.setIcon(emptyIcon);
                                    newLayer.addLayer(layer);
                                } else if (feature.geometry.type === 'Point' && feature.properties.shape === 'circle') {
                                    var newCircle = L.circle([feature.properties.center[0], feature.properties.center[1]], {
                                        color: feature.properties.color,
                                        fillColor: feature.properties.color,
                                        fillOpacity: 0.5,
                                        radius: feature.properties.radius
                                    });
                                    newCircle.feature = feature;
                                    newLayer.addLayer(newCircle);
                                } else if (feature.properties.text && feature.geometry.type === 'Point' && !feature.properties.iconUrl) {
                                    var customIcon = createTextLabelIcon(feature);
                                    layer.setIcon(customIcon);
                                    newLayer.addLayer(layer);
                                } else if (feature.geometry.type === 'Point' && feature.properties.iconUrl) {
                                    var customIcon = feature.properties.militarySymbol ? window.PlanMilT.militarySymbols.createIcon(feature.properties.militarySymbol, L) : L.icon({
                                        iconUrl: feature.properties.iconUrl,
                                        iconSize: [40, 40],
                                        iconAnchor: [15, 15]
                                    });
                                    layer.setIcon(customIcon);
                                    newLayer.addLayer(layer);
                                } else if (
                                    feature.geometry.type === 'LineString' ||
                                    feature.geometry.type === 'Polygon' ||
                                    feature.geometry.type === 'MultiLineString' ||
                                    feature.geometry.type === 'MultiPolygon' ||
                                    feature.geometry.type === 'GeometryCollection'
                                ) {
                                    // Modificação para aplicar estilos adicionais
                                    let style = { color: feature.properties.color };

                                    if (feature.properties.dashArray) {
                                        style.dashArray = feature.properties.dashArray;
                                    }

                                    if (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon') {
                                        if (feature.properties.fillColor) {
                                            style.fillColor = feature.properties.fillColor;
                                            style.fillOpacity = feature.properties.fillOpacity ?? 0.5;
                                        }
                                        if (feature.properties.fillPattern) {
                                            let pattern = window.PlanMilT.drawingPatterns.get(map, L, feature.properties.fillPattern, feature.properties.color);
                                            style.fillPattern = pattern;
                                        }
                                    }

                                    if (typeof layer.setStyle === 'function') {
                                        layer.setStyle(style);
                                    }
                                    if (feature.geometry.type === 'LineString' && feature.properties.boundaryId
                                        && feature.properties.tacticalGraphic?.name === 'Boundary') {
                                        tacticalGraphics.registerBoundaryLayer(layer);
                                    }
                                    newLayer.addLayer(layer);
                                }
                            }
                        });

                        addNewOverlayLayer(newLayerName, newLayer);

                    } else {
                        // Carrega para edição
                        if (!localData) window.PlanMilT.drawingAutoSave?.pauseForLoad();
                        drawnItems.clearLayers();
                        window.PlanMilT.coverageImage.clear();
                        coverageFeatures.forEach(feature => window.PlanMilT.coverageImage.add(feature, L));
                        const hasLegacyBoundaries = vectorData.features.some(feature =>
                            feature.geometry?.type === 'LineString'
                            && feature.properties?.tacticalGraphic?.name === 'Boundary'
                            && feature.properties.tacticalGraphic.boundary
                            && !feature.properties.boundaryId
                        );
                        const migratedBoundaries = hasLegacyBoundaries
                            ? tacticalGraphics.prepareLegacyBoundaries(vectorData)
                            : new Set();

                        L.geoJson(vectorData, {
                            onEachFeature: function(feature, layer) {
                                if (feature.geometry.type === 'Point' && Object.keys(feature.properties).length === 0) {
                                    var emptyIcon = L.divIcon({ html: '', className: 'empty-icon', iconSize: [0, 0] });
                                    layer.setIcon(emptyIcon);
                                    return;
                                } else if (feature.geometry.type === 'Point' && feature.properties.shape === 'circle') {
                                    var newCircle = L.circle([feature.properties.center[0], feature.properties.center[1]], {
                                        color: feature.properties.color,
                                        fillColor: feature.properties.color,
                                        fillOpacity: 0.5,
                                        radius: feature.properties.radius
                                    });
                                    newCircle.feature = feature;
                                    drawnItems.addLayer(newCircle);
                                } else if (feature.properties.text && feature.geometry.type === 'Point' && !feature.properties.iconUrl) {
                                    var customIcon = createTextLabelIcon(feature);
                                    layer.setIcon(customIcon);
                                    drawnItems.addLayer(layer);
                                } else if (feature.geometry.type === 'Point' && feature.properties.iconUrl) {
                                    var customIcon = feature.properties.militarySymbol ? window.PlanMilT.militarySymbols.createIcon(feature.properties.militarySymbol, L) : L.icon({
                                        iconUrl: feature.properties.iconUrl,
                                        iconSize: [40, 40],
                                        iconAnchor: [15, 15]
                                    });
                                    layer.setIcon(customIcon);
                                    drawnItems.addLayer(layer);
                                } else if (
                                    feature.geometry.type === 'LineString' ||
                                    feature.geometry.type === 'Polygon' ||
                                    feature.geometry.type === 'MultiLineString' ||
                                    feature.geometry.type === 'MultiPolygon' ||
                                    feature.geometry.type === 'GeometryCollection'
                                ) {
                                    // Modificação para aplicar estilos adicionais
                                    let style = { color: feature.properties.color };

                                    if (feature.properties.dashArray) {
                                        style.dashArray = feature.properties.dashArray;
                                    }

                                    if (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon') {
                                        if (feature.properties.fillColor) {
                                            style.fillColor = feature.properties.fillColor;
                                            style.fillOpacity = feature.properties.fillOpacity ?? 0.5;
                                        }
                                        if (feature.properties.fillPattern) {
                                            let pattern = window.PlanMilT.drawingPatterns.get(map, L, feature.properties.fillPattern, feature.properties.color);
                                            style.fillPattern = pattern;
                                        }
                                    }

                                    if (typeof layer.setStyle === 'function') {
                                        layer.setStyle(style);
                                    }
                                    if (feature.geometry.type === 'LineString' && feature.properties.boundaryId
                                        && feature.properties.tacticalGraphic?.name === 'Boundary') {
                                        tacticalGraphics.registerBoundaryLayer(layer, true);
                                    }
                                    drawnItems.addLayer(layer);
                                }
                            }
                        }).addTo(map);
                        if (migratedBoundaries.size) {
                            drawnItems.eachLayer(layer => {
                                if (layer.feature?.geometry?.type === 'LineString'
                                    && migratedBoundaries.has(layer.feature.properties?.boundaryId)) {
                                    tacticalGraphics.refreshBoundary(layer);
                                }
                            });
                        }
                    }

                    if (localData) return;
                    if (escolha && coverageFeatures.length) {
                        const bounds = window.PlanMilT.coverageImage.getGroup().getBounds();
                        if (drawnItems.getLayers().length) bounds.extend(drawnItems.getBounds());
                        map.fitBounds(bounds);
                    } else if (!escolha && coverageFeatures.length) {
                        map.fitBounds(loadedOverlay.getBounds());
                    } else if (drawnItems.getLayers().length) {
                        map.fitBounds(drawnItems.getBounds());
                    }

                    if (!window.PlanMilT.welcome.record(usuario)) {
                        Swal.fire('Aviso', 'Desenhos carregados, mas não foi possível atualizar a lista de recentes neste navegador.', 'warning');
                    }
                } catch (error) {
                    if (localData) throw error;
                    console.error("Erro ao carregar desenhos:", error);
                    Swal.fire('Erro HTTP', `Erro: ${error.message}`, 'error');
                }
                },
                /**
                 * Restaura desenhos locais editáveis sem consultar o servidor.
                 * @param {Object} data - Coleção GeoJSON previamente armazenada.
                 * @returns {Promise<void>} Restauração concluída.
                 */
                async restore(data) {
                    await this.load('', data);
                }
            });
