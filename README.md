# Pause Python for VS Code

Pause and resume long-running Python scripts directly from the VS Code terminal without Debug Mode.

> **Stop wasting hours of compute time.** Whether you're running a heavy data training script, a scraper, or a long simulation, you can now instantly freeze the process to reclaim your computer's power—and resume exactly where you left off.

## Features

- **Zero Overhead**: Pause and resume natively using OS-level process signals (SIGSTOP/SIGCONT on Linux/macOS, SuspendThread/ResumeThread on Windows) instead of relying on an integrated debugger, saving CPU and memory overhead.
- **Easy Access**: Pause and resume directly from the terminal toolbar or via keyboard shortcuts (`Ctrl+Shift+P` `Ctrl+Shift+P`).
- **Graceful Handling**: Safely resolves child processes to ensure the correct Python processes are suspended.

## Local Development

If you want to contribute or build this extension locally, follow these steps:

1. Clone the repository:
   ```bash
   git clone https://github.com/YOUR_GITHUB_USERNAME/vscode-pause-python.git
   cd vscode-pause-python
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Compile the extension (Webpack):
   ```bash
   npm run watch
   ```
4. Hit `F5` in VS Code to open the **Extension Development Host**. The extension will run in this new window. Open a terminal and run a Python script to test it out!
   
## Contributing

We welcome contributions! Whether it's adding support for new languages (like Node.js or C++), improving the process resolution logic, or updating documentation, feel free to submit a Pull Request.

## License

This project is licensed under the MIT License
