<?php
declare(strict_types=1);

namespace PlanMilT\Application;

use Closure;
use PDO;
use PDOException;
use PlanMilT\Infrastructure\Logging\Logger;

/**
 * Encapsula persistência e regras de acesso às sequências de tarefas.
 *
 * Os métodos retornam os mesmos payloads JSON que o endpoint legado expõe.
 */
final class TaskSequencesService
{
    private PDO $database;
    private Closure $logger;

    /**
     * Cria o serviço com uma conexão SQLite e um logger substituível em testes.
     *
     * @param PDO $database Conexão configurada para a base de dados da aplicação.
     * @param callable|null $logger Callback que recebe mensagens de diagnóstico.
     */
    public function __construct(PDO $database, ?callable $logger = null)
    {
        $this->database = $database;
        $this->logger = $logger === null
            ? Closure::fromCallable([Logger::class, 'write'])
            : Closure::fromCallable($logger);
    }

    /**
     * Cria uma sequência ou atualiza uma existente após verificar a senha.
     *
     * @param string $name Nome único da sequência.
     * @param string $password Senha informada para criar ou autorizar a atualização.
     * @param string $sequence Conteúdo da sequência serializado como JSON pelo cliente.
     * @param string $description Descrição apresentada ao usuário.
     * @return array{success: bool, message?: string, error?: string} Resultado legado da operação.
     */
    public function save(string $name, string $password, string $sequence, string $description): array
    {
        if (empty($name) || empty($password) || empty($sequence)) {
            $this->log('Dados incompletos para salvar uma sequência.');
            return ['success' => false, 'error' => 'Nome, senha e sequência são obrigatórios.'];
        }

        try {
            $statement = $this->database->prepare(
                'SELECT id, password FROM task_sequences WHERE name = ?'
            );
            $statement->execute([$name]);
            $existingSequence = $statement->fetch(PDO::FETCH_ASSOC);

            if ($existingSequence) {
                if (!password_verify($password, $existingSequence['password'])) {
                    $this->log('Senha incorreta ao atualizar uma sequência.');
                    return ['success' => false, 'error' => 'Senha incorreta para a sequência existente.'];
                }

                $statement = $this->database->prepare(
                    'UPDATE task_sequences SET sequence = ?, description = ?, date_modified = datetime(\'now\') WHERE id = ?'
                );
                $statement->execute([$sequence, $description, $existingSequence['id']]);

                $this->log('Sequência atualizada com sucesso.');
                return ['success' => true, 'message' => 'Sequência atualizada com sucesso.'];
            }

            $passwordHash = password_hash($password, PASSWORD_DEFAULT);
            $statement = $this->database->prepare(
                'INSERT INTO task_sequences (name, password, sequence, description, date_created, date_modified) '
                . 'VALUES (?, ?, ?, ?, datetime(\'now\'), datetime(\'now\'))'
            );
            $statement->execute([$name, $passwordHash, $sequence, $description]);

            $this->log('Sequência salva com sucesso.');
            return ['success' => true, 'message' => 'Sequência salva com sucesso.'];
        } catch (PDOException $error) {
            $this->log('Falha ao salvar uma sequência: ' . $error->getMessage());
            return ['success' => false, 'error' => 'Erro ao salvar a sequência.'];
        }
    }

    /**
     * Retorna nomes de sequências em ordem alfabética.
     *
     * @return array{success: bool, sequences?: array<int, string>, error?: string} Resultado legado da operação.
     */
    public function load(): array
    {
        try {
            $statement = $this->database->query(
                'SELECT name FROM task_sequences ORDER BY name ASC'
            );
            $sequences = $statement->fetchAll(PDO::FETCH_COLUMN);

            $this->log('Lista de sequências carregada. Total: ' . count($sequences));
            return ['success' => true, 'sequences' => $sequences];
        } catch (PDOException $error) {
            $this->log('Falha ao carregar sequências: ' . $error->getMessage());
            return ['success' => false, 'error' => 'Erro ao carregar as sequências.'];
        }
    }

    /**
     * Retorna o conteúdo e a descrição de uma sequência pelo nome.
     *
     * @param string $name Nome da sequência a consultar.
     * @return array{success: bool, sequence?: mixed, description?: string|null, error?: string} Resultado legado da operação.
     */
    public function getSequence(string $name): array
    {
        if (empty($name)) {
            $this->log('Nome ausente ao consultar uma sequência.');
            return ['success' => false, 'error' => 'Nome é obrigatório.'];
        }

        try {
            $statement = $this->database->prepare(
                'SELECT sequence, description FROM task_sequences WHERE name = ?'
            );
            $statement->execute([$name]);
            $sequenceData = $statement->fetch(PDO::FETCH_ASSOC);

            if (!$sequenceData) {
                $this->log('Sequência solicitada não encontrada.');
                return ['success' => false, 'error' => 'Sequência não encontrada.'];
            }

            return [
                'success' => true,
                'sequence' => json_decode($sequenceData['sequence'], true),
                'description' => $sequenceData['description']
            ];
        } catch (PDOException $error) {
            $this->log('Falha ao obter uma sequência: ' . $error->getMessage());
            return ['success' => false, 'error' => 'Erro ao obter a sequência.'];
        }
    }

    /**
     * Informa se existe uma sequência com o nome fornecido.
     *
     * @param string $name Nome da sequência a verificar.
     * @return array{success: bool, exists?: bool, error?: string} Resultado legado da operação.
     */
    public function exists(string $name): array
    {
        if (empty($name)) {
            $this->log('Nome ausente ao verificar uma sequência.');
            return ['success' => false, 'error' => 'Nome é obrigatório.'];
        }

        try {
            $statement = $this->database->prepare(
                'SELECT COUNT(*) FROM task_sequences WHERE name = ?'
            );
            $statement->execute([$name]);
            $exists = (int) $statement->fetchColumn() > 0;

            return ['success' => true, 'exists' => $exists];
        } catch (PDOException $error) {
            $this->log('Falha ao verificar uma sequência: ' . $error->getMessage());
            return ['success' => false, 'error' => 'Erro ao verificar a existência da sequência.'];
        }
    }

    /**
     * Exclui uma sequência somente após validar sua senha.
     *
     * @param string $name Nome da sequência a excluir.
     * @param string $password Senha necessária para autorizar a exclusão.
     * @return array{success: bool, message?: string, error?: string} Resultado legado da operação.
     */
    public function delete(string $name, string $password): array
    {
        if (empty($name) || empty($password)) {
            $this->log('Dados incompletos ao excluir uma sequência.');
            return ['success' => false, 'error' => 'Nome e senha são obrigatórios para deletar a sequência.'];
        }

        try {
            $statement = $this->database->prepare(
                'SELECT id, password FROM task_sequences WHERE name = ?'
            );
            $statement->execute([$name]);
            $existingSequence = $statement->fetch(PDO::FETCH_ASSOC);

            if (!$existingSequence) {
                $this->log('Tentativa de excluir sequência inexistente.');
                return ['success' => false, 'error' => 'Sequência não encontrada.'];
            }

            if (!password_verify($password, $existingSequence['password'])) {
                $this->log('Senha incorreta ao excluir uma sequência.');
                return ['success' => false, 'error' => 'Senha incorreta para deletar a sequência.'];
            }

            $statement = $this->database->prepare('DELETE FROM task_sequences WHERE id = ?');
            $statement->execute([$existingSequence['id']]);

            $this->log('Sequência deletada com sucesso.');
            return ['success' => true, 'message' => 'Sequência deletada com sucesso.'];
        } catch (PDOException $error) {
            $this->log('Falha ao excluir uma sequência: ' . $error->getMessage());
            return ['success' => false, 'error' => 'Erro ao deletar a sequência.'];
        }
    }

    /**
     * Registra diagnóstico sem incluir senhas ou conteúdo da sequência.
     *
     * @param string $message Mensagem técnica ou de estado para o logger.
     */
    private function log(string $message): void
    {
        ($this->logger)($message);
    }
}
