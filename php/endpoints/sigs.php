<?php
/**
 * Retorna a lista de serviços de informação geográfica cadastrados.
 *
 * Contrato GET que preserva os campos Nome e URL esperados pelos consumidores legados.
 */
use PlanMilT\Infrastructure\Database\ConnectionFactory;

require_once dirname(__DIR__) . '/bootstrap.php';

header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    header('Allow: GET');
    http_response_code(405);
    echo json_encode(['error' => 'Método não permitido.'], JSON_UNESCAPED_UNICODE);
    exit;
}

try {
    $db = ConnectionFactory::create();
    $stmt = $db->query('SELECT name AS Nome, url AS URL FROM map_services');
    $results = $stmt->fetchAll();

    echo json_encode($results, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
} catch (PDOException | JsonException $error) {
    http_response_code(500);
    echo json_encode(['error' => 'Não foi possível carregar a lista de SIGs.'], JSON_UNESCAPED_UNICODE);
}
?>