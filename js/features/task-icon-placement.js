/**
 * @fileoverview Calcula e posiciona ícones em uma área de seleção, usando elevação e espaçamento mínimo.
 * @requires Leaflet, dados de elevação, parâmetros da tarefa e drawnItems no escopo legado.
 */
                /**
                 * Distribui ícones na área segundo as regras e limites da tarefa.
                 * @param {Object} params - Parâmetros validados da tarefa.
                 */
                async function performPlaceIcons(params) {
                    const iconUrl = params.iconUrl;
                    const elevationMin = params.criteria;
                    const maxNumberOfIcons = params.maxNumberOfIcons;             // Novo parâmetro
                    const minDistanceBetweenIcons = params.minDistanceBetweenIcons; // Novo parâmetro
                    let selectionArea = params.area;

                    addToLog('Iniciando tarefa: Colocar múltiplos ícones', params);

                    // Se a área de seleção for nula, considerar os limites atuais do mapa
                    if (!selectionArea) {
                        selectionArea = map.getBounds();
                    }

                    // Obter os limites da área de seleção
                    let bounds;
                    if (selectionArea instanceof L.LatLngBounds) {
                        bounds = selectionArea;
                    } else if (selectionArea instanceof L.Polygon) {
                        bounds = selectionArea.getBounds();
                    }

                    try {
                        const elevationData = await fetchElevationData(bounds);

                        if (!elevationData) {
                            return;
                        }


                        if (!Array.isArray(elevationData) || elevationData.length === 0) {
                            await Swal.fire('Erro', 'Não foi possível obter os dados de elevação.', 'error');
                            console.error('Dados de elevação inválidos ou vazios.');
                            return;
                        }

                        Swal.close();

                        // Filtrar os pontos que atendem ao critério de elevação mínima e estão dentro da área de seleção
                        const suitablePoints = elevationData.filter(point => {
                            let isInArea = false;
                            const pointLatLng = L.latLng(point.lat, point.lon);

                            if (selectionArea instanceof L.LatLngBounds) {
                                isInArea = selectionArea.contains(pointLatLng);
                            } else if (selectionArea instanceof L.Polygon) {
                                isInArea = selectionArea.contains(pointLatLng);
                            }

                            return point.elevation >= elevationMin && isInArea;
                        });

                        if (suitablePoints.length === 0) {
                            addToLog('Erro: Nenhum ponto atende ao critério de elevação mínima na área selecionada.');
                            return;
                        }

                        // Ordenar os pontos por elevação descendente para priorizar os mais altos
                        suitablePoints.sort((a, b) => b.elevation - a.elevation);

                        // Limitar a quantidade de ícones conforme o parâmetro
                        const pointsToPlace = suitablePoints.slice(0, maxNumberOfIcons);

                        // Array para armazenar as coordenadas dos ícones já inseridos
                        const placedIcons = [];

                        for (const point of pointsToPlace) {
                            const pointLatLng = L.latLng(point.lat, point.lon);

                            // Verificar a distância mínima entre os ícones já colocados
                            const tooClose = placedIcons.some(existingLatLng => {
                                const distance = map.distance(existingLatLng, pointLatLng);
                                return distance < minDistanceBetweenIcons;
                            });

                            if (tooClose) {
                                console.warn(`Ícone em ${pointLatLng} está muito próximo de outro ícone já inserido. Ignorado.`);
                                continue;
                            }

                            // Adicionar o ícone no mapa
                            const marker = L.marker([point.lat, point.lon], {
                                icon: L.icon({
                                    iconUrl: iconUrl,
                                    iconSize: [32, 32],
                                    iconAnchor: [16, 32],
                                    popupAnchor: [0, -32]
                                })
                            }).bindPopup(`Ícone inserido<br>Elevação: ${point.elevation} metros`);

                            // Adiciona propriedades personalizadas
                            marker.feature = {
                                type: "Feature",
                                properties: {
                                    folderName: "Sugestão de Planejamento",
                                    name: `Ícone Inserido`,
                                    description: `Elevação: ${point.elevation} metros`,
                                    iconUrl: iconUrl,
                                    color: "#FF0000"
                                }
                            };

                            planejamentoLayer.addLayer(marker);
                            placedIcons.push(pointLatLng); // Atualizar a lista de coordenadas
                        }

                        // Verificar se todos os ícones solicitados foram inseridos
                        const iconsPlaced = placedIcons.length;
                        if (iconsPlaced < maxNumberOfIcons) {
                            addToLog(`Apenas ${iconsPlaced} ícones foram inseridos devido às restrições de distância.`);
                        } else {
                            addToLog(`Tarefa concluída: ${iconsPlaced} ícones adicionados ao mapa.`);
                        }

                    } catch (error) {
                        console.error('Erro ao processar a tarefa:', error);
                        await Swal.fire('Erro', 'Ocorreu um erro ao processar a tarefa.', 'error');
                    }
                }



                // Função para executar a tarefa de desenhar linhas entre ícones do mesmo tipo
