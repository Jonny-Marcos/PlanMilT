/**
 * @fileoverview Importa arquivos KMZ, interpreta estilos e geometrias KML e adiciona o conteúdo ao mapa.
 * @requires Leaflet, JSZip, DOMParser, TinyMCE e controles globais do mapa.
 */




            document.getElementById('importKMZ').addEventListener('click', function() {
                document.getElementById('fileInput').click(); // Deve acionar o clique no input de arquivo
            });


            /**
             * Apresenta o editor de texto para uma coordenada do mapa.
             * @param {Object} layer - Camada Leaflet ou feição processada.
             * @param {*} latlng - Coordenada geográfica Leaflet.
             */
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
            /**
             * Calcula o número da zona UTM correspondente à longitude.
             * @param {number} lng - Valor de entrada usado durante esta operação.
             */
            function getUtmZone(lng) {
                return Math.floor((lng + 180) / 6) + 1;
            }

            /**
             * Determina o hemisfério a partir da latitude.
             * @param {number} lat - Valor de entrada usado durante esta operação.
             */
            function getHemisphere(lat) {
                return lat >= 0 ? 'north' : 'south';
            }

            /**
             * Converte latitude e longitude para coordenadas UTM.
             * @param {number} lat - Valor de entrada usado durante esta operação.
             * @param {number} lng - Valor de entrada usado durante esta operação.
             */
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



            /**
             * Apresenta o editor de texto para uma coordenada do mapa.
             * @param {*} latlng - Coordenada geográfica Leaflet.
             * @param {Function} callback - Função chamada após a operação configurada.
             * @param {string} initialContent - Conteúdo inicial do editor de texto.
             */
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

            /**
             * Extrai ícones e imagens referenciados no KML do arquivo KMZ.
             * @param {string} kmlContent - Documento KML extraído do arquivo KMZ.
             * @param {Object} zip - Arquivo ZIP/KMZ atualmente processado.
             * @param {Object} importLayer - Grupo Leaflet de destino do conteúdo importado.
             */
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

            /**
             * Lê estilos e geometrias LineString de um documento KML.
             * @param {string} kmlContent - Documento KML extraído do arquivo KMZ.
             * @param {Object} importLayer - Grupo Leaflet de destino do conteúdo importado.
             */
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

            /**
             * Lê GroundOverlay KML e adiciona a imagem georreferenciada ao mapa.
             * @param {string} kmlContent - Documento KML extraído do arquivo KMZ.
             * @param {Object} zip - Arquivo ZIP/KMZ atualmente processado.
             * @param {Object} importLayer - Grupo Leaflet de destino do conteúdo importado.
             */
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

            /**
             * Converte a cor KML ABGR para a notação hexadecimal RGB.
             * @param {string} kmlColor - Cor no formato ABGR definida pelo KML.
             */
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
