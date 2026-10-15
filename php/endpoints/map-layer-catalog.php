<?php
declare(strict_types=1);

/**
 * Retorna recomendações por categoria ou pesquisa textual no catálogo completo de camadas WMS.
 */
use PlanMilT\Application\MapLayerCatalogService;
use PlanMilT\Infrastructure\Database\ConnectionFactory;

require_once dirname(__DIR__) . '/bootstrap.php';
require_once dirname(__DIR__) . '/src/Application/MapLayerCatalogService.php';

header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    header('Allow: GET');
    http_response_code(405);
    echo json_encode(['error' => 'Método não permitido.'], JSON_UNESCAPED_UNICODE);
    exit;
}

$query = trim((string) ($_GET['q'] ?? ''));
$serviceIdInput = (string) ($_GET['service_id'] ?? '');
$categoryCodeInput = (string) ($_GET['category_code'] ?? '');
$yearInput = (string) ($_GET['year'] ?? '');
if (strlen($query) > 256) {
    http_response_code(400);
    echo json_encode(['error' => 'O texto de busca excede o limite permitido.'], JSON_UNESCAPED_UNICODE);
    exit;
}
if ($serviceIdInput !== '' && (!ctype_digit($serviceIdInput) || (int) $serviceIdInput < 1)) {
    http_response_code(400);
    echo json_encode(['error' => 'SIG inválido.'], JSON_UNESCAPED_UNICODE);
    exit;
}
if ($categoryCodeInput !== ''
    && $categoryCodeInput !== 'uncategorized'
    && !preg_match('/^[a-z0-9_]{1,64}$/D', $categoryCodeInput)) {
    http_response_code(400);
    echo json_encode(['error' => 'Categoria inválida.'], JSON_UNESCAPED_UNICODE);
    exit;
}
if ($yearInput !== ''
    && $yearInput !== 'none'
    && (!ctype_digit($yearInput) || (int) $yearInput < 1 || (int) $yearInput > 9999)) {
    http_response_code(400);
    echo json_encode(['error' => 'Ano inválido.'], JSON_UNESCAPED_UNICODE);
    exit;
}
if ($query === '' && ($categoryCodeInput !== '' || $yearInput !== '')) {
    http_response_code(400);
    echo json_encode(['error' => 'Os filtros avançados exigem um texto de busca.'], JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    $service = new MapLayerCatalogService(ConnectionFactory::create());
    $serviceId = $serviceIdInput === '' ? null : (int) $serviceIdInput;
    $categoryCode = $categoryCodeInput === '' ? null : $categoryCodeInput;
    $year = $yearInput === '' ? null : $yearInput;
    echo json_encode(
        $service->browse($query, $serviceId, $categoryCode, $year),
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR
    );
} catch (Throwable $error) {
    http_response_code(500);
    echo json_encode(['error' => 'Não foi possível carregar o catálogo de camadas.'], JSON_UNESCAPED_UNICODE);
}
?>