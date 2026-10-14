/**
 * @fileoverview Serializa desenhos do mapa e coordena seu salvamento autenticado no servidor.
 * @requires Leaflet GeoJSON, drawnItems, Swal e jQuery no escopo legado.
 */
            /**
             * Envia os desenhos serializados ao endpoint de persistência.
             * @param {string} usuario - Identificador do usuário para a operação do servidor.
             * @param {string} senha - Senha solicitada pelo endpoint.
             * @param {Object} drawnData - Dados GeoJSON dos desenhos a persistir.
             * @param {string} diretorio - Diretório lógico associado à camada compartilhada.
             */
            function salvarDesenhos(usuario, senha, drawnData, diretorio) {
                console.log('--- Iniciando salvarDesenhos ---');
                console.log('Usuário:', usuario);
                console.log('Diretório:', diretorio);
                console.log('Dados dos desenhos antes de personalizar:', drawnData);

                // Itera por cada feature para incluir propriedades personalizadas
                drawnData.features.forEach(function(feature) {
                    var layer = drawnItems.getLayer(feature.properties._leaflet_id);
                    if (layer && layer.options) {
                        if (layer.options.icon) {
                            feature.properties.iconUrl = layer.options.icon.options.iconUrl;
                            console.log('iconUrl adicionado:', feature.properties.iconUrl);
                        }
                        // Para formas que não são marcadores, salvar a cor
                        if (layer.options.color) {
                            feature.properties.color = layer.options.color;
                            console.log('Cor adicionada:', feature.properties.color);
                        }
                    }
                });

                console.log('Dados dos desenhos após personalização:', drawnData);

                var data = {
                    usuario: usuario,
                    senha: senha,
                    link: diretorio, // Diretório a ser usado na requisição
                    leaflet: JSON.stringify(drawnData) // Converte os dados desenhados para uma string JSON
                };

                console.log('Dados a serem enviados via AJAX:', data);

                // Envio dos dados via AJAX
                $.ajax({
                    type: "POST",
                    url: "/salvar.php", // Substitua pelo caminho correto para sua página PHP
                    data: data,
                    success: function(response) {
                        console.log('Resposta recebida do servidor:', response);

                        // Verifica se a resposta contém a frase "Desenho atualizado com sucesso!"
                        if (response.includes("Desenho atualizado com sucesso!") || response.includes("Desenho salvo com sucesso!")) {
                            Swal.fire('Sucesso!', 'Desenhos salvos com sucesso!', 'success');
                            console.log('Desenhos salvos com sucesso!');
                        } else {
                            // Se a resposta não contém a frase esperada, trata como erro
                            Swal.fire('Erro!', response, 'error');
                            console.error('Erro ao salvar desenhos:', response);
                        }
                    },
                    error: function(xhr, status, error) {
                        console.error("Erro ao salvar desenhos via AJAX:", error);
                        Swal.fire('Erro!', 'Não foi possível salvar os desenhos.', 'error');
                    }
                });
            }


            // Recupera usuário e senha salvos, ou define como string vazia se não existir
            const savedUsuario = '';
            const savedSenha = '';

            document.getElementById('saveDrawings').addEventListener('click', function() {
                // Recupera usuário e senha salvos, ou define como string vazia se não existir
                const savedUsuario = sessionStorage.getItem('usuario') || '';
                const savedSenha = sessionStorage.getItem('senha') || '';

                // Utiliza o SweetAlert2 para solicitar o usuário e senha
                Swal.fire({
                    title: 'Insira suas credenciais',
                    html: `
<input type="text" id="swal-input-usuario" class="swal2-input" placeholder="Usuário" value="${savedUsuario}">
<input type="password" id="swal-input-senha" class="swal2-input" placeholder="Senha" value="${savedSenha}">
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
                        var { usuario, senha } = result.value;

                        // Salva usuário e senha no sessionStorage
                        sessionStorage.setItem('usuario', usuario);
                        sessionStorage.setItem('senha', senha);

                        // Gera o GeoJSON dos desenhos
                        var drawnData = drawnItems.toGeoJSON();

                        // Verifica se não há desenhos para salvar
                        if (drawnData.features.length === 0) {
                            // Informa o usuário e pergunta se deseja continuar
                            Swal.fire({
                                title: 'Nenhum desenho encontrado',
                                text: 'Não há desenhos para salvar. Deseja continuar salvando mesmo assim?',
                                icon: 'warning',
                                showCancelButton: true,
                                confirmButtonText: 'Sim, salvar mesmo assim',
                                cancelButtonText: 'Cancelar'
                            }).then((confirmResult) => {
                                if (confirmResult.isConfirmed) {
                                    // Obtém a URL completa da janela atual
                                    const urlCompleta = window.location.href;

                                    // Extrai o diretório a partir da URL completa
                                    const padraoDiretorio = /https:\/\/methodux\.online\/(.*?)\//;
                                    const resultado = padraoDiretorio.exec(urlCompleta);

                                    // A variável 'diretorio' conterá o diretório atual, ou uma string vazia se não encontrado
                                    const diretorio = resultado ? resultado[1] : '';

                                    // Prossegue com o salvamento mesmo sem desenhos
                                    salvarDesenhos(usuario, senha, drawnData, diretorio);
                                } else {
                                    // Se o usuário cancelar, aborta o salvamento
                                    Swal.fire('Salvamento cancelado', 'Nenhum desenho foi salvo.', 'info');
                                }
                            });
                            // Retorna para evitar que o código continue imediatamente
                            return;
                        }

                        // Obtém a URL completa da janela atual
                        const urlCompleta = window.location.href;

                        // Extrai o diretório a partir da URL completa
                        const padraoDiretorio = /https:\/\/methodux\.online\/(.*?)\//;
                        const resultado = padraoDiretorio.exec(urlCompleta);

                        // A variável 'diretorio' conterá o diretório atual, ou uma string vazia se não encontrado
                        const diretorio = resultado ? resultado[1] : '';

                        // Prossegue com o salvamento normalmente
                        salvarDesenhos(usuario, senha, drawnData, diretorio);
                    }
                });
            });







            // Função para verificar se o objeto é do tipo GeoJSON
            /**
             * Verifica se o objeto tem a estrutura mínima esperada de GeoJSON.
             * @param {Object} geoJsonObject - Objeto GeoJSON a validar ou comparar.
             */
            function isValidGeoJson(geoJsonObject) {
                return geoJsonObject && typeof geoJsonObject === 'object' && 
                    (geoJsonObject.type === 'Feature' || geoJsonObject.type === 'FeatureCollection') &&
                    (geoJsonObject.type === 'FeatureCollection' ? geoJsonObject.features && Array.isArray(geoJsonObject.features) : true);
            }







            // Carrega novas camadas se existir o parâmetro GET com múltiplas camadas separadas por vírgulas
