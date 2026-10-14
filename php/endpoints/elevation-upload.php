<?php
/**
 * Recebe tiles SRTM em multipart e os grava no diretório operacional SRTM3.
 *
 * Mantém os campos files[] e missingTiles enviados pelo frontend.
 */
require_once dirname(__DIR__) . '/bootstrap.php';

// elevation-upload.php

error_reporting(E_ALL);

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!isset($_FILES['files']) || !isset($_POST['missingTiles'])) {
        echo json_encode(['success' => false, 'message' => 'Dados incompletos.']);
        exit;
    }

    $missingTiles = json_decode($_POST['missingTiles'], true);

    if (!is_array($missingTiles)) {
        echo json_encode(['success' => false, 'message' => 'Dados inválidos.']);
        exit;
    }

    $uploadDir = dirname(__DIR__, 2) . '/SRTM3/';
    $uploadedFiles = $_FILES['files'];

    $errors = [];
    $successCount = 0;

    foreach ($missingTiles as $index => $tileName) {
        // Verifica se o arquivo foi enviado
        if (isset($uploadedFiles['name'][$index])) {
            $fileName = $uploadedFiles['name'][$index];
            $tmpName = $uploadedFiles['tmp_name'][$index];
            $fileError = $uploadedFiles['error'][$index];

            if ($fileError !== UPLOAD_ERR_OK) {
                $errors[] = "Erro ao fazer upload do arquivo $fileName.";
                continue;
            }

            // Verifica se o nome do arquivo corresponde ao tile esperado
            if (strtoupper($fileName) !== strtoupper($tileName)) {
                $errors[] = "O nome do arquivo enviado ($fileName) não corresponde ao esperado ($tileName).";
                continue;
            }

            // Verifica se o arquivo é um arquivo .hgt válido
            $fileSize = filesize($tmpName);
            $expectedSizes = [1201 * 1201 * 2, 3601 * 3601 * 2]; // Tamanhos válidos para SRTM3 e SRTM1

            if (!in_array($fileSize, $expectedSizes)) {
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
    echo json_encode(['success' => false, 'message' => 'Método de requisição inválido.']);
}
?>