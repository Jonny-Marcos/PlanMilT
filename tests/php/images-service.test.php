<?php
declare(strict_types=1);

use PlanMilT\Application\ImagesService;

require_once dirname(__DIR__, 2) . '/php/src/Application/ImagesService.php';

$database = new PDO('sqlite::memory:');
$database->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$database->exec(
    'CREATE TABLE images ('
    . 'id INTEGER PRIMARY KEY AUTOINCREMENT, '
    . 'image BLOB, '
    . 'location TEXT, '
    . 'created_at TEXT NOT NULL, '
    . 'updated_at TEXT NOT NULL, '
    . 'description TEXT NOT NULL, '
    . 'password_hash TEXT NOT NULL, '
    . 'is_shared INTEGER NOT NULL'
    . ')'
);

$service = new ImagesService($database);
$assert = static function (bool $condition, string $message): void {
    if (!$condition) {
        throw new RuntimeException($message);
    }
};

$location = '[[10,20],[0,30]]';
$assert(
    $service->save('original-image', 'Tema original', $location, '', false, null, '', '2020-01-02 03:04:05')
        === 'Imagem salva com sucesso!',
    'Creating an unprotected theme changed its response.'
);
$assert(
    $database->query(
        "SELECT created_at FROM images WHERE description = 'Tema original'"
    )->fetchColumn() === '2020-01-02 03:04:05',
    'The optional legacy creation timestamp was not preserved.'
);
$assert(
    $service->save('protected-image', 'Tema protegido', $location, 'old-secret', false) === 'Imagem salva com sucesso!',
    'Creating a password-protected theme failed.'
);
$protectedId = (int) $database->query(
    "SELECT id FROM images WHERE description = 'Tema protegido'"
)->fetchColumn();
$originalHash = (string) $database->query(
    'SELECT password_hash FROM images WHERE id = ' . $protectedId
)->fetchColumn();

$assert(
    $service->save('unauthorized', 'Nome indevido', $location, '', false, $protectedId, 'wrong-secret')
        === 'Senha incorreta ou não fornecida.',
    'Updating a protected theme should require its current password.'
);
$unchanged = $database->query(
    'SELECT image, description, password_hash FROM images WHERE id = ' . $protectedId
)->fetch(PDO::FETCH_ASSOC);
$assert(
    $unchanged['image'] === 'protected-image' && $unchanged['description'] === 'Tema protegido'
        && $unchanged['password_hash'] === $originalHash,
    'A rejected update modified the protected theme.'
);

$assert(
    $service->save('updated-image', 'Tema renomeado', $location, '', false, $protectedId, 'old-secret')
        === 'Imagem atualizada com sucesso!',
    'An authorized rename without a new password failed.'
);
$updated = $database->query(
    'SELECT image, description, password_hash, updated_at FROM images WHERE id = ' . $protectedId
)->fetch(PDO::FETCH_ASSOC);
$assert(
    $updated['image'] === 'updated-image' && $updated['description'] === 'Tema renomeado'
        && $updated['password_hash'] === $originalHash && !empty($updated['updated_at']),
    'An authorized update failed to preserve the existing password or content.'
);

$assert(
    $service->save('reprotected-image', 'Tema renomeado', $location, 'new-secret', false, $protectedId, 'old-secret')
        === 'Imagem atualizada com sucesso!',
    'Changing the password on an authorized update failed.'
);
$newHash = (string) $database->query(
    'SELECT password_hash FROM images WHERE id = ' . $protectedId
)->fetchColumn();
$assert(
    $newHash !== $originalHash && password_verify('new-secret', $newHash),
    'The new password was not hashed and stored.'
);

$assert(
    $service->save('missing', 'Inexistente', $location, '', false, 999, '')
        === 'Imagem não encontrada.',
    'Updating a missing theme should return a not-found message.'
);

echo "ImagesService tests passed.\n";
