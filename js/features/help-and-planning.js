/**
 * @fileoverview Apresenta a ajuda da interface e envia a camada de sugestão de planejamento ao servidor.
 * @requires DOM, Swal, jQuery, mapa e planejamentoLayer no escopo legado.
 */
                /**
                 * Apresenta o guia de controles a partir da tela de boas-vindas.
                 */
                function showButtonGuide() {
                    Swal.fire({
                        title: 'Ajuda do PlanMilT',
                        customClass: { popup: 'planmilt-help-modal' },
                        html: `<style>
.swal2-popup.planmilt-help-modal { width:min(820px,calc(100vw - 28px))!important; padding:20px!important; }
#planmiltHelp { text-align:left; font:14px/1.5 sans-serif; color:#27364a; }
#planmiltHelp .help-intro { margin:0 0 12px; }
#planmiltHelp .help-sections { max-height:45vh; overflow-y:auto; border:1px solid #d3d8e0; border-radius:6px; }
#planmiltHelp details { border-bottom:1px solid #d3d8e0; }
#planmiltHelp details:last-child { border-bottom:0; }
#planmiltHelp summary { cursor:pointer; padding:12px; font-weight:600; background:#f4f6f9; }
#planmiltHelp summary:focus-visible, #planmiltHelp button:focus-visible, #planmiltHelp input:focus-visible { outline:3px solid #435f88; outline-offset:2px; }
#planmiltHelp details > div { padding:2px 12px 8px; }
#planmiltHelp p { margin:8px 0; }
#planmiltHelp .help-settings { margin-top:14px; padding:12px; background:#eef1f5; border-radius:6px; }
#planmiltHelp label { display:flex; align-items:center; gap:8px; }
#planmiltHelp label input { width:auto; margin:0; }
#planmiltHelp button { min-height:40px; margin:10px 0 0; padding:8px 12px; border:1px solid #435f88; border-radius:6px; background:#fff; color:#27364a; cursor:pointer; }
#planmiltHelp #helpStorageError { color:#a00000; }
</style>
<div id="planmiltHelp">
<p class="help-intro">Escolha um assunto para conhecer as ferramentas e seus usos.</p>
<div class="help-sections">
<details open><summary>Começar e navegar no mapa</summary><div>
<p><b>Mostrar ou ocultar controles:</b> use o ícone de olho na barra de ferramentas. Em telas pequenas, os controles começam ocultos.</p>
<p><b>Localização, zoom e busca:</b> mostre sua localização, aproxime ou afaste o mapa e pesquise lugares. Use os controles de medição e impressão para medir distâncias ou áreas e imprimir o mapa.</p>
<p><b>Dados do ponto:</b> clique com o botão direito ou mantenha o toque pressionado para consultar coordenadas e elevação. O link opcional do Street View abre o Google Maps e envia a coordenada selecionada ao Google.</p>
</div></details>
<details><summary>Desenhos e simbologia</summary><div>
<p>Desenhe linhas, polígonos, retângulos, círculos, marcadores e texto; use as ferramentas de edição e exclusão para modificá-los. A ferramenta de desenho livre permite traçar à mão.</p>
<p><b>Simbologia militar:</b> use o controle de escudo para pesquisar gráficos táticos por seção, ver a prévia e informar uma designação opcional antes de desenhar.</p>
</div></details>
<details><summary>Salvar, carregar e compartilhar</summary><div>
<p><b>Salvar desenhos:</b> informe usuário e senha. Para carregar, informe o usuário e escolha edição ou camada não editável.</p>
<p><b>Recentes:</b> a tela de boas-vindas lista até dez planejamentos salvos ou carregados neste navegador. Não guarda senha nem cópia dos desenhos; limpar os dados do navegador pode apagar a lista.</p>
<p><b>KMZ e compartilhamento:</b> importe ou exporte arquivos KMZ e gere links para compartilhar camadas. Novas coberturas são incluídas no KMZ como imagens.</p>
</div></details>
<details><summary>Camadas e temas</summary><div>
<p>Use Adicionar Camadas para explorar recomendações e buscar camadas WMS; use Remover Camadas ou o controle de camadas para organizá-las. É possível inserir uma camada atualizável e salvar a Sugestão de Planejamento.</p>
<p><b>Imagens e temas:</b> em Carregar Imagens, escolha Criar tema para posicionar, redimensionar e girar uma imagem. Use Mover mapa para navegar sem deslocá-la; temas protegidos exigem senha para edição.</p>
</div></details>
<details><summary>Elevação e rádio</summary><div>
<p>Quando um arquivo de elevação estiver faltando, o PlanMilT tenta baixá-lo automaticamente e oferece envio manual se houver falha. O provedor recebe a região aproximada solicitada.</p>
<p><b>Predição de Enlace:</b> analise enlaces ou áreas de cobertura RF e ótica. Na área de cobertura, a resolução angular usa 32, 72 ou 180 radiais; a barra de progresso acompanha o cálculo das radiais.</p>
<p>Na cobertura RF, escolha Penetração/Difração alta, média ou baixa. Clique em uma nova cobertura RF para consultar a potência recebida aproximada; coberturas antigas podem não ter esse dado. A visada ótica não usa esse ajuste.</p>
<p>Os resultados são estimativas e não garantem cobertura real; valide-os em campo.</p>
</div></details>
<details><summary>Planejamento automático</summary><div>
<p>Em Planejamento Automático, monte e execute sequências de tarefas para gerar sugestões no mapa, analisar enlaces e propor repetidoras. Enquadre a região de interesse antes das análises RF ou óticas.</p>
<p>Para guardar a camada de sugestões, use Salvar Sugestão de Planejamento nos controles de camadas.</p>
</div></details>
</div>
<div class="help-settings">
<label><input id="helpWelcomeShow" type="checkbox"> Aparecer mensagem de boas-vindas ao abrir</label>
<p id="helpStorageError" role="status"></p>
<button id="helpOpenWelcome" type="button">Abrir boas-vindas e recentes</button>
</div>
</div>`,
                        confirmButtonText: 'Fechar',
                        didOpen: () => {
                            window.PlanMilT.welcome.bindPreference(
                                document.getElementById('helpWelcomeShow'),
                                document.getElementById('helpStorageError')
                            );
                            document.getElementById('helpOpenWelcome').addEventListener('click', () => {
                                Swal.close();
                                window.PlanMilT.welcome.show();
                            });
                        }
                    });
                }

                document.getElementById('helpButton').addEventListener('click', showButtonGuide);
                window.PlanMilT.showButtonGuide = showButtonGuide;
                document.addEventListener('DOMContentLoaded', async () => {
                    try {
                        await window.PlanMilT.sharedLayersReady;
                    } catch (error) {
                        console.error('[PlanMilT][Boas-vindas] Falha ao concluir o carregamento compartilhado.', error);
                        return;
                    }
                    if (!Swal.isVisible()) window.PlanMilT.welcome.show(true);
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
                            let planejamentoData;
                            try {
                                planejamentoData = window.PlanMilT.geoJsonSerialization.toFeatureCollection(planejamentoLayer);
                            } catch (error) {
                                console.error('[PlanMilT][Planejamento] Falha ao preparar o salvamento.', error);
                                Swal.fire('Erro!', 'Não foi possível preparar a Sugestão de Planejamento para salvamento.', 'error');
                                return;
                            }

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
                            let serializedData;
                            try {
                                serializedData = JSON.stringify(planejamentoData);
                            } catch (error) {
                                console.error('[PlanMilT][Planejamento] Falha ao serializar a sugestão.', error);
                                Swal.fire('Erro!', 'Não foi possível serializar a Sugestão de Planejamento.', 'error');
                                return;
                            }
                            const data = {
                                usuario: usuario,
                                senha: senha,
                                link: diretorio, // Diretório a ser usado na requisição
                                leaflet: serializedData
                            };

                            // Envio dos dados via AJAX usando jQuery
                            $.ajax({
                                type: "POST",
                                url: "/salvar.php",
                                data: data,
                                success: function(response) {
                                    if (response.includes('Desenho atualizado com sucesso!') || response.includes('Desenho salvo com sucesso!')) {
                                        const recorded = window.PlanMilT.welcome.record(usuario);
                                        Swal.fire('Sucesso!', recorded ? 'Sugestão de Planejamento salva com sucesso!' :
                                            'Sugestão salva, mas não foi possível atualizar a lista de recentes neste navegador.', 'success');
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
                                    Swal.fire('Erro!', xhr.status === 413
                                        ? 'A sugestão excede o limite de envio do servidor. Ajuste post_max_size no PHP ou reduza os desenhos.'
                                        : 'Não foi possível salvar a Sugestão de Planejamento.', 'error');
                                }
                            });
                        }
                    });
                });
