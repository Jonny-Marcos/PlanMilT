


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




            document.getElementById('importKMZ').addEventListener('click', function() {
                document.getElementById('fileInput').click(); // Deve acionar o clique no input de arquivo
            });


            function editText(layer, latlng) {
                openTextEditor(latlng, function(content) {
                    layer.feature.properties.text = content;
                    layer.setIcon(L.divIcon({
                        className: 'custom-text-label',
                        html: content,
                        iconSize: null,
                        iconAnchor: [0, 0]
                    }));
                }, layer.feature.properties.text);
            }


            drawnItems.on('click', function(e) {
                var layer = e.layer;
                var latlng = e.latlng; // Certifique-se de obter as coordenadas do clique
                if (layer.feature && layer.feature.properties && layer.feature.properties.text) {
                    editText(layer, latlng);
                }
                else {
                    try {
                        var latlng = layer.getLatLng();
                        var utm = latLngToUtm(latlng.lat, latlng.lng);

                        // Exibe um popup com as coordenadas UTM
                        L.popup()
                            .setLatLng(latlng)
                            .setContent(`Coordenadas Métricas (UTM): (${utm.easting}, ${utm.northing})`)
                            .openOn(map);
                    }
                    catch (e){

                    }
                }
            });
            function getUtmZone(lng) {
                return Math.floor((lng + 180) / 6) + 1;
            }

            function getHemisphere(lat) {
                return lat >= 0 ? 'north' : 'south';
            }

            function latLngToUtm(lat, lng) {
                var utmZone = getUtmZone(lng);
                var hemisphere = getHemisphere(lat);
                var proj4Str = `+proj=utm +zone=${utmZone} +${hemisphere} +datum=WGS84 +units=m +no_defs`;

                // Converte para coordenadas UTM usando proj4js
                var utmCoordinates = proj4('EPSG:4326', proj4Str, [lng, lat]);

                return {
                    zone: utmZone,
                    easting: Math.round(utmCoordinates[0]),
                    northing: Math.round(utmCoordinates[1]),
                    hemisphere: hemisphere
                };
            }



            function openTextEditor(latlng, callback, initialContent = '') {
                var popupContent = `
<div id="text-editor-popup" style="width: 400px;">
<textarea id="tiny-editor" style="width: 400px; height: 200px;">${initialContent}</textarea>
<button id="save-text" style="margin-top: 10px;">Salvar</button>
<button id="cancel-text" style="margin-top: 10px;">Cancelar</button>
            </div>
`;

                var popup = L.popup({ maxWidth: 400 })
                .setLatLng(latlng) // Usa as coordenadas do clique para definir a localização do popup
                .setContent(popupContent)
                .openOn(map);

                tinymce.init({
                    selector: '#tiny-editor',
                    plugins: 'textcolor', // Não é necessário carregar o plugin de fontsize
                    toolbar: 'bold italic underline | fontsizeselect | forecolor backcolor', // Use 'fontsizeselect' para selecionar o tamanho da fonte
                    menubar: false,
                    fontsize_formats: '8pt 10pt 12pt 14pt 18pt 24pt 36pt', // Opções predefinidas de tamanho de fonte
                    setup: function (editor) {
                        editor.on('init', function () {
                            editor.setContent(initialContent);
                        });
                    }
                });



                document.getElementById('save-text').addEventListener('click', function () {
                    var content = tinymce.get('tiny-editor').getContent();
                    tinymce.remove('#tiny-editor');
                    map.closePopup(popup);
                    callback(content);
                });

                document.getElementById('cancel-text').addEventListener('click', function () {
                    tinymce.remove('#tiny-editor');
                    map.closePopup(popup);
                });
            }





            document.getElementById('fileInput').addEventListener('change', function(e) {
                var file = e.target.files[0];
                if (file) {
                    var reader = new FileReader();
                    reader.onload = function(event) {
                        JSZip.loadAsync(event.target.result).then(function(zip) {
                            var kmlFile = zip.file("doc.kml");

                            if (!kmlFile) {
                                // Procurar qualquer arquivo .kml caso doc.kml não seja encontrado
                                var kmlFiles = zip.file(/\.kml$/);
                                if (kmlFiles.length > 0) {
                                    kmlFile = kmlFiles[0];
                                }
                            }

                            if (kmlFile) {
                                kmlFile.async("string").then(function(kmlContent) {
                                    // Criar a camada de importação
                                    var importLayer = L.layerGroup().addTo(map);

                                    // Processar imagens e adicioná-las à camada de importação
                                    processImagesFromKML(kmlContent, zip, importLayer);
                                    // Processar estilos, linhas e overlays e adicioná-las à camada de importação
                                    processStylesAndLinesFromKML(kmlContent, importLayer);
                                    processGroundOverlaysFromKML(kmlContent, zip, importLayer);

                                    // Obter o nome do arquivo KMZ sem a extensão
                                    var fileName = file.name.replace(/\.kmz$/i, '');

                                    // Adicionar a camada de importação ao controle de camadas com o nome do arquivo KMZ
                                    layerControl.addOverlay(importLayer, fileName);
                                });
                            } else {
                                console.error("Nenhum arquivo KML encontrado no ZIP.");
                            }
                        });
                    };
                    reader.readAsArrayBuffer(file);
                }
            });

            function processImagesFromKML(kmlContent, zip, importLayer) {
                var parser = new DOMParser();
                var kmlDoc = parser.parseFromString(kmlContent, 'application/xml');

                var iconNodes = kmlDoc.querySelectorAll('IconStyle > Icon > href');
                var placemarks = kmlDoc.querySelectorAll('Placemark');

                var iconCache = {};

                iconNodes.forEach(function(iconNode) {
                    var iconPath = iconNode.textContent.trim();
                    console.log("Processing icon:", iconPath);

                    if (!iconCache[iconPath] && zip.file(iconPath)) {
                        zip.file(iconPath).async("base64").then(function(imageData) {
                            var imgSrc = "data:image/png;base64," + imageData;
                            iconCache[iconPath] = imgSrc;

                            placemarks.forEach(function(placemark) {
                                var styleUrl = placemark.querySelector('styleUrl');
                                if (styleUrl && styleUrl.textContent.includes(iconPath)) {
                                    var coordinates = placemark.querySelector('coordinates').textContent.trim().split(',');
                                    var latLng = L.latLng(parseFloat(coordinates[1]), parseFloat(coordinates[0]));

                                    var customIcon = L.icon({
                                        iconUrl: imgSrc,
                                        iconSize: [40, 40],
                                        iconAnchor: [20, 20],
                                        popupAnchor: [0, -20]
                                    });

                                    var marker = L.marker(latLng, { icon: customIcon });
                                    marker.addTo(importLayer);
                                }
                            });
                        }).catch(function(error) {
                            console.error("Error reading image file:", error);
                        });
                    }
                });

                placemarks.forEach(function(placemark) {
                    var geometryType = placemark.querySelector('Point, LineString, Polygon');
                    if (geometryType) {
                        var coordinates = placemark.querySelector('coordinates').textContent.trim().split(' ');
                        var latLngs = coordinates.map(function(coord) {
                            var [lng, lat] = coord.split(',').map(parseFloat);
                            return [lat, lng];
                        });

                        if (geometryType.nodeName === 'LineString') {
                            var lineStyle = placemark.querySelector('LineStyle');
                            var color = lineStyle ? lineStyle.querySelector('color').textContent : '#3388ff';
                            var width = lineStyle ? parseFloat(lineStyle.querySelector('width').textContent) : 2;

                            L.polyline(latLngs, { color: color, weight: width }).addTo(importLayer);
                        }
                    }
                });

                console.log("Import completed. Added layers:", importLayer.getLayers());
            }

            function processStylesAndLinesFromKML(kmlContent, importLayer) {
                var parser = new DOMParser();
                var kmlDoc = parser.parseFromString(kmlContent, 'application/xml');

                var linePlacemarks = kmlDoc.querySelectorAll('Placemark LineString');
                linePlacemarks.forEach(function(linePlacemark) {
                    var styleNode = linePlacemark.parentNode.querySelector('Style LineStyle color');
                    var color = styleNode ? kmlColorToHex(styleNode.textContent.trim()) : '#0000ff';

                    var coordinates = linePlacemark.querySelector('coordinates').textContent.trim().split(' ');
                    var latLngs = coordinates.map(function(coord) {
                        var parts = coord.split(',');
                        return [parseFloat(parts[1]), parseFloat(parts[0])];
                    });
                    L.polyline(latLngs, { color: color }).addTo(importLayer);
                });
            }

            function processGroundOverlaysFromKML(kmlContent, zip, importLayer) {
                var parser = new DOMParser();
                var kmlDoc = parser.parseFromString(kmlContent, 'application/xml');

                var overlayNodes = kmlDoc.querySelectorAll('GroundOverlay');

                overlayNodes.forEach(function(overlayNode) {
                    var iconPath = overlayNode.querySelector('Icon > href').textContent.trim();
                    console.log("Processing overlay icon:", iconPath);

                    if (zip.file(iconPath)) {
                        zip.file(iconPath).async("base64").then(function(imageData) {
                            var imgSrc = "data:image/png;base64," + imageData;

                            var latLonBox = overlayNode.querySelector('LatLonBox');
                            var bounds = [
                                [parseFloat(latLonBox.querySelector('south').textContent), parseFloat(latLonBox.querySelector('west').textContent)],
                                [parseFloat(latLonBox.querySelector('north').textContent), parseFloat(latLonBox.querySelector('east').textContent)]
                            ];

                            var overlay = L.imageOverlay(imgSrc, bounds);
                            overlay.addTo(importLayer);
                        }).catch(function(error) {
                            console.error("Error reading overlay image file:", error);
                        });
                    }
                });
            }

            function kmlColorToHex(kmlColor) {
                if (kmlColor.length === 8) {
                    var alpha = kmlColor.substr(0, 2);
                    var blue = kmlColor.substr(2, 2);
                    var green = kmlColor.substr(4, 2);
                    var red = kmlColor.substr(6, 2);
                    return '#' + red + green + blue;
                }
                return kmlColor;
            }











            var hash = new L.Hash(map);
            map.attributionControl.setPrefix(
                '<a href="https://github.com/Jonny-Marcos/PlanMilT/" title="PlanMilT(GitHub)" target="_blank">PlanMilT</a> | ' +
                '<a href="https://www.linkedin.com/in/joao-marcos-barbosa-oliveira-8b866a175/" title="Cap Barbosa Oliveira (LinkedIn)" target="_blank">Cap Barbosa Oliveira</a>'
            );

            var autolinker = new Autolinker({truncate: {length: 30, location: 'smart'}});
            function removeEmptyRowsFromPopupContent(content, feature) {
                var tempDiv = document.createElement('div');
                tempDiv.innerHTML = content;
                var rows = tempDiv.querySelectorAll('tr');
                for (var i = 0; i < rows.length; i++) {
                    var td = rows[i].querySelector('td.visible-with-data');
                    var key = td ? td.id : '';
                    if (td && td.classList.contains('visible-with-data') && feature.properties[key] == null) {
                        rows[i].parentNode.removeChild(rows[i]);
                    }
                }
                return tempDiv.innerHTML;
            }




            document.querySelector(".leaflet-popup-pane").addEventListener("load", function(event) {
                var tagName = event.target.tagName,
                    popup = map._popup;
                // Also check if flag is already set.
                if (tagName === "IMG" && popup && !popup._updated) {
                    popup._updated = true; // Set flag to prevent looping.
                    popup.update();
                }
            }, true);


            var measureControl = new L.Control.Measure({
                position: 'topright',
                primaryLengthUnit: 'meters',
                secondaryLengthUnit: 'kilometers',
                primaryAreaUnit: 'sqmeters',
                secondaryAreaUnit: 'hectares',
                activeColor: '#db4a29', // Cor das linhas ativas
                completedColor: '#9b2d14'
            });
            measureControl.addTo(map);

            // Personalizar o botão de alternância
            var measureToggleButton = document.getElementsByClassName('leaflet-control-measure-toggle')[0];
            measureToggleButton.innerHTML = '';
            measureToggleButton.className += ' fas fa-ruler';
            measureToggleButton.title = 'Medição'; // Adiciona um título em português



            var bounds_group = new L.featureGroup([]);
            function setBounds() {
            }



            // Adiciona o botão de exportação
            L.control.browserPrint({
                position: 'topright',
                title: 'Print ...',
            }).addTo(map);

            // Adiciona o controle de escala ao mapa
            L.control.scale({maxWidth: 100, metric: true, imperial: false, position: 'bottomleft'}).addTo(map);

            // Adiciona um evento de clique ao botão de impressão
            document.querySelector('.leaflet-control-browser-print a').addEventListener('click', function() {
                var originalZoom = map.getZoom();
                var targetZoom = 13; // Defina o nível de zoom desejado para a escala 1:50000

                // Ajusta o zoom do mapa para a escala desejada
                map.setZoom(targetZoom);

                // Garante que o controle de escala seja atualizado
                map.on('zoomend', function() {
                    setTimeout(function() {
                        // Chama a função de impressão padrão do navegador
                        window.print();

                        // Restaura o zoom original após a impressão
                        map.setZoom(originalZoom);
                    }, 1000); // Aguarda 1 segundo antes de imprimir para garantir que o mapa e a escala sejam atualizados
                });
            });







            // Função para salvar os desenhos via AJAX
            function salvarDesenhos(usuario, senha, drawnData, diretorio) {
                console.log('--- Iniciando salvarDesenhos ---');
                console.log('Usuário:', usuario);
                console.log('Diretório:', diretorio);
                console.log('Dados dos desenhos antes de personalizar:', drawnData);

                // Itera por cada feature para incluir propriedades personalizadas
                drawnData.features.forEach(function(feature) {
                    var layer = drawnItems.getLayer(feature.properties._leaflet_id);
                    if (layer && layer.options) {
                        if (layer.options.icon) {
                            feature.properties.iconUrl = layer.options.icon.options.iconUrl;
                            console.log('iconUrl adicionado:', feature.properties.iconUrl);
                        }
                        // Para formas que não são marcadores, salvar a cor
                        if (layer.options.color) {
                            feature.properties.color = layer.options.color;
                            console.log('Cor adicionada:', feature.properties.color);
                        }
                    }
                });

                console.log('Dados dos desenhos após personalização:', drawnData);

                var data = {
                    usuario: usuario,
                    senha: senha,
                    link: diretorio, // Diretório a ser usado na requisição
                    leaflet: JSON.stringify(drawnData) // Converte os dados desenhados para uma string JSON
                };

                console.log('Dados a serem enviados via AJAX:', data);

                // Envio dos dados via AJAX
                $.ajax({
                    type: "POST",
                    url: "/salvar.php", // Substitua pelo caminho correto para sua página PHP
                    data: data,
                    success: function(response) {
                        console.log('Resposta recebida do servidor:', response);

                        // Verifica se a resposta contém a frase "Desenho atualizado com sucesso!"
                        if (response.includes("Desenho atualizado com sucesso!") || response.includes("Desenho salvo com sucesso!")) {
                            Swal.fire('Sucesso!', 'Desenhos salvos com sucesso!', 'success');
                            console.log('Desenhos salvos com sucesso!');
                        } else {
                            // Se a resposta não contém a frase esperada, trata como erro
                            Swal.fire('Erro!', response, 'error');
                            console.error('Erro ao salvar desenhos:', response);
                        }
                    },
                    error: function(xhr, status, error) {
                        console.error("Erro ao salvar desenhos via AJAX:", error);
                        Swal.fire('Erro!', 'Não foi possível salvar os desenhos.', 'error');
                    }
                });
            }


            // Recupera usuário e senha salvos, ou define como string vazia se não existir
            const savedUsuario = '';
            const savedSenha = '';

            document.getElementById('saveDrawings').addEventListener('click', function() {
                // Recupera usuário e senha salvos, ou define como string vazia se não existir
                const savedUsuario = sessionStorage.getItem('usuario') || '';
                const savedSenha = sessionStorage.getItem('senha') || '';

                // Utiliza o SweetAlert2 para solicitar o usuário e senha
                Swal.fire({
                    title: 'Insira suas credenciais',
                    html: `
<input type="text" id="swal-input-usuario" class="swal2-input" placeholder="Usuário" value="${savedUsuario}">
<input type="password" id="swal-input-senha" class="swal2-input" placeholder="Senha" value="${savedSenha}">
`,
                    focusConfirm: false,
                    preConfirm: () => {
                        const usuario = document.getElementById('swal-input-usuario').value;
                        const senha = document.getElementById('swal-input-senha').value;
                        if (!usuario || !senha) {
                            Swal.showValidationMessage('Usuário e senha são necessários!');
                            return false;
                        }
                        return { usuario: usuario, senha: senha };
                    }
                }).then((result) => {
                    if (result.isConfirmed) {
                        var { usuario, senha } = result.value;

                        // Salva usuário e senha no sessionStorage
                        sessionStorage.setItem('usuario', usuario);
                        sessionStorage.setItem('senha', senha);

                        // Gera o GeoJSON dos desenhos
                        var drawnData = drawnItems.toGeoJSON();

                        // Verifica se não há desenhos para salvar
                        if (drawnData.features.length === 0) {
                            // Informa o usuário e pergunta se deseja continuar
                            Swal.fire({
                                title: 'Nenhum desenho encontrado',
                                text: 'Não há desenhos para salvar. Deseja continuar salvando mesmo assim?',
                                icon: 'warning',
                                showCancelButton: true,
                                confirmButtonText: 'Sim, salvar mesmo assim',
                                cancelButtonText: 'Cancelar'
                            }).then((confirmResult) => {
                                if (confirmResult.isConfirmed) {
                                    // Obtém a URL completa da janela atual
                                    const urlCompleta = window.location.href;

                                    // Extrai o diretório a partir da URL completa
                                    const padraoDiretorio = /https:\/\/methodux\.online\/(.*?)\//;
                                    const resultado = padraoDiretorio.exec(urlCompleta);

                                    // A variável 'diretorio' conterá o diretório atual, ou uma string vazia se não encontrado
                                    const diretorio = resultado ? resultado[1] : '';

                                    // Prossegue com o salvamento mesmo sem desenhos
                                    salvarDesenhos(usuario, senha, drawnData, diretorio);
                                } else {
                                    // Se o usuário cancelar, aborta o salvamento
                                    Swal.fire('Salvamento cancelado', 'Nenhum desenho foi salvo.', 'info');
                                }
                            });
                            // Retorna para evitar que o código continue imediatamente
                            return;
                        }

                        // Obtém a URL completa da janela atual
                        const urlCompleta = window.location.href;

                        // Extrai o diretório a partir da URL completa
                        const padraoDiretorio = /https:\/\/methodux\.online\/(.*?)\//;
                        const resultado = padraoDiretorio.exec(urlCompleta);

                        // A variável 'diretorio' conterá o diretório atual, ou uma string vazia se não encontrado
                        const diretorio = resultado ? resultado[1] : '';

                        // Prossegue com o salvamento normalmente
                        salvarDesenhos(usuario, senha, drawnData, diretorio);
                    }
                });
            });







            // Função para verificar se o objeto é do tipo GeoJSON
            function isValidGeoJson(geoJsonObject) {
                return geoJsonObject && typeof geoJsonObject === 'object' && 
                    (geoJsonObject.type === 'Feature' || geoJsonObject.type === 'FeatureCollection') &&
                    (geoJsonObject.type === 'FeatureCollection' ? geoJsonObject.features && Array.isArray(geoJsonObject.features) : true);
            }







            // Carrega novas camadas se existir o parâmetro GET com múltiplas camadas separadas por vírgulas
            document.addEventListener('DOMContentLoaded', async function() {
                // Cria um objeto URL com a URL atual
                const url = new URL(window.location.href);

                // Utiliza o URLSearchParams para analisar a string de consulta
                const params = new URLSearchParams(url.search);

                // Verifica se a variável 'camada' está presente na URL e obtém o valor como uma string
                const camadasParam = params.get('camada');
                const urlCompleta = window.location.href;

                const calco = params.get('calco');
                if (calco) {
                    loadImageFromId(calco);
                }

                var toolbar = document.querySelector('.map-toolbar');
                var drawToolbar = document.querySelectorAll('.leaflet-draw-toolbar');
                var printButton = document.querySelector('.leaflet-control-browser-print');



                // Extrai o diretório a partir da URL completa
                const padraoDiretorio = /https:\/\/methodux\.online\/(.*?)\//;
                const resultado = padraoDiretorio.exec(urlCompleta);
                const diretorio = resultado ? resultado[1] : '';

                // Separa as camadas se existirem múltiplas, separadas por vírgulas
                const camadas = camadasParam ? camadasParam.split(',') : [];

                try {
                    for (const camada of camadas) {
                        const response = await fetch("/carregar.php", { // Ajuste para o caminho correto do seu script PHP
                            method: "POST",
                            headers: {
                                'Content-Type': 'application/x-www-form-urlencoded',
                            },
                            body: `usuario=${encodeURIComponent(camada)}&link=${encodeURIComponent(diretorio)}`
                        });

                        if (!response.ok) {
                            throw new Error(`Erro HTTP: ${response.status}`);
                        }

                        const geoJsonData = await response.json();

                        // Verifica se os dados obtidos são do tipo GeoJSON válido
                        if (!isValidGeoJson(geoJsonData)) {
                            console.log(`A camada solicitada ${camada} não é um GeoJSON válido ou não existe.`);
                            return; // Sai da função se não for um GeoJSON válido
                        }

                        console.log("Geojson carregado para a camada", camada, ":", geoJsonData);

                        // Define um nome único para a nova camada de desenhos
                        var newLayerName = camada;

                        // Prepara uma nova camada GeoJSON para adicionar ao mapa
                        var newLayer = L.geoJson(null).addTo(map);

                        // Processa e adiciona os dados GeoJSON à nova camada
                        L.geoJson(geoJsonData, {
                            onEachFeature: function(feature, layer) {
                                if (feature.geometry.type === 'Point' && Object.keys(feature.properties).length === 0) {
                                    console.log("Ponto vazio encontrado:", feature);
                                    // Configura um ícone transparente e sem tamanho para o layer
                                    var emptyIcon = L.divIcon({
                                        html: '', // Sem conteúdo HTML
                                        className: 'empty-icon', // Classe personalizada que pode ser usada para torná-lo invisível através de CSS, se necessário
                                        iconSize: [0, 0] // Tamanho do ícone definido como zero
                                    });
                                    layer.setIcon(emptyIcon); // Aplica o ícone vazio ao marcador
                                    newLayer.addLayer(layer);
                                }
                                else if (feature.geometry.type === 'Point' && feature.properties.shape === 'circle') {
                                    // Cria e adiciona o círculo diretamente ao drawnItems
                                    var newCircle = L.circle([feature.properties.center[0], feature.properties.center[1]], {
                                        color: feature.properties.color,
                                        fillColor: feature.properties.color,
                                        fillOpacity: 0.5,
                                        radius: feature.properties.radius
                                    });
                                    newLayer.addLayer(newCircle);
                                }
                                // Trata pontos com propriedade text, garantindo que não são círculos
                                else if (feature.properties.text && feature.geometry.type === 'Point' && !feature.properties.iconUrl) {
                                    var customIcon = L.divIcon({
                                        className: 'custom-text-label',
                                        html: feature.properties.text,
                                        iconSize: [100, 30],
                                        iconAnchor: [15, 15]
                                    });
                                    // Configura o ícone personalizado no marcador existente
                                    layer.setIcon(customIcon);
                                    newLayer.addLayer(layer);
                                }
                                // Trata ícones personalizados para pontos, garantindo que não são círculos
                                else if (feature.geometry.type === 'Point' && feature.properties.iconUrl && feature.properties.shape !== 'circle') {
                                    var customIcon = L.icon({
                                        iconUrl: feature.properties.iconUrl,
                                        iconSize: [40, 40],
                                        iconAnchor: [15, 15]
                                    });
                                    layer.setIcon(customIcon);
                                    newLayer.addLayer(layer);
                                }
                                // Aplica estilo para outros tipos de geometria
                                else if (feature.geometry.type === 'LineString' || feature.geometry.type === 'Polygon'){
                                    layer.setStyle({color: feature.properties.color});
                                    newLayer.addLayer(layer);
                                }
                            }
                        });

                        // Adiciona 'newLayer' ao controle do mapa, assumindo que 'addNewOverlayLayer' está definido corretamente
                        addNewOverlayLayer(newLayerName, newLayer);
                    }
                } catch (error) {
                    console.error("Falha ao carregar desenhos:", error);
                }
            });








            document.getElementById('shareLink').addEventListener('click', async function () {
                const { value: formValues } = await Swal.fire({
                    title: 'Compartilhar Camadas Ativas',
                    html:
                    `<label for="userInput">Insira os nomes dos usuários:</label>
<input id="userInput" class="swal2-input" placeholder="Nome de usuário" type="text">
<div id="userList" style="margin-top: 10px;"></div>
<label for="imageSelect">Selecione as imagens:</label>
<select id="imageSelect" class="swal2-input" multiple style="width: 100%; height: 150px;" size="6"></select>
<button type="button" id="addUserBtn" class="swal2-confirm swal2-styled">Adicionar Usuário</button>`,
                    focusConfirm: false,
                    showCancelButton: true,
                    confirmButtonText: 'Gerar Link',
                    didOpen: () => {
                        // Função para adicionar usuários ao pressionar "Enter"
                        const userInput = document.getElementById('userInput');
                        userInput.addEventListener('keydown', (event) => {
                            if (event.key === 'Enter' && userInput.value.trim() !== '') {
                                addUserToList(userInput.value);
                                userInput.value = ''; // Limpa o campo de entrada
                            }
                        });

                        // Função para adicionar usuários ao clicar no botão "Adicionar Usuário"
                        document.getElementById('addUserBtn').addEventListener('click', () => {
                            if (userInput.value.trim() !== '') {
                                addUserToList(userInput.value);
                                userInput.value = ''; // Limpa o campo de entrada
                            }
                        });

                        // Carrega as imagens ao abrir o modal
                        loadImages();
                    },
                    preConfirm: () => {
                        const users = Array.from(document.querySelectorAll('#userList .user')).map(el => el.textContent.trim());
                        const images = Array.from(document.querySelectorAll('#imageSelect option:checked')).map(el => el.value);
                        if (!users.length) {
                            Swal.showValidationMessage('Você deve inserir pelo menos um nome de usuário!');
                            return false;
                        }
                        return { users, images };
                    }
                });

                if (formValues) {
                    const { users, images } = formValues;

                    // Função para obter o valor de um parâmetro da URL
                    function getParameterByName(name, url = window.location.href) {
                        name = name.replace(/\\/g, "\\\\").replace(/[\[\]]/g, "\\$&");
                        let regex = new RegExp("[?&]" + name + "(=([^&#]*)|&|#|$)"),
                            results = regex.exec(url);
                        if (!results) return null;
                        if (!results[2]) return '';
                        return decodeURIComponent(results[2].replace(/\+/g, " "));
                    }

                    const calcoValue = images.join(','); // IDs das imagens
                    const camadasParam = encodeURIComponent(users.join(',')); // Usuários separados por vírgula

                    // Função para obter o fragmento da URL (parte que começa com #)
                    const urlFragment = window.location.hash || '';

                    // Construir a URL no formato desejado com o fragmento no final
                    const novaURL = `https://aescoladatatica.fun/?calco=${calcoValue}&camada=${camadasParam}${urlFragment}`;


                    // Exibe o link gerado
                    Swal.fire({
                        title: 'Link Gerado',
                        html: `<p>Copie o link para compartilhar suas camadas e imagens ativas:</p>
<input type="text" id="link-gerado" class="swal2-input" value="${novaURL}" readonly>`,
                        confirmButtonText: 'Copiar Link',
                        showCancelButton: true,
                        cancelButtonText: 'Fechar',
                        preConfirm: () => {
                            const input = document.getElementById('link-gerado');
                            input.select();
                            document.execCommand('copy');
                            return 'Link copiado para a área de transferência!';
                        }
                    }).then((copyResult) => {
                        if (copyResult.isConfirmed) {
                            Swal.fire('Sucesso!', 'O link foi copiado para a área de transferência.', 'success');
                        }
                    });
                }

                // Função para adicionar um usuário à lista
                function addUserToList(userName) {
                    const userList = document.getElementById('userList');
                    const userDiv = document.createElement('div');
                    userDiv.className = 'user';
                    userDiv.textContent = userName;
                    userList.appendChild(userDiv);
                }

                // Função para carregar imagens do servidor
                async function loadImages() {
                    try {
                        const response = await fetch('carregar-imagem.php', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
                        });
                        const data = await response.json();

                        if (data.images) {
                            // Preenche o select com as imagens
                            const imageSelect = document.getElementById('imageSelect');
                            data.images.forEach(image => {
                                const option = document.createElement('option');
                                option.value = image.id;
                                option.textContent = image.descricao;
                                imageSelect.appendChild(option);
                            });
                        } else if (data.error) {
                            Swal.fire('Erro!', data.error, 'error');
                        } else {
                            Swal.fire('Erro!', 'Nenhuma imagem disponível.', 'error');
                        }
                    } catch (error) {
                        console.error('Erro ao carregar imagens:', error);
                        Swal.fire('Erro!', 'Erro ao obter a lista de imagens.', 'error');
                    }
                }
            });
























            document.getElementById('loadImages').addEventListener('click', function() {
                loadImageWithPrompt();
            });

            async function loadImageWithPrompt() {
                // Obtém a lista de imagens do servidor
                try {
                    const response = await fetch('carregar-imagem.php', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
                    });
                    const data = await response.json();

                    if (data.images) {
                        // Monta as opções para o select
                        const options = data.images.map(image => `<option value="${image.id}">${image.descricao}</option>`).join('');

                        // Exibe o SweetAlert2 com o select e o novo botão "Enviar imagem"
                        const { value: imageId } = await Swal.fire({
                            title: 'Carregar Imagem',
                            html: `
<select id="swal-input1" class="swal2-input">${options}</select>
<br><br>
<a href="criador-tema.html" class="swal2-styled swal2-cancel">Enviar imagem</a>
`,
                            focusConfirm: false,
                            showCancelButton: true,
                            confirmButtonText: 'Carregar',
                            preConfirm: () => {
                                const selectedId = document.getElementById('swal-input1').value;
                                if (!selectedId) {
                                    Swal.showValidationMessage('Por favor, selecione uma imagem!');
                                    return false;
                                }
                                return selectedId;
                            }
                        });

                        if (!imageId) return;

                        await attemptToLoadImage(imageId);
                    } else if (data.error) {
                        Swal.fire('Erro!', data.error, 'error');
                    } else {
                        Swal.fire('Erro!', 'Nenhuma imagem disponível.', 'error');
                    }
                } catch (error) {
                    console.error(error);
                    Swal.fire('Erro!', 'Erro ao obter a lista de imagens.', 'error');
                }
            }


            async function attemptToLoadImage(imageId) {
                const params = new URLSearchParams();
                params.append('id', imageId);

                try {
                    const response = await fetch('carregar-imagem.php', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                        body: params.toString()
                    });
                    const data = await response.json();

                    if (data.url && data.bounds) {
                        var bounds = L.latLngBounds(data.bounds);
                        var imageLayer = L.imageOverlay(data.url, bounds);
                        addNewOverlayLayer(`Imagem: ${data.descricao}`, imageLayer);
                    } else if (data.error) {
                        if (data.error === 'Senha incorreta ou não fornecida.') {
                            // Solicita a senha
                            const { value: senhaInput } = await Swal.fire({
                                title: 'Senha necessária',
                                input: 'password',
                                inputPlaceholder: 'Digite a senha',
                                showCancelButton: true,
                                confirmButtonText: 'Carregar',
                                preConfirm: (value) => {
                                    if (!value) {
                                        Swal.showValidationMessage('A senha não pode estar vazia!');
                                        return false;
                                    }
                                    return value;
                                }
                            });
                            if (!senhaInput) return;

                            // Tenta carregar a imagem novamente com a senha fornecida
                            params.append('senha', senhaInput);

                            const responseWithPassword = await fetch('carregar-imagem.php', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                                body: params.toString()
                            });
                            const dataWithPassword = await responseWithPassword.json();

                            if (dataWithPassword.url && dataWithPassword.bounds) {
                                var bounds = L.latLngBounds(dataWithPassword.bounds);
                                var imageLayer = L.imageOverlay(dataWithPassword.url, bounds);
                                addNewOverlayLayer(`Imagem: ${dataWithPassword.descricao}`, imageLayer);
                            } else if (dataWithPassword.error) {
                                // Informa que a senha está incorreta e encerra o processo
                                Swal.fire('Erro!', 'Senha incorreta.', 'error');
                            } else {
                                Swal.fire('Erro!', 'Imagem não encontrada ou dados incompletos.', 'error');
                            }
                        } else {
                            Swal.fire('Erro!', data.error, 'error');
                        }
                    } else {
                        Swal.fire('Erro!', 'Imagem não encontrada ou dados incompletos.', 'error');
                    }
                } catch (error) {
                    console.error(error);
                    Swal.fire('Erro!', 'Erro ao carregar a imagem.', 'error');
                }
            }








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

                if (!usuario) return; // Sai se o usuário cancelar ou não preencher

                const urlCompleta = window.location.href;
                const padraoDiretorio = /https:\/\/methodux\.online\/(.*?)\//;
                const resultado = padraoDiretorio.exec(urlCompleta);
                const diretorio = resultado ? resultado[1] : '';

                try {
                    const response = await fetch("/carregar.php", {
                        method: "POST",
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                        body: `usuario=${encodeURIComponent(usuario)}&link=${encodeURIComponent(diretorio)}`
                    });

                    if (!response.ok) throw new Error(`Erro HTTP: ${response.status}`);

                    const geoJsonData = await response.json();
                    console.log("Geojson carregado:", geoJsonData);

                    if (!isValidGeoJson(geoJsonData)) {
                        Swal.fire('Erro', 'Erro ao carregar os desenhos. Verifique o usuário e o link!', 'error');
                        return;
                    }

                    const { isConfirmed: escolha } = await Swal.fire({
                        title: 'Como deseja carregar os desenhos?',
                        text: "Escolha 'Edição' para edição ou 'Camada não-editável' para carregá-los como uma nova camada.",
                        icon: 'question',
                        showCancelButton: true,
                        confirmButtonText: 'Edição',
                        cancelButtonText: 'Camada não-editável'
                    });

                    // Definição do cache de padrões
                    var patternCache = {};

                    // Função para criar ou obter um padrão existente
                    function getPattern(fillPatternType, color) {
                        var key = fillPatternType + '_' + color;
                        if (patternCache[key]) {
                            return patternCache[key];
                        }
                        let patternId = 'pattern_' + fillPatternType + '_' + color.replace('#', '');
                        let pattern = new L.Pattern({
                            id: patternId,
                            width: 8,
                            height: 8,
                            patternUnits: 'userSpaceOnUse'
                        });
                        var shape;
                        if (fillPatternType === 'patternX') {
                            shape = new L.PatternPath({
                                d: 'M0,0 L8,8 M8,0 L0,8',
                                stroke: true,
                                weight: 1,
                                color: color
                            });
                        } else if (fillPatternType === 'patternSlash') {
                            shape = new L.PatternPath({
                                d: 'M0,0 L8,8',
                                stroke: true,
                                weight: 1,
                                color: color
                            });
                        }
                        pattern.addShape(shape);
                        pattern.addTo(map);
                        patternCache[key] = pattern;
                        return pattern;
                    }

                    if (!escolha) {
                        // Carrega como camada não-editável
                        const newLayerName = usuario;
                        const newLayer = L.geoJson(null).addTo(map);

                        L.geoJson(geoJsonData, {
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
                                    // Modificação para aplicar estilos adicionais
                                    let style = { color: feature.properties.color };

                                    if (feature.properties.dashArray) {
                                        style.dashArray = feature.properties.dashArray;
                                    }

                                    if (feature.geometry.type === 'Polygon') {
                                        if (feature.properties.fillColor) {
                                            style.fillColor = feature.properties.fillColor;
                                            style.fillOpacity = feature.properties.fillOpacity || 0.5;
                                        }
                                        if (feature.properties.fillPattern) {
                                            // Usar a função getPattern para obter o padrão correto
                                            let pattern = getPattern(feature.properties.fillPattern, feature.properties.color);
                                            style.fillPattern = pattern;
                                        }
                                    }

                                    layer.setStyle(style);
                                    newLayer.addLayer(layer);
                                }
                            }
                        });

                        addNewOverlayLayer(newLayerName, newLayer);

                    } else {
                        // Carrega para edição
                        drawnItems.clearLayers();

                        L.geoJson(geoJsonData, {
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
                                    drawnItems.addLayer(newCircle);
                                } else if (feature.properties.text && feature.geometry.type === 'Point' && !feature.properties.iconUrl) {
                                    var customIcon = L.divIcon({
                                        className: 'custom-text-label',
                                        html: feature.properties.text,
                                        iconSize: [100, 30],
                                        iconAnchor: [15, 15]
                                    });
                                    layer.setIcon(customIcon);
                                    drawnItems.addLayer(layer);
                                } else if (feature.geometry.type === 'Point' && feature.properties.iconUrl) {
                                    var customIcon = L.icon({
                                        iconUrl: feature.properties.iconUrl,
                                        iconSize: [40, 40],
                                        iconAnchor: [15, 15]
                                    });
                                    layer.setIcon(customIcon);
                                    drawnItems.addLayer(layer);
                                } else if (feature.geometry.type === 'LineString' || feature.geometry.type === 'Polygon') {
                                    // Modificação para aplicar estilos adicionais
                                    let style = { color: feature.properties.color };

                                    if (feature.properties.dashArray) {
                                        style.dashArray = feature.properties.dashArray;
                                    }

                                    if (feature.geometry.type === 'Polygon') {
                                        if (feature.properties.fillColor) {
                                            style.fillColor = feature.properties.fillColor;
                                            style.fillOpacity = feature.properties.fillOpacity || 0.5;
                                        }
                                        if (feature.properties.fillPattern) {
                                            // Usar a função getPattern para obter o padrão correto
                                            let pattern = getPattern(feature.properties.fillPattern, feature.properties.color);
                                            style.fillPattern = pattern;
                                        }
                                    }

                                    layer.setStyle(style);
                                    drawnItems.addLayer(layer);
                                }
                            }
                        }).addTo(map);
                    }

                    if (drawnItems.getLayers().length) {
                        map.fitBounds(drawnItems.getBounds());
                    }

                } catch (error) {
                    console.error("Erro ao carregar desenhos:", error);
                    Swal.fire('Erro HTTP', `Erro: ${error.message}`, 'error');
                }
            });




            var mapSetup = window.PlanMilT.mapSetup.attach({ map, leaflet: L });
            var layerControl = mapSetup.layerControl;
            var layerRegistry = mapSetup.layerRegistry;
            var planejamentoLayer = mapSetup.planejamentoLayer;
            var addNewOverlayLayer = mapSetup.addNewOverlayLayer;

            // botão de fechar perfil topográfico
            document.getElementById('close-btn').addEventListener('click', function() {
                // Para fechar
                document.getElementById('elevation-profile-container').style.display = 'none';
            });


            //Perfil topográfico

            L.DomEvent.on(document, 'DOMContentLoaded', function () {

                var elevationProfileControl = L.control({position: 'topright'}); // Você pode ajustar a posição conforme necessário

                elevationProfileControl.onAdd = function(map) {
                    // Retorna o elemento que você quer adicionar ao mapa
                    // Neste caso, é o contêiner do perfil de elevação
                    var container = L.DomUtil.get('elevation-profile-container');
                    L.DomEvent.disableClickPropagation(container); // Impede que os cliques no contêiner afetem o mapa
                    return container;
                }



                // Adiciona o controle personalizado ao mapa
                elevationProfileControl.addTo(map);
            });
            async function getElevationProfile(marker1, marker2) {
                try {
                    // Extrai as localizações dos marcadores passados como argumentos
                    console.log(marker1);
                    var P1 = marker1.getLatLng();
                    var P2 = marker2.getLatLng();
                    var profileSamples = window.PlanMilT.elevationProfile.createProfileSamples(P1, P2);
                    var midpoint = profileSamples.midpoint;
                    var points = profileSamples.points;

                    console.log("Calculando perfil de elevação para os pontos:", points);

                    // Prepara os dados para enviar à API local
                    var payload = {
                        points: points
                    };

                    const data = await window.PlanMilT.apiClient.postJson('elevation_profile.php', payload);

                    console.log("Dados de elevação recebidos:", data);

                    // Verifica se a resposta contém as elevações
                    if (!data || !Array.isArray(data)) {
                        throw new Error('Formato de dados inválido recebido da API.');
                    }

                    var elevationData = data.map(point => point.elevation);
                    drawElevationProfile(elevationData, midpoint); // Passa o ponto médio para a função
                } catch (error) {
                    console.error('Erro:', error);
                    Swal.fire({
                        icon: 'error',
                        title: 'Erro',
                        text: 'Ocorreu um erro ao obter o perfil de elevação.',
                    });
                }
            };



            async function loadImageFromId(calco) {
                if (!calco) {
                    console.error("IDs das imagens são necessários para carregar.");
                    return;
                }

                // Separar os IDs das imagens por vírgula
                const calcoArray = calco.split(',');

                for (const id of calcoArray) {
                    try {
                        // Primeiro, fazer uma requisição GET para obter a descrição e verificar se a imagem requer senha
                        let response = await fetch(`carregar-imagem.php?id=${id.trim()}`);
                        let data = await response.json();

                        if (data.error) {
                            console.error("Erro: " + data.error);
                            continue;
                        }

                        const descricao = data.descricao;
                        const requiresPassword = data.requiresPassword;

                        if (requiresPassword) {
                            // Solicita a senha
                            const { value: senha } = await Swal.fire({
                                title: `A imagem "${descricao}" requer uma senha`,
                                input: 'password',
                                inputPlaceholder: 'Digite a senha',
                                showCancelButton: true
                            });

                            if (!senha) {
                                Swal.fire('Erro!', 'Nenhuma senha foi fornecida.', 'error');
                                continue;
                            }

                            // Agora fazer o POST com a senha
                            const params = new URLSearchParams();
                            params.append('id', id.trim());
                            params.append('senha', senha);

                            response = await fetch('carregar-imagem.php', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                                body: params.toString()
                            });

                        } else {
                            // Se não requer senha, fazer o POST sem a senha
                            const params = new URLSearchParams();
                            params.append('id', id.trim());

                            response = await fetch('carregar-imagem.php', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                                body: params.toString()
                            });
                        }

                        const imageData = await response.json();

                        if (imageData.url && imageData.bounds) {
                            var bounds = L.latLngBounds(imageData.bounds);
                            var imageLayer = L.imageOverlay(imageData.url, bounds, { opacity: 0.7 });
                            addNewOverlayLayer(`${imageData.descricao}`, imageLayer);
                            console.log(`Imagem "${descricao}" carregada com sucesso.`);
                        } else if (imageData.error) {
                            Swal.fire('Erro', imageData.error, 'error');
                        } else {
                            console.error("Imagem não encontrada ou dados incompletos.");
                        }

                    } catch (error) {
                        console.error('Erro ao carregar a imagem:', error);
                    }
                }
            }






            var currentChart = null;

            function drawElevationProfile(elevationData, midpoint) {
                var container = document.getElementById('elevation-profile-container');
                container.style.display = 'block'; // Altera o display para 'block', tornando-o visível

                var canvas = document.getElementById('elevation-profile-canvas');
                var ctx = canvas.getContext('2d');

                if (currentChart != null) {
                    currentChart.destroy();
                }

                var straightLineDataPoints = window.PlanMilT.elevationProfile.createLineOfSight(elevationData, 12);

                var labels = elevationData.map((_, i) => (i + 1).toString());

                var lineData = {
                    label: 'Linha de alturas (m)',
                    backgroundColor: 'rgb(255, 99, 132)',
                    borderColor: 'rgb(255, 99, 132)',
                    data: elevationData,
                    fill: false,
                };

                var straightLineData = {
                    label: 'Enlace c/ torre 12m',
                    borderColor: 'rgb(0, 0, 255)',
                    data: straightLineDataPoints,
                    fill: false,
                    borderDash: [5, 5],
                };

                var data = {
                    labels: labels,
                    datasets: [lineData, straightLineData],
                };

                var config = {
                    type: 'line',
                    data: data,
                    options: {
                        plugins: {
                            legend: {
                                display: true,
                                labels: {
                                    color: 'blue', // Cor dos textos da legenda
                                }
                            },
                            title: {
                                display: true,
                                text: 'Perfil Topográfico', // Texto do título
                                font: {
                                    size: 18 // Tamanho da fonte do título
                                },
                                color: '#000', // Cor do título
                                padding: {
                                    top: 10,
                                    bottom: 30
                                }
                            },
                            background: {
                                color: 'rgba(255, 255, 255, 0.8)', // Fundo levemente branco com um pouco de transparência
                            }
                        },
                        maintainAspectRatio: false
                    },
                    scales: {
                        y: {
                            display: true,
                            beginAtZero: false,
                        },
                        x: { display: false }
                    },
                    plugins: [{
                        id: 'background', // Define a ID do plugin para correspondência com a configuração acima
                        beforeDraw: (chart) => {
                            const ctx = chart.ctx;
                            ctx.save();
                            ctx.globalCompositeOperation = 'destination-over';
                            ctx.fillStyle = chart.options.plugins.background.color;
                            ctx.fillRect(0, 0, chart.width, chart.height);
                            ctx.restore();
                        }
                    }]
                };

                canvas.height = 200; // Ajusta a altura do elemento canvas, não o estilo
                currentChart = new Chart(ctx, config);
            }



            var profileMarkers = [];
            drawnItems.on('layerremove', function(event) {
                var removedLayer = event.layer;
                profileMarkers = profileMarkers.filter(function(marker) {
                    return marker !== removedLayer;
                });
            });

            function delay(ms) {
                return new Promise(resolve => setTimeout(resolve, ms));
            }



            // Geolocalização do usuário
            window.PlanMilT.geolocation.attach({
                map,
                button: document.getElementById('locateMeButton'),
                leaflet: L,
                showError: message => alert(message)
            });






            // Adiciona um ouvinte de evento ao botão de exportação para KMZ
            window.PlanMilT.kmzExport.attach({
                map,
                drawnItems,
                layerRegistry,
                button: document.getElementById('exportKMZ'),
                zipArchive: JSZip,
                sweetAlert: Swal,
                captureCanvas: html2canvas
            });










                // Seleciona os elementos necessários
                var toolbar = document.querySelector('.map-toolbar');
                var drawToolbar = document.querySelectorAll('.leaflet-draw-toolbar');
                var printButton = document.querySelector('.leaflet-control-browser-print');
                var layersControl = document.querySelector('.leaflet-control-layers'); // Seleciona o controle de camadas
                var toggleControlsBtn = document.getElementById('toggleControlsBtn'); // Seleciona o botão de desativar controles
                var freehandButton = freehandControl.getContainer();
                var measureToggleButton; // Botão de medir distâncias e áreas
                var translateButton = document.querySelector('.google-translate-control'); // Seleciona o botão de tradução

                if (window.innerWidth <= 600) {
                    toolbar.style.display = 'none';
                    drawToolbar.forEach(function(toolbar) {
                        toolbar.style.display = 'none';
                    });
                    if (printButton) printButton.style.display = 'none';
                    if (layersControl) layersControl.style.display = 'none'; // Ocultar controle de camadas
                    if (freehandButton) freehandButton.style.display = 'none'; // Ocultar botão de desenho à mão livre
                    if (measureToggleButton) measureToggleButton.style.display = 'none'; // Ocultar botão de medição
                    if (translateButton) translateButton.style.display = 'none'; // Ocultar botão de tradução
                } else {
                    toolbar.style.display = 'flex';
                    drawToolbar.forEach(function(toolbar) {
                        toolbar.style.display = 'block';
                    });
                    if (printButton) printButton.style.display = 'block';
                    if (layersControl) layersControl.style.display = 'block'; // Mostrar controle de camadas
                    if (freehandButton) freehandButton.style.display = 'block'; // Mostrar botão de desenho à mão livre
                    if (measureToggleButton) measureToggleButton.style.display = 'block'; // Mostrar botão de medição
                    if (translateButton) translateButton.style.display = 'block'; // Mostrar botão de tradução
                    if (toggleControlsBtn) {
                        toggleControlsBtn.style.display = 'block';
                        toggleControlsBtn.textContent = 'Ocultar Controles';
                    }
                }

                document.getElementById('toggleControlsBtn').addEventListener('click', function() {
                    if (toolbar.style.display === 'none' || toolbar.style.display === '') {
                        toolbar.style.display = 'flex';
                        drawToolbar.forEach(function(toolbar) {
                            toolbar.style.display = 'block'; // Mostrar controles de desenho
                        });
                        if (printButton) printButton.style.display = 'block'; // Mostrar botão de imprimir
                        if (layersControl) layersControl.style.display = 'block'; // Mostrar controle de camadas
                        if (freehandButton) freehandButton.style.display = 'block'; // Mostrar botão de desenho à mão livre
                        if (measureToggleButton) measureToggleButton.style.display = 'block'; // Mostrar botão de medição
                        if (translateButton) translateButton.style.display = 'block'; // Mostrar botão de tradução
                        this.textContent = 'Ocultar Controles';
                    } else {
                        toolbar.style.display = 'none';
                        drawToolbar.forEach(function(toolbar) {
                            toolbar.style.display = 'none'; // Ocultar controles de desenho
                        });
                        if (printButton) printButton.style.display = 'none'; // Ocultar botão de imprimir
                        if (layersControl) layersControl.style.display = 'none'; // Ocultar controle de camadas
                        if (freehandButton) freehandButton.style.display = 'none'; // Ocultar botão de desenho à mão livre
                        if (measureToggleButton) measureToggleButton.style.display = 'none'; // Ocultar botão de medição
                        if (translateButton) translateButton.style.display = 'none'; // Ocultar botão de tradução
                        this.textContent = 'Mostrar Controles';
                    }
                });





                var customLayers = {}; // Objeto para armazenar as camadas adicionadas dinamicamente

                function getSigsData() {
                    return window.PlanMilT.apiClient.getJson('/get_sigs.php')
                        .catch(error => {
                            console.error('Erro ao carregar a lista de SIGs:', error);
                            Swal.fire('Erro!', 'Não foi possível carregar a lista de SIGs.', 'error');
                            return [];
                        });
                }

                function getWMSLayers(wmsURL) {
                    return window.PlanMilT.mapLayers.getWMSLayers(wmsURL, {
                        apiClient: window.PlanMilT.apiClient,
                        onError: error => {
                            console.error('Erro ao obter camadas WMS:', error);
                            Swal.fire('Erro!', 'Não foi possível obter as camadas do servidor WMS.', 'error');
                        }
                    });
                }



                function addWMSLayerToMap(wmsURL, layerName, layerTitle) {
                    var layer = L.tileLayer.wms(wmsURL, {
                        layers: layerName,
                        format: 'image/png',
                        transparent: true,
                        version: '1.1.1'
                    });

                    // Adiciona a camada ao mapa e ao controle de camadas
                    addNewOverlayLayer(layerTitle, layer);

                    // Armazena a camada em customLayers para referência futura
                    customLayers[layerTitle] = layer;
                }












                // Variável global para armazenar as tarefas
                var taskSequence = [];

                // Função para desenhar a área de seleção
                async function drawSelectionArea() {
                    return new Promise((resolve) => {
                        // Inicia o desenho de um polígono sem adicionar ao drawnItems
                        const drawPolygon = new L.Draw.Polygon(map, {
                            showArea: true,
                            allowIntersection: false,
                            drawError: {
                                color: '#e1e100',
                                message: '<strong>Polígono inválido</strong>'
                            },
                            shapeOptions: {
                                color: '#97009c'
                            }
                        });
                        drawPolygon.enable();

                        // Configura um listener para capturar o desenho quando concluído
                        map.once('draw:created', function (e) {
                            if (e.layerType === 'polygon') {
                                const selectionArea = e.layer;

                                // Desabilitar o modo de desenho
                                drawPolygon.disable();

                                // Retornar a área desenhada
                                resolve(selectionArea);
                            } else {
                                drawPolygon.disable();
                                resolve(null);
                            }
                        });

                        // Listener para caso o usuário cancele o desenho
                        map.once('draw:canceled', function () {
                            drawPolygon.disable();
                            resolve(null);
                        });

                        // Listener para o botão "Cancelar" do controle de desenho
                        map.once('draw:drawstop', function () {
                            drawPolygon.disable();
                            resolve(null);
                        });
                    });
                }

                
                
                
                
                
                
                
                
                
                
                
                
                
                

                

                
             // ==========================================
                // FERRAMENTA AVANÇADA DE PREDIÇÃO RF E ÓTICA
                // ==========================================
                window.PlanMilT.radioPlanning.attach({
                    map,
                    leaflet: L,
                    turf,
                    drawnItems,
                    sweetAlert: Swal,
                    chartConstructor: Chart
                });

                // Função para iniciar o processo de criação de tarefas
                var taskParameters = window.PlanMilT.taskParameters.attach({
                    apiClient: window.PlanMilT.apiClient,
                    sweetAlert: Swal
                });
                var taskEditor = window.PlanMilT.taskSequenceEditor.attach({
                    getTasks: () => taskSequence,
                    setTasks: tasks => { taskSequence = tasks; },
                    taskParameters,
                    getStorage: () => taskSequenceStorage,
                    drawSelectionArea,
                    executeSequence: () => executeTaskSequence(),
                    sweetAlert: Swal
                });

                // Variável global para armazenar o log
                let logMessages = [];

                // Função auxiliar para serializar qualquer tipo de dado
                function serializeMessage(msg) {
                    if (typeof msg === 'string') {
                        return msg;
                    } else if (typeof msg === 'object') {
                        try {
                            return JSON.stringify(msg);
                        } catch (e) {
                            return String(msg);
                        }
                    } else if (typeof msg === 'function') {
                        return msg.toString();
                    } else if (typeof msg === 'undefined') {
                        return 'undefined';
                    } else {
                        return String(msg);
                    }
                }

                // Função addToLog atualizada para aceitar qualquer tipo de dado
                function addToLog(...messages) {
                    const timestamp = new Date().toLocaleTimeString();
                    const formattedMessage = messages.map(msg => serializeMessage(msg)).join(' ') + '\n';
                    logMessages += `[${timestamp}] ${formattedMessage}\n`;
                }






                // Função para obter os valores dos parâmetros da tarefa selecionada
                async function executeTaskSequence() {

                    logMessages = '';
                    addToLog('Iniciando execução da sequência de tarefas.');

                    for (let i = 0; i < taskSequence.length; i++) {
                        const task = taskSequence[i];

                        addToLog(`Executando tarefa ${i + 1}: ${task.task} com parâmetros: ${JSON.stringify(task.parameters)}`);

                        try {
                            switch (task.task) {
                                case 'findHighestPoint':
                                    await performFindHighestPoint(task.parameters);
                                    break;

                                case 'placeIcons':
                                    await performPlaceIcons(task.parameters);
                                    break;

                                case 'drawLinesBetweenIcons':
                                    await performDrawLinesBetweenIcons(task.parameters);
                                    break;

                                case 'connectDifferentIcons':
                                    await performConnectDifferentIcons(task.parameters);
                                    break;

                                case 'drawCoverageArea':
                                    await performDrawCoverageArea(task.parameters);
                                    break;

                                default:
                                    addToLog('Erro: Tarefa desconhecida:', task.task);
                                    break;
                                             }

                            addToLog(`Tarefa ${i + 1} concluída.`);
                        } catch (error) {
                            console.error(`Erro na tarefa ${i + 1}:`, error);
                            await Swal.fire('Erro', `Ocorreu um erro na tarefa ${i + 1}: ${error.message}`, 'error');
                            return;
                        }

                        // Calcula o progresso atual
                        const progress = Math.round(((i + 1) / taskSequence.length) * 100);

                        // Exibe um toast com a porcentagem de progresso
                        Swal.fire({
                            toast: true,
                            position: 'top-end',
                            icon: 'info', // Você pode mudar o ícone conforme a necessidade
                            title: `Progresso: ${progress}%`,
                            showConfirmButton: false,
                            timer: 500, // Fecha automaticamente após 500ms
                            timerProgressBar: false,
                            background: '#fff', // Define o fundo da toast (opcional)
                            // Customizações adicionais podem ser feitas aqui
                        });
                    }

                    // Exibe a mensagem de conclusão
                    addToLog('Planejamento concluído e salvo na camada "Sugestão de Planejamento".');

                    // Função para formatar o log, destacando linhas com "Erro:" em negrito
                    function formatLog(log) {
                        // Dividir o log em linhas
                        const lines = log.split('\n');
                        // Mapear cada linha, aplicando negrito se contiver "Erro:"
                        const formattedLines = lines.map(line => {
                            if (line.includes('Erro:')) {
                                return `<strong>${line}</strong>`;
                            }
                            return line;
                        });
                        // Unir as linhas novamente
                        return formattedLines.join('<br>');
                    }

                    // Função para verificar se existem erros no log
                    function hasErrors(log) {
                        return log.includes('Erro:');
                    }

                    console.warn(logMessages);

                    // Modal de Planejamento Concluído aprimorado
                    await Swal.fire({
                        title: hasErrors(logMessages) ? 'Planejamento concluído com erros' : 'Planejamento concluído com sucesso',
                        html: `
<div style="max-height: 300px; overflow-y: auto; text-align: left; white-space: pre-line; margin-bottom: 20px;">
${formatLog(logMessages)}
            </div>
${!hasErrors(logMessages) ? "<p>Planejamento salvo na camada 'Sugestão de Planejamento'.</p>" : ""}
`,
                        icon: hasErrors(logMessages) ? 'warning' : 'success',
                        showCancelButton: true,
                        cancelButtonText: '<i class="fa fa-copy"></i> Copiar Log',
                        confirmButtonText: 'OK',
                        reverseButtons: true,
                        preConfirm: () => {
                            // Nenhuma ação específica ao confirmar
                        },
                        didOpen: () => {
                            const copyButton = Swal.getCancelButton();
                            copyButton.addEventListener('click', () => {
                                // Copiar o log para a área de transferência
                                navigator.clipboard.writeText(logMessages).then(() => {
                                    Swal.fire({
                                        title: 'Sucesso',
                                        text: 'Log copiado para a área de transferência.',
                                        icon: 'success',
                                        timer: 2000,
                                        showConfirmButton: false
                                    });
                                }).catch(err => {
                                    Swal.fire('Erro', 'Não foi possível copiar o log.', 'error');
                                });
                            });
                        }
                    });

                }







                // Função global para obter dados de elevação, com tratamento de erros e opção de upload
                async function fetchElevationData(bounds) {
                    try {
                        const response = await fetch(`get_elevation_data.php?minLat=${bounds.getSouth()}&maxLat=${bounds.getNorth()}&minLon=${bounds.getWest()}&maxLon=${bounds.getEast()}`);

                        if (!response.ok) {
                            const errorData = await response.json();

                            if (errorData.error === 'Arquivos de elevação faltando' && errorData.missingTiles) {
                                // Mostrar mensagem de erro e oferecer opção de upload
                                const missingTiles = errorData.missingTiles;
                                const tileList = missingTiles.join(', ');
                                const { isConfirmed } = await Swal.fire({
                                    title: 'Arquivos de Elevação Faltando',
                                    html: `Os seguintes arquivos de elevação estão faltando: <b>${tileList}</b><br>Você pode obtê-los através do site <a href="https://dwtkns.com/srtm30m/" target="_blank">SRTM30</a><br>Deseja fazer o upload dos arquivos faltantes?`,
                                    icon: 'error',
                                    showCancelButton: true,
                                    confirmButtonText: 'Fazer Upload',
                                    cancelButtonText: 'Cancelar'
                                });

                                if (isConfirmed) {
                                    // Mostrar formulário para upload
                                    const { value: uploadData } = await Swal.fire({
                                        title: 'Upload de Arquivos de Elevação',
                                        html: `
<p>Por favor, selecione os arquivos correspondentes aos tiles faltantes.</p>
${missingTiles.map(tile => `<label>${tile}: <input type="file" id="file_${tile}" accept=".hgt"></label><br>`).join('')}
`,
                                        focusConfirm: false,
                                        preConfirm: () => {
                                            const formData = new FormData();
                                            let allFilesSelected = true;
                                            missingTiles.forEach(tile => {
                                                const fileInput = document.getElementById(`file_${tile}`);
                                                if (!fileInput || fileInput.files.length === 0) {
                                                    allFilesSelected = false;
                                                } else {
                                                    formData.append('files[]', fileInput.files[0], fileInput.files[0].name.toUpperCase());
                                                }
                                                // Adicionar missingTiles ao FormData
                                                formData.append('missingTiles', JSON.stringify(missingTiles));

                                            });
                                            if (!allFilesSelected) {
                                                Swal.showValidationMessage('Você deve selecionar todos os arquivos.');
                                                return false;
                                            }
                                            return formData;
                                        },
                                        showCancelButton: true,
                                        confirmButtonText: 'Enviar',
                                        cancelButtonText: 'Cancelar'
                                    });

                                    if (uploadData) {
                                        // Enviar os arquivos ao servidor
                                        try {
                                            // **Adicionar** a barra de progresso falsa antes do upload
                                            Swal.fire({
                                                title: 'Enviando arquivo(s)',
                                                html: `
<div style="width: 100%; background-color: #ddd; border-radius: 5px; overflow: hidden; margin-top: 20px;">
<div id="fake-progress" style="width: 0%; height: 20px; background-color: #4caf50;"></div>
            </div>
<p style="margin-top: 10px;">Por favor, aguarde...</p>
`,
                                                allowOutsideClick: false,
                                                showConfirmButton: false,
                                                didOpen: () => {
                                                    const progressBar = Swal.getPopup().querySelector('#fake-progress');
                                                    let progress = 0;
                                                    // Simular o progresso até 90%
                                                    window.fakeProgressInterval = setInterval(() => {
                                                        if (progress < 95) {
                                                            // Incremento aleatório entre 0.5% e 1%
                                                            progress += (Math.random() * 0.4) + 0.5;
                                                            if (progress > 90) progress = 90; // Limitar a 90%
                                                            progressBar.style.width = progress.toFixed(2) + '%';
                                                        } else {
                                                            clearInterval(window.fakeProgressInterval);
                                                        }
                                                    }, 1000); // Atualizar a cada 1 segundo

                                                }
                                            });

                                            const uploadResponse = await fetch('upload_elevation_files.php', {
                                                method: 'POST',
                                                body: uploadData
                                            });

                                            // **Atualizar** a barra de progresso para 100% após a conclusão do upload
                                            const progressBar = Swal.getPopup().querySelector('#fake-progress');
                                            progressBar.style.width = '100%';
                                            clearInterval(window.fakeProgressInterval);

                                            const uploadResult = await uploadResponse.json();

                                            if (uploadResult.success) {
                                                Swal.fire('Sucesso', 'Arquivos enviados com sucesso. Tentando novamente obter os dados de elevação...', 'success');
                                                addToLog('Arquivos de elevação enviados com sucesso.');
                                                console.warn("Arquivos de elevação enviados com sucesso.");

                                                // Tentar novamente obter os dados de elevação
                                                return await fetchElevationData(bounds);
                                            } else {
                                                Swal.fire('Erro', uploadResult.message || 'Falha ao enviar os arquivos de elevação.', 'error');
                                                addToLog('Erro: Falha ao enviar os arquivos de elevação:', uploadResult.message);
                                                console.warn("Falha ao enviar os arquivos de elevação");
                                                return null;
                                            }
                                        } catch (uploadError) {
                                            Swal.fire('Erro', 'Erro ao enviar os arquivos de elevação.', 'error');
                                            addToLog('Erro ao enviar os arquivos de elevação:', uploadError);
                                            console.warn("Erro ao enviar os arquivos de elevação.");
                                            return null;
                                        }
                                    } else {
                                        // Usuário cancelou o upload
                                        Swal.fire('Aviso', 'Operação cancelada pelo usuário.', 'warning');
                                        return null;
                                    }


                                } else {
                                    // Usuário cancelou a ação
                                    return null;
                                }
                            } else {
                                addToLog('Erro ao obter dados de elevação:', errorData.error);
                                console.warn("Erro ao obter os dados de elevação.");
                                return null;
                            }
                        } else {
                            const elevationData = await response.json();

                            if (!Array.isArray(elevationData) || elevationData.length === 0) {
                                addToLog('Erro: Dados de elevação inválidos ou vazios.');
                                console.warn("Erro: Dados de elevação inválidos ou vazios");
                                return null;
                            }

                            Swal.close();
                            return elevationData;
                        }
                    } catch (error) {
                        addToLog('Erro ao obter os dados de elevação:', error);
                        console.warn("Erro ao obter os dados de elevação.");
                        return null;
                    }
                }




                // Função para executar a tarefa de encontrar o ponto mais alto
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
                    function calculateDistance(latlng1, latlng2) {
                        return map.distance(latlng1, latlng2);
                    }

                    // Função para obter os centróides potenciais (usando grade ou centroides)
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




















                document.getElementById('startPlanning').addEventListener('click', async function () {
                    const startButton = document.getElementById('startPlanning');

                    // Desabilita o botão para evitar novos cliques
                    startButton.disabled = true;

                    try {
                        await taskEditor.startPlanning(); // Aguarda a conclusão da sequência de tarefas
                    } catch (error) {
                        console.error('Erro na execução da sequência de tarefas:', error);
                    } finally {
                        // Reabilita o botão após a conclusão
                        startButton.disabled = false;
                    }
                });








                // Função para deletar uma sequência de tarefas
                var taskSequenceStorage = window.PlanMilT.taskSequenceStorage.attach({
                    getTasks: () => taskSequence,
                    setTasks: tasks => { taskSequence = tasks; },
                    renderTasks: () => taskEditor.defineTasksInSingleScreen(),
                    sweetAlert: Swal,
                    request: fetch
                });
                var deleteTaskSequence = taskSequenceStorage.deleteTaskSequence;
                var saveTaskSequence = taskSequenceStorage.saveTaskSequence;
                var loadTaskSequences = taskSequenceStorage.loadTaskSequences;
                var loadTaskSequenceDetails = taskSequenceStorage.loadTaskSequenceDetails;

                var selectedLayers = []; // Agora é um array para armazenar múltiplos usuários
                var intervalId;     // Variável para armazenar o intervalo de atualização
                var layerRegistry = {}; // Para garantir que as camadas estejam registradas corretamente
                var previousGeoJsonData = {}; // Para armazenar o estado anterior da camada carregada

                // Função para gerar um hash de um objeto GeoJSON
                function generateGeoJsonHash(geoJsonObject) {
                    return JSON.stringify(geoJsonObject);  // Pode usar uma função de hash mais sofisticada, se necessário
                }

                async function reloadLayer() {
                    if (!selectedLayers || selectedLayers.length === 0) {
                        Swal.fire('Nenhum usuário fornecido!', 'Por favor, insira pelo menos um nome de usuário para carregar a camada.', 'warning');
                        return;
                    }

                    for (const layerName of selectedLayers) {
                        try {
                            const response = await fetch("/carregar.php", {
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
                function isValidGeoJson(geoJsonObject) {
                    return geoJsonObject && typeof geoJsonObject === 'object' &&
                        (geoJsonObject.type === 'Feature' || geoJsonObject.type === 'FeatureCollection') &&
                        (geoJsonObject.type === 'FeatureCollection' ? geoJsonObject.features && Array.isArray(geoJsonObject.features) : true);
                }

                // Função para solicitar os nomes dos usuários e configurar o tempo de atualização
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

                        fetch(proxyURL)
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



                document.getElementById('helpButton').addEventListener('click', function() {
                    Swal.fire({
                        title: 'Ajuda - Guia de Botões',
                        html: `
<div id="helpTabs" style="display: flex; justify-content: center; margin-bottom: 10px;">
<button class="swal2-styled" id="btnGeneral" style="margin: 0 10px;">Geral</button>
<button class="swal2-styled" id="btnDraw" style="margin: 0 10px;">Desenho</button>
<button class="swal2-styled" id="btnLayers" style="margin: 0 10px;">Camadas</button>
<button class="swal2-styled" id="btnLeafletControls" style="margin: 0 10px;">Leaflet Controls</button>
            </div>
<div id="generalHelp" class="help-section">
<p><i class="fas fa-file-export"></i> <b>Exportar para KMZ:</b> Exporte o conteúdo do mapa para um arquivo KMZ.</p>
<p><i class="fas fa-file-import"></i> <b>Importar KMZ:</b> Importe arquivos KMZ para visualização no mapa.</p>
<p><i class="fas fa-map-marker-alt"></i> <b>Localização:</b> Mostra/esconde sua localização atual.</p>
<p><i class="fas fa-save"></i> <b>Salvar Desenhos:</b> Salve os desenhos feitos no mapa.</p>
<p><i class="fas fa-download"></i> <b>Carregar Desenhos:</b> Carregue desenhos salvos anteriormente.</p>
<p><i class="fas fa-images"></i> <b>Carregar Imagens:</b> Carregue imagens no mapa como camadas de sobreposição.</p>
<p><i class="fas fa-share-alt"></i> <b>Compartilhar Link:</b> Gere e compartilhe um link com as camadas atuais.</p>
<p><i class="fas fa-network-wired"></i> <b>Planejamento Automático:</b> Inicia o processo de planejamento automático no mapa.</p>
            </div>
<div id="drawHelp" class="help-section" style="display:none;">
<p><i class="fas fa-minus"></i> <b>Desenhar Linha:</b> Ferramenta para desenhar linhas no mapa.</p>
<p><i class="fas fa-draw-polygon"></i> <b>Desenhar Polígono:</b> Ferramenta para desenhar polígonos no mapa.</p>
<p><i class="fas fa-square"></i> <b>Desenhar Quadrado:</b> Ferramenta para desenhar quadrados no mapa.</p>
<p><i class="fas fa-circle"></i> <b>Desenhar Círculo:</b> Ferramenta para desenhar círculos no mapa.</p>
<p><i class="fas fa-map-marker-alt"></i> <b>Adicionar Marcador:</b> Ferramenta para colocar um marcador no mapa.</p>
<p><i class="fas fa-pencil-alt"></i> <b>Editar Elementos:</b> Ferramenta para mover elementos desenhados no mapa.</p>
<p><i class="fas fa-trash"></i> <b>Excluir Elementos:</b> Ferramenta para excluir elementos desenhados no mapa.</p>
            </div>

<div id="layersHelp" class="help-section" style="display:none;">
<p><i class="fas fa-plus"></i> <b>Adicionar Camada:</b> Adicione uma camada ao mapa.</p>
<p><i class="fas fa-minus"></i> <b>Remover Camada:</b> Remova uma camada do mapa.</p>
<p><i class="fas fa-save"></i> <b>Salvar Sugestão de Planejamento:</b> Salve a camada de sugestão de planejamento.</p>
<p><i class="fas fa-sync-alt"></i> <b>Inserir Camada Atualizável:</b> Insira uma camada que será atualizada automaticamente.</p>
<p><i class="fas fa-layer-group"></i> <b>Controles de Camadas:</b> Use os controles de camadas à direita para ativar/desativar camadas no mapa.</p>
            </div>
<div id="leafletControlsHelp" class="help-section" style="display:none;">
<p><i class="fas fa-ruler"></i> <b>Medir Distância/Área:</b> Ferramenta de medição de distâncias e áreas.</p>
<p><i class="fas fa-print"></i> <b>Imprimir Mapa:</b> Imprime o mapa atual com a escala selecionada.</p>
<p><i class="fas fa-search-plus"></i> <b>Zoom In:</b> Aumenta o zoom no mapa.</p>
<p><i class="fas fa-search-minus"></i> <b>Zoom Out:</b> Diminui o zoom no mapa.</p>
            </div>
`,
                        confirmButtonText: 'Fechar',
                        didOpen: () => {
                            // Função para trocar as abas ao clicar
                            document.getElementById('btnGeneral').addEventListener('click', function() {
                                toggleSections('generalHelp');
                            });
                            document.getElementById('btnDraw').addEventListener('click', function() {
                                toggleSections('drawHelp');
                            });
                            document.getElementById('btnLayers').addEventListener('click', function() {
                                toggleSections('layersHelp');
                            });
                            document.getElementById('btnLeafletControls').addEventListener('click', function() {
                                toggleSections('leafletControlsHelp');
                            });
                        }
                    });

                    // Função para mostrar/esconder seções de ajuda
                    function toggleSections(sectionId) {
                        const sections = document.querySelectorAll('.help-section');
                        sections.forEach(section => section.style.display = 'none');
                        document.getElementById(sectionId).style.display = 'block';
                    }
                });

                document.getElementById('savePlanningButton').addEventListener('click', function() {
                    // Utiliza o SweetAlert2 para solicitar o usuário e senha
                    Swal.fire({
                        title: 'Insira suas credenciais',
                        html: `
<input type="text" id="swal-input-usuario" class="swal2-input" placeholder="Usuário">
<input type="password" id="swal-input-senha" class="swal2-input" placeholder="Senha">
`,
                        focusConfirm: false,
                        preConfirm: () => {
                            const usuario = document.getElementById('swal-input-usuario').value;
                            const senha = document.getElementById('swal-input-senha').value;
                            if (!usuario || !senha) {
                                Swal.showValidationMessage('Usuário e senha são necessários!');
                                return false;
                            }
                            return { usuario: usuario, senha: senha };
                        }
                    }).then((result) => {
                        if (result.isConfirmed) {
                            const { usuario, senha } = result.value;

                            // Gera o GeoJSON da camada "Sugestão de Planejamento"
                            const planejamentoData = planejamentoLayer.toGeoJSON();

                            // Itera por cada feature para incluir propriedades personalizadas
                            planejamentoData.features.forEach(function(feature) {
                                // Obtém o ID único da feature no Leaflet
                                const layerId = feature.properties._leaflet_id;
                                const layer = planejamentoLayer.getLayer(layerId);

                                if (layer && layer.options) {
                                    // Se a camada possui um ícone (marcador)
                                    if (layer.options.icon && layer.options.icon.options.iconUrl) {
                                        feature.properties.iconUrl = layer.options.icon.options.iconUrl;
                                        // Adicione outras propriedades do ícone, se necessário
                                    }
                                    // Se a camada possui uma cor (formas como polígonos ou linhas)
                                    if (layer.options.color) {
                                        feature.properties.color = layer.options.color;
                                    }
                                }
                            });

                            // Obtém a URL completa da janela atual
                            const urlCompleta = window.location.href;

                            // Extrai o diretório a partir da URL completa usando expressão regular
                            const padraoDiretorio = /https:\/\/methodux\.online\/(.*?)\//;
                            const resultado = padraoDiretorio.exec(urlCompleta);

                            // A variável 'diretorio' conterá o diretório atual, ou uma string vazia se não encontrado
                            const diretorio = resultado ? resultado[1] : '';

                            // Prepara os dados a serem enviados
                            const data = {
                                usuario: usuario,
                                senha: senha,
                                link: diretorio, // Diretório a ser usado na requisição
                                leaflet: JSON.stringify(planejamentoData) // Converte os dados da camada para uma string JSON
                            };

                            // Envio dos dados via AJAX usando jQuery
                            $.ajax({
                                type: "POST",
                                url: "/salvar.php", // Substitua pelo caminho correto para sua página PHP
                                data: data,
                                success: function(response) {
                                    Swal.fire('Sucesso!', 'Sugestão de Planejamento salva com sucesso!', 'success');
                                },
                                error: function(xhr, status, error) {
                                    console.error("Erro ao salvar a Sugestão de Planejamento:", error);
                                    Swal.fire('Erro!', 'Não foi possível salvar a Sugestão de Planejamento.', 'error');
                                }
                            });
                        }
                    });
                });


