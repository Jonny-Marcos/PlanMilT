/**
 * @fileoverview Carrega camadas por usuário a partir dos parâmetros do link e constrói links compartilháveis com imagens.
 * @requires Endpoints de desenhos/imagens, Leaflet, DOM e Swal no escopo legado.
 */
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
                    /**
                     * Lê e decodifica um parâmetro da query string.
                     * @param {string} name - Nome ou identificador associado à operação.
                     * @param {string} url - URL ou caminho relativo do endpoint/recurso.
                     */
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
                /**
                 * Acrescenta um usuário à lista do formulário de compartilhamento.
                 * @param {string} userName - Nome de usuário inserido para compartilhamento.
                 */
                function addUserToList(userName) {
                    const userList = document.getElementById('userList');
                    const userDiv = document.createElement('div');
                    userDiv.className = 'user';
                    userDiv.textContent = userName;
                    userList.appendChild(userDiv);
                }

                // Função para carregar imagens do servidor
                /**
                 * Carrega a lista de imagens e preenche o seletor de compartilhamento.
                 */
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
























