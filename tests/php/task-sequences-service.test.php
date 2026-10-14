<?php
declare(strict_types=1);

use PlanMilT\Application\TaskSequencesService;

require_once dirname(__DIR__, 2) . '/php/src/Application/TaskSequencesService.php';

$database = new PDO('sqlite::memory:');
$database->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$database->exec(
    'CREATE TABLE task_sequences ('
    . 'id INTEGER PRIMARY KEY AUTOINCREMENT, '
    . 'name TEXT NOT NULL UNIQUE, '
    . 'password TEXT NOT NULL, '
    . 'sequence TEXT NOT NULL, '
    . 'description TEXT, '
    . 'date_created TEXT NOT NULL, '
    . 'date_modified TEXT NOT NULL'
    . ')'
);

$service = new TaskSequencesService($database);

$assert = static function (bool $condition, string $message): void {
    if (!$condition) {
        throw new RuntimeException($message);
    }
};

$created = $service->save('Alpha', 'correct horse battery staple', '[{"task":"survey"}]', 'First plan');
$assert($created === ['success' => true, 'message' => 'Sequência salva com sucesso.'], 'Sequence creation payload changed.');
$assert($service->exists('Alpha') === ['success' => true, 'exists' => true], 'Saved sequence was not found.');
$assert($service->exists('Missing') === ['success' => true, 'exists' => false], 'Missing sequence was reported as present.');

$loaded = $service->getSequence('Alpha');
$assert($loaded === [
    'success' => true,
    'sequence' => [['task' => 'survey']],
    'description' => 'First plan'
], 'Sequence lookup payload changed.');

$wrongPassword = $service->save('Alpha', 'incorrect password', '[{"task":"changed"}]', 'Changed plan');
$assert($wrongPassword === [
    'success' => false,
    'error' => 'Senha incorreta para a sequência existente.'
], 'Incorrect password did not reject sequence update.');
$assert($service->getSequence('Alpha') === $loaded, 'Rejected update modified the saved sequence.');

$updated = $service->save('Alpha', 'correct horse battery staple', '[{"task":"changed"}]', 'Changed plan');
$assert($updated === ['success' => true, 'message' => 'Sequência atualizada com sucesso.'], 'Sequence update payload changed.');

$list = $service->load();
$assert($list === ['success' => true, 'sequences' => ['Alpha']], 'Sequence listing payload changed.');

$wrongDeletePassword = $service->delete('Alpha', 'incorrect password');
$assert($wrongDeletePassword === [
    'success' => false,
    'error' => 'Senha incorreta para deletar a sequência.'
], 'Incorrect password did not reject sequence deletion.');
$assert($service->exists('Alpha') === ['success' => true, 'exists' => true], 'Rejected deletion removed the sequence.');

$deleted = $service->delete('Alpha', 'correct horse battery staple');
$assert($deleted === ['success' => true, 'message' => 'Sequência deletada com sucesso.'], 'Sequence deletion payload changed.');
$assert($service->exists('Alpha') === ['success' => true, 'exists' => false], 'Deleted sequence still exists.');
$assert($service->delete('Alpha', 'correct horse battery staple') === [
    'success' => false,
    'error' => 'Sequência não encontrada.'
], 'Missing sequence deletion payload changed.');
$assert($service->save('', '', '', '') === [
    'success' => false,
    'error' => 'Nome, senha e sequência são obrigatórios.'
], 'Missing save fields were not rejected.');

echo "TaskSequencesService tests passed.\n";
