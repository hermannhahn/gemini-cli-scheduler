# Gemini CLI Scheduler Extension

This extension adds the `scheduler` tool to the Gemini CLI, allowing the model to manage and execute scheduled tasks.

## How It Works

The extension operates as a native **MCP (Model Context Protocol)** extension, meaning it integrates directly with the Gemini CLI's core functionality. The `scheduler` tool is defined in `tool_code.js`, which handles the logic for scheduling tasks and communicating with the MCP server. This design ensures that the extension can manage tasks efficiently while adhering to the MCP standards for tool development.

## Installation

You can install this extension directly from the repository:

```bash
gemini extensions install https://github.com/hermannhahn/gemini-cli-scheduler
```
