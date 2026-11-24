/**
 * @fileoverview Mantém o shell da aplicação e os pacotes de tiles disponíveis sem rede.
 */
const APP_CACHE = 'planmilt-app-shell-v11';
const APP_CACHE_PREFIX = 'planmilt-app-shell-';
const PACKAGE_PREFIX = 'planmilt-offline-package-v1:';
const SHELL_DOCUMENTS = [
    './index.html',
    './visualizador-3d.html',
    './criador-tema.html',
    './manifest.webmanifest',
    './favicon.ico'
];

/**
 * Indica se uma URL pertence a conteúdo do Google Maps.
 * @param {URL} url - URL a verificar.
 * @returns {boolean} Verdadeiro para hosts sujeitos às restrições de cache do Google.
 */
function isRestrictedMapHost(url) {
    return /(?:^|\.)(?:google|googleapis)\.com$/i.test(url.hostname);
}

/**
 * Armazena uma resposta HTTP válida no cache indicado.
 * @param {Cache} cache - Cache de destino.
 * @param {string} requestUrl - URL da requisição.
 * @returns {Promise<boolean>} Indica se a resposta foi armazenada.
 */
async function cacheRequest(cache, requestUrl) {
    const url = new URL(requestUrl, self.location.href);
    const requestOptions = {
        credentials: url.origin === self.location.origin ? 'same-origin' : 'omit',
        redirect: 'follow'
    };
    let response;
    try {
        response = await fetch(new Request(url, {
            ...requestOptions,
            mode: url.origin === self.location.origin ? 'same-origin' : 'cors'
        }));
    } catch (error) {
        if (url.origin === self.location.origin) throw error;
        response = await fetch(new Request(url, { ...requestOptions, mode: 'no-cors' }));
    }
    if (response.ok || response.type === 'opaque') {
        await cache.put(url.href, response);
        return true;
    }
    return false;
}

/**
 * Extrai recursos locais declarados em HTML ou CSS.
 * @param {string} content - Conteúdo do documento.
 * @param {string} baseUrl - URL usada para resolver caminhos relativos.
 * @param {boolean} styles - Se o conteúdo deve ser interpretado como CSS.
 * @returns {Array<string>} URLs locais encontradas.
 */
function getLocalAssetUrls(content, baseUrl, styles = false) {
    const expression = styles
        ? /url\(\s*["']?([^"')#]+)["']?\s*\)/gi
        : /(?:src|href)=["']([^"'#]+)["']/gi;
    return [...content.matchAll(expression)]
        .map(match => new URL(match[1], baseUrl))
        .filter(url => url.origin === self.location.origin
            && !/^data:|^blob:/i.test(url.protocol)
            && !/\/php\/endpoints\//.test(url.pathname))
        .map(url => url.href);
}

/**
 * Prepara os documentos e os recursos estáticos necessários para abrir o PlanMilT offline.
 * @returns {Promise<void>} Conclusão da preparação.
 */
async function cacheApplicationShell() {
    const cache = await caches.open(APP_CACHE);
    const documentAssets = new Set();

    for (const documentUrl of SHELL_DOCUMENTS) {
        const url = new URL(documentUrl, self.location.href);
        let response;
        try {
            response = await fetch(new Request(url, { cache: 'no-cache', credentials: 'same-origin' }));
        } catch (error) {
            const previousCaches = (await caches.keys())
                .filter(name => name.startsWith(APP_CACHE_PREFIX) && name !== APP_CACHE);
            for (const previousName of previousCaches) {
                response = await (await caches.open(previousName)).match(url.href);
                if (response) break;
            }
            console.warn(`[PlanMilT][Offline] Falha ao atualizar documento do shell: ${url.pathname}`, error);
        }
        if (!response?.ok) {
            console.warn(`[PlanMilT][Offline] Documento do shell indisponível: ${url.pathname} (HTTP ${response.status}).`);
            continue;
        }
        const body = await response.clone().text();
        if (/\.html$/i.test(url.pathname)) {
            getLocalAssetUrls(body, url.href).forEach(asset => documentAssets.add(asset));
        }
        if (documentUrl === './index.html') {
            const rootResponse = response.clone();
            await cache.put(url.href, response);
            await cache.put(new URL('./', self.location.href).href, rootResponse);
        } else {
            await cache.put(url.href, response);
        }
    }

    const stylesheetAssets = new Set();
    await Promise.allSettled([...documentAssets].map(async assetUrl => {
        if (!assetUrl.endsWith('.css')) {
            await cacheRequest(cache, assetUrl);
            return;
        }
        const response = await fetch(new Request(assetUrl, { credentials: 'same-origin' }));
        if (!response.ok) return;
        const css = await response.clone().text();
        getLocalAssetUrls(css, assetUrl, true).forEach(asset => stylesheetAssets.add(asset));
        await cache.put(assetUrl, response);
    }));

    await Promise.allSettled([...stylesheetAssets].map(url => cacheRequest(cache, url)));
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
    if (urls.length > 10000) {
        throw new Error('O pacote excede o limite de 10.000 tiles.');
    }
    if (urls.some(requestUrl => {
        const url = new URL(requestUrl);
        return url.protocol !== 'https:'
            || Boolean(url.username || url.password)
            || isRestrictedMapHost(url);
    })) {
        throw new Error('O pacote contém uma URL insegura, com credenciais ou do Google Maps, cujo download em cache não é permitido.');
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
    event.waitUntil((async () => {
        const names = await caches.keys();
        await Promise.all(names
            .filter(name => name.startsWith(APP_CACHE_PREFIX) && name !== APP_CACHE)
            .map(name => caches.delete(name)));
        await self.clients.claim();
    })());
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
    if (url.origin !== self.location.origin && url.protocol !== 'https:') {
        return;
    }
    if (url.origin === self.location.origin && (/php\/endpoints\//.test(url.pathname)
        || /\/SRTM3\/[NS]\d{2}[EW]\d{3}\.HGT$/i.test(url.pathname))) {
        return;
    }

    event.respondWith((async () => {
        if (!isRestrictedMapHost(url)) {
            const packaged = await matchPackageCache(request);
            if (packaged) return packaged;
        }
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
