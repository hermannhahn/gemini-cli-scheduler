# gemini-cli-scheduler - Plano de Ação

## 🎯 Objetivo
Extensão MCP profissional para agendamento de tarefas autônomas no Gemini CLI, com logs individuais, histórico de execução e suporte a múltiplos executores (Gemini/Jules).

## 🛠️ Arquitetura (v0.8.0)
1.  **Persistence:** Tarefas salvas em `tasks.json` no diretório da extensão.
2.  **Individual Logging:** Logs de cada tarefa salvos em `logs/[taskName].log`.
3.  **System Logging:** Log geral do servidor em `scheduler.log`.
4.  **Executors:** Suporte a `Gemini` (padrão) e `Jules` (sub-agente especializado).
5.  **Status Tracking:** Estados `pending`, `completed`, `cancelled` e `missed`.

## 📋 Tarefas Concluídas

### Fase 1: Infraestrutura e Configuração
- [x] Persistência isolada no diretório da extensão (`EXTENSION_DIR`).
- [x] Sistema de logs individuais para cada tarefa.
- [x] Isolamento de dados: todos os arquivos ficam dentro da pasta da extensão.

### Fase 2: Ferramentas MCP (v0.8.0)
- [x] **schedule_task**: Suporte a `monitor` (espera integrada) e `useJules` (sub-agente).
- [x] **list_tasks**: Exibe histórico completo com status e caminhos de log.
- [x] **cancel_task**: Suporte a cancelamento de tarefas pendentes.
- [x] **monitor_task**: Monitoramento inteligente em tempo real (aguarda conclusão).
- [x] **check_task_results**: Leitura de logs de tarefas finalizadas.

### Fase 3: Motor de Execução e Segurança
- [x] Execução headless via `spawn` com redirecionamento de logs.
- [x] **Controle de Extensões:** Snapshoting automático de extensões habilitadas ou controle explícito.
- [x] **Modo Restrito por Padrão:** Tarefas sem extensões não acessam ferramentas externas por segurança.
- [x] **Integração com Jules:** Possibilidade de delegar tarefas para o sub-agente especializado.

## 🚀 Próximos Passos (Roadmap)
- [ ] **Limpeza Automática:** Ferramenta para limpar logs antigos ou tarefas completadas.
- [ ] **Interface de Histórico:** Melhorar a visualização da lista de tarefas completadas.
- [ ] **Retry Logic:** Opção para re-executar tarefas que falharam ou foram perdidas.
- [ ] **Filtros na Listagem:** Listar apenas tarefas `completed` ou `pending`.
- [ ] **Tratamento de Timezone:** Melhorar a detecção automática do fuso horário local.
