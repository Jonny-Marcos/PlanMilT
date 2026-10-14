/**
 * @fileoverview Controla a visualização de perfis de elevação e o carregamento de imagens georreferenciadas.
 * @requires Leaflet, Chart, API client, DOM e Swal no escopo legado.
 */
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
            /**
             * Solicita elevações entre dois marcadores e apresenta o perfil resultante.
             * @param {Object} marker1 - Primeiro marcador Leaflet do perfil.
             * @param {Object} marker2 - Segundo marcador Leaflet do perfil.
             */
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



            /**
             * Carrega as imagens identificadas pelo parâmetro do link compartilhado.
             * @param {string} calco - Identificador ou lista de identificadores de imagens.
             */
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

            /**
             * Desenha o gráfico de elevação e mantém seus marcadores sincronizados.
             * @param {*} elevationData - Valor de entrada usado durante esta operação.
             * @param {Object} midpoint - Valor de entrada usado durante esta operação.
             */
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

