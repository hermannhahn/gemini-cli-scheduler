# Contributing to Gemini CLI Extensions

Thank you for your interest in contributing to our Gemini CLI extensions! We follow professional software engineering standards to ensure stability and high-quality code.

## 🛠️ Development Workflow

We use a two-branch strategy for all extensions:

1.  **`development`**: This is the main development branch. All active work, new features, and bug fixes must be performed here.
2.  **`main`**: This branch contains the stable, production-ready code. Releases are created from this branch.

### 📋 Prerequisites

- **Node.js 20+** and **npm**
- **Git**
- **GitHub CLI (`gh`)** for automated releases

### 🚀 Getting Started

1.  **Fork** the repository and clone it locally.
2.  Switch to the `development` branch:
    ```bash
    git checkout development
    ```
3.  Install dependencies:
    ```bash
    npm install
    ```

## 🧪 Quality Standards

Before submitting any changes, ensure:

- **Linting**: Run `npm run lint` to check for style issues and fixed errors.
- **Testing**: Run `npm run test` (if available) to ensure no regressions.
- **Build**: For TypeScript projects, run `npx webpack` or the provided build command to verify the final bundle.

## 🏷️ Versioning & Deployment

We use [Semantic Versioning](https://semver.org/). 

1.  **Version Bump**: Always perform version bumps on the `development` branch using:
    ```bash
    npm run update:version
    ```
    This script automatically synchronizes versions across `package.json`, `gemini-extension.json`, and source files.

2.  **Deployment**: Deployments to `main` and GitHub Releases are handled by the `npm run deploy` script, which automates merging, tagging, and publishing.

## 🤝 Community

- Report bugs or suggest features via **GitHub Issues**.
- Submit your improvements via **Pull Requests** from your feature branch to our `development` branch.

Thank you for helping us make Gemini CLI even better!
