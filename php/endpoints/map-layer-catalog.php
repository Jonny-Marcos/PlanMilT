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

try {
    $service = new MapLayerCatalogService(ConnectionFactory::create());
    $serviceId = $serviceIdInput === '' ? null : (int) $serviceIdInput;
    echo json_encode(
        $service->browse($query, $serviceId),
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR
    );
} catch (Throwable $error) {
    http_response_code(500);
    echo json_encode(['error' => 'Não foi possível carregar o catálogo de camadas.'], JSON_UNESCAPED_UNICODE);
}
?>