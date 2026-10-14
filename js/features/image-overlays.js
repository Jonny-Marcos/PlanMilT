/**
 * @fileoverview Lista imagens disponíveis, solicita dados de acesso quando necessário e adiciona sobreposições ao mapa.
 * @requires Endpoints de imagens, Leaflet, fetch, DOM e Swal no escopo legado.
 */
            document.getElementById('loadImages').addEventListener('click', function() {
                loadImageWithPrompt();
            });

            /**
             * Solicita a escolha de uma imagem disponível para sobrepor no mapa.
             */
            async function loadImageWithPrompt() {
                // Obtém a lista de imagens do servidor
                try {
                    const response = await window.PlanMilT.apiClient.request('image-load.php', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
                    });
                    const data = await response.json();

                    if (data.images) {
                        console.info('[PlanMilT][Imagens] Lista carregada.', { count: data.images.length });
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
                        console.error('[PlanMilT][Imagens] Falha ao listar imagens.', { message: data.error });
                        Swal.fire('Erro!', data.error, 'error');
                    } else {
                        console.warn('[PlanMilT][Imagens] Nenhuma imagem disponível.');
                        Swal.fire('Erro!', 'Nenhuma imagem disponível.', 'error');
                    }
                } catch (error) {
                    console.error('[PlanMilT][Imagens] Falha ao obter a lista.', error);
                    Swal.fire('Erro!', 'Erro ao obter a lista de imagens.', 'error');
                }
            }


            /**
             * Busca uma imagem pelo identificador e trata autenticação e sobreposição.
             * @param {string} imageId - Identificador da imagem no servidor.
             */
            async function attemptToLoadImage(imageId) {
                const params = new URLSearchParams();
                params.append('id', imageId);

                try {
                    const response = await window.PlanMilT.apiClient.request('image-load.php', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                        body: params.toString()
                    });
                    const data = await response.json();

                    if (data.url && data.bounds) {
                        var bounds = L.latLngBounds(data.bounds);
                        var imageLayer = L.imageOverlay(data.url, bounds);
                        addNewOverlayLayer(`Imagem: ${data.descricao}`, imageLayer);
                        console.info('[PlanMilT][Imagens] Sobreposição carregada.', { id: imageId });
                    } else if (data.error) {
                        console.error('[PlanMilT][Imagens] Servidor recusou o carregamento.', { message: data.error });
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

                            const responseWithPassword = await window.PlanMilT.apiClient.request('image-load.php', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                                body: params.toString()
                            });
                            const dataWithPassword = await responseWithPassword.json();

                            if (dataWithPassword.url && dataWithPassword.bounds) {
                                var bounds = L.latLngBounds(dataWithPassword.bounds);
                                var imageLayer = L.imageOverlay(dataWithPassword.url, bounds);
                                addNewOverlayLayer(`Imagem: ${dataWithPassword.descricao}`, imageLayer);
                                console.info('[PlanMilT][Imagens] Sobreposição autenticada carregada.', { id: imageId });
                            } else if (dataWithPassword.error) {
                                console.error('[PlanMilT][Imagens] Falha no carregamento autenticado.', {
                                    message: dataWithPassword.error
                                });
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
                    console.error('[PlanMilT][Imagens] Falha ao carregar a sobreposição.', error);
                    Swal.fire('Erro!', 'Erro ao carregar a imagem.', 'error');
                }
            }





