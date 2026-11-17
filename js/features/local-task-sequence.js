/**
 * @fileoverview Guarda e recupera neste navegador, via IndexedDB, a sequência de tarefas em edição.
 * @exports window.PlanMilT.localTaskSequence
 */
window.PlanMilT = window.PlanMilT || {};

window.PlanMilT.localTaskSequence = (() => {
    const databaseName = `planmilt.tasks.v1:${new URL('.', window.location.href).pathname}`;
    const recordKey = 'latest';
    let controller = null;

    /**
     * Abre o armazenamento local da sequência de tarefas.
     * @returns {Promise<IDBDatabase>} Banco de dados do navegador.
     */
    function openDatabase() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(databaseName, 1);
            request.onupgradeneeded = () => request.result.createObjectStore('tasks');
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
            request.onblocked = () => reject(new Error('O armazenamento local está bloqueado por outra aba.'));
        });
    }

    /**
     * Lê ou grava a sequência em uma única transação.
     * @param {IDBDatabase} db - Banco aberto.
     * @param {Array<Object>} [tasks] - Tarefas a gravar; omitido para leitura.
     * @returns {Promise<Array<Object>|undefined>} Tarefas lidas ou confirmação de gravação.
     */
    function transact(db, tasks) {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction('tasks', tasks === undefined ? 'readonly' : 'readwrite');
            const store = transaction.objectStore('tasks');
            const request = tasks === undefined ? store.get(recordKey) : store.put(tasks, recordKey);
            transaction.oncomplete = () => resolve(tasks === undefined ? request.result : undefined);
            transaction.onerror = () => reject(transaction.error || request.error);
            transaction.onabort = () => reject(transaction.error || new Error('Transação local cancelada.'));
        });
    }

    /**
     * Indica se o valor guardado tem o formato de uma sequência de tarefas.
     * @param {*} value - Valor lido do navegador.
     * @returns {boolean} Verdadeiro para uma lista de tarefas válidas.
     */
    function isValidSequence(value) {
        return Array.isArray(value) && value.every(item => item && typeof item.task === 'string'
            && item.parameters && typeof item.parameters === 'object');
    }

    /**
     * Restaura a sequência anterior e passa a gravar as alterações.
     * @param {Object} dependencies - Acesso ao estado das tarefas.
     * @param {Function} dependencies.getTasks - Fornece a lista atual de tarefas.
     * @param {Function} dependencies.setTasks - Substitui a lista atual de tarefas.
     * @returns {Promise<void>} Restauração inicial concluída.
     */
    async function start({ getTasks, setTasks }) {
        let db;
        let ready = false;
        let timer;
        let writing = Promise.resolve();

        /**
         * Grava imediatamente uma cópia da sequência atual.
         */
        function persist() {
            timer = undefined;
            if (!ready) return;
            let current;
            try {
                current = structuredClone(getTasks());
            } catch (error) {
                console.error('[PlanMilT][Sequências locais] A sequência não pôde ser copiada.', { name: error.name });
                return;
            }
            writing = writing.then(() => transact(db, current)).catch(error => {
                console.error('[PlanMilT][Sequências locais] Não foi possível guardar a sequência.', { name: error?.name });
            });
        }

        /**
         * Agrupa alterações próximas antes de gravar.
         */
        function save() {
            if (!ready) return;
            clearTimeout(timer);
            timer = setTimeout(persist, 500);
        }

        controller = { save };
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden' && timer !== undefined) {
                clearTimeout(timer);
                persist();
            }
        });

        try {
            db = await openDatabase();
            const stored = await transact(db);
            if (isValidSequence(stored) && stored.length && getTasks().length === 0) setTasks(stored);
            ready = true;
        } catch (error) {
            console.error('[PlanMilT][Sequências locais] Não foi possível recuperar a sequência.', { name: error?.name });
        }
    }

    return Object.freeze({
        start,
        /**
         * Agenda a gravação da sequência atual, se o recurso já foi iniciado.
         */
        save() { controller?.save(); }
    });
})();
