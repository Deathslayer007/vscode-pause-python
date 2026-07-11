import { exec } from 'child_process';
import * as os from 'os';

/**
 * Executes a shell command and returns stdout. Rejects on error.
 */
function execAsync(command: string): Promise<string> {
    return new Promise((resolve, reject) => {
        exec(command, { timeout: 15000 }, (error, stdout, stderr) => {
            if (error) {
                reject(new Error(`Command failed: ${command.substring(0, 80)}...\n${stderr || error.message}`));
                return;
            }
            resolve(stdout);
        });
    });
}

// ─── Linux / macOS ──────────────────────────────────────────────────────────────

/**
 * Suspends processes on Linux/macOS using SIGSTOP.
 */
async function suspendUnix(pids: number[]): Promise<void> {
    if (pids.length === 0) {
        return;
    }
    const pidArgs = pids.join(' ');
    await execAsync(`kill -SIGSTOP ${pidArgs} 2>/dev/null || true`);
}

/**
 * Resumes processes on Linux/macOS using SIGCONT.
 */
async function resumeUnix(pids: number[]): Promise<void> {
    if (pids.length === 0) {
        return;
    }
    const pidArgs = pids.join(' ');
    await execAsync(`kill -SIGCONT ${pidArgs} 2>/dev/null || true`);
}

// ─── Windows ────────────────────────────────────────────────────────────────────

/**
 * Inline C# code that uses Win32 API (kernel32.dll) to suspend/resume
 * individual threads of a process. This is the standard documented approach
 * using OpenThread, SuspendThread, and ResumeThread.
 */
const WINDOWS_CSHARP_TYPE = `
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;

public class ZeroPauserProcessController {
    [DllImport("kernel32.dll", SetLastError = true)]
    static extern IntPtr OpenThread(int dwDesiredAccess, bool bInheritHandle, uint dwThreadId);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern int SuspendThread(IntPtr hThread);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern int ResumeThread(IntPtr hThread);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool CloseHandle(IntPtr hObject);

    const int THREAD_SUSPEND_RESUME = 0x0002;

    public static void SuspendProcess(int pid) {
        try {
            var process = Process.GetProcessById(pid);
            foreach (ProcessThread thread in process.Threads) {
                IntPtr hThread = OpenThread(THREAD_SUSPEND_RESUME, false, (uint)thread.Id);
                if (hThread != IntPtr.Zero) {
                    SuspendThread(hThread);
                    CloseHandle(hThread);
                }
            }
        } catch (Exception) {
            // Ignore exceptions if process doesn't exist or access is denied
        }
    }

    public static void ResumeProcess(int pid) {
        try {
            var process = Process.GetProcessById(pid);
            foreach (ProcessThread thread in process.Threads) {
                IntPtr hThread = OpenThread(THREAD_SUSPEND_RESUME, false, (uint)thread.Id);
                if (hThread != IntPtr.Zero) {
                    ResumeThread(hThread);
                    CloseHandle(hThread);
                }
            }
        } catch (Exception) {
            // Ignore exceptions if process doesn't exist or access is denied
        }
    }
}
`;

/**
 * Encodes a PowerShell script as a base64 UTF-16LE string for use with
 * powershell -EncodedCommand. This completely avoids all quoting and
 * escaping issues with complex inline C# code.
 */
function encodePowerShellCommand(script: string): string {
    const buffer = Buffer.from(script, 'utf16le');
    return buffer.toString('base64');
}

/**
 * Builds a PowerShell script string that compiles the C# type (if not already
 * loaded) and calls the specified method for each PID.
 */
function buildWindowsPsScript(method: 'SuspendProcess' | 'ResumeProcess', pids: number[]): string {
    const lines: string[] = [];
    // Only add the type if it hasn't been loaded already in this session
    lines.push(`if (-not ([System.Management.Automation.PSTypeName]'ZeroPauserProcessController').Type) {`);
    lines.push(`  Add-Type -TypeDefinition '${WINDOWS_CSHARP_TYPE.replace(/'/g, "''")}'`);
    lines.push(`}`);
    for (const pid of pids) {
        lines.push(`[ZeroPauserProcessController]::${method}(${pid})`);
    }
    return lines.join('\n');
}

/**
 * Suspends processes on Windows using the inline C# Win32 API approach.
 */
async function suspendWindows(pids: number[]): Promise<void> {
    if (pids.length === 0) {
        return;
    }
    const script = buildWindowsPsScript('SuspendProcess', pids);
    const encoded = encodePowerShellCommand(script);
    await execAsync(`powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${encoded}`);
}

/**
 * Resumes processes on Windows using the inline C# Win32 API approach.
 */
async function resumeWindows(pids: number[]): Promise<void> {
    if (pids.length === 0) {
        return;
    }
    const script = buildWindowsPsScript('ResumeProcess', pids);
    const encoded = encodePowerShellCommand(script);
    await execAsync(`powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${encoded}`);
}

// ─── Public API ─────────────────────────────────────────────────────────────────

/**
 * Suspends all processes with the given PIDs.
 * Uses SIGSTOP on Linux/macOS, Win32 SuspendThread on Windows.
 *
 * @param pids - Array of process IDs to suspend.
 */
export async function suspendProcesses(pids: number[]): Promise<void> {
    if (pids.length === 0) {
        return;
    }
    const platform = os.platform();
    if (platform === 'win32') {
        await suspendWindows(pids);
    } else {
        await suspendUnix(pids);
    }
}

/**
 * Resumes all processes with the given PIDs.
 * Uses SIGCONT on Linux/macOS, Win32 ResumeThread on Windows.
 *
 * @param pids - Array of process IDs to resume.
 */
export async function resumeProcesses(pids: number[]): Promise<void> {
    if (pids.length === 0) {
        return;
    }
    const platform = os.platform();
    if (platform === 'win32') {
        await resumeWindows(pids);
    } else {
        await resumeUnix(pids);
    }
}
