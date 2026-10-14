/**
 * @fileoverview Inicializa o mapa principal, a toolbar, o seletor de cor e as ferramentas de desenho.
 * @exports Função global googleTranslateElementInit.
 * @requires Leaflet, jQuery/Spectrum e módulos PlanMilT carregados antes deste script; registra googleTranslateElementInit global.
 */



            var defaultColor = '#bada55'; // Cor padrão
            var map = L.map('map', {
                zoomControl: true,
                maxZoom: 28,
                minZoom: 1,
                tap: true, // Habilita eventos de toque em dispositivos móveis
                touchZoom: true, // Habilita o zoom por toque
                dragging: true // Garante que o arrasto do mapa esteja ativado
            }).fitBounds([[-21.666684470453795,-51.420400265474385],[-21.473097026357785,-51.07103186636465]]);
            // Definição do controle personalizado
            var MapToolbarControl = L.Control.extend({
                onAdd: function(map) {
                    // Cria um elemento div para a toolbar
                    var div = L.DomUtil.create('div', 'map-toolbar');

                    // Aqui você pode adicionar os botões e outros elementos HTML à sua toolbar
                    div.innerHTML = `
<div class="toolbar-item">
<div id="iconSelectorContainer">
<button id="iconSelectorToggle">Selecionar ícone</button>
<div id="iconSelectorContent" style="display: none;">
<!-- icon-selector.js monta esta área após carregar a lista de ícones. -->
            </div>
            </div>
<img id="iconPreview" src="" alt="Pré-visualização do ícone selecionado" style="width: 30px; height: 30px; display: none;">
            </div>
<div class="toolbar-icons">
<i id="exportKMZ" class="fas fa-file-export toolbar-icon" title="Exportar para KMZ"></i>
<i id="importKMZ" class="fas fa-file-import toolbar-icon" title="Importar arquivo KMZ"></i>
<i id="locateMeButton" class="fas fa-map-marker-alt toolbar-icon" title="Mostrar/esconder minha localização"></i>
<i id="saveDrawings" class="fas fa-save toolbar-icon" title="Salvar desenhos"></i>
<i id="loadDrawings" class="fas fa-download toolbar-icon" title="Carregar desenhos"></i>
<i id="loadImages" class="fas fa-images toolbar-icon" title="Carregar imagens"></i>
<i id="shareLink" class="fas fa-share-alt toolbar-icon" title="Compartilhar link com camadas"></i>
<i id="startPlanning" class="fas fa-network-wired toolbar-icon" title="Planejamento Automático"></i>
<i id="linkPredictionBtn" class="fas fa-broadcast-tower toolbar-icon" title="Predição de Enlace (Rádio)"></i>
<i id="helpButton" class="fas fa-question-circle toolbar-icon" title="Ajuda"></i>
<input type="file" id="fileInput" accept=".kmz" style="display: none;">
            </div>
<div class="toolbar-item color-picker-label">
<input type='text' id="colorPicker" class="color-picker"/>
            </div>
<div class="toolbar-item">
<select id="layerSelector">
<option value="">Selecione um camada para transparência</option>
            </select>
            </div>
<div class="toolbar-item">
<label for="transparencySlider">Transparência:</label>
<input type="range" id="transparencySlider" min="0" max="100" value="100">
            </div>
`;

                    // Impede que eventos do mapa ocorram quando interagindo com a toolbar
                    L.DomEvent.disableClickPropagation(div);

                    return div;
                }
            });

            // Adiciona o controle personalizado ao mapa
            var mapToolbar = new MapToolbarControl({position: 'bottomleft'});
            mapToolbar.addTo(map);



            // Inicializa o seletor de cores
            $('#colorPicker').spectrum({
                color: defaultColor,
                showPalette: true,
                palette: [
                    ['#000', '#444', '#666', '#999', '#ccc', '#eee', '#f3f3f3', '#fff'],
                    ['#f00', '#f90', '#ff0', '#0f0', '#0ff', '#00f', '#90f', '#f0f'],
                    ['#f4cccc', '#fce5cd', '#fff2cc', '#d9ead3', '#d0e0e3', '#cfe2f3', '#d9d2e9', '#ead1dc'],
                    ['#ea9999', '#f9cb9c', '#ffe599', '#b6d7a8', '#a2c4c9', '#9fc5e8', '#b4a7d6', '#d5a6bd'],
                    ['#e06666', '#f6b26b', '#ffd966', '#93c47d', '#76a5af', '#6fa8dc', '#8e7cc3', '#c27ba0'],
                    ['#c00', '#e69138', '#f1c232', '#6aa84f', '#45818e', '#3d85c6', '#674ea7', '#a64d79'],
                    ['#900', '#b45f06', '#bf9000', '#38761d', '#134f5c', '#0b5394', '#351c75', '#741b47'],
                    ['#600', '#783f04', '#7f6000', '#274e13', '#0c343d', '#073763', '#20124d', '#4c1130']
                ],
                change: function(color) {
                    defaultColor = color.toHexString();
                    updateDrawControl(); // Atualiza a cor padrão no controle de desenho
                }
            });






            var freehandControl = window.PlanMilT.freehandDrawing.createControl({
                map,
                leaflet: L,
                getDefaultColor: () => defaultColor
            });
            map.addControl(freehandControl);

            // Adicionar o controle do Google Translate ao mapa
            var TranslateControl = L.Control.extend({
                options: {
                    position: 'topright' // Posição do botão no mapa
                },
                onAdd: function (map) {
                    // Cria um contêiner para o Google Translate
                    var div = L.DomUtil.create('div', 'google-translate-control leaflet-bar');
                    div.id = 'google_translate_element'; // O id que o Google Translate precisa
                    div.style.backgroundColor = 'white'; // Fundo branco para se integrar ao estilo do Leaflet
                    div.style.padding = '5px';
                    div.style.borderRadius = '5px'; // Deixe arredondado para ficar bonito
                    div.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)'; // Sombra para destacar
                    return div;
                }
            });

            // Adicionar o controle ao mapa
            map.addControl(new TranslateControl());

            // Inicializar o Google Translate
            /**
             * Inicializa o controle do Google Translate dentro do mapa.
             */
            function googleTranslateElementInit() {
                new google.translate.TranslateElement({
                    pageLanguage: 'pt'
                }, 'google_translate_element');
            }



            var iconSelector = window.PlanMilT.iconSelector.attach({
                container: document.getElementById('iconSelectorContainer'),
                preview: document.getElementById('iconPreview'),
                leaflet: L,
                apiClient: window.PlanMilT.apiClient
            });
            iconSelector.load().catch(error => console.error('Erro ao carregar ícones:', error));

            // Adicione o controle de busca ao mapa
            L.Control.geocoder({
                position: 'topright', // Posição do controle no mapa
                placeholder: 'Buscar cidade...', // Texto de placeholder
                errorMessage: 'Local não encontrado.',
                defaultMarkGeocode: false // Não adiciona um marcador no local encontrado
            })
                .on('markgeocode', function(e) {
                var latlng = e.geocode.center;
                var bbox = e.geocode.bbox;

                // Centraliza o mapa na localização encontrada
                map.fitBounds(bbox);

                // Opcional: Ajustar o nível de zoom diretamente
                // map.setView(latlng, 13); // Use um nível de zoom específico, se preferir
            })
                .addTo(map);









            var drawnItems = new L.FeatureGroup();
            map.addLayer(drawnItems);

            // Função para atualizar o controle de desenho sem especificar um ícone por padrão
            /**
             * Reconstrói o controle de desenho com a cor e opções atuais.
             */
            function updateDrawControl() {
                if (map.drawControl) map.removeControl(map.drawControl);
                // Customização dos textos e tooltips
                L.drawLocal.draw.toolbar.buttons.polygon = 'Desenhar polígono';
                L.drawLocal.draw.toolbar.buttons.polyline = 'Desenhar linha';
                L.drawLocal.draw.toolbar.buttons.rectangle = 'Desenhar retângulo';
                L.drawLocal.draw.toolbar.buttons.circle = 'Desenhar círculo';
                L.drawLocal.draw.toolbar.buttons.marker = 'Adicionar ícone ou texto';
                L.drawLocal.draw.toolbar.actions.title = 'Cancelar desenho';
                L.drawLocal.draw.toolbar.actions.text = 'Cancelar';
                L.drawLocal.draw.toolbar.undo.title = 'Deletar último ponto desenhado';
                L.drawLocal.draw.toolbar.undo.text = 'Deletar último ponto';
                L.drawLocal.edit.toolbar.actions.save.title = 'Salvar alterações';
                L.drawLocal.edit.toolbar.actions.save.text = 'Salvar';
                L.drawLocal.edit.toolbar.actions.cancel.title = 'Cancelar edição, descarta todas as alterações';
                L.drawLocal.edit.toolbar.actions.cancel.text = 'Cancelar';
                L.drawLocal.edit.toolbar.actions.clearAll.title = 'Limpar todos os desenhos';
                L.drawLocal.edit.toolbar.actions.clearAll.text = 'Limpar tudo';
                // Continuação da customização dos textos e tooltips
                L.drawLocal.draw.handlers.polygon.tooltip.start = 'Clique para começar a desenhar o polígono.';
                L.drawLocal.draw.handlers.polygon.tooltip.cont = 'Clique para continuar desenhando o polígono.';
                L.drawLocal.draw.handlers.polygon.tooltip.end = 'Clique no primeiro ponto para fechar este polígono.';
                L.drawLocal.draw.handlers.polyline.tooltip.start = 'Clique para começar a desenhar a linha.';
                L.drawLocal.draw.handlers.polyline.tooltip.cont = 'Clique para continuar desenhando a linha.';
                L.drawLocal.draw.handlers.polyline.tooltip.end = 'Clique no último ponto para terminar a linha.';
                L.drawLocal.draw.handlers.rectangle.tooltip.start = 'Clique e arraste para desenhar o retângulo.';
                L.drawLocal.draw.handlers.circle.tooltip.start = 'Clique e arraste para desenhar o círculo.';
                L.drawLocal.draw.handlers.circle.radius = 'Solte o mouse para terminar de desenhar o círculo.';
                L.drawLocal.draw.handlers.marker.tooltip.start = 'Clique no mapa para colocar o marcador.';
                L.drawLocal.edit.handlers.edit.tooltip.text = 'Arraste os manipuladores ou marcadores para editar a forma.';
                L.drawLocal.edit.handlers.edit.tooltip.subtext = 'Clique em cancelar para desfazer as alterações.';
                L.drawLocal.edit.handlers.remove.tooltip.text = 'Clique em uma forma para removê-la.';


                map.drawControl = new L.Control.Draw({
                    edit: {
                        featureGroup: drawnItems,
                        remove: true
                    },
                    draw: {
                        marker: {
                        },
                        polygon: {
                            shapeOptions: {
                                color: defaultColor
                            }
                        },
                        polyline: {
                            shapeOptions: {
                                color: defaultColor
                            }
                        },
                        rectangle: {
                            shapeOptions: {
                                color: defaultColor
                            }
                        },
                        circle: {
                            shapeOptions: {
                                color: defaultColor
                            }
                        },
                        circlemarker: false,
                    }
                });
                map.addControl(map.drawControl);
            }

            // Certifique-se de chamar updateDrawControl sem passar um selectedIconKey
            updateDrawControl();

            // Chamada inicial para configurar o controle de desenho
            updateDrawControl('defaultIcon'); // Use 'defaultIcon' como valor inicial

            //var centralPoint = null; // Armazena o ponto central escolhido no mapa-

            map.on(L.Draw.Event.CREATED, async function(e) {
                var type = e.layerType;
                var layer = e.layer; // Define a cor padrão para todos os desenhos


                if (type === 'polyline') {
                    // Opções de estilo para linhas
                    const { value: dashOption } = await Swal.fire({
                        title: 'Selecione o estilo da linha',
                        input: 'select',
                        inputOptions: {
                            solid: 'Sólida',
                            dashed: 'Tracejada',
                            dotted: 'Pontilhada'
                        },
                        inputPlaceholder: 'Selecione um estilo',
                        showCancelButton: true
                    });

                    if (dashOption !== undefined) {
                        let dashArrayValue;
                        switch(dashOption) {
                            case 'solid':
                                dashArrayValue = null;
                                break;
                            case 'dashed':
                                dashArrayValue = '10, 10';
                                break;
                            case 'dotted':
                                dashArrayValue = '2, 6';
                                break;
                                         }

                        layer.setStyle({
                            color: defaultColor,
                            dashArray: dashArrayValue
                        });

                        // Garantir que layer.feature e layer.feature.properties existam
                        layer.feature = layer.feature || { type: 'Feature', properties: {} };
                        layer.feature.properties.color = defaultColor;
                        if (dashArrayValue) {
                            layer.feature.properties.dashArray = dashArrayValue;
                        }
                    }

                    drawnItems.addLayer(layer);
                } 

                if (type === 'polygon') {
                    // Apresentar opções de preenchimento para o usuário
                    const { value: fillOption } = await Swal.fire({
                        title: 'Selecione o tipo de preenchimento',
                        input: 'select',
                        inputOptions: {
                            solid: 'Cor Sólida',
                            patternX: 'Padrão "X"',
                            patternSlash: 'Padrão "\\"'
                        },
                        inputPlaceholder: 'Selecione um preenchimento',
                        showCancelButton: true
                    });

                    if (fillOption !== undefined) {
                        if (fillOption === 'solid') {
                            layer.setStyle({
                                fillColor: defaultColor,
                                fillOpacity: 0.5
                            });

                            // Adicionar informações de estilo às propriedades da feature
                            layer.feature = {
                                type: 'Feature',
                                properties: {
                                    fillColor: defaultColor,
                                    fillOpacity: 0.5
                                },
                                geometry: layer.toGeoJSON().geometry
                            };
                        } else {
                            // Aplicar padrões de preenchimento
                            let pattern;
                            if (fillOption === 'patternX') {
                                pattern = new L.Pattern({
                                    width: 8,
                                    height: 8,
                                    patternUnits: 'userSpaceOnUse'
                                });
                                var shape = new L.PatternPath({
                                    d: 'M0,0 L8,8 M8,0 L0,8',
                                    stroke: true,
                                    weight: 1,
                                    color: defaultColor
                                });
                                pattern.addShape(shape);
                                pattern.addTo(map);
                            } else if (fillOption === 'patternSlash') {
                                pattern = new L.Pattern({
                                    width: 8,
                                    height: 8,
                                    patternUnits: 'userSpaceOnUse'
                                });
                                var shape = new L.PatternPath({
                                    d: 'M0,0 L8,8',
                                    stroke: true,
                                    weight: 1,
                                    color: defaultColor
                                });
                                pattern.addShape(shape);
                                pattern.addTo(map);
                            }

                            layer.setStyle({
                                fillPattern: pattern
                            });

                            // Adicionar informações de estilo às propriedades da feature
                            layer.feature = {
                                type: 'Feature',
                                properties: {
                                    fillPattern: fillOption,
                                    color: defaultColor
                                },
                                geometry: layer.toGeoJSON().geometry
                            };
                        }
                    }

                    drawnItems.addLayer(layer);
                }

                if (type === 'circle') {
                    var center = layer.getLatLng();
                    var radius = layer.getRadius();

                    var polygonCoordinates = window.PlanMilT.drawingGeometry.createCirclePolygon(center, radius);

                    var polygonLayer = L.polygon(polygonCoordinates, {
                        color: defaultColor,
                        fillColor: defaultColor,
                        fillOpacity: 0.5,
                    }).addTo(drawnItems);

                    polygonLayer.feature = {
                        type: 'Feature',
                        properties: {
                            shape: 'circle',
                            center: [center.lat, center.lng],
                            radius: radius,
                            color: defaultColor
                        },
                        geometry: {
                            type: "Polygon",
                            coordinates: [polygonCoordinates]
                        }
                    };
                } else if (type === 'marker') {
                    // Substituindo o confirm() por SweetAlert2
                    const result = await Swal.fire({
                        title: 'Adicionar Ícone ou Texto?',
                        text: "Clique em 'Ícone' para adicionar ícone ou 'Texto' para adicionar um texto.",
                        icon: 'question',
                        showCancelButton: true,
                        confirmButtonText: 'Ícone',
                        cancelButtonText: 'Texto'
                    });

                    var addText = !result.isConfirmed;

                    if (addText) {
                        openTextEditor(layer.getLatLng(), function(content) {
                            var customIcon = L.divIcon({
                                className: 'custom-text-label',
                                html: content,
                                iconSize: [200,50],
                                iconAnchor: [0, 0]
                            });
                            layer.setIcon(customIcon);
                            layer.feature = {
                                type: 'Feature',
                                properties: {
                                    text: content,
                                    color: defaultColor
                                },
                                geometry: layer.toGeoJSON().geometry
                            };
                            drawnItems.addLayer(layer);
                        });
                    } else {
                        var selectedIcon = iconSelector.getSelectedIcon();
                        var iconUrl = selectedIcon ? selectedIcon.options.iconUrl : '';

                        if (iconUrl) {
                            // Define o ícone para a camada
                            layer.setIcon(selectedIcon);

                            // Adiciona propriedades personalizadas à camada
                            layer.feature = {
                                type: 'Feature',
                                properties: {
                                    iconUrl: iconUrl,
                                    color: defaultColor
                                },
                                geometry: layer.toGeoJSON().geometry
                            };
                        } else {
                            // Exibe um alerta ao usuário informando que nenhum ícone foi selecionado
                            Swal.fire({
                                title: 'Ícone Não Selecionado',
                                text: 'Por favor, selecione um ícone antes de adicionar ao mapa.',
                                icon: 'warning',
                                confirmButtonText: 'OK'
                            });

                            // Opcional: Retorna ou encerra a execução para evitar ações adicionais
                            return;
                        }
                    }


                    // Adiciona explicitamente o marcador ao drawnItems
                    drawnItems.addLayer(layer);
                } else {
                    // Outros tipos de camadas
                    layer.feature = layer.feature || { type: 'Feature', properties: {} };
                    layer.feature.properties.color = defaultColor;
                    drawnItems.addLayer(layer);
                }

                // Exibir o GeoJSON gerado
                console.log('GeoJSON com propriedades de estilo:', JSON.stringify(drawnItems.toGeoJSON()));
            });
