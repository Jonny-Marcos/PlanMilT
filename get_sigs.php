<?php
header('Content-Type: application/json');

try {
    // Conecta ao banco de dados SQLite
    $db = new PDO('sqlite:bd.db');
    $db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    // Consulta os campos Nome e URL da tabela sigs
    $stmt = $db->query('SELECT Nome, URL FROM sigs');
    $results = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Retorna os resultados em formato JSON
    echo json_encode($results);
} catch (PDOException $e) {
    // Em caso de erro, retorna uma mensagem de erro
    echo json_encode(['error' => $e->getMessage()]);
}
?>