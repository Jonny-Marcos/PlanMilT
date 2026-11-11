/**
 * @fileoverview Apresenta boas-vindas e mantém uma lista local de planejamentos recentes.
 * @exports window.PlanMilT.welcome
 * @requires SweetAlert2 e localStorage
 */
window.PlanMilT = window.PlanMilT || {};

window.PlanMilT.welcome = (() => {
    const key = `planmilt.welcome.v1:${new URL('.', window.location.href).pathname}`;
    const limit = 10;

    /**
     * Lê as preferências locais sem impedir o uso do mapa em caso de falha.
     * @returns {Object} Preferência de exibição e planejamentos recentes.
     */
    function read() {
        try {
            const raw = localStorage.getItem(key);
            if (!raw) return { hidden: false, recent: [] };
            const value = JSON.parse(raw);
            if (!value || typeof value !== 'object' || typeof value.hidden !== 'boolean' || !Array.isArray(value.recent) ||
                value.recent.some(item => !item || typeof item.name !== 'string' || !item.name ||
                    typeof item.date !== 'string' || !Number.isFinite(Date.parse(item.date)))) {
                throw new Error('Dados locais de boas-vindas inválidos.');
            }
            return { hidden: value.hidden, recent: value.recent.slice(0, limit).map(item => ({ name: item.name, date: item.date })) };
        } catch (error) {
            console.error('[PlanMilT][Boas-vindas] Não foi possível ler os dados locais.', error);
            return { hidden: false, recent: [], unavailable: true };
        }
    }

    /**
     * Persiste os dados locais e informa falhas ao usuário.
     * @param {Object} state - Preferências e lista de recentes.
     * @returns {boolean} Indica se a gravação foi concluída.
     */
    function write(state) {
        try {
            localStorage.setItem(key, JSON.stringify({ hidden: state.hidden, recent: state.recent }));
            return true;
        } catch (error) {
            console.error('[PlanMilT][Boas-vindas] Não foi possível gravar os dados locais.', error);
            return false;
        }
    }

    /**
     * Registra uma operação concluída, sem guardar senha ou conteúdo do desenho.
     * @param {string} name - Identificador usado para salvar ou carregar.
     * @returns {boolean} Indica se a lista foi atualizada.
     */
    function record(name) {
        const state = read();
        if (state.unavailable) return false;
        state.recent = [{ name, date: new Date().toISOString() }, ...state.recent.filter(item => item.name !== name)].slice(0, limit);
        return write(state);
    }

    /**
     * Exibe a tela inicial ou a reabre a partir do botão de ajuda.
     * @param {boolean} [automatic=false] - Respeita a preferência apenas na abertura automática.
     */
    function show(automatic = false) {
        const state = read();
        if (automatic && state.hidden) return;
        Swal.fire({
            title: 'Bem-vindo ao PlanMilT',
            html: `<style>
                #welcomePanel { text-align: left; }
                #welcomeRecent { max-height: 32vh; overflow-y: auto; margin: 0 0 1em; }
                #welcomeRecent button { display: block; width: 100%; margin: .35em 0; overflow-wrap: anywhere; text-align: left; }
                #welcomePanel label { display: flex; align-items: center; gap: .5em; }
                #welcomePanel label input { width: auto; }
                #welcomeStorageError { color: #a00000; }
            </style><div id="welcomePanel">
                <p>Planeje, desenhe e salve suas atividades no mapa.</p>
                <h3>Planejamentos recentes</h3>
                <p>Salvos ou carregados neste navegador. A lista pode ser apagada ao limpar os dados do navegador; não contém senhas nem desenhos.</p>
                <div id="welcomeRecent"></div>
                <label><input id="welcomeHide" type="checkbox"> Não mostrar automaticamente novamente</label>
                <p id="welcomeStorageError" role="status"></p>
            </div>`,
            showCancelButton: true,
            confirmButtonText: 'Começar',
            cancelButtonText: 'Guia de botões',
            didOpen: () => {
                const list = document.getElementById('welcomeRecent');
                if (!state.recent.length) {
                    list.textContent = 'Nenhum planejamento recente neste navegador.';
                } else {
                    state.recent.forEach(item => {
                        const button = document.createElement('button');
                        button.type = 'button';
                        button.className = 'swal2-styled';
                        button.textContent = `${item.name} — ${new Date(item.date).toLocaleString('pt-BR')}`;
                        button.addEventListener('click', () => {
                            Swal.close();
                            window.PlanMilT.drawingLoading.load(item.name);
                        });
                        list.appendChild(button);
                    });
                }
                const checkbox = document.getElementById('welcomeHide');
                checkbox.checked = state.hidden;
                const errorText = document.getElementById('welcomeStorageError');
                if (state.unavailable) errorText.textContent = 'Não foi possível acessar as preferências locais deste navegador.';
                checkbox.addEventListener('change', () => {
                    const current = read();
                    if (current.unavailable || !write({ hidden: checkbox.checked, recent: current.recent })) {
                        checkbox.checked = current.hidden;
                        errorText.textContent = 'Não foi possível salvar a preferência neste navegador.';
                    } else {
                        errorText.textContent = '';
                    }
                });
            }
        }).then(result => {
            if (result.dismiss === Swal.DismissReason.cancel) {
                window.PlanMilT.showButtonGuide();
            }
        });
    }

    return Object.freeze({ record, show });
})();
