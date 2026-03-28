# Gemini CLI Scheduler Extension

Uma extensão MCP para o Gemini CLI que permite agendar lembretes e tarefas automatizadas.

## 🚀 Funcionalidades

- **Agendamento Flexível:** Agende mensagens para o futuro usando `schedule_task`.
- **Persistência Local:** As tarefas são salvas em um arquivo `tasks.json` na raiz do seu projeto atual, permitindo listas independentes por workspace.
- **Execução Autônoma:** Quando o horário atinge, o scheduler executa `gemini --prompt "sua mensagem"`, permitindo que o modelo tome ações e use outras extensões instaladas.

## 🛠️ Instalação

```bash
gemini extensions install https://github.com/hermannhahn/gemini-cli-scheduler
```

## 📖 Como Usar

### Agendar uma tarefa

> Agende um lembrete para dia 23 às 8 da manhã com a mensagem "Revisar o código do scheduler"

### Listar tarefas

> Liste todas as tarefas agendadas no scheduler

### Cancelar uma tarefa

> Cancele a tarefa com ID 'abc1234'
