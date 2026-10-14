<?php
/**
 * Endpoint HTTP de compatibilidade para operações de sequências de tarefas.
 *
 * Traduz o campo POST `action` para chamadas ao serviço de aplicação.
 */
use PlanMilT\Application\TaskSequencesService;
use PlanMilT\Infrastructure\Database\ConnectionFactory;
use PlanMilT\Infrastructure\Logging\Logger;

require_once dirname(__DIR__, 2) . '/bootstrap.php';
require_once dirname(__DIR__) . '/src/Application/TaskSequencesService.php';

header('Content-Type: application/json');

try {
    $service = new TaskSequencesService(ConnectionFactory::create());
} catch (PDOException $error) {
    Logger::write('Falha ao conectar ao banco ao processar sequências: ' . $error->getMessage());
    echo json_encode(['success' => false, 'error' => 'Falha na conexão com o banco de dados.']);
    exit;
}

$action = $_POST['action'] ?? null;
$nameInput = $_POST['name'] ?? '';
$name = is_string($nameInput) ? trim($nameInput) : null;
$response = ['success' => false, 'error' => 'Ação inválida.'];

if ($action === 'save') {
    $password = $_POST['password'] ?? '';
    $sequence = $_POST['sequence'] ?? '';
    $descriptionInput = $_POST['description'] ?? '';
    $description = is_string($descriptionInput) ? trim($descriptionInput) : null;

    if (!is_string($name) || !is_string($password) || !is_string($sequence) || !is_string($description)) {
        $response = ['success' => false, 'error' => 'Dados inválidos para salvar a sequência.'];
    } else {
        $response = $service->save($name, $password, $sequence, $description);
    }
} elseif ($action === 'load') {
    $response = $service->load();
} elseif ($action === 'get_sequence') {
    $response = is_string($name)
        ? $service->getSequence($name)
        : ['success' => false, 'error' => 'Nome é obrigatório.'];
} elseif ($action === 'check_sequence') {
    $response = is_string($name)
        ? $service->exists($name)
        : ['success' => false, 'error' => 'Nome é obrigatório.'];
} elseif ($action === 'delete_sequence') {
    $password = $_POST['password'] ?? '';
    $response = is_string($name) && is_string($password)
        ? $service->delete($name, $password)
        : ['success' => false, 'error' => 'Nome e senha são obrigatórios para deletar a sequência.'];
}

echo json_encode($response);
