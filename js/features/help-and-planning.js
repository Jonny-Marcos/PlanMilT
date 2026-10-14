/**
 * @fileoverview Apresenta a ajuda da interface e envia a camada de sugestão de planejamento ao servidor.
 * @requires DOM, Swal, jQuery, mapa e planejamentoLayer no escopo legado.
 */
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
                    /**
                     * Exibe a seção de ajuda escolhida e oculta as demais.
                     * @param {string} sectionId - Identificador da seção a exibir.
                     */
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
                                url: "/salvar.php",
                                data: data,
                                success: function(response) {
                                    if (response.includes('Desenho atualizado com sucesso!') || response.includes('Desenho salvo com sucesso!')) {
                                        Swal.fire('Sucesso!', 'Sugestão de Planejamento salva com sucesso!', 'success');
                                        console.info('[PlanMilT][Planejamento] Sugestão salva.', {
                                            featureCount: planejamentoData.features.length
                                        });
                                    } else {
                                        Swal.fire('Erro!', 'Não foi possível salvar a Sugestão de Planejamento.', 'error');
                                        console.error('[PlanMilT][Planejamento] Servidor recusou o salvamento.');
                                    }
                                },
                                error: function(xhr, status, error) {
                                    console.error("Erro ao salvar a Sugestão de Planejamento:", error);
                                    Swal.fire('Erro!', 'Não foi possível salvar a Sugestão de Planejamento.', 'error');
                                }
                            });
                        }
                    });
                });
