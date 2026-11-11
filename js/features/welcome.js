/**
 * @fileoverview Apresenta boas-vindas e mantém uma lista local de planejamentos recentes.
 * @exports window.PlanMilT.welcome
 * @requires SweetAlert2 e localStorage
 */
window.PlanMilT = window.PlanMilT || {};

window.PlanMilT.welcome = (() => {
    const key = `planmilt.welcome.v1:${new URL('.', window.location.href).pathname}`;
    const limit = 10;
    const tips = [
        'Use o ícone de olho para mostrar ou ocultar os controles do mapa.',
        'Clique com o botão direito ou mantenha o toque no mapa para consultar coordenadas e elevação.',
        'Na predição de cobertura, escolha menos radiais para obter um resultado mais rápido.',
        'Clique em uma cobertura RF recente para consultar a potência recebida aproximada.',
        'O KMZ exportado inclui as imagens das coberturas salvas no planejamento.',
        'No seletor de imagens, escolha Criar tema para posicionar e ajustar uma imagem no mapa.',
        'Use Simbologia militar para pesquisar gráficos táticos e visualizar o símbolo antes de desenhar.',
        'Antes de executar análises RF ou óticas, enquadre no mapa a região de interesse.',
        'Se faltar um arquivo de elevação, o PlanMilT tenta baixá-lo e oferece envio manual em caso de falha.'
    ];

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
     * Sincroniza o controle de abertura automática com a preferência local.
     * @param {HTMLInputElement} checkbox - Controle para habilitar a tela inicial.
     * @param {HTMLElement} errorText - Área para comunicar falhas de armazenamento.
     */
    function bindPreference(checkbox, errorText) {
        const state = read();
        checkbox.checked = !state.hidden;
        if (state.unavailable) errorText.textContent = 'Não foi possível acessar as preferências locais deste navegador.';
        checkbox.addEventListener('change', () => {
            const current = read();
            if (current.unavailable || !write({ hidden: !checkbox.checked, recent: current.recent })) {
                checkbox.checked = !current.hidden;
                errorText.textContent = 'Não foi possível salvar a preferência neste navegador.';
            } else {
                errorText.textContent = '';
            }
        });
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
                #welcomePanel .welcome-tip { background: #eef4fa; border-left: 3px solid #435f88; padding: 10px 12px; }
            </style><div id="welcomePanel">
                <p>Planeje, desenhe e salve suas atividades no mapa.</p>
                <p class="welcome-tip"><strong>Dica:</strong> <span id="welcomeTip"></span></p>
                <h3>Planejamentos recentes</h3>
                <p>Salvos ou carregados neste navegador. A lista pode ser apagada ao limpar os dados do navegador; não contém senhas nem desenhos.</p>
                <div id="welcomeRecent"></div>
                <label><input id="welcomeShow" type="checkbox"> Aparecer mensagem de boas-vindas ao abrir</label>
                <p id="welcomeStorageError" role="status"></p>
            </div>`,
            showCancelButton: true,
            confirmButtonText: 'Começar',
            cancelButtonText: 'Ajuda',
            didOpen: () => {
                document.getElementById('welcomeTip').textContent = tips[Math.floor(Math.random() * tips.length)];
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
                bindPreference(document.getElementById('welcomeShow'), document.getElementById('welcomeStorageError'));
            }
        }).then(result => {
            if (result.dismiss === Swal.DismissReason.cancel) {
                window.PlanMilT.showButtonGuide();
            }
        });
    }

    return Object.freeze({ record, show, bindPreference });
})();
