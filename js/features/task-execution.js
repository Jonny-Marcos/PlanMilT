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
                 */
                async function fetchElevationData(bounds) {
                    try {
                        const response = await window.PlanMilT.apiClient.request(`elevation-data.php?minLat=${bounds.getSouth()}&maxLat=${bounds.getNorth()}&minLon=${bounds.getWest()}&maxLon=${bounds.getEast()}`);

                        if (!response.ok) {
                            const errorData = await response.json();

                            if (errorData.error === 'Arquivos de elevação faltando' && errorData.missingTiles) {
                                // Mostrar mensagem de erro e oferecer opção de upload
                                const missingTiles = errorData.missingTiles;
                                const tileList = missingTiles.join(', ');
                                const { isConfirmed } = await Swal.fire({
                                    title: 'Arquivos de Elevação Faltando',
                                    html: `Os seguintes arquivos de elevação estão faltando: <b>${tileList}</b><br>Você pode obtê-los em <a href="https://www.okmap.org/en/en_srtm.aspx" target="_blank" rel="noopener">OkMap</a>.<br>Deseja fazer o upload dos arquivos faltantes?`,
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

                                            const uploadResponse = await window.PlanMilT.apiClient.request('elevation-upload.php', {
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
                                                console.info('[PlanMilT][Elevação] Upload concluído.');

                                                // Tentar novamente obter os dados de elevação
                                                return await fetchElevationData(bounds);
                                            } else {
                                                Swal.fire('Erro', uploadResult.message || 'Falha ao enviar os arquivos de elevação.', 'error');
                                                addToLog('Erro: Falha ao enviar os arquivos de elevação:', uploadResult.message);
                                                console.error('[PlanMilT][Elevação] Upload recusado.', {
                                                    message: uploadResult.message || 'Falha ao enviar os arquivos.'
                                                });
                                                return null;
                                            }
                                        } catch (uploadError) {
                                            Swal.fire('Erro', 'Erro ao enviar os arquivos de elevação.', 'error');
                                            addToLog('Erro ao enviar os arquivos de elevação:', uploadError);
                                            console.error('[PlanMilT][Elevação] Falha no upload.', uploadError);
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
                        return null;
                    }
                }




                // Função para executar a tarefa de encontrar o ponto mais alto
