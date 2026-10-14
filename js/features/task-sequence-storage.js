window.PlanMilT = window.PlanMilT || {};

window.PlanMilT.taskSequenceStorage = Object.freeze({
    attach({ getTasks, setTasks, renderTasks, sweetAlert, request }) {
        const Swal = sweetAlert;

                async function deleteTaskSequence() {
                    // Passo 1: Solicitar a lista de sequências para deletar
                    const formDataLoad = new FormData();
                    formDataLoad.append('action', 'load');

                    try {
                        const responseLoad = await request('tasks.php', {
                            method: 'POST',
                            body: formDataLoad
                        });
                        const resultLoad = await responseLoad.json();

                        if (!resultLoad.success) {
                            await Swal.fire('Erro', resultLoad.error || 'Falha ao carregar as sequências.', 'error');
                            console.error('Falha ao carregar as sequências:', resultLoad.error);
                            return;
                        }

                        const sequences = resultLoad.sequences;

                        if (sequences.length === 0) {
                            await Swal.fire('Aviso', 'Não há sequências para deletar.', 'info');
                            return;
                        }

                        // Passo 2: Selecionar a sequência a deletar
                        const { value: selectedSequence } = await Swal.fire({
                            title: 'Deletar Sequência',
                            input: 'select',
                            inputOptions: sequences.reduce((options, name) => {
                                options[name] = name;
                                return options;
                            }, {}),
                            inputPlaceholder: 'Selecione uma sequência',
                            showCancelButton: true,
                            inputValidator: (value) => {
                                if (!value) {
                                    return 'Por favor, selecione uma sequência para deletar.';
                                }
                            }
                        });

                        if (!selectedSequence) {
                            // Usuário cancelou a ação
                            return;
                        }

                        // Passo 3: Solicitar a senha para deletar
                        const { value: deletePassword } = await Swal.fire({
                            title: 'Senha',
                            input: 'password',
                            inputLabel: 'Digite a senha para deletar a sequência',
                            inputPlaceholder: 'Senha',
                            showCancelButton: true,
                            inputValidator: (value) => {
                                if (!value) {
                                    return 'Por favor, insira a senha.';
                                }
                            }
                        });

                        if (!deletePassword) {
                            // Usuário cancelou a ação
                            return;
                        }

                        // Passo 4: Confirmar a deleção
                        const { isConfirmed } = await Swal.fire({
                            title: 'Confirmar Deleção',
                            text: `Tem certeza de que deseja deletar a sequência "${selectedSequence}"? Esta ação não pode ser desfeita.`,
                            icon: 'warning',
                            showCancelButton: true,
                            confirmButtonText: 'Sim, deletar',
                            cancelButtonText: 'Cancelar'
                        });

                        if (!isConfirmed) {
                            // Usuário cancelou a deleção
                            return;
                        }

                        // Passo 5: Enviar a requisição para deletar a sequência
                        const formDataDelete = new FormData();
                        formDataDelete.append('action', 'delete_sequence');
                        formDataDelete.append('name', selectedSequence);
                        formDataDelete.append('password', deletePassword);

                        const responseDelete = await request('tasks.php', {
                            method: 'POST',
                            body: formDataDelete
                        });

                        const resultDelete = await responseDelete.json();

                        if (resultDelete.success) {
                            await Swal.fire('Sucesso', `Sequência "${selectedSequence}" deletada com sucesso.`, 'success');
                            // Atualizar a lista de tarefas no modal
                            setTasks(getTasks().filter(task => task.name !== selectedSequence));
                            renderTasks();
                        } else {
                            await Swal.fire('Erro', resultDelete.error || 'Falha ao deletar a sequência.', 'error');
                            console.error('Falha ao deletar a sequência:', resultDelete.error);
                        }

                    } catch (error) {
                        console.error('Erro ao deletar a sequência:', error);
                        await Swal.fire('Erro', 'Erro ao deletar a sequência.', 'error');
                    }
                }


                // Função para salvar a sequência de tarefas
                async function saveTaskSequence() {
                    // Passo 1: Solicitar Nome da Sequência
                    const { value: sequenceName } = await Swal.fire({
                        title: 'Salvar Sequência',
                        input: 'text',
                        inputLabel: 'Nome da Sequência',
                        inputPlaceholder: 'Digite o nome da sequência',
                        showCancelButton: true,
                        inputValidator: (value) => {
                            if (!value) {
                                return 'Por favor, insira um nome para a sequência.';
                            }
                        }
                    });

                    if (!sequenceName) {
                        // Se o usuário cancelar ou não fornecer um nome, não prosseguir
                        return;
                    }

                    // Passo 2: Solicitar Senha
                    const { value: password } = await Swal.fire({
                        title: 'Senha',
                        input: 'password',
                        inputLabel: 'Digite a senha para salvar a sequência',
                        inputPlaceholder: 'Senha',
                        showCancelButton: true,
                        inputValidator: (value) => {
                            if (!value) {
                                return 'Por favor, insira a senha.';
                            }
                        }
                    });

                    if (!password) {
                        // Se o usuário cancelar a inserção de senha, não prosseguir
                        return;
                    }

                    // Passo 2.5: Solicitar Descrição da Sequência
                    const { value: description } = await Swal.fire({
                        title: 'Descrição da Sequência',
                        input: 'textarea',
                        inputLabel: 'Descrição',
                        inputPlaceholder: 'Digite uma descrição para o seu planejamento (até um parágrafo)...',
                        inputAttributes: {
                            'aria-label': 'Digite uma descrição para o seu planejamento'
                        },
                        showCancelButton: true,
                        inputValidator: (value) => {
                            if (!value) {
                                return 'Por favor, insira uma descrição para a sequência.';
                            }
                            if (value.length > 500) { // Limite de 500 caracteres (ajuste conforme necessário)
                                return 'A descrição não deve exceder 500 caracteres.';
                            }
                        }
                    });

                    if (!description) {
                        // Se o usuário cancelar ou não fornecer uma descrição, não prosseguir
                        return;
                    }


                    // Passo 3: Verificar se a sequência já existe
                    const formDataCheck = new FormData();
                    formDataCheck.append('action', 'check_sequence');
                    formDataCheck.append('name', sequenceName);

                    try {
                        const responseCheck = await request('tasks.php', {
                            method: 'POST',
                            body: formDataCheck
                        });
                        const resultCheck = await responseCheck.json();

                        let overwritePassword = '';

                        // Passo 4: Salvar a sequência
                        const formData = new FormData();
                        formData.append('action', 'save');
                        formData.append('name', sequenceName);
                        formData.append('description', description);
                        formData.append('sequence', JSON.stringify(getTasks()));
                        formData.append('password', overwritePassword || password);

                        const response = await request('tasks.php', {
                            method: 'POST',
                            body: formData
                        });
                        const result = await response.json();

                        if (result.success) {
                            await Swal.fire('Sucesso', `Sequência salva com sucesso: ${sequenceName}`, 'success').then(() => {
                                // Reabrir o modal principal após salvar
                                renderTasks();
                            });
                        } else {
                            await Swal.fire('Erro', result.error || 'Falha ao salvar a sequência', 'error');
                            console.error('Falha ao salvar a sequência:', result.error);
                        }
                    } catch (error) {
                        console.error('Erro ao salvar a sequência:', error);
                        await Swal.fire('Erro', 'Erro ao salvar a sequência', 'error');
                    }
                }


                async function loadTaskSequences() {
                    // Solicita a lista de sequências salvas
                    const formData = new FormData();
                    formData.append('action', 'load');

                    try {
                        const response = await request('tasks.php', {
                            method: 'POST',
                            body: formData
                        });
                        const result = await response.json();

                        if (result.success) {
                            const sequences = result.sequences;

                            if (sequences.length === 0) {
                                await Swal.fire('Aviso', 'Não há sequências salvas.', 'info');
                                return;
                            }

                            const { value: selectedSequence } = await Swal.fire({
                                title: 'Carregar Sequência',
                                input: 'select',
                                inputOptions: sequences.reduce((options, name) => {
                                    options[name] = name;
                                    return options;
                                }, {}),
                                inputPlaceholder: 'Selecione uma sequência',
                                showCancelButton: true
                            });

                            if (selectedSequence) {
                                // Obter os detalhes da sequência selecionada
                                await loadTaskSequenceDetails(selectedSequence);
                            }

                        } else {
                            Swal.fire('Erro', result.error || 'Falha ao carregar as sequências', 'error');
                            console.error('Falha ao carregar as sequências:', result.error);
                        }
                    } catch (error) {
                        console.error('Erro ao carregar as sequências:', error);
                        Swal.fire('Erro', 'Erro ao carregar as sequências', 'error');
                    }
                }

                async function loadTaskSequenceDetails(sequenceName) {
                    const formData = new FormData();
                    formData.append('action', 'get_sequence');
                    formData.append('name', sequenceName);

                    try {
                        const response = await request('tasks.php', {
                            method: 'POST',
                            body: formData
                        });
                        const result = await response.json();

                        if (result.success) {
                            setTasks(result.sequence);
                            const description = result.description || 'Nenhuma descrição fornecida.';

                            await Swal.fire({
                                title: `Sequência: ${sequenceName}`,
                                html: `<p><strong>Descrição:</strong> ${description}</p>`,
                                icon: 'info'
                            });

                            // Por exemplo, chamar renderTasks() para exibir a sequência carregada
                            renderTasks();

                        } else {
                            Swal.fire('Erro', result.error || 'Falha ao carregar a sequência', 'error');
                            console.error('Falha ao carregar a sequência:', result.error);
                        }
                    } catch (error) {
                        console.error('Erro ao carregar a sequência:', error);
                        Swal.fire('Erro', 'Erro ao carregar a sequência', 'error');
                    }
                }

        return Object.freeze({ deleteTaskSequence, saveTaskSequence, loadTaskSequences, loadTaskSequenceDetails });
    }
});
