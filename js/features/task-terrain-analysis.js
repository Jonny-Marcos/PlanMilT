/**
 * @fileoverview Localiza os pontos mais altos de uma área e disponibiliza elevações para o planejamento.
 * @requires Leaflet, serviço de elevação, seleção e dados da tarefa no escopo legado.
 */
                /**
                 * Localiza o ponto de maior elevação na área da tarefa.
                 * @param {Object} params - Parâmetros validados da tarefa.
                 */
                async function performFindHighestPoint(params) {
                    const iconLayerName = params.iconLayer;
                    const iconType = params.iconType;
                    const maxDistance = params.maxDistance * 1000; // Converter km para metros
                    const selectedIconUrl = params.iconToInsert;
                    let selectionArea = params.area;
                    const numberOfNewIcons = params.numberOfNewIcons; // Novo parâmetro
                    const maxDistanceBetweenNewIcons = params.maxDistanceBetweenNewIcons * 1000; // Converter km para metros

                    addToLog('Iniciando tarefa: Encontrar o ponto mais alto próximo a um ícone', params);
                    //addToLog(`Iniciando tarefa: Encontrar o ponto mais alto com parâmetros: ${JSON.stringify(params)}`);
                    //addToLog(`Parâmetros antes de executar performFindHighestPoint: ${JSON.stringify(params)}`);

                    // Obter a camada selecionada para buscar os ícones existentes
                    let iconLayer;
                    if (iconLayerName === 'drawnItems') {
                        iconLayer = drawnItems;
                    } else if (iconLayerName === 'planningSuggestions') {
                        iconLayer = planejamentoLayer;
                    } else {
                        addToLog('Erro: Camada de origem dos ícones inválida:', iconLayerName);
                        return;
                    }

                    // Se a área de seleção for nula, considerar os limites atuais do mapa
                    if (!selectionArea) {
                        selectionArea = map.getBounds();
                    }

                    // Obter todos os ícones do tipo especificado na camada selecionada dentro da área de seleção
                    const icons = [];
                    iconLayer.eachLayer(function(layer) {
                        if (layer instanceof L.Marker && layer.options.icon && layer.options.icon.options.iconUrl) {
                            const iconUrl = layer.options.icon.options.iconUrl;

                            let isInArea = false;
                            if (selectionArea instanceof L.LatLngBounds) {
                                isInArea = selectionArea.contains(layer.getLatLng());
                            } else if (selectionArea instanceof L.Polygon) {
                                isInArea = selectionArea.contains(layer.getLatLng());
                            }

                            if (iconUrl === iconType && isInArea) {
                                icons.push(layer);
                            }
                        }
                    });

                    if (icons.length === 0) {
                        addToLog(`Erro: Nenhum ícone do tipo ${iconType} encontrado na área selecionada.`);
                        return;
                    }

                    // Obter os limites da área de seleção
                    let bounds;
                    if (selectionArea instanceof L.LatLngBounds) {
                        bounds = selectionArea;
                    } else if (selectionArea instanceof L.Polygon) {
                        bounds = selectionArea.getBounds();
                    }



                    // Chamar a função para obter os dados de elevação
                    addToLog('Buscando dados de altura com limites:', bounds);

                    const elevationData = await fetchElevationData(bounds);

                    if (!elevationData) {
                        addToLog('Erro: Dados de elevação inválidos ou vazios.');
                        return;
                    }


                    // Para cada ícone, encontrar o ponto mais alto próximo
                    for (const icon of icons) {
                        const iconLatLng = icon.getLatLng();

                        // Filtrar pontos dentro da distância máxima e dentro da área de seleção
                        const nearbyPoints = elevationData.filter(point => {
                            const pointLatLng = L.latLng(point.lat, point.lon);
                            const distance = map.distance(iconLatLng, pointLatLng);

                            let isInArea = false;
                            if (selectionArea instanceof L.LatLngBounds) {
                                isInArea = selectionArea.contains(pointLatLng);
                            } else if (selectionArea instanceof L.Polygon) {
                                isInArea = selectionArea.contains(pointLatLng);
                            }

                            return distance <= maxDistance && isInArea;
                        });

                        if (nearbyPoints.length === 0) {
                            addToLog(`Erro: Nenhum ponto próximo encontrado para o ícone em ${iconLatLng}`);
                            continue;
                        }

                        // Encontrar o ponto com a maior elevação
                        const highestPoint = nearbyPoints.reduce((prev, current) => (prev.elevation > current.elevation) ? prev : current);

                        // Adicionar um marcador no ponto mais alto encontrado com o ícone selecionado
                        const marker = L.marker([highestPoint.lat, highestPoint.lon], {
                            icon: L.icon({
                                iconUrl: selectedIconUrl,
                                iconSize: [32, 32],
                                iconAnchor: [16, 32],
                                popupAnchor: [0, -32]
                            })
                        }).bindPopup(`Ponto mais alto próximo a ${iconType}<br>Elevação: ${highestPoint.elevation} metros`);

                        // Adiciona propriedades personalizadas
                        marker.feature = {
                            type: "Feature",
                            properties: {
                                folderName: "Sugestão de Planejamento",
                                name: "Ponto Mais Alto",
                                description: `Elevação: ${highestPoint.elevation} metros`,
                                iconUrl: selectedIconUrl,
                                color: "#FF0000"
                            }
                        };

                        planejamentoLayer.addLayer(marker);
                    }

                    // **Adiciona Novos Ícones**
                    if (params.numberOfNewIcons > 0) {

                        // Função para gerar posições aleatórias dentro dos limites da área de seleção
                        /**
                         * Gera uma posição aleatória dentro dos limites recebidos.
                         * @param {Object} bounds - Limites geográficos da área consultada.
                         */
                        function getRandomLatLng(bounds) {
                            const southWest = bounds.getSouthWest();
                            const northEast = bounds.getNorthEast();

                            const lat = southWest.lat + Math.random() * (northEast.lat - southWest.lat);
                            const lng = southWest.lng + Math.random() * (northEast.lng - southWest.lng);
                            return L.latLng(lat, lng);
                        }

                        const newIcons = [];

                        while (newIcons.length <= numberOfNewIcons-2) {
                            const randomLatLng = getRandomLatLng(bounds);

                            // Verifica se a nova posição está dentro da distância máxima de outros novos ícones
                            const tooClose = newIcons.some(existingIcon => {
                                const distance = map.distance(randomLatLng, existingIcon);
                                return distance < maxDistanceBetweenNewIcons;
                            });

                            if (!tooClose) {
                                newIcons.push(randomLatLng);
                            }

                            // Evita loops infinitos caso não seja possível encontrar posições adequadas
                            if (newIcons.length + (numberOfNewIcons - newIcons.length) > numberOfNewIcons * 10) {
                                addToLog('Erro: Não foi possível encontrar posições adequadas para todos os novos ícones.');
                                break;
                            }
                        }

                        // Adicionar os novos ícones ao mapa
                        newIcons.forEach(latlng => {
                            const newMarker = L.marker(latlng, {
                                icon: L.icon({
                                    iconUrl: selectedIconUrl,
                                    iconSize: [32, 32],
                                    iconAnchor: [16, 32],
                                    popupAnchor: [0, -32]
                                })
                            }).bindPopup(`Novo Ícone Adicionado<br>Coordenadas: ${latlng.lat.toFixed(5)}, ${latlng.lng.toFixed(5)}`);

                            // Adiciona propriedades personalizadas
                            newMarker.feature = {
                                type: "Feature",
                                properties: {
                                    folderName: "Sugestão de Planejamento",
                                    name: "Novo Ícone",
                                    description: `Coordenadas: ${latlng.lat.toFixed(5)}, ${latlng.lng.toFixed(5)}`,
                                    iconUrl: selectedIconUrl,
                                    color: "#00FF00"
                                }
                            };

                            planejamentoLayer.addLayer(newMarker);
                        });
                        Swal.close();
                        addToLog(`Tarefa concluída: ${newIcons.length} novos ícones adicionados ao mapa.`);
                    } else {
                        Swal.close();
                        addToLog('Tarefa concluída: Pontos mais altos adicionados ao mapa.');
                    }
                }


                // Função para executar a tarefa de colocar múltiplos ícones
