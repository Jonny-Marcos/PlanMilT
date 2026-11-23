/**
 * @fileoverview Mantém o shell da aplicação e os pacotes de tiles disponíveis sem rede.
 */
const APP_CACHE = 'planmilt-app-shell-v1';
const PACKAGE_PREFIX = 'planmilt-offline-package-v1:';

/**
 * Armazena uma resposta HTTP válida no cache indicado.
 * @param {Cache} cache - Cache de destino.
 * @param {string} requestUrl - URL da requisição.
 * @returns {Promise<boolean>} Indica se a resposta foi armazenada.
 */
async function cacheRequest(cache, requestUrl) {
    const url = new URL(requestUrl, self.location.href);
    const response = await fetch(new Request(url, {
        credentials: 'omit',
        mode: url.origin === self.location.origin ? 'same-origin' : 'no-cors',
        redirect: 'follow'
    }));
    if (response.ok || response.type === 'opaque') {
        await cache.put(url.href, response);
        return true;
    }
    return false;
}

/**
 * Prepara os arquivos declarados diretamente pelo documento principal.
 * @returns {Promise<void>} Conclusão da preparação.
 */
async function cacheApplicationShell() {
    const cache = await caches.open(APP_CACHE);
    const indexResponse = await fetch('./index.html', { cache: 'no-cache' });
    if (!indexResponse.ok) {
        throw new Error(`Não foi possível carregar o shell (HTTP ${indexResponse.status}).`);
    }
    const indexText = await indexResponse.clone().text();
    const rootResponse = indexResponse.clone();
    await cache.put('./index.html', indexResponse);
    await cache.put('./', rootResponse);

    const assetUrls = [...indexText.matchAll(/(?:src|href)=["']([^"'#]+)["']/g)]
        .map(match => new URL(match[1], self.location.href))
        .filter(url => url.origin === self.location.origin && url.pathname !== self.location.pathname)
        .map(url => url.href);

    await Promise.allSettled(assetUrls.map(url => cacheRequest(cache, url)));
}

/**
 * Localiza uma resposta entre os caches de pacotes offline.
 * @param {Request} request - Requisição interceptada.
 * @returns {Promise<Response|undefined>} Resposta armazenada, quando existir.
 */
async function matchPackageCache(request) {
    const names = (await caches.keys()).filter(name => name.startsWith(PACKAGE_PREFIX));
    for (const name of names) {
        const response = await (await caches.open(name)).match(request, { ignoreSearch: false });
        if (response) return response;
    }
    return undefined;
}

/**
 * Baixa uma lista de URLs para um pacote, respeitando concorrência limitada.
 * @param {MessagePort} port - Canal de progresso com a página.
 * @param {{cacheName: string, urls: Array<string>}} data - Definição do pacote.
 * @returns {Promise<void>} Conclusão do download.
 */
async function cachePackage(port, data) {
    if (!data || typeof data.cacheName !== 'string' || !data.cacheName.startsWith(PACKAGE_PREFIX)
        || !Array.isArray(data.urls) || data.urls.some(url => typeof url !== 'string')) {
        throw new Error('Manifesto de pacote offline inválido.');
    }
    const urls = [...new Set(data.urls)];
    if (urls.some(requestUrl => {
        const url = new URL(requestUrl);
        return url.protocol !== 'https:'
            || !['tile.opentopomap.org', 'bdgex.eb.mil.br'].includes(url.hostname);
    })) {
        throw new Error('O pacote contém uma origem de tiles não autorizada.');
    }
    const cache = await caches.open(data.cacheName);
    let completed = 0;
    let nextIndex = 0;
    const workers = Array.from({ length: Math.min(4, urls.length) }, async () => {
        while (nextIndex < urls.length) {
            const index = nextIndex++;
            const url = urls[index];
            try {
                if (!await cache.match(url)) await cacheRequest(cache, url);
            } catch (error) {
                console.warn('[PlanMilT][Offline] Falha ao armazenar um tile.', error);
            } finally {
                completed++;
                port.postMessage({ type: 'PACKAGE_PROGRESS', completed, total: urls.length });
            }
        }
    });
    await Promise.all(workers);
    const keys = await cache.keys();
    port.postMessage({ type: 'PACKAGE_COMPLETE', cached: keys.length, total: urls.length });
}

self.addEventListener('install', event => {
    event.waitUntil(cacheApplicationShell().then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
    event.waitUntil(self.clients.claim());
});

self.addEventListener('message', event => {
    if (!event.data || event.data.type !== 'CACHE_PACKAGE' || !event.ports[0]) return;
    event.waitUntil(cachePackage(event.ports[0], event.data)
        .catch(error => event.ports[0].postMessage({
            type: 'PACKAGE_ERROR',
            message: error instanceof Error ? error.message : 'Falha ao criar o pacote.'
        })));
});

self.addEventListener('fetch', event => {
    const request = event.request;
    if (request.method !== 'GET') return;
    const url = new URL(request.url);
    if (url.origin !== self.location.origin && !/^https:\/\/(?:tile\.opentopomap\.org|bdgex\.eb\.mil\.br)\//i.test(url.href)) {
        return;
    }
    if (url.origin === self.location.origin && /php\/endpoints\//.test(url.pathname)) {
        return;
    }

    event.respondWith((async () => {
        const packaged = await matchPackageCache(request);
        if (packaged) return packaged;
        if (url.origin !== self.location.origin) return fetch(request);
        try {
            const response = await fetch(request);
            if (response.ok) {
                const cache = await caches.open(APP_CACHE);
                await cache.put(request, response.clone());
            }
            return response;
        } catch (error) {
            const cached = await (await caches.open(APP_CACHE)).match(request);
            if (cached) return cached;
            if (request.mode === 'navigate') {
                const shell = await (await caches.open(APP_CACHE)).match('./index.html');
                if (shell) return shell;
            }
            throw error;
        }
    })());
});
