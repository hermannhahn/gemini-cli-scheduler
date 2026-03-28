# Gemini CLI Scheduler Extension

Uma extensão MCP para o Gemini CLI que permite agendar lembretes e tarefas automatizadas.

## 🚀 Funcionalidades

- **Agendamento Flexível:** Agende mensagens para o futuro usando `schedule_task`.
- **Persistência Local:** As tarefas são salvas em um arquivo `tasks.json` na raiz do seu projeto atual, permitindo listas independentes por workspace.
- **Execução Autônoma:** Quando o horário atinge, o scheduler executa `gemini --prompt "sua mensagem"`, permitindo que o modelo tome ações e use outras extensões instaladas.

## 🛠️ Instalação

A extensão é configurada automaticamente através do arquivo `package.json` do seu projeto usando o script `terminal.js`.

## 📖 Como Usar

### Agendar uma tarefa
```
Agende um lembrete para 2026-03-27T23:50:00 com a mensagem "Revisar o código do scheduler"
```

### Listar tarefas
```
Liste todas as tarefas agendadas no scheduler
```

### Cancelar uma tarefa
```
Cancele a tarefa com ID 'abc1234'
```

## ⚙️ Arquitetura

O `tool_code.js` mantém um motor de agendamento em background (`node-schedule`). Quando uma tarefa é disparada, ela é removida do `tasks.json` local e executada via shell em um novo processo do Gemini CLI em modo headless.
