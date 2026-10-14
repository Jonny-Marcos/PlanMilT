/**
 * @fileoverview Cria linhas entre ícones e conecta conjuntos de ícones segundo os parâmetros da tarefa.
 * @requires Leaflet, Turf, ícones, parâmetros e drawnItems no escopo legado.
 */
                /**
                 * Cria linhas entre ícones de acordo com os parâmetros da tarefa.
                 * @param {Object} params - Parâmetros validados da tarefa.
                 */
                async function performDrawLinesBetweenIcons(params) {
                    const iconType = params.iconType;
                    const maxDistance = params.maxDistance * 1000; // Converter km para metros
                    const maxConnectionsPerIcon = params.maxConnectionsPerIcon; // Novo parâmetro
                    const minDistanceBetweenLines = params.minDistanceBetweenLines; // Novo parâmetro
                    let selectionArea = params.area; // Pode ser nulo

                    addToLog('Iniciando tarefa: Desenhar linhas entre ícones', params);

                    // Obter a camada selecionada para buscar os ícones existentes
                    let iconLayer;
                    if (params.iconLayer === 'drawnItems') {
                        iconLayer = drawnItems;
                    } else if (params.iconLayer === 'planningSuggestions') {
                        iconLayer = planejamentoLayer;
                    } else {
                        await Swal.fire('Erro', 'Camada de origem dos ícones inválida.', 'error');
                        console.error('Camada de origem dos ícones inválida:', params.iconLayer);
                        return;
                    }

                    // Se a área de seleção for nula, considerar os limites atuais do mapa
                    if (!selectionArea) {
                        selectionArea = map.getBounds(); // Agora é um L.LatLngBounds
                    }

                    // Obter todos os ícones do tipo especificado dentro da área selecionada
                    const icons = [];
                    iconLayer.eachLayer(function(layer) {
                        if (layer instanceof L.Marker && layer.options.icon && layer.options.icon.options.iconUrl) {

                            const iconUrl = layer.options.icon.options.iconUrl;
                            //const iconNameWithExtension = iconUrl.substring(iconUrl.lastIndexOf('/') + 1);
                            //const iconName = iconNameWithExtension.split('.')[0]; // Remove a extensão do arquivo

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

                    if (icons.length < 2) {
                        addToLog(`Erro: Não há ícones suficientes do tipo ${iconType} na área selecionada para desenhar linhas.`);
                        return;
                    }

                    // Criar todas as combinações possíveis de pares de ícones
                    const potentialLines = [];
                    for (let i = 0; i < icons.length; i++) {
                        for (let j = i + 1; j < icons.length; j++) {
                            const latlng1 = icons[i].getLatLng();
                            const latlng2 = icons[j].getLatLng();
                            const distance = map.distance(latlng1, latlng2);

                            if (distance <= maxDistance) {
                                potentialLines.push({
                                    from: icons[i],
                                    to: icons[j],
                                    distance
                                });
                            }
                        }
                    }

                    if (potentialLines.length === 0) {
                        addToLog(`Erro: Nenhuma conexão encontrada entre ícones do tipo ${iconType} dentro da distância máxima especificada.`);
                        return;
                    }

                    // Ordenar as linhas potenciais pela distância (opcional, para priorizar conexões mais próximas)
                    potentialLines.sort((a, b) => a.distance - b.distance);

                    // Controle de conexões por ícone
                    const connectionCount = {};
                    icons.forEach(icon => {
                        connectionCount[icon._leaflet_id] = 0;
                    });

                    // Lista de linhas já desenhadas para verificar a distância mínima entre elas
                    const linesDrawn = [];

                    for (const line of potentialLines) {
                        const fromId = line.from._leaflet_id;
                        const toId = line.to._leaflet_id;

                        // Verificar se os ícones já atingiram o número máximo de conexões
                        if (connectionCount[fromId] >= maxConnectionsPerIcon || connectionCount[toId] >= maxConnectionsPerIcon) {
                            continue;
                        }

                        // Criar uma linha temporária para verificar a distância mínima com linhas já desenhadas
                        const tempPolyline = L.polyline([line.from.getLatLng(), line.to.getLatLng()]);
                        let isTooClose = false;

                        for (const existingLine of linesDrawn) {
                            // Verificar se as linhas compartilham algum ícone comum
                            const existingLatLngs = existingLine.getLatLngs();
                            const existingFrom = existingLatLngs[0];
                            const existingTo = existingLatLngs[1];
                            const newFrom = line.from.getLatLng();
                            const newTo = line.to.getLatLng();

                            const shareFrom = (existingFrom.lat === newFrom.lat && existingFrom.lng === newFrom.lng) ||
                                  (existingFrom.lat === newTo.lat && existingFrom.lng === newTo.lng);
                            const shareTo = (existingTo.lat === newFrom.lat && existingTo.lng === newFrom.lng) ||
                                  (existingTo.lat === newTo.lat && existingTo.lng === newTo.lng);

                            if (shareFrom || shareTo) {
                                // Linhas compartilham um ícone comum, não verificar distância mínima entre elas
                                continue;
                            }

                            // Calcular a distância mínima entre as duas polilinhas
                            const distance = polylineDistance(tempPolyline, existingLine);
                            if (distance < minDistanceBetweenLines) {
                                isTooClose = true;
                                break;
                            }
                        }

                        if (isTooClose) {
                            continue;
                        }

                        // Desenhar a linha entre os ícones
                        const polyline = L.polyline([line.from.getLatLng(), line.to.getLatLng()], { color: 'blue' });
                        polyline.addTo(planejamentoLayer);

                        // Adicionar propriedades personalizadas
                        polyline.feature = {
                            type: "Feature",
                            properties: {
                                folderName: "Sugestão de Planejamento",
                                name: "Linha entre Ícones",
                                description: `Linha entre ${iconType}`,
                                color: "#0000FF"
                            }
                        };

                        // Atualizar contagem de conexões
                        connectionCount[fromId]++;
                        connectionCount[toId]++;

                        // Adicionar a linha à lista de linhas desenhadas
                        linesDrawn.push(polyline);
                    }

                    // Função para calcular a distância mínima entre duas polilinhas
                    /**
                     * Calcula a distância entre os pontos representativos de duas linhas.
                     * @param {Object} polyline1 - Primeira polilinha Leaflet.
                     * @param {Object} polyline2 - Segunda polilinha Leaflet.
                     */
                    function polylineDistance(polyline1, polyline2) {
                        const latlngs1 = polyline1.getLatLngs();
                        const latlngs2 = polyline2.getLatLngs();
                        let minDistance = Infinity;

                        latlngs1.forEach((latlng1) => {
                            latlngs2.forEach((latlng2) => {
                                const distance = map.distance(latlng1, latlng2);
                                if (distance < minDistance) {
                                    minDistance = distance;
                                }
                            });
                        });

                        return minDistance;
                    }

                    addToLog(`Tarefa concluída: ${linesDrawn.length} linhas desenhadas entre ícones do tipo ${iconType}.`);
                }



                // Função para executar a tarefa de conectar ícones diferentes com linhas
                /**
                 * Conecta grupos de ícones diferentes segundo a configuração recebida.
                 * @param {Object} params - Parâmetros validados da tarefa.
                 */
                async function performConnectDifferentIcons(params) {
                    const iconLayerName = params.iconLayer;
                    const iconType1 = params.iconType1;
                    const iconType2 = params.iconType2;
                    const maxDistance = params.maxDistance * 1000; // Converter km para metros
                    const maxConnectionsSource = params.maxConnectionsSource;
                    const maxConnectionsTarget = params.maxConnectionsTarget;
                    const connectionCriterion = params.connectionCriterion; // 'closest' ou 'farthest'
                    let selectionArea = params.area;

                    addToLog('Iniciando tarefa: Conectar ícones diferentes com linhas', params);

                    // Obter a camada selecionada para buscar os ícones existentes
                    let iconLayer;
                    if (iconLayerName === 'drawnItems') {
                        iconLayer = drawnItems;
                    } else if (iconLayerName === 'planningSuggestions') {
                        iconLayer = planejamentoLayer;
                    } else {
                        await Swal.fire('Erro', 'Camada de origem dos ícones inválida.', 'error');
                        console.error('Camada de origem dos ícones inválida:', iconLayerName);
                        return;
                    }

                    // Se a área de seleção for nula, considerar os limites atuais do mapa
                    if (!selectionArea) {
                        selectionArea = map.getBounds();
                    }

                    // Obter os ícones do tipo 1 (ícones fonte)
                    const icons1 = [];
                    iconLayer.eachLayer(function(layer) {
                        if (layer instanceof L.Marker && layer.options.icon && layer.options.icon.options.iconUrl) {

                            const iconUrl = layer.options.icon.options.iconUrl;
                            //const iconNameWithExtension = iconUrl.substring(iconUrl.lastIndexOf('/') + 1);
                            //const iconName = iconNameWithExtension.split('.')[0];

                            let isInArea = false;
                            if (selectionArea instanceof L.LatLngBounds) {
                                isInArea = selectionArea.contains(layer.getLatLng());
                            } else if (selectionArea instanceof L.Polygon) {
                                isInArea = selectionArea.contains(layer.getLatLng());
                            }

                            if (iconUrl === iconType1 && isInArea) {
                                icons1.push(layer);
                            }
                        }
                    });

                    // Obter os ícones do tipo 2 (ícones alvo)
                    const icons2 = [];
                    iconLayer.eachLayer(function(layer) {
                        if (layer instanceof L.Marker && layer.options.icon && layer.options.icon.options.iconUrl) {

                            const iconUrl = layer.options.icon.options.iconUrl;
                            //const iconNameWithExtension = iconUrl.substring(iconUrl.lastIndexOf('/') + 1);
                            //const iconName = iconNameWithExtension.split('.')[0];

                            let isInArea = false;
                            if (selectionArea instanceof L.LatLngBounds) {
                                isInArea = selectionArea.contains(layer.getLatLng());
                            } else if (selectionArea instanceof L.Polygon) {
                                isInArea = selectionArea.contains(layer.getLatLng());
                            }

                            if (iconUrl === iconType2 && isInArea) {
                                icons2.push(layer);
                            }
                        }
                    });

                    if (icons1.length === 0 || icons2.length === 0) {
                        addToLog('Erro: Não há ícones suficientes para conectar os ícones.');
                        return;
                    }

                    // Mapear quantas conexões cada ícone alvo já recebeu
                    const targetIconConnections = new Map();

                    const linesDrawn = [];

                    // Para cada ícone fonte (icon1), encontrar ícones alvo (icon2) dentro da distância máxima
                    for (let i = 0; i < icons1.length; i++) {
                        const icon1 = icons1[i];
                        const icon1LatLng = icon1.getLatLng();

                        // Lista de potenciais ícones alvo com a distância
                        const potentialTargets = [];

                        for (let j = 0; j < icons2.length; j++) {
                            const icon2 = icons2[j];
                            const icon2LatLng = icon2.getLatLng();
                            const distance = map.distance(icon1LatLng, icon2LatLng);

                            if (distance <= maxDistance) {
                                potentialTargets.push({
                                    icon: icon2,
                                    distance: distance
                                });
                            }
                        }

                        if (potentialTargets.length === 0) {
                            continue; // Nenhum ícone alvo dentro da distância máxima
                        }

                        // Ordenar os potenciais alvos de acordo com o critério
                        if (connectionCriterion === 'closest') {
                            potentialTargets.sort((a, b) => a.distance - b.distance); // Mais próximos primeiro
                        } else if (connectionCriterion === 'farthest') {
                            potentialTargets.sort((a, b) => b.distance - a.distance); // Mais distantes primeiro
                        }

                        // Conectar com até maxConnectionsSource ícones alvo
                        let connectionsMade = 0;

                        for (let k = 0; k < potentialTargets.length && connectionsMade < maxConnectionsSource; k++) {
                            const target = potentialTargets[k];
                            const icon2 = target.icon;

                            // Verificar se o ícone alvo não ultrapassou o máximo de conexões
                            const icon2Id = L.stamp(icon2); // ID único para cada layer
                            const icon2Connections = targetIconConnections.get(icon2Id) || 0;

                            if (icon2Connections < maxConnectionsTarget) {
                                // Desenhar linha entre icon1 e icon2
                                const polyline = L.polyline([icon1LatLng, icon2.getLatLng()], { color: 'green' });
                                polyline.addTo(planejamentoLayer);

                                // Adicionar propriedades personalizadas
                                polyline.feature = {
                                    type: "Feature",
                                    properties: {
                                        folderName: "Sugestão de Planejamento",
                                        name: "Linha entre Ícones Diferentes",
                                        description: `Linha entre ${iconType1} e ${iconType2}`,
                                        color: "#00FF00"
                                    }
                                };

                                linesDrawn.push(polyline);

                                // Atualizar contador de conexões
                                targetIconConnections.set(icon2Id, icon2Connections + 1);

                                connectionsMade++;
                            }
                        }
                    }

                    addToLog(`Tarefa concluída: ${linesDrawn.length} linhas desenhadas entre ícones diferentes.`);
                }

                // Função para executar a tarefa de desenhar áreas de cobertura otimizadas
