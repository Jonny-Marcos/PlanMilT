<?php
declare(strict_types=1);

use PlanMilT\Application\AdminService;
use PlanMilT\Application\SuggestionsService;
use PlanMilT\Infrastructure\Database\SchemaMigrator;

require_once dirname(__DIR__, 2) . '/php/src/Application/SuggestionsService.php';
require_once dirname(__DIR__, 2) . '/php/src/Application/AdminService.php';
require_once dirname(__DIR__, 2) . '/php/src/Infrastructure/Database/SchemaMigrator.php';

$db = new PDO('sqlite::memory:', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$db->exec('PRAGMA user_version = 7');
SchemaMigrator::migrate($db);
$service = new SuggestionsService($db);
$admin = new AdminService($db);
$owner = str_repeat('a', 64);
$other = str_repeat('b', 64);
$requestId = str_repeat('1', 32);
$check = static function (bool $ok, string $message): void {
    if (!$ok) throw new RuntimeException($message);
};
$reject = static function (callable $call, string $message): void {
    try { $call(); } catch (InvalidArgumentException | RuntimeException $error) { return; }
    throw new RuntimeException($message);
};

$id = $service->create($owner, $requestId, 'Título', 'Detalhes', '127.0.0.1');
$check($id === $service->create($owner, $requestId, 'Título', 'Detalhes', '127.0.0.1'), 'Retry created a duplicate.');
$check(count($service->list($owner)) === 1 && count($service->list($other)) === 0, 'Owner isolation failed.');
$reject(fn () => $service->update($other, $id, 'Outro', 'Texto'), 'Another browser edited the suggestion.');
$reject(fn () => $service->create($other, $requestId, 'Outro', 'Texto', '127.0.0.2'), 'Another owner reused a request id.');
$reject(fn () => $service->list('invalid'), 'Invalid token was accepted.');
$reject(fn () => $service->create($owner, str_repeat('2', 32), '', 'Texto', '127.0.0.1'), 'Empty title was accepted.');
$reject(fn () => $service->update($owner, $id, 'Título', str_repeat('x', 8001)), 'Overlong description was accepted.');
$service->update($owner, $id, 'Título editado', 'Detalhes editados');
$record = $admin->getRecord('suggestions', $id);
$check($record['title'] === 'Título editado' && !isset($record['owner_hash']), 'Admin record or secret handling failed.');
$reject(fn () => $admin->saveRecord('suggestions', $id, ['status' => 'pending', 'admin_reply' => 'Resposta']), 'Pending reply was accepted.');
$admin->saveRecord('suggestions', $id, ['status' => 'acknowledged', 'admin_reply' => 'Obrigado']);
$result = $service->list($owner)[0];
$check($result['status'] === 'acknowledged' && $result['admin_reply'] === 'Obrigado', 'Admin response not returned.');
$reject(fn () => $service->update($owner, $id, 'Alterado', 'Texto'), 'Reviewed suggestion remained editable.');
$reject(fn () => $admin->saveRecord('suggestions', $id, ['status' => 'pending', 'admin_reply' => '']), 'Reviewed suggestion reopened.');
$admin->saveRecord('suggestions', $id, ['status' => 'in_progress', 'admin_reply' => 'Em andamento']);
$admin->saveRecord('suggestions', $id, ['status' => 'implemented', 'admin_reply' => 'Concluído']);
$check($service->list($owner)[0]['status'] === 'implemented', 'Final status not persisted.');
$records = $admin->listRecords('suggestions', 0, ['field' => 'title', 'term' => 'editado', 'mode' => 'contains']);
$check(count($records) === 1 && !isset($records[0]['owner_hash']), 'Admin search or secrecy failed.');
$check(count($admin->listRecords('suggestions', 0, ['field' => 'status', 'term' => 'Implementado', 'mode' => 'exact'])) === 1, 'Portuguese status search failed.');
for ($i = 0; $i < 9; $i++) {
    $service->create($owner, sprintf('%032x', $i + 2), 'Título', 'Descrição', '127.0.0.1');
}
$reject(fn () => $service->create($owner, str_repeat('f', 32), 'Título', 'Descrição', '127.0.0.1'), 'Submission limit was not enforced.');
$check(count($service->list($owner)) === 10, 'Limited submission was persisted.');
$admin->deleteRecord('suggestions', $id);
$check(count($service->list($owner)) === 9, 'Admin deletion failed.');
echo "SuggestionsService tests passed.\n";
