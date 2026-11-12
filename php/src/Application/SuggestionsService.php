<?php
declare(strict_types=1);

namespace PlanMilT\Application;

use InvalidArgumentException;
use OverflowException;
use PDO;
use RuntimeException;
use Throwable;

/**
 * Persiste sugestões e restringe leitura e edição à chave do navegador.
 */
final class SuggestionsService
{
    private PDO $database;

    /** @param PDO $database Conexão SQLite migrada. */
    public function __construct(PDO $database)
    {
        $this->database = $database;
    }

    /** @param string $token Chave secreta do navegador. @return string Hash usado para autorização. */
    private function ownerHash(string $token): string
    {
        if (!preg_match('/\A[a-f0-9]{64}\z/', $token)) {
            throw new InvalidArgumentException('Chave de acesso inválida.');
        }
        return hash('sha256', $token);
    }

    /** @param string $value Texto recebido. @param int $maxBytes Limite em bytes. @return string Texto validado. */
    private function text(string $value, int $maxBytes): string
    {
        $value = trim($value);
        if ($value === '' || strlen($value) > $maxBytes || !preg_match('//u', $value)) {
            throw new InvalidArgumentException('Preencha título e descrição dentro dos limites permitidos.');
        }
        return $value;
    }

    /** @param string $token Chave do navegador. @return array Sugestões dessa chave, sem credenciais. */
    public function list(string $token): array
    {
        $statement = $this->database->prepare(
            'SELECT id, title, description, status, admin_reply, created_at, updated_at '
            . 'FROM suggestions WHERE owner_hash = ? ORDER BY id DESC'
        );
        $statement->execute([$this->ownerHash($token)]);
        return $statement->fetchAll(PDO::FETCH_ASSOC);
    }

    /**
     * Cria uma sugestão idempotente e limita envios por endereço.
     * @param string $token Chave do navegador.
     * @param string $requestId Identificador aleatório da tentativa.
     * @param string $title Título.
     * @param string $description Descrição.
     * @param string $address Endereço remoto informado pelo servidor.
     * @return int Identificador da sugestão.
     */
    public function create(string $token, string $requestId, string $title, string $description, string $address): int
    {
        $owner = $this->ownerHash($token);
        if (!preg_match('/\A[a-f0-9]{32}\z/', $requestId)) {
            throw new InvalidArgumentException('Identificador de envio inválido.');
        }
        $title = $this->text($title, 200);
        $description = $this->text($description, 8000);
        $this->database->beginTransaction();
        try {
            $existing = $this->database->prepare('SELECT id, owner_hash FROM suggestions WHERE request_id = ?');
            $existing->execute([$requestId]);
            $row = $existing->fetch(PDO::FETCH_ASSOC);
            if (is_array($row)) {
                if (!hash_equals($row['owner_hash'], $owner)) {
                    throw new InvalidArgumentException('Identificador de envio inválido.');
                }
                $this->database->commit();
                return (int) $row['id'];
            }
            $this->database->exec("DELETE FROM suggestion_submissions WHERE created_at < datetime('now', '-1 day')");
            $addressHash = hash('sha256', $address);
            $count = $this->database->prepare(
                "SELECT COUNT(*) FROM suggestion_submissions WHERE address_hash = ? AND created_at >= datetime('now', '-15 minutes')"
            );
            $count->execute([$addressHash]);
            if ((int) $count->fetchColumn() >= 10) {
                throw new OverflowException('Limite de envios atingido. Aguarde 15 minutos.');
            }
            $insert = $this->database->prepare(
                'INSERT INTO suggestions (owner_hash, request_id, title, description) VALUES (?, ?, ?, ?)'
            );
            $insert->execute([$owner, $requestId, $title, $description]);
            $id = (int) $this->database->lastInsertId();
            $rate = $this->database->prepare('INSERT INTO suggestion_submissions (address_hash) VALUES (?)');
            $rate->execute([$addressHash]);
            $this->database->commit();
            return $id;
        } catch (Throwable $error) {
            if ($this->database->inTransaction()) $this->database->rollBack();
            throw $error;
        }
    }

    /** @param string $token Chave do navegador. @param int $id Sugestão. @param string $title Título. @param string $description Descrição. */
    public function update(string $token, int $id, string $title, string $description): void
    {
        $owner = $this->ownerHash($token);
        if ($id < 1) throw new InvalidArgumentException('Identificador inválido.');
        $statement = $this->database->prepare(
            "UPDATE suggestions SET title = ?, description = ?, updated_at = datetime('now') "
            . "WHERE id = ? AND owner_hash = ? AND status = 'pending'"
        );
        $statement->execute([$this->text($title, 200), $this->text($description, 8000), $id, $owner]);
        if ($statement->rowCount() !== 1) {
            throw new RuntimeException('Sugestão não encontrada ou já analisada; atualize a lista.');
        }
    }
}
