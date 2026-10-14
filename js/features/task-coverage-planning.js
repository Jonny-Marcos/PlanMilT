/**
 * @fileoverview Seleciona posições para cobrir ícones, considerando área de seleção, elevação e agrupamentos.
 * @requires Leaflet, Turf, dados de elevação e funções auxiliares de execução de tarefas no escopo legado.
 */
                /**
                 * Desenha uma área para cobrir os ícones selecionados.
                 * @param {Object} params - Parâmetros validados da tarefa.
                 */
                async function performDrawCoverageArea(params) {
                    const iconUrl = params.iconUrl;
                    const radiusKm = params.radius;
                    const iconTypesToCover = params.iconTypesToCover;
                    const coverageLayerName = params.coverageLayer; // Adicionado
                    let selectionArea = params.area;

                    addToLog('Iniciando tarefa: Desenhar áreas de cobertura com ícone central', params);

                    // Obter a camada selecionada com base no nome
                    const coverageLayer = planejamentoLayer;


                    addToLog('Desenhos serão adicionados à camada: Sugestão de Planejamento');


                    addToLog(`Camada selecionada para cobertura: ${coverageLayerName}`);

                    // Se a área de seleção for nula, considerar os limites atuais do mapa
                    if (!selectionArea) {
                        selectionArea = map.getBounds();
                        addToLog('Área de seleção é nula, usando map.getBounds():', selectionArea);
                    } else {
                        addToLog('Área de seleção fornecida:', selectionArea);
                    }

                    // Definir as camadas onde os ícones podem estar
                    const layersToSearch = [drawnItems, planejamentoLayer];

                    // Obter todos os ícones que precisam ser cobertos
                    const iconsToCover = [];

                    layersToSearch.forEach(layerGroup => {
                        layerGroup.eachLayer(function(layer) {
                            if (layer instanceof L.Marker && layer.options.icon && layer.options.icon.options.iconUrl) {
                                const layerIconUrl = layer.options.icon.options.iconUrl;
                                //const iconNameWithExtension = layerIconUrl.substring(layerIconUrl.lastIndexOf('/') + 1);
                                //const iconName = iconNameWithExtension.split('.')[0];

                                let isInArea = false;

                                if (selectionArea instanceof L.LatLngBounds) {
                                    isInArea = selectionArea.contains(layer.getLatLng());
                                } else if (selectionArea instanceof L.Polygon) {
                                    isInArea = selectionArea.contains(layer.getLatLng());
                                }

                                if (iconTypesToCover.includes(layerIconUrl) && isInArea) {
                                    iconsToCover.push({
                                        marker: layer,
                                        latlng: layer.getLatLng()
                                    });
                                }
                            }
                        });
                    });

                    addToLog(`Total de ícones a serem cobertos: ${iconsToCover.length}`);

                    if (iconsToCover.length === 0) {
                        addToLog('Erro: Nenhum ícone para cobrir na área selecionada.');
                        return;
                    }

                    const radiusMeters = radiusKm * 1000;

                    // Converter os pontos dos ícones em um array de coordenadas
                    const points = iconsToCover.map(icon => [icon.latlng.lat, icon.latlng.lng]);

                    // Configurar o DBSCAN com ajustes
                    const clustering = new DBSCAN();
                    const minPts = 1; // Permitir clusters de tamanho 1
                    const epsilon = radiusMeters; // Ajustado para radiusMeters para garantir que cada cluster possa ser coberto por um círculo de raio R

                    const clusters = clustering.run(points, epsilon, minPts, function(p, q) {
                        // Função de distância esférica (Haversine)
                        const R = 6371000; // Raio da Terra em metros
                        const lat1 = p[0] * Math.PI / 180;
                        const lat2 = q[0] * Math.PI / 180;
                        const deltaLat = (q[0] - p[0]) * Math.PI / 180;
                        const deltaLon = (q[1] - p[1]) * Math.PI / 180;

                        const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
                              Math.cos(lat1) * Math.cos(lat2) *
                              Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);
                        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

                        return R * c;
                    });

                    addToLog('Clusters formados pelo DBSCAN:', clusters);

                    // Conjunto para rastrear quais ícones já estão cobertos
                    const coveredIcons = new Set();

                    // Array para armazenar todas as coverage circles
                    const coverageCircles = [];

                    // Função para calcular a distância entre dois pontos em metros
                    /**
                     * Calcula a distância geográfica entre duas posições.
                     * @param {*} latlng1 - Primeira coordenada geográfica.
                     * @param {*} latlng2 - Segunda coordenada geográfica.
                     */
                    function calculateDistance(latlng1, latlng2) {
                        return map.distance(latlng1, latlng2);
                    }

                    // Função para obter os centróides potenciais (usando grade ou centroides)
                    /**
                     * Gera posições candidatas para cobrir um conjunto de ícones.
                     * @param {Array<*>} icons - Ícones candidatos à distribuição ou cobertura.
                     * @param {Object} clusterBounds - Limites geográficos do agrupamento.
                     * @param {number} gridSizeKm - Espaçamento da grade de posições candidatas em quilômetros.
                     */
                    function generatePotentialCentroids(icons, clusterBounds, gridSizeKm = 1) {
                        const gridSize = gridSizeKm / 111; // Aproximadamente 1 km em graus (varia com a latitude)
                        const minLat = clusterBounds.minLat;
                        const maxLat = clusterBounds.maxLat;
                        const minLon = clusterBounds.minLon;
                        const maxLon = clusterBounds.maxLon;

                        const centroids = [];

                        for (let lat = minLat; lat <= maxLat; lat += gridSize) {
                            for (let lon = minLon; lon <= maxLon; lon += gridSize) {
                                centroids.push(L.latLng(lat, lon));
                            }
                        }

                        return centroids;
                    }

                    // Variável para armazenar todos os dados de elevação
                    let allElevationData = [];

                    // Obter os limites da área de seleção para buscar todos os dados de elevação necessários
                    let minLatSelection, maxLatSelection, minLonSelection, maxLonSelection;

                    if (selectionArea instanceof L.LatLngBounds) {
                        minLatSelection = selectionArea.getSouth();
                        maxLatSelection = selectionArea.getNorth();
                        minLonSelection = selectionArea.getWest();
                        maxLonSelection = selectionArea.getEast();
                    } else if (selectionArea instanceof L.Polygon) {
                        const bounds = selectionArea.getBounds();
                        minLatSelection = bounds.getSouth();
                        maxLatSelection = bounds.getNorth();
                        minLonSelection = bounds.getWest();
                        maxLonSelection = bounds.getEast();
                    }

                    try {
                        // Criar um objeto bounds com base nas seleções atuais
                        addToLog('Solicitando dados de elevação para os limites:', selectionArea);

                        // Chamar a função fetchElevationData em vez de fetch diretamente
                        allElevationData = await fetchElevationData(selectionArea);

                        if (!allElevationData) {
                            addToLog('Erro: Não foi possível obter os dados de elevação.');
                            await Swal.fire('Erro', 'Não foi possível obter os dados de elevação.', 'error');
                            return;
                        }

                        addToLog('Todos os dados de elevação obtidos com sucesso.');
                    } catch (error) {
                        addToLog('Erro: Erro ao obter todos os dados de elevação:', error);
                        await Swal.fire('Erro', 'Ocorreu um erro ao obter os dados de elevação.', 'error');
                        return;
                    }


                    // Função para selecionar o melhor centróide baseado na cobertura máxima
                    /**
                     * Seleciona a posição candidata que cobre mais ícones válidos.
                     * @param {Array<*>} centroids - Posições geográficas candidatas a avaliar.
                     * @param {Array<*>} remainingIcons - Ícones que ainda precisam ser cobertos.
                     */
                    async function selectBestCentroid(centroids, remainingIcons) {
                        let bestCentroid = null;
                        let maxCoverage = 0;
                        let elevationDataBest = null;

                        for (let centroid of centroids) {
                            // Obter os dados de elevação para o centróide a partir de allElevationData
                            const lat = centroid.lat;
                            const lon = centroid.lng;

                            // Definir uma área pequena ao redor do centróide para obter a elevação
                            const delta = 0.001; // Aproximadamente 111m
                            const minLat = lat - delta;
                            const maxLat = lat + delta;
                            const minLon = lon - delta;
                            const maxLon = lon + delta;

                            // Filtrar os dados de elevação que estão dentro da área do centróide
                            const epsilon = 0.01; // Margem de tolerância para buscar pontos próximos

                            const elevationData = allElevationData.filter(point => {
                                return point.lat >= (minLat - epsilon) && point.lat <= (maxLat + epsilon) &&
                                    point.lon >= (minLon - epsilon) && point.lon <= (maxLon + epsilon);
                            });


                            if (!Array.isArray(elevationData) || elevationData.length === 0) {
                                addToLog(`Erro: Dados de elevação inválidos ou vazios para centróide (${lat}, ${lon}).`);
                                continue; // Pular este centróide
                            }

                            // Selecionar o ponto com a maior elevação dentro da área do centróide
                            elevationData.sort((a, b) => b.elevation - a.elevation);
                            const highestPoint = elevationData[0];
                            const highestLatLng = L.latLng(highestPoint.lat, highestPoint.lon);

                            // Calcular quantos ícones ainda não cobertos estão dentro do raio de cobertura deste ponto
                            const iconsInCoverage = remainingIcons.filter(icon => {
                                const distance = calculateDistance(icon.latlng, highestLatLng);
                                return distance <= radiusMeters;
                            });

                            if (iconsInCoverage.length > maxCoverage) {
                                maxCoverage = iconsInCoverage.length;
                                bestCentroid = highestLatLng;
                                elevationDataBest = highestPoint;
                            }
                        }

                        if (bestCentroid) {
                            return {
                                centroid: bestCentroid,
                                coverageCount: maxCoverage,
                                elevation: elevationDataBest
                            };
                        } else {
                            return null;
                        }
                    }

                    // Função principal de cobertura otimizada
                    /**
                     * Escolhe iterativamente posições candidatas para cobrir os ícones restantes.
                     * @param {Array<*>} clusterIcons - Ícones pertencentes ao grupo em análise.
                     */
                    async function coverIconsOptimally(clusterIcons) {
                        // Filtrar os ícones que ainda não estão cobertos
                        let remainingIcons = clusterIcons.filter(icon => !coveredIcons.has(icon.marker._leaflet_id));

                        while (remainingIcons.length > 0) {
                            // Definir os limites do cluster para gerar centróides potenciais
                            const clusterLatLngs = remainingIcons.map(icon => [icon.latlng.lat, icon.latlng.lng]);
                            const minLat = Math.min(...clusterLatLngs.map(coord => coord[0]));
                            const maxLat = Math.max(...clusterLatLngs.map(coord => coord[0]));
                            const minLon = Math.min(...clusterLatLngs.map(coord => coord[1]));
                            const maxLon = Math.max(...clusterLatLngs.map(coord => coord[1]));

                            const clusterBounds = { minLat, maxLat, minLon, maxLon };

                            // Gerar centróides potenciais dentro dos limites do cluster
                            const potentialCentroids = generatePotentialCentroids(remainingIcons, clusterBounds, 1); // Grid de 1km

                            // Selecionar o melhor centróide baseado na cobertura máxima
                            const best = await selectBestCentroid(potentialCentroids, remainingIcons);

                            if (!best) {
                                addToLog('Erro: Não foi possível encontrar um centróide adequado para cobrir os ícones restantes.');
                                break; // Saia do loop para evitar um loop infinito
                            }

                            const { centroid, coverageCount, elevation } = best;

                            addToLog(`Melhor centróide selecionado: LatLng(${centroid.lat}, ${centroid.lng}) cobrindo ${coverageCount} ícones.`);

                            // Adicionar o ícone central no centróide
                            const centralMarker = L.marker([centroid.lat, centroid.lng], {
                                icon: L.icon({
                                    iconUrl: iconUrl,
                                    iconSize: [32, 32],
                                    iconAnchor: [16, 32],
                                    popupAnchor: [0, -32]
                                })
                            }).bindPopup(`Ícone Central<br>Elevação: ${elevation.elevation} metros`);

                            // Adicionar propriedades personalizadas
                            centralMarker.feature = {
                                type: "Feature",
                                properties: {
                                    folderName: "Sugestão de Planejamento",
                                    name: "Ícone Central",
                                    description: `Elevação: ${elevation.elevation} metros`,
                                    iconUrl: iconUrl,
                                    color: "#FF0000"
                                }
                            };

                            coverageLayer.addLayer(centralMarker);
                            addToLog(`Ícone central adicionado ao mapa em LatLng(${centroid.lat}, ${centroid.lng}).`);

                            // Desenhar o círculo de cobertura como um polígono
                            const polygonCoordinates = window.PlanMilT.drawingGeometry.createCirclePolygon(centroid, radiusMeters);

                            const coveragePolygon = L.polygon(polygonCoordinates, {
                                color: '#FF0000',
                                fillColor: '#FF0000',
                                fillOpacity: 0.2,
                            }).bindPopup(`Cobertura de ${radiusKm} km`);

                            // Adicionar propriedades personalizadas ao polígono
                            coveragePolygon.feature = {
                                type: 'Feature',
                                properties: {
                                    shape: 'circle',
                                    center: [centroid.lat, centroid.lng],
                                    radius: radiusMeters,
                                    color: '#FF0000'
                                },
                                geometry: {
                                    type: 'Polygon',
                                    coordinates: [polygonCoordinates]
                                }
                            };

                            coverageLayer.addLayer(coveragePolygon);
                            coverageCircles.push(coveragePolygon); // Armazenar referência para verificação posterior
                            addToLog(`Círculo de cobertura desenhado como polígono em LatLng(${centroid.lat}, ${centroid.lng}).`);


                            // Marcar os ícones dentro da cobertura como cobertos
                            const iconsJustCovered = remainingIcons.filter(icon => {
                                const distance = calculateDistance(icon.latlng, centroid);
                                return distance <= radiusMeters;
                            });

                            iconsJustCovered.forEach(icon => {
                                coveredIcons.add(icon.marker._leaflet_id);
                                addToLog(`Ícone em LatLng(${icon.latlng.lat}, ${icon.latlng.lng}) está coberto pela cobertura central em LatLng(${centroid.lat}, ${centroid.lng}).`);
                            });

                            // Atualizar a lista de ícones restantes
                            remainingIcons = remainingIcons.filter(icon => !coveredIcons.has(icon.marker._leaflet_id));
                        }
                    }

                    // Iniciar a cobertura otimizada para cada cluster
                    for (let i = 0; i < clusters.length; i++) {
                        const cluster = clusters[i];

                        if (cluster.length === 0) {
                            console.warn(`Cluster ${i} está vazio. Pulando.`);
                            continue;
                        }

                        // Obter os ícones pertencentes a este cluster
                        const clusterIcons = cluster.map(index => iconsToCover[index]);

                        addToLog(`Processando Cluster ${i} com ${clusterIcons.length} ícones.`);

                        // Cobrir os ícones do cluster de forma otimizada
                        await coverIconsOptimally(clusterIcons);
                    }

                    addToLog('Tarefa concluída: Áreas de cobertura desenhadas.');
                }




















