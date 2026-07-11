# Contributing to Pause Python

First off, thank you for considering contributing to Pause Python! It's people like you that make open source such a great community.

## Architectural Overview

Unlike typical Python debuggers, this extension **does not use a Python backend or the debug adapter protocol**. Instead, it uses **native OS commands** to pause and resume processes. This ensures zero overhead during execution.

- **Linux / macOS**: Uses `pgrep` and `ps` to resolve process trees, and `kill -SIGSTOP` / `kill -SIGCONT` to suspend/resume.
- **Windows**: Uses `Get-CimInstance Win32_Process` (PowerShell) to resolve process trees, and an encoded PowerShell script executing inline C# (Win32 API: `OpenThread`, `SuspendThread`, `ResumeThread`) to suspend/resume individual threads.

## Local Setup

1. Fork the repository on GitHub.
2. Clone your fork locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/vscode-pause-python.git
   ```
3. Install the dependencies:
   ```bash
   npm install
   ```
4. Open the project in VS Code.
5. Press `F5` to open the Extension Development Host window.
6. Test your changes!

## Submitting a Pull Request

1. Create a new branch for your feature or bug fix:
   ```bash
   git checkout -b feature-or-bugfix-name
   ```
2. Commit your changes. Please include clear and descriptive commit messages.
3. Push the branch to your fork:
   ```bash
   git push origin feature-or-bugfix-name
   ```
4. Open a Pull Request against the `main` branch of this repository. Include a clear description of what your PR solves or adds.
