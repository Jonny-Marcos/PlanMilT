<?php
// upload_elevation_files.php

ini_set('display_errors', 1);
error_reporting(E_ALL);

header('Content-Type: application/json');

function writeLog($message) {
    file_put_contents('logfile.log', date('Y-m-d H:i:s') . ' - ' . $message . PHP_EOL, FILE_APPEND);
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!isset($_FILES['files']) || !isset($_POST['missingTiles'])) {
        writeLog("Dados incompletos.\n");
        echo json_encode(['success' => false, 'message' => 'Dados incompletos.']);
        exit;
    }

    $missingTiles = json_decode($_POST['missingTiles'], true);

    if (!is_array($missingTiles)) {
        writeLog("Dados inválidos para missingTiles.\n");
        echo json_encode(['success' => false, 'message' => 'Dados inválidos.']);
        exit;
    }

    $uploadDir = __DIR__ . '/SRTM3/';
    $uploadedFiles = $_FILES['files'];

    $errors = [];
    $successCount = 0;

    foreach ($missingTiles as $index => $tileName) {
        writeLog("Processando tile: $tileName\n");
        // Verifica se o arquivo foi enviado
        if (isset($uploadedFiles['name'][$index])) {
            $fileName = $uploadedFiles['name'][$index];
            $tmpName = $uploadedFiles['tmp_name'][$index];
            $fileError = $uploadedFiles['error'][$index];

            if ($fileError !== UPLOAD_ERR_OK) {
                writeLog("Erro no upload do arquivo: $fileName\n");
                $errors[] = "Erro ao fazer upload do arquivo $fileName.";
                continue;
            }

            // Verifica se o nome do arquivo corresponde ao tile esperado
            if (strtoupper($fileName) !== strtoupper($tileName)) {
                writeLog("Nome do arquivo incorreto: $fileName != $tileName\n");
                $errors[] = "O nome do arquivo enviado ($fileName) não corresponde ao esperado ($tileName).";
                continue;
            }

            // Verifica se o arquivo é um arquivo .hgt válido
            $fileSize = filesize($tmpName);
            $expectedSizes = [1201 * 1201 * 2, 3601 * 3601 * 2]; // Tamanhos válidos para SRTM3 e SRTM1

            if (!in_array($fileSize, $expectedSizes)) {
                writeLog("Tamanho do arquivo inválido: $fileName ($fileSize bytes)\n");
                $errors[] = "O arquivo $fileName não parece ser um arquivo de elevação válido.";
                continue;
            }

            // Move o arquivo para o diretório SRTM3
            $destination = $uploadDir . strtoupper($tileName);
            if (move_uploaded_file($tmpName, $destination)) {
                $successCount++;
            } else {
                $errors[] = "Falha ao mover o arquivo $fileName.";
            }
        } else {
            $errors[] = "Arquivo para $tileName não foi enviado.";
        }
    }

    if ($successCount === count($missingTiles)) {
        echo json_encode(['success' => true]);
    } else {
        $message = 'Ocorreram erros durante o upload: ' . implode(' ', $errors);
        echo json_encode(['success' => false, 'message' => $message]);
    }

} else {
    writeLog("Método de requisição inválido: {$_SERVER['REQUEST_METHOD']}\n");
    echo json_encode(['success' => false, 'message' => 'Método de requisição inválido.']);
}
?>