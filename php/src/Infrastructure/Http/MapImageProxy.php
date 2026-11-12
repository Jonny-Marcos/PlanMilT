<?php
declare(strict_types=1);

namespace PlanMilT\Infrastructure\Http;

use InvalidArgumentException;
use PDO;
use RuntimeException;

/**
 * Busca imagens apenas de origens HTTPS cadastradas para camadas do mapa.
 */
final class MapImageProxy
{
    private const MAX_IMAGE_BYTES = 3_000_000;
    private const MAX_IMAGE_DIMENSION = 2048;
    private const OPEN_TOPO_HOST = 'tile.opentopomap.org';

    /**
     * @param PDO $database Banco com as origens WMS permitidas.
     * @param callable|null $resolver Resolver DNS substituível em testes.
     * @param callable|null $requester Requisição HTTP substituível em testes.
     */
    public function __construct(
        private PDO $database,
        private $resolver = null,
        private $requester = null
    ) {
    }

    /**
     * Valida uma URL contra hosts cadastrados e o padrão fixo de tiles OpenTopoMap.
     *
     * @param string $url URL de imagem solicitada.
     * @return array{host:string,path:string,query:string} Componentes validados.
     */
    public function validateUrl(string $url): array
    {
        if ($url === '' || strlen($url) > 8192) {
            throw new InvalidArgumentException('A URL da camada não é permitida.');
        }
        $parts = parse_url($url);
        if (!is_array($parts)
            || strtolower($parts['scheme'] ?? '') !== 'https'
            || !isset($parts['host'], $parts['path'])
            || isset($parts['user'])
            || isset($parts['pass'])
            || isset($parts['fragment'])
            || (isset($parts['port']) && $parts['port'] !== 443)) {
            throw new InvalidArgumentException('A URL da camada não é permitida.');
        }
        $host = strtolower(rtrim($parts['host'], '.'));
        $path = $parts['path'];
        $query = $parts['query'] ?? '';
        if ($host !== strtolower($parts['host'])
            || !preg_match('/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))+$/', $host)) {
            throw new InvalidArgumentException('A origem da camada não é permitida.');
        }
        if (preg_match('/(^|\.)google\.(?:com|com\.br)$/i', $host)) {
            throw new InvalidArgumentException('A origem de imagens do Google não pode ser encaminhada.');
        }
        if ($host === self::OPEN_TOPO_HOST) {
            if ($query !== '' || !preg_match('~^/map/(?:[0-9]|1[0-8])/\d+/\d+\.png$~', $path)) {
                throw new InvalidArgumentException('O tile de mapa solicitado não é permitido.');
            }
            return ['host' => $host, 'path' => $path, 'query' => ''];
        }

        if (!$this->isRegisteredServicePath($host, $path)) {
            throw new InvalidArgumentException('A origem da camada não está na lista permitida.');
        }

        $queryKeys = [];
        foreach (explode('&', $query) as $parameter) {
            $key = strtolower(urldecode(explode('=', $parameter, 2)[0]));
            if ($key !== '' && isset($queryKeys[$key])) {
                throw new InvalidArgumentException('A solicitação WMS contém parâmetros repetidos.');
            }
            $queryKeys[$key] = true;
        }
        parse_str($query, $parameters);
        $parameters = array_change_key_case($parameters, CASE_LOWER);
        $format = strtolower((string) ($parameters['format'] ?? ''));
        $bboxParts = explode(',', (string) ($parameters['bbox'] ?? ''));
        $validBbox = count($bboxParts) === 4;
        foreach ($bboxParts as $value) {
            if (!preg_match('/^-?(?:\d+(?:\.\d*)?|\.\d+)$/', $value)) {
                $validBbox = false;
                break;
            }
        }
        $bbox = $validBbox ? array_map('floatval', $bboxParts) : [];
        if (strtoupper((string) ($parameters['service'] ?? '')) !== 'WMS'
            || strtoupper((string) ($parameters['request'] ?? '')) !== 'GETMAP'
            || !in_array($format, ['image/png', 'image/jpeg', 'image/webp'], true)
            || !isset($parameters['width'], $parameters['height'])
            || !ctype_digit((string) $parameters['width'])
            || !ctype_digit((string) $parameters['height'])
            || (int) $parameters['width'] < 1
            || (int) $parameters['width'] > self::MAX_IMAGE_DIMENSION
            || (int) $parameters['height'] < 1
            || (int) $parameters['height'] > self::MAX_IMAGE_DIMENSION
            || !$validBbox
            || !array_reduce($bbox, static fn (bool $valid, float $value): bool =>
                $valid && is_finite($value) && abs($value) <= 40_000_000, true)) {
            throw new InvalidArgumentException('A solicitação WMS não é uma imagem de mapa permitida.');
        }

        return ['host' => $host, 'path' => $path, 'query' => $query];
    }

    /**
     * Busca e valida uma resposta de imagem com limite de tamanho e sem redirecionamentos.
     *
     * @param string $url URL já validada contra a allowlist.
     * @return array{contentType:string,body:string} Imagem raster validada.
     */
    public function fetch(string $url): array
    {
        $target = $this->validateUrl($url);
        $address = $this->resolvePublicAddress($target['host']);
        $response = $this->requester !== null
            ? ($this->requester)($url, $address)
            : $this->requestRemote($url, $target['host'], $address);

        if (!is_array($response)
            || ($response['status'] ?? 0) !== 200
            || !is_string($response['body'] ?? null)
            || strlen($response['body']) > self::MAX_IMAGE_BYTES) {
            throw new RuntimeException('O serviço de mapa não retornou uma imagem permitida.');
        }

        $imageInfo = getimagesizefromstring($response['body']);
        $contentType = strtolower(trim(explode(';', (string) ($response['contentType'] ?? ''))[0]));
        $allowedTypes = ['image/png', 'image/jpeg', 'image/webp'];
        if (!is_array($imageInfo)
            || !in_array($imageInfo['mime'] ?? '', $allowedTypes, true)
            || !in_array($contentType, $allowedTypes, true)
            || $contentType !== $imageInfo['mime']
            || ($imageInfo[0] ?? 0) < 1
            || ($imageInfo[0] ?? 0) > self::MAX_IMAGE_DIMENSION
            || ($imageInfo[1] ?? 0) < 1
            || ($imageInfo[1] ?? 0) > self::MAX_IMAGE_DIMENSION) {
            throw new RuntimeException('O serviço de mapa não retornou uma imagem permitida.');
        }

        return ['contentType' => $contentType, 'body' => $response['body']];
    }

    /**
     * Verifica se o caminho corresponde ao endpoint WMS cadastrado.
     *
     * @param string $host Host da URL requisitada.
     * @param string $path Caminho da URL requisitada.
     * @return bool Indica que a origem e o caminho estão cadastrados.
     */
    private function isRegisteredServicePath(string $host, string $path): bool
    {
        $services = $this->database->query('SELECT url FROM map_services')->fetchAll(PDO::FETCH_COLUMN);
        foreach ($services as $serviceUrl) {
            $service = parse_url((string) $serviceUrl);
            if (is_array($service)
                && strtolower($service['scheme'] ?? '') === 'https'
                && !isset($service['user'])
                && !isset($service['pass'])
                && strtolower(rtrim($service['host'] ?? '', '.')) === $host
                && ($service['port'] ?? 443) === 443
                && ($service['path'] ?? '/') === $path) {
                return true;
            }
        }
        return false;
    }

    /**
     * Resolve o host e rejeita endereços privados ou reservados antes da conexão.
     *
     * @param string $host Host permitido pela allowlist.
     * @return string Endereço IPv4 público para fixar na conexão.
     */
    private function resolvePublicAddress(string $host): string
    {
        $addresses = $this->resolver !== null
            ? ($this->resolver)($host)
            : gethostbynamel($host);
        if (!is_array($addresses) || $addresses === []) {
            throw new RuntimeException('Não foi possível resolver o serviço de mapa.');
        }
        foreach ($addresses as $address) {
            if (!filter_var(
                $address,
                FILTER_VALIDATE_IP,
                FILTER_FLAG_IPV4 | FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE
            )) {
                throw new InvalidArgumentException('O serviço de mapa resolveu para um endereço não permitido.');
            }
        }
        return $addresses[0];
    }

    /**
     * Executa HTTPS para um IP validado, limita bytes/tempo e não segue redirecionamentos.
     *
     * @param string $url URL do serviço aprovado.
     * @param string $host Host HTTPS esperado.
     * @param string $address IPv4 público fixado na conexão.
     * @return array{status:int,contentType:string,body:string} Resposta recebida.
     */
    private function requestRemote(string $url, string $host, string $address): array
    {
        if (!function_exists('curl_init')) {
            throw new RuntimeException('O cURL do PHP não está disponível.');
        }
        $body = '';
        $tooLarge = false;
        $handle = curl_init($url);
        if ($handle === false) {
            throw new RuntimeException('Não foi possível iniciar a conexão com o serviço de mapa.');
        }
        curl_setopt_array($handle, [
            CURLOPT_RETURNTRANSFER => false,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
            CURLOPT_CONNECTTIMEOUT => 4,
            CURLOPT_TIMEOUT => 12,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_SSL_VERIFYHOST => 2,
            CURLOPT_RESOLVE => [$host . ':443:' . $address],
            CURLOPT_HTTPHEADER => ['Accept: image/png,image/jpeg,image/webp'],
            CURLOPT_WRITEFUNCTION => static function ($curl, string $chunk) use (&$body, &$tooLarge): int {
                if (strlen($body) + strlen($chunk) > self::MAX_IMAGE_BYTES) {
                    $tooLarge = true;
                    return 0;
                }
                $body .= $chunk;
                return strlen($chunk);
            },
        ]);
        $success = curl_exec($handle);
        $status = (int) curl_getinfo($handle, CURLINFO_RESPONSE_CODE);
        $contentType = (string) curl_getinfo($handle, CURLINFO_CONTENT_TYPE);
        curl_close($handle);
        if ($success === false || $tooLarge) {
            throw new RuntimeException('Não foi possível obter a imagem do serviço de mapa.');
        }

        return ['status' => $status, 'contentType' => $contentType, 'body' => $body];
    }
}
