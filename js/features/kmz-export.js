/**
 * @fileoverview Converte desenhos e camadas selecionadas para KML e gera o arquivo KMZ para download.
 * @exports window.PlanMilT.kmzExport
 * @requires Leaflet, JSZip e recursos opcionais de captura
 */
window.PlanMilT = window.PlanMilT || {};

window.PlanMilT.kmzExport = Object.freeze({
    /**
     * Conecta o botão de exportação e prepara a conversão e o download KMZ.
     * @param {Object} dependencies - Dependências externas necessárias para inicializar o módulo.
     * @param {Object} dependencies.map - Instância Leaflet do mapa principal.
     * @param {Object} dependencies.drawnItems - Grupo Leaflet com os elementos desenhados pelo usuário.
     * @param {Object} dependencies.layerRegistry - Registro das camadas disponíveis no mapa.
     * @param {HTMLElement} dependencies.button - Botão DOM que aciona o recurso.
     * @param {Object} dependencies.zipArchive - Biblioteca JSZip usada para gerar o arquivo compactado.
     * @param {Object} dependencies.sweetAlert - Interface SweetAlert para confirmação, carregamento e notificações.
     * @param {Function} dependencies.captureCanvas - Função que captura canvas para incluí-los na exportação.
     */
    attach({ map, drawnItems, layerRegistry, button, zipArchive, sweetAlert, captureCanvas }) {
        const JSZip = zipArchive;
        const Swal = sweetAlert;
        const html2canvas = captureCanvas;

            /**
             * Serializa os desenhos e inicia o download de um arquivo KMZ.
             */
            async function exportDrawingsToKMZ() {
                try {
                    // Obtém os dados dos desenhos existentes
                    var geoJsonData = drawnItems.toGeoJSON();

                    // Verifica se a camada "Sugestão de Planejamento" existe no layerRegistry
                    if (layerRegistry.hasOwnProperty("Sugestão de Planejamento")) {
                        var sugestaoLayer = layerRegistry["Sugestão de Planejamento"];

                        // Verifica se a camada possui layers internos
                        if (sugestaoLayer.getLayers && sugestaoLayer.getLayers().length > 0) {

                            // Obtém os dados da camada "Sugestão de Planejamento"
                            var sugestaoGeoJSON = sugestaoLayer.toGeoJSON();

                            // Verifica se há features no GeoJSON
                            if (sugestaoGeoJSON.features && sugestaoGeoJSON.features.length > 0) {
                                // Adiciona uma propriedade 'folderName' para agrupar em uma pasta
                                sugestaoGeoJSON.features.forEach(feature => {
                                    feature.properties.folderName = "Sugestão de Planejamento";
                                    // Garantir que cada feature tenha 'name' e 'description'
                                    feature.properties.name = feature.properties.name || "";
                                    feature.properties.description = feature.properties.description || "";
                                });

                                // Combina as features dos desenhos com as da camada "Sugestão de Planejamento"
                                geoJsonData.features = geoJsonData.features.concat(sugestaoGeoJSON.features);
                            }
                        }
                    }

                    // Função para inserir o Folder "Sugestão de Planejamento" no KML
                            // Converte GeoJSON para KML com suporte para ícones e estilos usando geojsontokml
                            var kmlData = geojsontokml(geoJsonData, {
                            name: 'name',
                                  description: 'description',
                                      documentName: 'A Escola da Tatica',
                                          documentDescription: 'KMZ exportado por escoladatatica.fun',
                                              folderName: function(properties) {
                                                  return properties.folderName || 'Outras Features';
                                              }
                        });

                        // Define as tags de início e fim do Folder
                        const folderStartTag = `<Folder><name>Sugestão de Planejamento</name>`;
                        const folderEndTag = `</Folder>`;

                        // Expressão regular para encontrar todos os Placemark
                        const placemarkRegex = /<Placemark>[\s\S]*?<\/Placemark>/g;
                        const allPlacemarks = kmlData.match(placemarkRegex);

                        // Filtrar os Placemarks que pertencem à "Sugestão de Planejamento"
                        const folderPlacemarks = allPlacemarks.filter(placemark => placemark.includes('<name>Conexão TAR</name>') || placemark.includes('<name>NA Sugerido</name>')|| placemark.includes('<name>Enlace Sugerido</name>')|| placemark.includes('<name>EIR Sugerido</name>')|| placemark.includes('<name>CN Sugerido</name>') || placemark.includes('<name>TAR Sugerido</name>') || placemark.includes('<name>Cobertura TAR</name>'));

                        // Remover os Placemarks da "Sugestão de Planejamento" do kmlData original
                        folderPlacemarks.forEach(placemark => {
                            kmlData = kmlData.replace(placemark, '');
                        });

                        // Criar a seção do Folder com os Placemarks filtrados
                        const folderKml = `${folderStartTag}\n${folderPlacemarks.join('\n')}\n${folderEndTag}`;

                        // Inserir o Folder no KML antes do fechamento de </Document>
                        kmlData = kmlData.replace('</Document>', `${folderKml}\n</Document>`);

                        // Continua com a criação do ZIP e download
                        var zip = new JSZip();
                        zip.file("doc.kml", kmlData);

                        // Pergunta ao usuário se ele deseja adicionar imagens da camada atual
                        const result = await Swal.fire({
                            title: 'Adicionar Imagens ao KMZ?',
                            text: 'Você deseja adicionar imagens da camada atual, como as cartas do BDGEx? Isso pode aumentar o tamanho do arquivo.',
                            icon: 'question',
                            showCancelButton: true,
                            confirmButtonText: 'Sim, adicionar',
                            cancelButtonText: 'Não, obrigado'
                        });

                        if (result.isConfirmed) {
                            await addBDGExLayerToKMZ(zip);
                        }

                        // Baixa os ícones necessários, converte para PNG e adiciona ao zip
                        var uniqueIcons = [...new Set(geoJsonData.features.map(f => f.properties.iconUrl).filter(Boolean))];

                        await Promise.all(uniqueIcons.map(async (iconUrl) => {
                            try {
                                const response = await window.PlanMilT.apiClient.request(iconUrl);
                                if (!response.ok) {
                                    throw new Error(`Falha ao carregar o ícone (HTTP ${response.status}).`);
                                }
                                const iconBlob = await response.blob();
                                const iconName = iconUrl.split('/').pop().replace(/\.\w+$/, '.png');

                                // Converte a imagem para PNG
                                const img = document.createElement('img');
                                img.src = URL.createObjectURL(iconBlob);
                                await new Promise((resolve, reject) => {
                                    img.onload = () => resolve();
                                    img.onerror = (err) => reject(err);
                                });

                                const canvas = document.createElement('canvas');
                                const ctx = canvas.getContext('2d');
                                canvas.width = img.width;
                                canvas.height = img.height;
                                ctx.drawImage(img, 0, 0);

                                const pngBlob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
                                zip.file(`files/${iconName}`, pngBlob);
                            } catch (error) {
                                console.error('Erro ao processar o ícone:', error);
                            }
                        }));

                        // Gera o arquivo KMZ e faz o download
                        try {
                            const content = await zip.generateAsync({ type: "blob" });
                            var link = document.createElement("a");
                            link.href = URL.createObjectURL(content);
                            link.download = "aescoladatatica.kmz";
                            link.click();
                            console.info('[PlanMilT][KMZ] Exportação concluída.', {
                                featureCount: geoJsonData.features.length,
                                iconCount: uniqueIcons.length
                            });
                        } catch (error) {
                            console.error("Erro ao gerar o KMZ:", error);
                        }
                    } catch (error) {
                        console.error("Erro na função exportDrawingsToKMZ:", error);
                    }
                }







                /**
                 * Adiciona ao arquivo KMZ uma captura georreferenciada opcional da camada BDGEx.
                 * @param {Object} zip - Arquivo ZIP/KMZ atualmente processado.
                 */
                async function addBDGExLayerToKMZ(zip) {
                    // Utiliza SweetAlert2 para a escolha da qualidade
                    const { value: qualityOption } = await Swal.fire({
                        title: 'Escolha a Qualidade da Imagem',
                        text: 'Selecione a qualidade desejada para exportar as imagens.',
                        icon: 'question',
                        input: 'select',
                        inputOptions: {
                            high: 'Alta Qualidade (1m30s - 10MB)',
                            medium: 'Média Qualidade (40s - 5MB)',
                            low: 'Baixa Qualidade (20s - 2,5MB)'
                        },
                        inputPlaceholder: 'Selecione uma qualidade',
                        showCancelButton: true,
                        confirmButtonText: 'Confirmar',
                        cancelButtonText: 'Cancelar'
                    });

                    // Define o número de divisões com base na escolha de qualidade
                    let divisions;
                    switch (qualityOption) {
                        case 'high':
                            divisions = 4; // Alta Qualidade: 4 divisões
                            break;
                        case 'medium':
                            divisions = 3; // Média Qualidade: 3 divisões
                            break;
                        case 'low':
                            divisions = 2; // Baixa Qualidade: 2 divisões
                            break;
                        default:
                            return; // Se o usuário cancelar, a função é encerrada
                                         }

                    const panels = [];
                    const mapElement = document.getElementById('map');
                    const originalZoom = map.getZoom();
                    const targetZoom = originalZoom + 2;
                    const bounds = map.getBounds();
                    const { north, south, east, west } = {
                        north: bounds.getNorth(),
                        south: bounds.getSouth(),
                        east: bounds.getEast(),
                        west: bounds.getWest()
                    };

                    const width = mapElement.offsetWidth;
                    const height = mapElement.offsetHeight;

                    const latStep = (north - south) / divisions;
                    const lonStep = (east - west) / divisions;

                    for (let i = 0; i < divisions; i++) {
                        for (let j = 0; j < divisions; j++) {
                            const panelNorth = north - i * latStep;
                            const panelSouth = north - (i + 1) * latStep;
                            const panelWest = west + j * lonStep;
                            const panelEast = west + (j + 1) * lonStep;
                            panels.push([[panelNorth, panelWest], [panelSouth, panelEast]]);
                        }
                    }

                    const images = [];
                    const elementsToHide = document.querySelectorAll('.leaflet-control, .leaflet-top, .leaflet-bottom, .leaflet-interactive');

                    // Oculta os elementos do Leaflet
                    elementsToHide.forEach(element => element.style.display = 'none');

                    // Garante que os elementos de texto estejam visíveis
                    const textElements = document.querySelectorAll('.custom-text-label');
                    textElements.forEach(element => element.style.display = 'block');

                    let cancelCapture = false; // Variável para controlar o cancelamento

                    // Configura a barra de progresso com SweetAlert2 e um botão de cancelamento
                    Swal.fire({
                        title: 'Capturando Imagens',
                        html: 'Progresso: <b>0%</b>',
                        icon: 'info',
                        allowOutsideClick: false,
                        showCancelButton: true, // Habilita o botão de cancelamento
                        cancelButtonText: 'Cancelar',
                        showConfirmButton: false, // Remove o botão de confirmação para evitar confusão
                        willOpen: () => {
                            Swal.showLoading();
                            // Listener para o botão de cancelar
                            Swal.getCancelButton().addEventListener('click', () => {
                                cancelCapture = true;
                                elementsToHide.forEach(element => element.style.display = ''); // Restaura os controles do mapa
                                Swal.close();
                            });
                        }
                    });


                    for (let index = 0; index < panels.length; index++) {
                        if (cancelCapture) break; // Verifica se o usuário cancelou

                        const panel = panels[index];
                        map.fitBounds(panel);
                        await new Promise(resolve => setTimeout(resolve, 5000)); // Aguarda o ajuste do mapa

                        const canvas = await html2canvas(mapElement, {
                            useCORS: true,
                            width: width,
                            height: height,
                            backgroundColor: null
                        });

                        images.push(canvas);

                        // Atualiza a barra de progresso
                        const progress = Math.round(((index + 1) / panels.length) * 100);
                        Swal.getHtmlContainer().querySelector('b').textContent = `${progress}%`;
                    }

                    if (cancelCapture) {
                        // Reexibe os elementos e restaura o zoom original caso o usuário cancele
                        elementsToHide.forEach(element => element.style.display = '');
                        map.setZoom(originalZoom);
                        map.fitBounds(bounds);
                        Swal.fire('Operação Cancelada', 'A captura das imagens foi cancelada.', 'info');
                        return;
                    }

                    // Exibe novamente os elementos do Leaflet
                    elementsToHide.forEach(element => element.style.display = '');

                    // Restaura o zoom original do mapa
                    map.setZoom(originalZoom);
                    map.fitBounds(bounds);

                    // Unir as imagens capturadas em uma única imagem
                    const finalCanvas = document.createElement('canvas');
                    finalCanvas.width = width * divisions;
                    finalCanvas.height = height * divisions;
                    const finalCtx = finalCanvas.getContext('2d');

                    images.forEach((canvas, index) => {
                        const row = Math.floor(index / divisions);
                        const col = index % divisions;
                        const x = col * width;
                        const y = row * height;
                        finalCtx.drawImage(canvas, x, y, width, height);
                    });

                    const jpegBlob = await new Promise(resolve => finalCanvas.toBlob(resolve, 'image/jpeg', 0.95));

                    // Adiciona a imagem ao zip
                    const imageName = 'BDGEx_CTM50.jpg';
                    zip.file(`files/${imageName}`, jpegBlob);

                    // Cria a entrada GroundOverlay para o KML
                    const groundOverlay = `
<GroundOverlay>
<name>Carta BDGEx</name>
<visibility>0</visibility>
<Icon>
<href>files/${imageName}</href>
<viewBoundScale>0.75</viewBoundScale>
            </Icon> 
<LatLonBox>
<north>${north}</north>
<south>${south}</south>
<east>${east}</east>
<west>${west}</west>
            </LatLonBox>
            </GroundOverlay>`;

                    // Adiciona o GroundOverlay ao KML existente
                    const kmlData = await zip.file("doc.kml").async("string");
                    const newKmlData = kmlData.replace('</Document>', `${groundOverlay}</Document>`);
                    zip.file("doc.kml", newKmlData);

                    // Fecha o SweetAlert2 ao finalizar
                    Swal.close();
                }















                /**
                 * Converte uma estrutura GeoJSON para a representação textual KML.
                 * @param {Object} geojson - Objeto GeoJSON a converter.
                 * @param {Object} options - Opções adicionais que personalizam a operação.
                 */
                function geojsontokml(geojson, options) {
                    const kmlHeader = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
<name>${options.documentName}</name>
<description>${options.documentDescription}</description>`;

                    const kmlFooter = `</Document></kml>`;

                    /**
                     * Converte uma cor hexadecimal e opacidade para o formato KML.
                     * @param {string} hex - Cor hexadecimal de origem.
                     * @param {number} opacity - Opacidade numérica entre zero e um.
                     */
                    function adjustColorOpacity(hex, opacity) {
                        const alpha = Math.round(opacity * 255).toString(16).padStart(2, '0');
                        const red = hex.slice(1, 3);
                        const green = hex.slice(3, 5);
                        const blue = hex.slice(5, 7);
                        return alpha + blue + green + red; // AABBGGRR
                    }

                    /**
                     * Remove marcação HTML para obter texto simples para o KML.
                     * @param {string} html - Marcação HTML a processar.
                     */
                    function stripHTML(html) {
                        let tmp = document.createElement("DIV");
                        tmp.innerHTML = html;
                        return tmp.textContent || tmp.innerText || "";
                    }

                    /**
                     * Serializa uma feição GeoJSON como um Placemark KML.
                     * @param {Object} feature - Feição GeoJSON associada à camada.
                     */
                    function createPlacemark(feature) {
                        const geometryType = feature.geometry.type;
                        const coordinates = feature.geometry.coordinates;
                        const properties = feature.properties;
                        const iconUrl = properties.iconUrl ? `files/${properties.iconUrl.split('/').pop().replace(/\.\w+$/, '.png')}` : '';
                        const styleUrl = iconUrl ? `<styleUrl>#m_${iconUrl}</styleUrl>` : '';
                        const color = properties.color ? adjustColorOpacity(properties.color, 1.0) : 'ff000000';
                        const fillColor = properties.color ? adjustColorOpacity(properties.color, 0.6) : '99000000';
                        const lineColor = properties.color ? adjustColorOpacity(properties.color, 1.0) : 'ff000000';

                        if (geometryType === "Point") {
                            const textContent = properties.text ? stripHTML(properties.text) : '';
                            if (textContent) {
                                return `<Placemark>
<name>${textContent}</name>
<description>${properties.description || ''}</description>
<Style>
<IconStyle>
<Icon>
<href></href>
            </Icon>
            </IconStyle>
<LabelStyle>
<color>ff000000</color>
<scale>1</scale>
            </LabelStyle>
            </Style>
<Point>
<coordinates>${coordinates.join(',')}</coordinates>
            </Point>
            </Placemark>`;
                            } else {
                                return `<Placemark>
<name>${properties.name || ''}</name>
<description>${properties.description || ''}</description>
${styleUrl}
<Point>
<coordinates>${coordinates.join(',')}</coordinates>
            </Point>
            </Placemark>`;
                            }
                        } else if (geometryType === "LineString") {
                            const lineCoordinates = coordinates.map(coord => coord.join(',')).join(' ');
                            return `<Placemark>
<name>${properties.name || ''}</name>
<description>${properties.description || ''}</description>
<Style>
<LineStyle>
<color>${lineColor}</color>
<width>2</width>
            </LineStyle>
            </Style>
<LineString>
<coordinates>${lineCoordinates}</coordinates>
            </LineString>
            </Placemark>`;
                        } else if (geometryType === "Polygon") {
                            const polygonCoordinates = coordinates.map(ring => ring.map(coord => coord.join(',')).join(' ')).join(' ');
                            return `<Placemark>
<name>${properties.name || ''}</name>
<description>${properties.description || ''}</description>
<Style>
<LineStyle>
<color>${lineColor}</color>
            </LineStyle>
<PolyStyle>
<color>${fillColor}</color>
            </PolyStyle>
            </Style>
<Polygon>
<outerBoundaryIs>
<LinearRing>
<coordinates>${polygonCoordinates}</coordinates>
            </LinearRing>
            </outerBoundaryIs>
            </Polygon>
            </Placemark>`;
                        }
                    }

                    /**
                     * Gera definições de estilo KML para os tipos de feição encontrados.
                     * @param {Array<*>} features - Feições GeoJSON a converter ou estilizar.
                     */
                    function createStyles(features) {
                        const uniqueIcons = [...new Set(features.map(f => f.properties.iconUrl).filter(Boolean))];
                        return uniqueIcons.map(iconUrl => {
                            const localUrl = `files/${iconUrl.split('/').pop().replace(/\.\w+$/, '.png')}`;
                            return `
<Style id="${localUrl}">
<IconStyle>
<Icon>
<href>${localUrl}</href>
            </Icon>
<hotSpot x="0.5" y="0.5" xunits="fraction" yunits="fraction"/>
            </IconStyle>
<ListStyle>
<ItemIcon>
<href>${localUrl}</href>
            </ItemIcon>
            </ListStyle>
            </Style>
<StyleMap id="m_${localUrl}">
<Pair>
<key>normal</key>
<styleUrl>#${localUrl}</styleUrl>
            </Pair>
<Pair>
<key>highlight</key>
<styleUrl>#${localUrl}</styleUrl>
            </Pair>
            </StyleMap>`;
                        }).join('');
                    }

                    const placemarks = geojson.features.map(createPlacemark).join('');
                    const styles = createStyles(geojson.features);

                    return `${kmlHeader}${styles}${placemarks}${kmlFooter}`;
                }

        button.addEventListener('click', exportDrawingsToKMZ);
        return Object.freeze({ geojsontokml });
    }
});
