/**
 * @fileoverview Salva desenhos manualmente e, quando autorizado, automaticamente no servidor.
 * @requires Leaflet GeoJSON, drawnItems, Swal e cliente HTTP no escopo legado.
 */
window.PlanMilT.drawingAutoSave = (() => {
    let choice;
    let target;
    let baseline;
    let revision = 0;
    let dirty = false;
    let generation = 0;
    let timer;
    let editing = false;
    let checking = false;
    let tail = Promise.resolve();
    let status;

    /**
     * Exibe o estado do salvamento sem interromper outros diálogos.
     * @param {string} message - Estado ou falha a mostrar.
     */
    function showStatus(message) {
        if (!status) {
            status = document.createElement('div');
            status.setAttribute('role', 'status');
            Object.assign(status.style, { position: 'fixed', bottom: '48px', right: '8px',
                zIndex: '10000', background: '#fff3cd', color: '#503800', padding: '10px', maxWidth: '360px' });
            document.body.appendChild(status);
        }
        status.textContent = message;
    }

    /**
     * Interrompe o envio automático e invalida tentativas ainda não iniciadas.
     * @param {string} [message] - Aviso opcional para o usuário.
     */
    function pause(message) {
        generation++;
        if (timer !== undefined) clearInterval(timer);
        timer = undefined;
        target = undefined;
        if (message) showStatus(message);
    }

    /**
     * Marca modificações dos desenhos ou coberturas para a próxima verificação.
     */
    function changed() {
        revision++;
        dirty = true;
    }

    /**
     * Serializa os desenhos e coberturas no mesmo formato do salvamento manual.
     * @returns {{data: Object, json: string, revision: number}} Snapshot do planejamento.
     */
    function snapshot() {
        try {
            const data = window.PlanMilT.geoJsonSerialization.toFeatureCollection(drawnItems, false);
            for (const feature of window.PlanMilT.geoJsonSerialization.toFeatureCollection(window.PlanMilT.coverageImage.getGroup()).features) {
                data.features.push(feature);
            }
            data.features.forEach(feature => {
                const layer = drawnItems.getLayer(feature.properties._leaflet_id);
                if (layer?.options?.icon) feature.properties.iconUrl = layer.options.icon.options.iconUrl;
                if (layer?.options?.color) feature.properties.color = layer.options.color;
            });
            return { data, json: JSON.stringify(data), revision };
        } catch (error) {
            console.error('[PlanMilT][Desenhos] Falha ao preparar o salvamento.', { name: error.name });
            throw new Error('Não foi possível preparar os desenhos para salvamento.');
        }
    }

    /**
     * Enfileira envios para impedir que um snapshot antigo termine depois de um novo.
     * @param {Object} credentials - Identificador, senha e diretório do desenho.
     * @param {string} json - GeoJSON serializado.
     * @param {number} requestGeneration - Geração da operação.
     * @param {boolean} automatic - Indica envio automático.
     * @returns {Promise<boolean>} True se o servidor confirmou a gravação.
     */
    function send(credentials, json, requestGeneration, automatic) {
        const operation = tail.then(async () => {
            if (automatic && requestGeneration !== generation) return false;
            let response;
            try {
                response = await window.PlanMilT.apiClient.request('/salvar.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: new URLSearchParams({ usuario: credentials.usuario, senha: credentials.senha,
                        link: credentials.diretorio, leaflet: json }).toString()
                });
            } catch (error) {
                throw new Error('Não foi possível conectar ao servidor para salvar os desenhos.');
            }
            if (!response.ok) {
                throw new Error(response.status === 413
                    ? 'Os desenhos excedem o limite de envio do servidor. Ajuste post_max_size no PHP ou reduza o tamanho da cobertura.'
                    : 'Não foi possível salvar os desenhos.');
            }
            let text;
            try {
                text = await response.text();
            } catch (error) {
                throw new Error('Não foi possível ler a resposta do servidor.');
            }
            if (!text.includes('Desenho atualizado com sucesso!') && !text.includes('Desenho salvo com sucesso!')) {
                throw new Error(text.trim() === 'Senha incorreta.' ? 'Senha incorreta.' : 'O servidor recusou o salvamento dos desenhos.');
            }
            return true;
        });
        tail = operation.then(() => undefined, () => undefined);
        return operation;
    }

    /**
     * Confirma a substituição do desenho remoto por uma coleção vazia.
     * @returns {Promise<boolean>} Indica se o usuário autorizou.
     */
    async function confirmEmpty() {
        const result = await Swal.fire({
            title: 'Nenhum desenho encontrado',
            text: 'Não há desenhos para salvar. Deseja continuar salvando mesmo assim?',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Sim, salvar mesmo assim',
            cancelButtonText: 'Cancelar'
        });
        return result.isConfirmed;
    }

    /**
     * Salva alterações confirmadas no intervalo configurado, sem sobrepor diálogos.
     */
    async function tick() {
        if (!target || !dirty || checking || editing || Swal.isVisible()) return;
        checking = true;
        const requestGeneration = generation;
        const credentials = target;
        try {
            let current = snapshot();
            if (current.json === baseline) {
                dirty = false;
                return;
            }
            if (!current.data.features.length) {
                if (!await confirmEmpty()) {
                    if (requestGeneration === generation) pause('Salvamento automático pausado. Salve manualmente para retomá-lo.');
                    return;
                }
                if (requestGeneration !== generation || editing) return;
                current = snapshot();
            }
            if (await send(credentials, current.json, requestGeneration, true) && requestGeneration === generation) {
                baseline = current.json;
                dirty = revision !== current.revision;
                console.info('[PlanMilT][Desenhos] Salvamento automático concluído.');
            }
        } catch (error) {
            console.error('[PlanMilT][Desenhos] Falha no salvamento automático.', { name: error.name });
            if (requestGeneration === generation) {
                pause(`Salvamento automático pausado: ${error.message} Salve manualmente para retomá-lo.`);
            }
        } finally {
            checking = false;
        }
    }

    /**
     * Pausa o envio antes de substituir os desenhos por outro planejamento.
     */
    function pauseForLoad() {
        if (target) pause('Salvamento automático pausado. Salve o planejamento carregado para retomá-lo.');
        else pause();
    }

    drawnItems.on('layeradd layerremove', changed);
    map.on('draw:edited draw:deleted planmilt:changed', changed);
    map.on('draw:drawstart draw:editstart draw:deletestart', () => { editing = true; });
    map.on('draw:drawstop draw:editstop draw:deletestop', () => { editing = false; });
    document.addEventListener('DOMContentLoaded', () => {
        window.PlanMilT.coverageImage.getGroup().on('layeradd layerremove', changed);
    });

    document.getElementById('saveDrawings').addEventListener('click', async () => {
        let savedUsuario;
        let savedSenha;
        try {
            savedUsuario = sessionStorage.getItem('usuario') || '';
            savedSenha = sessionStorage.getItem('senha') || '';
        } catch (error) {
            console.error('[PlanMilT][Desenhos] Não foi possível acessar as credenciais da sessão.', { name: error.name });
            Swal.fire('Erro!', 'Não foi possível acessar o armazenamento da sessão neste navegador.', 'error');
            return;
        }
        const askChoice = choice === undefined;
        const result = await Swal.fire({
            title: 'Insira suas credenciais',
            html: `<input type="text" id="swal-input-usuario" class="swal2-input" placeholder="Usuário">
<input type="password" id="swal-input-senha" class="swal2-input" placeholder="Senha">
${askChoice ? '<label><input type="checkbox" id="drawingAutoSaveChoice"> Ativar salvamento automático no servidor a cada 15 segundos quando houver alterações, até recarregar a página.</label><p>Alterações no mesmo planejamento feitas em outra aba ou dispositivo podem ser sobrescritas.</p>' : ''}`,
            focusConfirm: false,
            didOpen: () => {
                document.getElementById('swal-input-usuario').value = savedUsuario;
                document.getElementById('swal-input-senha').value = savedSenha;
            },
            preConfirm: () => {
                const usuario = document.getElementById('swal-input-usuario').value;
                const senha = document.getElementById('swal-input-senha').value;
                if (!usuario || !senha) {
                    Swal.showValidationMessage('Usuário e senha são necessários!');
                    return false;
                }
                return { usuario, senha, autoSave: askChoice && document.getElementById('drawingAutoSaveChoice').checked };
            }
        });
        if (!result.isConfirmed) return;
        const { usuario, senha } = result.value;
        if (askChoice) choice = !!result.value.autoSave;
        pause(target ? 'Salvamento automático pausado durante o salvamento manual.' : undefined);
        const requestGeneration = generation;
        try {
            try {
                sessionStorage.setItem('usuario', usuario);
                sessionStorage.setItem('senha', senha);
            } catch (error) {
                console.error('[PlanMilT][Desenhos] Não foi possível guardar as credenciais da sessão.', { name: error.name });
                throw new Error('Não foi possível acessar o armazenamento da sessão neste navegador.');
            }
            let current = snapshot();
            if (!current.data.features.length) {
                if (!await confirmEmpty()) {
                    Swal.fire('Salvamento cancelado', 'Nenhum desenho foi salvo.', 'info');
                    return;
                }
                if (requestGeneration !== generation) return;
                current = snapshot();
            }
            const match = /https:\/\/methodux\.online\/(.*?)\//.exec(window.location.href);
            const credentials = { usuario, senha, diretorio: match ? match[1] : '' };
            if (!await send(credentials, current.json, requestGeneration, false)) return;
            if (requestGeneration === generation) {
                baseline = current.json;
                dirty = revision !== current.revision;
                if (choice) {
                    target = credentials;
                    timer = setInterval(tick, 15000);
                    showStatus('Salvamento automático no servidor ativado.');
                } else if (status) {
                    status.remove();
                    status = undefined;
                }
            }
            const recorded = window.PlanMilT.welcome.record(usuario);
            Swal.fire('Sucesso!', recorded ? 'Desenhos salvos com sucesso!' :
                'Desenhos salvos, mas não foi possível atualizar a lista de recentes neste navegador.', 'success');
            console.info('[PlanMilT][Desenhos] Salvamento concluído.', { featureCount: current.data.features.length });
        } catch (error) {
            console.error('[PlanMilT][Desenhos] Falha ao salvar desenhos.', { name: error.name });
            Swal.fire('Erro!', error.message || 'Não foi possível preparar os desenhos para salvamento.', 'error');
            if (choice) showStatus('Salvamento automático pausado. Salve manualmente para retomá-lo.');
        }
    });

    return Object.freeze({ pauseForLoad });
})();

/**
 * Verifica se o objeto tem a estrutura mínima esperada de GeoJSON.
 * @param {Object} geoJsonObject - Objeto GeoJSON a validar.
 * @returns {boolean} Indica se a estrutura é reconhecida.
 */
function isValidGeoJson(geoJsonObject) {
    return geoJsonObject && typeof geoJsonObject === 'object' &&
        (geoJsonObject.type === 'Feature' || geoJsonObject.type === 'FeatureCollection') &&
        (geoJsonObject.type === 'FeatureCollection' ? geoJsonObject.features && Array.isArray(geoJsonObject.features) : true);
}
