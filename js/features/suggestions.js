/**
 * @fileoverview Envia e acompanha sugestões de desenvolvimento deste navegador.
 * @requires DOM, SweetAlert2 e PlanMilT.apiClient
 */
window.PlanMilT = window.PlanMilT || {};

window.PlanMilT.suggestions = (() => {
    const key = `planmilt.suggestions.v1:${new URL('.', window.location.href).pathname}`;
    const endpoint = 'php/endpoints/suggestions.php';
    const labels = {
        pending: 'Aguardando análise', acknowledged: 'Ciente',
        in_progress: 'Em implementação', implemented: 'Implementado'
    };
    const styles = `
.swal2-popup.suggestions-modal{width:min(720px,calc(100vw - 28px))!important;padding:20px!important}
#suggestionsContent{text-align:left;font:14px/1.5 sans-serif;color:#27364a}
#suggestionsContent .suggestions-list{max-height:42vh;overflow-y:auto;border:1px solid #d3d8e0;border-radius:6px}
#suggestionsContent article{padding:10px;border-bottom:1px solid #d3d8e0}
#suggestionsContent article:last-child{border-bottom:0}
#suggestionsContent p{margin:5px 0;white-space:pre-wrap;overflow-wrap:anywhere}
#suggestionsContent label{display:block;font-weight:600;margin:10px 0 4px}
#suggestionsContent input,#suggestionsContent textarea{box-sizing:border-box;width:100%;padding:8px;border:1px solid #c5cad2;border-radius:6px;font:inherit}
#suggestionsContent textarea{min-height:120px;resize:vertical}
#suggestionsContent button{min-height:36px;margin:6px 6px 0 0;padding:6px 10px;border:1px solid #435f88;border-radius:6px;background:#fff;color:#27364a;cursor:pointer}
`;

    /** @param {number} length Quantidade de bytes aleatórios. @returns {string} Valor hexadecimal. */
    function randomHex(length) {
        if (!window.crypto || !window.crypto.getRandomValues) {
            throw new Error('O navegador precisa de uma conexão segura para gerar a chave de acesso.');
        }
        return Array.from(window.crypto.getRandomValues(new Uint8Array(length)),
            byte => byte.toString(16).padStart(2, '0')).join('');
    }

    /** @returns {Object} Identidade e eventual envio ainda não confirmado. */
    function state() {
        const raw = localStorage.getItem(key);
        if (raw === null) {
            const value = { token: randomHex(32), draft: null };
            localStorage.setItem(key, JSON.stringify(value));
            return value;
        }
        const value = JSON.parse(raw);
        if (!value || !/^[a-f0-9]{64}$/.test(value.token) ||
            (value.draft !== null && (!value.draft || !/^[a-f0-9]{32}$/.test(value.draft.requestId)
                || typeof value.draft.title !== 'string' || typeof value.draft.description !== 'string'))) {
            throw new Error('Os dados locais das sugestões são inválidos.');
        }
        return value;
    }

    /** @param {Object} value Identidade e rascunho a guardar antes do envio. */
    function saveState(value) {
        localStorage.setItem(key, JSON.stringify(value));
    }

    /** @param {Object} value Estado local. @param {Object} payload Operação da API. @returns {Promise<Object>} Resposta. */
    function request(value, payload) {
        return window.PlanMilT.apiClient.postJson(endpoint, { ...payload, token: value.token });
    }

    /** @param {string} message Mensagem segura exibida ao usuário. */
    function showError(message) {
        console.error('[PlanMilT][Sugestões] Operação não concluída.');
        return Swal.fire('Sugestões', message, 'error');
    }

    /** @param {Object} value Estado local. @returns {Promise<void>} Reenvia a mesma tentativa com segurança. */
    async function sendDraft(value) {
        await request(value, { action: 'create', ...value.draft });
        saveState({ ...value, draft: null });
        value.draft = null;
    }

    /** @param {Object} value Estado local. @param {Object|null} suggestion Registro para edição. */
    async function edit(value, suggestion = null) {
        const result = await Swal.fire({
            title: suggestion ? 'Editar sugestão' : 'Nova sugestão',
            customClass: { popup: 'suggestions-modal' },
            html: `<style>${styles}</style><div id="suggestionsContent">
                <p>Não inclua dados pessoais ou informações sensíveis. A sugestão será enviada ao administrador desta instalação.</p>
                <label for="suggestionTitle">Título</label><input id="suggestionTitle" maxlength="200">
                <label for="suggestionDescription">Descrição</label><textarea id="suggestionDescription" maxlength="8000"></textarea>
            </div>`,
            showCancelButton: true,
            confirmButtonText: suggestion ? 'Salvar' : 'Enviar',
            cancelButtonText: 'Voltar',
            showLoaderOnConfirm: true,
            allowOutsideClick: () => !Swal.isLoading(),
            didOpen: () => {
                document.getElementById('suggestionTitle').value = suggestion?.title || '';
                document.getElementById('suggestionDescription').value = suggestion?.description || '';
            },
            preConfirm: async () => {
                const title = document.getElementById('suggestionTitle').value.trim();
                const description = document.getElementById('suggestionDescription').value.trim();
                if (!title || !description || new TextEncoder().encode(title).length > 200 ||
                    new TextEncoder().encode(description).length > 8000) {
                    Swal.showValidationMessage('Preencha título e descrição: até 200 e 8.000 bytes, respectivamente.');
                    return false;
                }
                try {
                    if (suggestion) {
                        await request(value, { action: 'update', id: suggestion.id, title, description });
                    } else {
                        if (value.draft && (value.draft.title !== title || value.draft.description !== description)) {
                            throw new Error('Reenvie a sugestão anterior sem alterar o texto para confirmar seu recebimento.');
                        }
                        value.draft = value.draft || { requestId: randomHex(16), title, description };
                        saveState(value);
                        await sendDraft(value);
                    }
                    return true;
                } catch (error) {
                    console.error('[PlanMilT][Sugestões] Falha ao salvar ou enviar.');
                    Swal.showValidationMessage('Não foi possível concluir o envio: ' + error.message);
                    return false;
                }
            }
        });
        if (result.isConfirmed || result.dismiss === Swal.DismissReason.cancel) await open();
    }

    /** Abre a lista privada e oferece envio, reenvio e edição de sugestões pendentes. */
    async function open() {
        let value;
        let records;
        try {
            value = state();
            const result = await request(value, { action: 'list' });
            if (!Array.isArray(result.suggestions)) throw new Error('Resposta do servidor inválida.');
            records = result.suggestions;
        } catch (error) {
            await showError('Não foi possível carregar as sugestões: ' + error.message);
            return;
        }
        await Swal.fire({
            title: 'Sugestões de desenvolvimento',
            customClass: { popup: 'suggestions-modal' },
            html: `<style>${styles}</style><div id="suggestionsContent">
                <p>Disponíveis somente neste navegador. Limpar seus dados impede recuperar o histórico. As sugestões vão ao administrador desta instalação e só podem ser editadas antes da análise.</p>
                <div id="suggestionsList" class="suggestions-list"></div>
                <button type="button" id="newSuggestion">Nova sugestão</button>
                <button type="button" id="retrySuggestion" hidden>Reenviar sugestão pendente</button>
            </div>`,
            confirmButtonText: 'Fechar',
            didOpen: () => {
                const list = document.getElementById('suggestionsList');
                if (!records.length) list.textContent = 'Nenhuma sugestão enviada.';
                records.forEach(record => {
                    const article = document.createElement('article');
                    const heading = document.createElement('strong');
                    heading.textContent = record.title;
                    const status = document.createElement('p');
                    status.textContent = 'Situação: ' + (labels[record.status] || 'Desconhecida');
                    const description = document.createElement('p');
                    description.textContent = record.description;
                    const date = document.createElement('p');
                    date.textContent = 'Enviada (UTC): ' + record.created_at;
                    article.append(heading, status, description);
                    if (record.admin_reply) {
                        const reply = document.createElement('p');
                        reply.textContent = 'Resposta: ' + record.admin_reply;
                        article.appendChild(reply);
                    }
                    article.appendChild(date);
                    if (record.status === 'pending') {
                        const button = document.createElement('button');
                        button.type = 'button';
                        button.textContent = 'Editar';
                        button.addEventListener('click', () => { void edit(value, record); });
                        article.appendChild(button);
                    }
                    list.appendChild(article);
                });
                document.getElementById('newSuggestion').disabled = !!value.draft;
                document.getElementById('newSuggestion').addEventListener('click', () => { void edit(value); });
                const retry = document.getElementById('retrySuggestion');
                retry.hidden = !value.draft;
                retry.addEventListener('click', async () => {
                    retry.disabled = true;
                    try {
                        await sendDraft(value);
                        await open();
                    } catch (error) {
                        await showError('Não foi possível reenviar: ' + error.message);
                    } finally {
                        retry.disabled = false;
                    }
                });
            }
        });
    }

    document.getElementById('suggestionsButton').addEventListener('click', () => { void open(); });
    return Object.freeze({ open });
})();
