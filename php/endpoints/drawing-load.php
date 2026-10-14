<?php
/**
 * Endpoint legado para carregar desenhos armazenados.
 *
 * Mantém o contrato POST e devolve o JSON persistido sem transformação.
 */
use PlanMilT\Application\DrawingsService;
use PlanMilT\Infrastructure\Database\ConnectionFactory;

require_once dirname(__DIR__) . '/bootstrap.php';
require_once dirname(__DIR__) . '/src/Application/DrawingsService.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    echo json_encode(['error' => 'Método de requisição não suportado.']);
    exit;
}

header('Content-Type: application/json');

$user = $_POST['usuario'] ?? '';
$link = $_POST['link'] ?? '';

if (!is_string($user) || !is_string($link)) {
    echo json_encode(['error' => 'Erro na conexão com o banco de dados: parâmetros inválidos.']);
    exit;
}

try {
    $service = new DrawingsService(ConnectionFactory::create());
    $drawing = $service->load($user, $link);

    if ($drawing !== null) {
        echo $drawing;
    } else {
        echo json_encode(['error' => 'Nenhum desenho encontrado para o usuário fornecido.']);
    }
} catch (PDOException $error) {
    echo json_encode(['error' => 'Não foi possível carregar os desenhos.']);
}
