/**
 * @fileoverview Coordena seleção de área, execução sequencial de tarefas e apresentação de progresso e resultados.
 * @requires taskSequence, taskEditor, mapa, Swal e funções perform* carregadas pelos módulos de tarefas.
 */
                var taskSequence = [];

                // Função para desenhar a área de seleção
                /**
                 * Ativa o desenho de uma área temporária para limitar uma tarefa.
                 */
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
                var radioPlanningService = window.PlanMilT.radioPlanning.attach({
                    map,
                    leaflet: L,
                    turf,
                    drawnItems,
                    sweetAlert: Swal,
                    chartConstructor: Chart
                });
                var taskRadioLinks = window.PlanMilT.taskRadioLinks.attach({
                    map,
                    leaflet: L,
                    drawnItems,
                    planningLayer: planejamentoLayer,
                    radioPlanning: radioPlanningService,
                    log: addToLog
                });
                var taskRadioOperations = window.PlanMilT.taskRadioOperations.attach({
                    map,
                    leaflet: L,
                    turf,
                    drawnItems,
                    planningLayer: planejamentoLayer,
                    radioPlanning: radioPlanningService,
                    log: addToLog
                });
                function getLayerIconCounts(layerName) {
                    const counts = {};
                    const sourceLayers = layerName === 'all'
                        ? [drawnItems, planejamentoLayer]
                        : layerName === 'drawnItems'
                            ? [drawnItems]
                            : layerName === 'planningSuggestions'
                                ? [planejamentoLayer]
                                : [];
                    for (const sourceLayer of sourceLayers) {
                        sourceLayer.eachLayer(layer => {
                            if (!(layer instanceof L.Marker) || !layer.options.icon || !layer.options.icon.options.iconUrl) return;
                            const iconUrl = layer.options.icon.options.iconUrl;
                            counts[iconUrl] = (counts[iconUrl] || 0) + 1;
                        });
                    }
                    return counts;
                }

                // Função para iniciar o processo de criação de tarefas
                var taskParameters = window.PlanMilT.taskParameters.attach({
                    apiClient: window.PlanMilT.apiClient,
                    sweetAlert: Swal,
                    radioPresets: radioPlanningService.getPresets(),
                    getLayerIconCounts
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
                /**
                 * Converte uma mensagem ou objeto em texto para o log.
                 * @param {*} msg - Mensagem a serializar para o log.
                 */
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
                /**
                 * Acrescenta mensagens formatadas ao log visível da execução de tarefas.
                 * @param {...*} messages - Mensagens a formatar e registrar.
                 */
                function addToLog(...messages) {
                    const timestamp = new Date().toLocaleTimeString();
                    const formattedMessage = messages.map(msg => serializeMessage(msg)).join(' ') + '\n';
                    logMessages += `[${timestamp}] ${formattedMessage}\n`;
                }






                // Função para obter os valores dos parâmetros da tarefa selecionada
                /**
                 * Executa em ordem as tarefas da sequência e atualiza o progresso.
                 */
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

                                case 'verifyRadioLinks':
                                    await taskRadioLinks.verify(task.parameters);
                                    break;

                                case 'checkRouteCommunication':
                                    await taskRadioOperations.checkRouteCommunication(task.parameters);
                                    break;

                                case 'suggestRepeaterPositions':
                                    Swal.fire({
                                        title: 'Calculando áreas de cobertura…',
                                        text: 'Preparando a análise das unidades selecionadas.',
                                        allowOutsideClick: false,
                                        allowEscapeKey: false,
                                        showConfirmButton: false,
                                        didOpen: () => Swal.showLoading()
                                    });
                                    try {
                                        await taskRadioOperations.suggestRepeaterPositions(task.parameters, message => {
                                            addToLog(message);
                                            Swal.update({ text: message });
                                        });
                                    } finally {
                                        Swal.close();
                                    }
                                    break;

                                case 'compareRadioPresets':
                                    await taskRadioOperations.compareRadioPresets(task.parameters);
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
                    /**
                     * Formata as linhas do log para apresentação na interface.
                     * @param {string} log - Conteúdo textual do log da execução.
                     */
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
                    /**
                     * Detecta mensagens de erro no log da sequência.
                     * @param {string} log - Conteúdo textual do log da execução.
                     */
                    function hasErrors(log) {
                        return log.includes('Erro:');
                    }

                    const logExecutionResult = hasErrors(logMessages) ? console.error : console.info;
                    logExecutionResult.call(console, '[PlanMilT][Tarefas] Execução finalizada.', {
                        taskCount: taskSequence.length,
                        hasErrors: hasErrors(logMessages)
                    });

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
                /**
                 * Obtém os dados de elevação necessários à análise da área.
                 * @param {Object} bounds - Limites geográficos da área consultada.
                 * @param {boolean} [allowRecovery=true] - Permite uma tentativa de recuperação.
                 * @returns {Promise<Array<Object>|null>} Amostras ou ausência de dados após erro.
                 */
                async function fetchElevationData(bounds, allowRecovery = true) {
                    try {
                        const response = await window.PlanMilT.apiClient.request(`elevation-data.php?minLat=${bounds.getSouth()}&maxLat=${bounds.getNorth()}&minLon=${bounds.getWest()}&maxLon=${bounds.getEast()}`);

                        if (!response.ok) {
                            const errorData = await response.json();

                            if (allowRecovery && errorData.error === 'Arquivos de elevação faltando' && errorData.missingTiles) {
                                const obtained = await window.PlanMilT.elevationFiles.ensure(errorData.missingTiles);
                                if (obtained) return await fetchElevationData(bounds, false);
                                return null;
                            } else {
                                addToLog('Erro ao obter dados de elevação:', errorData.error);
                                console.error('[PlanMilT][Elevação] Falha ao consultar amostras.', {
                                    message: errorData.error || 'Erro retornado pelo servidor.'
                                });
                                return null;
                            }
                        } else {
                            const elevationData = await response.json();

                            if (!Array.isArray(elevationData) || elevationData.length === 0) {
                                addToLog('Erro: Dados de elevação inválidos ou vazios.');
                                console.error('[PlanMilT][Elevação] Resposta inválida ou sem amostras.');
                                return null;
                            }

                            Swal.close();
                            console.info('[PlanMilT][Elevação] Amostras carregadas.', {
                                count: elevationData.length
                            });
                            return elevationData;
                        }
                    } catch (error) {
                        addToLog('Erro ao obter os dados de elevação:', error);
                        console.error('[PlanMilT][Elevação] Falha ao consultar elevações.', error);
                        Swal.fire('Erro', error.userMessage || 'Não foi possível obter os arquivos de elevação.', 'error');
                        return null;
                    }
                }




                // Função para executar a tarefa de encontrar o ponto mais alto
