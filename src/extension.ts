import * as vscode from 'vscode';
import { findPythonPids } from './processResolver';
import { suspendProcesses, resumeProcesses } from './processController';

// ─── State Management ───────────────────────────────────────────────────────────

/**
 * Tracks the pause state and associated Python PIDs for each terminal,
 * keyed by the terminal's shell PID.
 */
interface TerminalState {
    isPaused: boolean;
    pythonPids: number[];
    isProcessing?: boolean;
}

const terminalStates = new Map<number, TerminalState>();
let statusBarItem: vscode.StatusBarItem;

// ─── Status Bar UI ──────────────────────────────────────────────────────────────

/**
 * Updates the StatusBar item to reflect the current active terminal's state.
 * - If no terminal is active, hides the item.
 * - If the terminal's Python process is paused, shows a "Resume" button.
 * - Otherwise, shows a "Pause" button.
 * Also syncs the `pause-python:isPaused` context key so the
 * terminal/title/context menu items toggle correctly.
 */
async function updateStatusBar(): Promise<void> {
    const terminal = vscode.window.activeTerminal;
    if (!terminal) {
        statusBarItem.hide();
        vscode.commands.executeCommand('setContext', 'pause-python:isPaused', false);
        return;
    }

    const shellPid = await terminal.processId;
    if (!shellPid) {
        statusBarItem.hide();
        vscode.commands.executeCommand('setContext', 'pause-python:isPaused', false);
        return;
    }

    const state = terminalStates.get(shellPid);
    if (state?.isPaused) {
        statusBarItem.text = '$(debug-continue) Resume Python';
        statusBarItem.command = 'pause-python.resume';
        statusBarItem.tooltip = `Resume paused Python process (PIDs: ${state.pythonPids.join(', ')})`;
        statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        vscode.commands.executeCommand('setContext', 'pause-python:isPaused', true);
    } else {
        statusBarItem.text = '$(debug-pause) Pause Python';
        statusBarItem.command = 'pause-python.pause';
        statusBarItem.tooltip = 'Pause the running Python process in this terminal';
        statusBarItem.backgroundColor = undefined;
        vscode.commands.executeCommand('setContext', 'pause-python:isPaused', false);
    }
    statusBarItem.show();
}

// ─── Extension Lifecycle ────────────────────────────────────────────────────────

export function activate(context: vscode.ExtensionContext) {
    console.log('Pause Python is now active.');

    // ── Create Status Bar Item ──────────────────────────────────────────────
    statusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Left,
        100
    );
    statusBarItem.name = 'Pause Python';
    context.subscriptions.push(statusBarItem);

    // Initialize context key
    vscode.commands.executeCommand('setContext', 'pause-python:isPaused', false);

    // ── Pause Command ───────────────────────────────────────────────────────
    const pauseCommand = vscode.commands.registerCommand(
        'pause-python.pause',
        async () => {
            const terminal = vscode.window.activeTerminal;
            if (!terminal) {
                vscode.window.showWarningMessage(
                    'Pause Python: No active terminal found.'
                );
                return;
            }

            const shellPid = await terminal.processId;
            if (!shellPid) {
                vscode.window.showWarningMessage(
                    'Pause Python: Could not retrieve terminal process ID.'
                );
                return;
            }

            // Check if already paused or processing
            const existingState = terminalStates.get(shellPid);
            if (existingState?.isProcessing) {
                return;
            }
            if (existingState?.isPaused) {
                vscode.window.showInformationMessage(
                    'Pause Python: Python process is already paused in this terminal.'
                );
                return;
            }

            // Mark as processing
            terminalStates.set(shellPid, {
                isPaused: existingState?.isPaused || false,
                pythonPids: existingState?.pythonPids || [],
                isProcessing: true
            });

            try {
                // Resolve Python child processes
                const pythonPids = await findPythonPids(shellPid);
                if (pythonPids.length === 0) {
                    const currentState = terminalStates.get(shellPid);
                    if (currentState) {
                        currentState.isProcessing = false;
                    }
                    vscode.window.showWarningMessage(
                        `Pause Python: No running Python process found in the active terminal (Shell PID: ${shellPid}).`
                    );
                    return;
                }

                // Suspend all found Python processes
                await suspendProcesses(pythonPids);

                // Update state
                terminalStates.set(shellPid, {
                    isPaused: true,
                    pythonPids,
                    isProcessing: false
                });

                await updateStatusBar();

                const pidList = pythonPids.join(', ');
                vscode.window.showInformationMessage(
                    `Pause Python: Paused ${pythonPids.length} Python process(es) [PIDs: ${pidList}].`
                );
            } catch (err: any) {
                const currentState = terminalStates.get(shellPid);
                if (currentState) {
                    currentState.isProcessing = false;
                }
                vscode.window.showErrorMessage(
                    `Pause Python: Failed to pause — ${err.message}`
                );
            }
        }
    );

    // ── Resume Command ──────────────────────────────────────────────────────
    const resumeCommand = vscode.commands.registerCommand(
        'pause-python.resume',
        async () => {
            const terminal = vscode.window.activeTerminal;
            if (!terminal) {
                vscode.window.showWarningMessage(
                    'Pause Python: No active terminal found.'
                );
                return;
            }

            const shellPid = await terminal.processId;
            if (!shellPid) {
                vscode.window.showWarningMessage(
                    'Pause Python: Could not retrieve terminal process ID.'
                );
                return;
            }

            const state = terminalStates.get(shellPid);
            if (state?.isProcessing) {
                return;
            }
            if (!state || !state.isPaused) {
                vscode.window.showWarningMessage(
                    'Pause Python: No paused Python process in this terminal.'
                );
                return;
            }

            state.isProcessing = true;
            terminalStates.set(shellPid, state);

            try {
                // Resume all previously suspended Python processes
                await resumeProcesses(state.pythonPids);

                const pidList = state.pythonPids.join(', ');

                // Clear state
                terminalStates.set(shellPid, {
                    isPaused: false,
                    pythonPids: [],
                    isProcessing: false
                });

                await updateStatusBar();

                vscode.window.showInformationMessage(
                    `Pause Python: Resumed ${state.pythonPids.length} Python process(es) [PIDs: ${pidList}].`
                );
            } catch (err: any) {
                const currentState = terminalStates.get(shellPid);
                if (currentState) {
                    currentState.isProcessing = false;
                }
                vscode.window.showErrorMessage(
                    `Pause Python: Failed to resume — ${err.message}`
                );
            }
        }
    );

    // ── Event Listeners ─────────────────────────────────────────────────────

    // Update the status bar whenever the user switches active terminals
    const onTerminalChange = vscode.window.onDidChangeActiveTerminal(() => {
        updateStatusBar();
    });

    // Clean up state when a terminal is closed
    const onTerminalClose = vscode.window.onDidCloseTerminal(async (closedTerminal) => {
        const shellPid = await closedTerminal.processId;
        if (shellPid) {
            terminalStates.delete(shellPid);
        }
        updateStatusBar();
    });

    // ── Register Disposables ────────────────────────────────────────────────
    context.subscriptions.push(
        pauseCommand,
        resumeCommand,
        onTerminalChange,
        onTerminalClose
    );

    // Initial UI state
    updateStatusBar();
}

export function deactivate() {}
