/**
 * @fileoverview Gerencia camadas WMS dinâmicas, camadas compartilhadas atualizáveis e consulta GetFeatureInfo.
 * @requires Leaflet, proxy.php, API client, mapa e layerRegistry no escopo legado.
 */
                var selectedLayers = []; // Agora é um array para armazenar múltiplos usuários
                var intervalId;     // Variável para armazenar o intervalo de atualização
                var layerRegistry = {}; // Para garantir que as camadas estejam registradas corretamente
                var previousGeoJsonData = {}; // Para armazenar o estado anterior da camada carregada

                // Função para gerar um hash de um objeto GeoJSON
                /**
                 * Cria a representação usada para detectar mudanças no GeoJSON.
                 * @param {Object} geoJsonObject - Objeto GeoJSON a validar ou comparar.
                 */
                function generateGeoJsonHash(geoJsonObject) {
                    return JSON.stringify(geoJsonObject);  // Pode usar uma função de hash mais sofisticada, se necessário
                }

                /**
                 * Recarrega as camadas selecionadas e substitui as versões que mudaram.
                 */
                async function reloadLayer() {
                    if (!selectedLayers || selectedLayers.length === 0) {
                        Swal.fire('Nenhum usuário fornecido!', 'Por favor, insira pelo menos um nome de usuário para carregar a camada.', 'warning');
                        return;
                    }

                    for (const layerName of selectedLayers) {
                        try {
                            const response = await window.PlanMilT.apiClient.request("/carregar.php", {
                                method: "POST",
                                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                                body: `usuario=${encodeURIComponent(layerName)}`
                            });

                            if (!response.ok) {
                                const errorMessage = await response.text();
                                Swal.fire('Erro no servidor', `Erro ao carregar o usuário ${layerName}: ${errorMessage}`, 'error');
                                continue; // Pula para o próximo usuário
                            }

                            const geoJsonData = await response.json();

                            if (!isValidGeoJson(geoJsonData)) {
                                const errorMessage = typeof geoJsonData === 'string' ? geoJsonData : 'A camada carregada não é um GeoJSON válido.';
                                Swal.fire('Erro', `Erro no usuário ${layerName}: ${errorMessage}`, 'error');
                                continue; // Pula para o próximo usuário
                            }

                            const currentGeoJsonHash = generateGeoJsonHash(geoJsonData);

                            if (currentGeoJsonHash !== previousGeoJsonData[layerName]) {
                                // Se houver mudanças, remover a camada anterior
                                if (layerRegistry[layerName]) {
                                    map.removeLayer(layerRegistry[layerName]);
                                    layerControl.removeLayer(layerRegistry[layerName]); // Remove a camada do controle de camadas
                                    delete layerRegistry[layerName];  // Remove do registro
                                }

                                // Processar os dados do GeoJSON e adicionar ao mapa como camada não-editável
                                const newLayer = L.geoJson(null);

                                L.geoJson(geoJsonData, {
                                    onEachFeature: function (feature, layer) {
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
                                            newLayer.addLayer(newCircle);
                                        } else if (feature.properties.text && feature.geometry.type === 'Point' && !feature.properties.iconUrl) {
                                            var customIcon = L.divIcon({
                                                className: 'custom-text-label',
                                                html: feature.properties.text,
                                                iconSize: [100, 30],
                                                iconAnchor: [15, 15]
                                            });
                                            layer.setIcon(customIcon);
                                            newLayer.addLayer(layer);
                                        } else if (feature.geometry.type === 'Point' && feature.properties.iconUrl) {
                                            var customIcon = L.icon({
                                                iconUrl: feature.properties.iconUrl,
                                                iconSize: [40, 40],
                                                iconAnchor: [15, 15]
                                            });
                                            layer.setIcon(customIcon);
                                            newLayer.addLayer(layer);
                                        } else if (feature.geometry.type === 'LineString' || feature.geometry.type === 'Polygon') {
                                            layer.setStyle({ color: feature.properties.color });
                                            newLayer.addLayer(layer);
                                        }
                                    }
                                });

                                // Atualiza o estado anterior com o novo hash do GeoJSON
                                previousGeoJsonData[layerName] = currentGeoJsonHash;

                                // Adiciona a nova camada ao controle de camadas existente
                                addNewOverlayLayer(layerName, newLayer);

                                // Registra a camada no registry e adiciona ao mapa
                                layerRegistry[layerName] = newLayer;
                                map.addLayer(newLayer);

                                // Exibir popup informando que a camada foi atualizada
                                Swal.fire('Camada Atualizada!', `A camada "${layerName}" foi atualizada com sucesso.`, 'info');
                            }

                        } catch (error) {
                            console.error(`Erro ao atualizar a camada para o usuário ${layerName}:`, error);
                        }
                    }
                }


                // Função para verificar se o objeto é um GeoJSON válido
                /**
                 * Verifica se o objeto tem a estrutura mínima esperada de GeoJSON.
                 * @param {Object} geoJsonObject - Objeto GeoJSON a validar ou comparar.
                 */
                function isValidGeoJson(geoJsonObject) {
                    return geoJsonObject && typeof geoJsonObject === 'object' &&
                        (geoJsonObject.type === 'Feature' || geoJsonObject.type === 'FeatureCollection') &&
                        (geoJsonObject.type === 'FeatureCollection' ? geoJsonObject.features && Array.isArray(geoJsonObject.features) : true);
                }

                // Função para solicitar os nomes dos usuários e configurar o tempo de atualização
                /**
                 * Solicita usuários e intervalo para recarregar camadas periodicamente.
                 */
                function promptUserAndUpdate() {
                    Swal.fire({
                        title: 'Nome(s) de usuário(s)',
                        input: 'text',
                        inputLabel: 'Insira o nome do usuário. Caso existam mais de um, separe os nomes com vírgula. Exemplo: "sca,ge".',
                        inputPlaceholder: 'teste,teste2',
                        showCancelButton: true,
                        confirmButtonText: 'Carregar Camada(s)',
                        preConfirm: (usernameInput) => {
                            if (!usernameInput) {
                                Swal.showValidationMessage('Por favor, insira pelo menos um nome de usuário válido.');
                                return false;
                            }
                            const usernames = usernameInput.split(',').map(name => name.trim()).filter(name => name !== '');
                            if (usernames.length === 0) {
                                Swal.showValidationMessage('Por favor, insira pelo menos um nome de usuário válido.');
                                return false;
                            }
                            return usernames;
                        }
                    }).then((result) => {
                        if (result.isConfirmed) {
                            selectedLayers = result.value;

                            // Solicitar o intervalo de atualização
                            Swal.fire({
                                title: 'Configurar Intervalo de Atualização',
                                input: 'number',
                                inputLabel: 'Intervalo em segundos:',
                                inputPlaceholder: 'Digite o número de segundos',
                                showCancelButton: true,
                                confirmButtonText: 'Iniciar',
                                cancelButtonText: 'Cancelar',
                                preConfirm: (value) => {
                                    const seconds = parseInt(value, 10);
                                    if (isNaN(seconds) || seconds <= 0) {
                                        Swal.showValidationMessage('Por favor, insira um valor válido.');
                                        return false;
                                    }
                                    startAutoReload(seconds);  // Iniciar a atualização automática com o intervalo fornecido
                                }
                            });
                        }
                    });
                }


                // Função para configurar o intervalo de atualização
                /**
                 * Inicia ou reinicia a atualização periódica de camadas.
                 * @param {number} seconds - Intervalo de atualização em segundos.
                 */
                function startAutoReload(seconds) {
                    if (intervalId) {
                        clearInterval(intervalId);  // Limpa o intervalo anterior, se existir
                    }

                    intervalId = setInterval(reloadLayer, seconds * 1000);  // Define o intervalo de atualização
                    document.getElementById('startUpdateButton').style.color = 'green';  // Altera a cor do ícone
                }

                // Event listener para o botão de iniciar a atualização periódica
                document.getElementById('startUpdateButton').addEventListener('click', promptUserAndUpdate);








                document.getElementById('addLayerButton').addEventListener('click', function() {
                    getSigsData().then(sigsData => {
                        if (sigsData.length === 0) return;

                        var inputOptions = {};
                        var nomeToURL = {};
                        sigsData.forEach(item => {
                            inputOptions[item.Nome] = item.Nome;
                            nomeToURL[item.Nome] = item.URL;
                        });

                        // Ordena os SIGs em ordem alfabética
                        var sigNames = Object.keys(inputOptions).sort(function(a, b) {
                            return a.localeCompare(b, 'pt-BR', { sensitivity: 'base' });
                        });

                        var sortedInputOptions = {};
                        sigNames.forEach(nome => {
                            sortedInputOptions[nome] = inputOptions[nome];
                        });

                        Swal.fire({
                            title: 'Selecione o SIG',
                            input: 'select',
                            inputOptions: sortedInputOptions,
                            inputPlaceholder: 'Selecione um SIG',
                            showCancelButton: true,
                        }).then((result) => {
                            if (result.isConfirmed) {
                                var selectedNome = result.value;
                                var selectedURL = nomeToURL[selectedNome];

                                getWMSLayers(selectedURL).then(layers => {
                                    if (!layers || layers.length === 0) return;

                                    var inputOptions = {};
                                    var layerOptions = {};

                                    layers.forEach(layer => {
                                        layerOptions[layer.Name] = layer.Title || layer.Name;
                                    });

                                    // Cria um array de opções ordenadas
                                    var optionsArray = layers.map(layer => ({
                                        value: layer.Name,
                                        text: layer.Title || layer.Name
                                    }));

                                    // Constrói o objeto de opções
                                    optionsArray.forEach(option => {
                                        inputOptions[option.value] = option.text;
                                    });

                                    Swal.fire({
                                        title: 'Selecione a Camada',
                                        input: 'select',
                                        inputOptions: inputOptions,
                                        inputPlaceholder: 'Selecione uma Camada',
                                        showCancelButton: true,
                                    }).then((layerResult) => {
                                        if (layerResult.isConfirmed) {
                                            var selectedLayerName = layerResult.value;
                                            var selectedLayerTitle = layerOptions[selectedLayerName];

                                            addWMSLayerToMap(selectedURL, selectedLayerName, selectedLayerTitle);
                                        }
                                    });
                                });
                            }
                        });
                    });
                });





                document.getElementById('removeLayerButton').addEventListener('click', function() {
                    var layerOptions = {};
                    Object.keys(layerRegistry).forEach(layerName => {
                        layerOptions[layerName] = layerName;
                    });

                    if (Object.keys(layerOptions).length === 0) {
                        Swal.fire('Aviso', 'Não há camadas para remover.', 'info');
                        return;
                    }

                    Swal.fire({
                        title: 'Selecione a Camada para Remover',
                        input: 'select',
                        inputOptions: layerOptions,
                        inputPlaceholder: 'Selecione uma Camada',
                        showCancelButton: true,
                    }).then((result) => {
                        if (result.isConfirmed) {
                            var selectedLayerName = result.value;
                            var layer = layerRegistry[selectedLayerName];
                            if (layer) {
                                map.removeLayer(layer); // Remove a camada do mapa
                                layerControl.removeLayer(layer); // Remove a camada do controle de camadas
                                delete layerRegistry[selectedLayerName]; // Remove a camada do registro
                            }
                        }
                    });
                });


                map.on('click', function(e) {
                    var latlng = e.latlng;
                    getFeatureInfoAtPoint(latlng);
                });

                /**
                 * Consulta camadas WMS ativas no ponto clicado e abre o popup de resultado.
                 * @param {*} latlng - Coordenada geográfica Leaflet.
                 */
                function getFeatureInfoAtPoint(latlng) {
                    // Definir as camadas a serem ignoradas
                    const excludedLayers = [
                        layerRegistry["OpenTopo"],
                        layerRegistry["Google Satellite"],
                        layerRegistry["Infraestruturas"],
                        layerRegistry["Quadrículas - UTM"],
                        layerRegistry["BDGEx - CTM50"],
                        layerRegistry["Sugestão de Planejamento"]
                    ];

                    // Obter as camadas WMS ativas, excluindo as camadas ignoradas
                    var activeWMSLayers = [];
                    map.eachLayer(function(layer) {
                        // Verifica se a camada é uma WMS, está ativa no mapa e não está na lista de exclusão
                        if (layer instanceof L.TileLayer.WMS && map.hasLayer(layer) && !excludedLayers.includes(layer)) {
                            activeWMSLayers.push(layer);
                        }
                    });

                    if (activeWMSLayers.length === 0) {
                        return; // Nenhuma camada WMS ativa que não está na lista de exclusão
                    }

                    activeWMSLayers.forEach(function(layer) {
                        var wmsURL = layer._url;
                        var layerNames = layer.wmsParams.layers;

                        var point = map.latLngToContainerPoint(latlng, map.getZoom());
                        var size = map.getSize();

                        var params = {
                            service: 'WMS',
                            request: 'GetFeatureInfo',
                            srs: 'EPSG:4326',
                            styles: '',
                            transparent: true,
                            version: '1.1.1',
                            format: 'image/png',
                            bbox: map.getBounds().toBBoxString(),
                            height: size.y,
                            width: size.x,
                            layers: layerNames,
                            query_layers: layerNames,
                            info_format: 'text/html', // ou 'applicationjson', dependendo do servidor
                            x: Math.round(point.x),
                            y: Math.round(point.y)
                        };

                        // Constrói a string de parâmetros
                        var paramsString = L.Util.getParamString(params, null, true); // O segundo parâmetro é 'null', e o terceiro 'true' para upperCase

                        // Constrói a URL completa do GetFeatureInfo
                        var fullURL = wmsURL + paramsString;

                        // Codifica a URL completa e a passa para o proxy.php
                        var proxyURL = '/proxy.php?url=' + encodeURIComponent(fullURL);

                        window.PlanMilT.apiClient.request(proxyURL)
                            .then(function(response) {
                            return response.text();
                        })
                            .then(function(data) {
                            const mensagemIgnorar = "received wms getfeatureinfo request for unqueryable".toLowerCase();
                            if (data && !data.trim().toLowerCase().includes(mensagemIgnorar)) {
                                // Exibir o popup no mapa com opções personalizadas
                                L.popup({
                                    maxWidth: 500, // Define a largura máxima do popup
                                    minWidth: 200, // Define a largura mínima do popup
                                    closeButton: true, // Exibe o botão de fechar
                                    autoPan: true, // Pan automaticamente para exibir o popup completamente
                                    className: 'custom-popup' // Adiciona uma classe personalizada para o popup
                                })
                                    .setLatLng(latlng)
                                    .setContent('<div class="popup-content">' + data + '</div>')
                                    .openOn(map);
                            }
                        })
                            .catch(function(error) {
                            console.error('Erro ao obter GetFeatureInfo:', error);
                        });

                    });
                }
