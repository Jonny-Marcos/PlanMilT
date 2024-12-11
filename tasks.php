<?php
// tasks.php

header('Content-Type: application/json');

// Conecta ao banco de dados SQLite
try {
    $pdo = new PDO('sqlite:bd.db');
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
} catch (\PDOException $e) {
    echo json_encode(['success' => false, 'error' => 'Falha na conexão com o banco de dados.']);
    exit;
}

// Função de log (Inserir aqui)
function writeLog($message) {
    $logFile = __DIR__ . '/logfile.log'; // Define o caminho completo para o arquivo de log
    file_put_contents($logFile, date('Y-m-d H:i:s') . ' - ' . $message . PHP_EOL, FILE_APPEND);
}

// Manipular a ação
$action = isset($_POST['action']) ? $_POST['action'] : null;

if ($action === 'save') {
    // Manipular o salvamento de uma sequência
    $name = isset($_POST['name']) ? trim($_POST['name']) : '';
    $password = isset($_POST['password']) ? $_POST['password'] : '';
    $sequence = isset($_POST['sequence']) ? $_POST['sequence'] : '';
    $description = isset($_POST['description']) ? trim($_POST['description']) : '';

    if (empty($name) || empty($password) || empty($sequence)) {
        writeLog("Dados incompletos para salvar a sequência: $name");
        echo json_encode(['success' => false, 'error' => 'Nome, senha e sequência são obrigatórios.']);
        exit;
    }

    writeLog("Iniciando o salvamento da sequência: $name");
    writeLog("Descrição fornecida: $description");

    // Verificar se uma sequência com o mesmo nome já existe
    $stmt = $pdo->prepare('SELECT id, password FROM task_sequences WHERE name = ?');
    $stmt->execute([$name]);
    $existingSequence = $stmt->fetch();

    if ($existingSequence) {
        // Sequência existe, verificar a senha
        $sequenceId = $existingSequence['id'];
        $passwordHash = $existingSequence['password'];

        if (password_verify($password, $passwordHash)) {
            // Senha correta, atualizar a sequência
            try {
                $stmt = $pdo->prepare('UPDATE task_sequences SET sequence = ?, description = ?, date_modified = datetime(\'now\') WHERE id = ?');
                $stmt->execute([$sequence, $description, $sequenceId]);

                writeLog("Sequência '$name' atualizada com sucesso.");
                echo json_encode(['success' => true, 'message' => 'Sequência atualizada com sucesso.']);
                exit;
            } catch (\PDOException $e) {
                writeLog("Erro ao atualizar a sequência '$name': " . $e->getMessage());
                echo json_encode(['success' => false, 'error' => 'Erro ao atualizar a sequência.']);
                exit;
            }
        } else {
            // Senha incorreta
            writeLog("Senha incorreta para a sequência existente: $name");
            echo json_encode(['success' => false, 'error' => 'Senha incorreta para a sequência existente.']);
            exit;
        }
    } else {
        // Sequência não existe, inserir nova
        $passwordHash = password_hash($password, PASSWORD_DEFAULT);

        try {
            $stmt = $pdo->prepare('INSERT INTO task_sequences (name, password, sequence, description, date_created, date_modified) VALUES (?, ?, ?, ?, datetime(\'now\'), datetime(\'now\'))');
            $stmt->execute([$name, $passwordHash, $sequence, $description]);

            writeLog("Sequência '$name' salva com sucesso.");
            echo json_encode(['success' => true, 'message' => 'Sequência salva com sucesso.']);
            exit;
        } catch (\PDOException $e) {
            writeLog("Erro ao salvar a sequência '$name': " . $e->getMessage());
            echo json_encode(['success' => false, 'error' => 'Erro ao salvar a sequência.']);
            exit;
        }
    }

} elseif ($action === 'load') {
    // Carregar a lista de sequências
    try {
        $stmt = $pdo->prepare('SELECT name FROM task_sequences ORDER BY name ASC');
        $stmt->execute();
        $sequences = $stmt->fetchAll(PDO::FETCH_COLUMN);

        writeLog("Carregando lista de sequências. Total: " . count($sequences));
        echo json_encode(['success' => true, 'sequences' => $sequences]);
        exit;
    } catch (\PDOException $e) {
        writeLog("Erro ao carregar sequências: " . $e->getMessage());
        echo json_encode(['success' => false, 'error' => 'Erro ao carregar as sequências.']);
        exit;
    }

} elseif ($action === 'get_sequence') {
    // Obter uma sequência específica
    $name = isset($_POST['name']) ? trim($_POST['name']) : '';

    if (empty($name)) {
        writeLog("Nome é obrigatório para obter uma sequência.");
        echo json_encode(['success' => false, 'error' => 'Nome é obrigatório.']);
        exit;
    }

    try {
        // Obter também a descrição
        $stmt = $pdo->prepare('SELECT sequence, description FROM task_sequences WHERE name = ?');
        $stmt->execute([$name]);
        $sequenceData = $stmt->fetch(PDO::FETCH_ASSOC);

        if ($sequenceData) {
            writeLog("Sequência '$name' carregada com descrição: {$sequenceData['description']}");
            echo json_encode([
                'success' => true,
                'sequence' => json_decode($sequenceData['sequence'], true),
                'description' => $sequenceData['description']
            ]);
            exit;
        } else {
            writeLog("Sequência '$name' não encontrada.");
            echo json_encode(['success' => false, 'error' => 'Sequência não encontrada.']);
            exit;
        }
    } catch (\PDOException $e) {
        writeLog("Erro ao obter a sequência '$name': " . $e->getMessage());
        echo json_encode(['success' => false, 'error' => 'Erro ao obter a sequência.']);
        exit;
    }

} elseif ($action === 'check_sequence') {
    // **Novo Bloco: Tratamento da Ação check_sequence**
    $name = isset($_POST['name']) ? trim($_POST['name']) : '';

    if (empty($name)) {
        writeLog("Nome é obrigatório para verificar a existência da sequência.");
        echo json_encode(['success' => false, 'error' => 'Nome é obrigatório.']);
        exit;
    }

    try {
        $stmt = $pdo->prepare('SELECT COUNT(*) as count FROM task_sequences WHERE name = ?');
        $stmt->execute([$name]);
        $count = $stmt->fetch()['count'];

        writeLog("Verificação de existência para '$name': " . ($count > 0 ? "Existe" : "Não existe"));
        echo json_encode(['success' => true, 'exists' => $count > 0]);
        exit;
    } catch (\PDOException $e) {
        writeLog("Erro ao verificar a existência da sequência '$name': " . $e->getMessage());
        echo json_encode(['success' => false, 'error' => 'Erro ao verificar a existência da sequência.']);
        exit;
    }
} elseif ($action === 'delete_sequence') {
    $name = isset($_POST['name']) ? trim($_POST['name']) : '';
    $password = isset($_POST['password']) ? $_POST['password'] : '';

    if (empty($name) || empty($password)) {
        writeLog("Dados incompletos para deletar a sequência: $name");
        echo json_encode(['success' => false, 'error' => 'Nome e senha são obrigatórios para deletar a sequência.']);
        exit;
    }

    try {
        // Verificar se a sequência existe
        $stmt = $pdo->prepare('SELECT id, password FROM task_sequences WHERE name = ?');
        $stmt->execute([$name]);
        $existingSequence = $stmt->fetch();

        if (!$existingSequence) {
            writeLog("Tentativa de deletar sequência inexistente: $name");
            echo json_encode(['success' => false, 'error' => 'Sequência não encontrada.']);
            exit;
        }

        // Verificar a senha
        $passwordHash = $existingSequence['password'];
        if (!password_verify($password, $passwordHash)) {
            writeLog("Senha incorreta para deletar a sequência: $name");
            echo json_encode(['success' => false, 'error' => 'Senha incorreta para deletar a sequência.']);
            exit;
        }

        // Deletar a sequência
        $stmt = $pdo->prepare('DELETE FROM task_sequences WHERE id = ?');
        $stmt->execute([$existingSequence['id']]);

        writeLog("Sequência '$name' deletada com sucesso.");
        echo json_encode(['success' => true, 'message' => 'Sequência deletada com sucesso.']);
        exit;

    } catch (\PDOException $e) {
        writeLog("Erro ao deletar a sequência '$name': " . $e->getMessage());
        echo json_encode(['success' => false, 'error' => 'Erro ao deletar a sequência.']);
        exit;
    }
}
else {
    writeLog("Ação inválida recebida: $action");
    echo json_encode(['success' => false, 'error' => 'Ação inválida.']);
    exit;
}
?>
