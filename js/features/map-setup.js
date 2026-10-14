window.PlanMilT = window.PlanMilT || {};

window.PlanMilT.mapSetup = Object.freeze({
    attach({ map, leaflet }) {
        const L = leaflet;

            map.createPane('pane_OpenTopo_0');
            map.getPane('pane_OpenTopo_0').style.zIndex = 100;
            var layer_OpenTopo_0 = L.tileLayer('https://tile.opentopomap.org/{z}/{x}/{y}.png', {
                pane: 'pane_OpenTopo_0',
                opacity: 1.0,
                attribution: '',
                minZoom: 1,
                maxZoom: 28,
                minNativeZoom: 0,
                maxNativeZoom: 18
            });
            layer_OpenTopo_0;
            map.addLayer(layer_OpenTopo_0);
            map.createPane('pane_GoogleSatellite_1');
            map.getPane('pane_GoogleSatellite_1').style.zIndex = 101;
            var layer_GoogleSatellite_1 = L.tileLayer('https://mt0.google.com/vt/lyrs=s&hl=en&x={x}&y={y}&z={z}', {
                pane: 'pane_GoogleSatellite_1',
                opacity: 1.0,
                attribution: '',
                minZoom: 1,
                maxZoom: 28,
                minNativeZoom: 0,
                maxNativeZoom: 18
            });
            layer_GoogleSatellite_1;
            map.addLayer(layer_GoogleSatellite_1);


            map.createPane('pane_BDGEx_2');
            map.getPane('pane_BDGEx_2').style.zIndex = 104;
            var layer_BDGEx_2 = L.tileLayer.wms('https://bdgex.eb.mil.br/mapcache', {
                layers: 'ctm50',
                format: 'image/png',
                transparent: true,
                version: '1.1.1',
                tileSize: 96,
                crs: L.CRS.EPSG4326, // Ajustado para usar EPSG:4326
                dpiMode: 7,
                tileMatrixSet: 'ctm50-wmsc-2'
            });

            map.addLayer(layer_BDGEx_2);


            // Crie um pane para a camada OpenInfraMap
            map.createPane('pane_OpenInfraMap');
            map.getPane('pane_OpenInfraMap').style.zIndex = 1100; // Ajuste o zIndex conforme necessário

            // Defina a camada OpenInfraMap usando vector tiles
            var openInfraMapLayer = L.vectorGrid.protobuf('https://openinframap.org/tiles/{z}/{x}/{y}.pbf', {
                pane: 'pane_OpenInfraMap',
                minZoom: 2,
                maxZoom: 17,
                interactive: true, // Torna os elementos interativos
                rendererFactory: L.svg.tile, // Use o renderizador SVG
                vectorTileLayerStyles: {
                    // Linhas de energia
                    power_line: {
                        color: 'orange',
                        weight: 2,
                        opacity: 1.0,
                        interactive: true, // Adicionado
                    },
                    // Torres de energia
                    power_tower: {
                        fill: true,
                        fillColor: 'black',
                        fillOpacity: 1,
                        radius: 3,
                        interactive: true, // Adicionado
                    },
                    // Subestações
                    power_substation: {
                        fill: true,
                        fillColor: 'red',
                        fillOpacity: 0.8,
                        radius: 5,
                        interactive: true, // Adicionado
                    },
                    // Plantas de energia
                    power_plant: {
                        fill: true,
                        fillColor: 'green',
                        fillOpacity: 0.8,
                        radius: 5,
                        interactive: true, // Adicionado
                    },
                    // Geradores
                    power_generator: {
                        fill: true,
                        fillColor: 'blue',
                        fillOpacity: 0.8,
                        radius: 4,
                        interactive: true, // Adicionado
                    },
                    // Linhas de telecomunicação
                    telecoms_communication_line: {
                        color: 'purple',
                        weight: 2,
                        opacity: 1.0,
                        interactive: true, // Adicionado
                    },
                    // Masts de telecomunicação
                    telecoms_mast: {
                        fill: true,
                        fillColor: 'magenta',
                        fillOpacity: 0.8,
                        radius: 3,
                        interactive: true, // Adicionado
                    },
                    // Tubulações de petróleo
                    petroleum_pipeline: {
                        color: 'brown',
                        weight: 2,
                        opacity: 1.0,
                        interactive: true, // Adicionado
                    },
                    // Poços de petróleo
                    petroleum_well: {
                        fill: true,
                        fillColor: 'black',
                        fillOpacity: 1,
                        radius: 3,
                        interactive: true, // Adicionado
                    },
                    // Sites de petróleo
                    petroleum_site: {
                        fill: true,
                        fillColor: 'gray',
                        fillOpacity: 0.8,
                        radius: 5,
                        interactive: true, // Adicionado
                    },
                    // Tubulações de água
                    water_pipeline: {
                        color: 'blue',
                        weight: 2,
                        opacity: 0.7,
                        interactive: true, // Adicionado
                    },
                }
            });
            map.addLayer(openInfraMapLayer);

            // Inicializa a camada composta para as quadrículas UTM do Brasil
            var utmGrids = L.layerGroup();

            // Adiciona cada zona UTM à camada composta
            utmGrids.addLayer(L.utmGrid(19, true, {
                color: '#080',
                showAxisLabels: [100, 1000, 10000, 100000],
                showSquareLabels: [100000], // label 100km grid squares
                showAxis100km: true
            }));
            utmGrids.addLayer(L.utmGrid(20, true, {
                color: '#800',
                showAxisLabels: [100, 1000, 10000, 100000],
                showSquareLabels: [100000], // label 100km grid squares
                showAxis100km: true
            }));
            utmGrids.addLayer(L.utmGrid(21, true, {
                color: '##880',
                showAxisLabels: [100, 1000, 10000, 100000],
                showSquareLabels: [100000], // label 100km grid squares
                showAxis100km: true
            }));
            utmGrids.addLayer(L.utmGrid(22, true, {
                color: '#008',
                showAxisLabels: [100, 1000, 10000, 100000],
                showSquareLabels: [100000], // label 100km grid squares
                showAxis100km: true
            }));

            utmGrids.addLayer(L.utmGrid(23, true, {
                color: '#080',
                showAxisLabels: [100, 1000, 10000, 100000],
                showSquareLabels: [100000], // label 100km grid squares
                showAxis100km: true
            }));

            utmGrids.addLayer(L.utmGrid(24, true, {
                color: '#800',
                showAxisLabels: [100, 1000, 10000, 100000],
                showSquareLabels: [100000], // label 100km grid squares
                showAxis100km: true
            }));

            utmGrids.addLayer(L.utmGrid(25, true, {
                color: '#880',
                showAxisLabels: [100, 1000, 10000, 100000],
                showSquareLabels: [100000], // label 100km grid squares
                showAxis100km: true
            }));

            // Adiciona a camada composta ao mapa
            map.addLayer(utmGrids);








            var baseMaps = {};
            //L.control.layers(baseMaps,{"Tema Escola": layer_Calcotemaescola_0,"Carta": layer_Carta_3,"BDGEx - CTM50": layer_BDGEx_2,"BDGEx - Relevo": layer_MultiescalaRelevo,"Google Satellite": layer_GoogleSatellite_1,"OpenTopo": layer_OpenTopo_0,},{collapsed:false}).addTo(map);
            L.ImageOverlay.include({
                getBounds: function () {
                    return this._bounds;
                }
            });
            var planejamentoLayer = L.featureGroup().addTo(map);

            var layerControl; // Referência global ao controle de camadas
            var layerRegistry = {
                "OpenTopo": layer_OpenTopo_0,
                "Google Satellite": layer_GoogleSatellite_1,
                "Infraestruturas": openInfraMapLayer,
                "Quadrículas - UTM": utmGrids,
                "BDGEx - CTM50": layer_BDGEx_2,
                "Sugestão de Planejamento": planejamentoLayer
            };

            // Inicializa o controle de camadas uma vez
            var layerControl = L.control.layers(baseMaps, layerRegistry, {collapsed: false}).addTo(map);

            // Acessa o contêiner do controle de camadas
            var layerControlElement = layerControl.getContainer();

            // Cria um elemento div para conter os botões
            var buttonsDiv = L.DomUtil.create('div', 'layer-control-buttons', layerControlElement);
            buttonsDiv.style.marginTop = '10px'; // Ajuste o espaçamento conforme necessário

            // Insere os botões de Adicionar e Remover Camadas
            buttonsDiv.innerHTML += `
<i id="addLayerButton" class="fas fa-plus-square toolbar-icon" title="Adicionar Camadas" style="cursor: pointer; margin-right: 5px;"></i>
<i id="removeLayerButton" class="fas fa-minus-square toolbar-icon" title="Remover Camadas" style="cursor: pointer;"></i>
<i id="savePlanningButton" class="fas fa-save toolbar-icon" title="Salvar Sugestão de Planejamento" style="cursor: pointer;"></i>
<i id="startUpdateButton" class="fas fa-sync-alt toolbar-icon" title="Inserir camada atualizável" style="cursor: pointer; margin-left: 5px;"></i>
`;

            // Impede que cliques nos botões interfiram com as interações do mapa
            L.DomEvent.disableClickPropagation(buttonsDiv);
            L.DomEvent.on(buttonsDiv, 'mousedown dblclick click', L.DomEvent.stopPropagation);


            function deselecionarCamadasIniciais() {
                // Lista das camadas a serem removidas (exceto OpenTopo)
                var camadasParaRemover = [
                    layer_GoogleSatellite_1,
                    layer_BDGEx_2,
                    openInfraMapLayer,
                    utmGrids,
                    planejamentoLayer
                ];

                camadasParaRemover.forEach(function(camada) {
                    if (map.hasLayer(camada)) {
                        map.removeLayer(camada);
                    }
                });

                // Garantir que apenas OpenTopo esteja visível
                if (!map.hasLayer(layer_OpenTopo_0)) {
                    map.addLayer(layer_OpenTopo_0);
                }

                // Atualizar o controle de camadas para refletir o estado atual
                if (layerControl) {
                    layerControl._update();
                }
            }

            // Chame a função após a inicialização do mapa e das camadas
            deselecionarCamadasIniciais();


            function addNewOverlayLayer(layerName, layer) {
                // Verifica se o nome da camada já existe no registro
                if (!layerRegistry.hasOwnProperty(layerName)) {
                    layerRegistry[layerName] = layer; // Adiciona a nova camada ao registro

                    // Adiciona a camada ao controle de camadas existente
                    layerControl.addOverlay(layer, layerName);

                    // Opcionalmente, adiciona a camada ao mapa
                    map.addLayer(layer);
                } else {
                    console.warn(`A camada "${layerName}" já existe e não será adicionada novamente.`);
                }
            }




            // Função para preencher o seletor com os layers disponíveis e inicializar o registro de camadas
            function fillLayerSelector() {
                var layerRegistry = { // Variáveis de camadas declaradas diretamente
                    "OpenTopo": layer_OpenTopo_0,
                    "Google Satellite": layer_GoogleSatellite_1,
                    "BDGEx - CTM50": layer_BDGEx_2
                };

                var layerSelector = document.getElementById('layerSelector');
                layerSelector.innerHTML = ""; // Limpa o seletor antes de preenchê-lo

                // Adiciona opções ao seletor
                Object.keys(layerRegistry).forEach(function(key) {
                    var option = new Option(key, key);
                    layerSelector.appendChild(option);
                });

                return layerRegistry; // Retorna o registro para uso posterior
            }

            // Inicializa o layerRegistry a partir de fillLayerSelector
            var layers = fillLayerSelector();

            // Função para ajustar a transparência do layer selecionado
            function adjustLayerTransparency() {

                var selectedLayerKey = document.getElementById('layerSelector').value;
                var sliderValue = document.getElementById('transparencySlider').value;
                var opacity = parseFloat(sliderValue) / 100;

                if (selectedLayerKey && layers[selectedLayerKey]) {
                    var layer = layers[selectedLayerKey];

                    // Log detalhado do tipo e propriedades da camada
                    console.log('Tipo de camada:', layer.constructor.name);
                    console.log('Propriedades da camada:', layer);

                    // Ajuste de opacidade com métodos apropriados
                    if (typeof layer.setOpacity === 'function') {
                        layer.setOpacity(opacity);
                    } else if (layer.setStyle) {
                        layer.setStyle({ opacity: opacity, fillOpacity: opacity });
                    } else if (layer._container) {
                        layer._container.style.opacity = opacity;
                    } else {
                        console.warn(`O layer "${selectedLayerKey}" não suporta ajuste de opacidade.`);
                    }
                } else {
                    console.log(`selectedLayerKey ${selectedLayerKey} não encontrado no layerRegistry`);
                }
            }

            // Event listeners
            document.getElementById('layerSelector').addEventListener('change', adjustLayerTransparency);
            document.getElementById('transparencySlider').addEventListener('input', adjustLayerTransparency);

        return { layerControl, layerRegistry, planejamentoLayer, addNewOverlayLayer };
    }
});
