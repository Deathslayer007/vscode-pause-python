import { exec } from 'child_process';
import * as os from 'os';

/**
 * The set of Python executable base names we target.
 * We match case-insensitively and also handle versioned names like python3.11.
 */
const PYTHON_NAME_PATTERN = /^python[w]?(?:3(?:\.\d+)?)?(?:\.exe)?$/i;

/**
 * Checks if a process name matches a known Python executable variant.
 * Matches: python, python3, python3.11, python.exe, python3.exe, pythonw.exe, etc.
 */
export function isPythonProcess(processName: string): boolean {
    const baseName = processName.trim().split('/').pop()?.split('\\').pop() || '';
    return PYTHON_NAME_PATTERN.test(baseName);
}

/**
 * Executes a shell command and returns its stdout as a string.
 * Rejects on non-zero exit code or execution error.
 */
function execAsync(command: string): Promise<string> {
    return new Promise((resolve, reject) => {
        exec(command, { timeout: 5000 }, (error, stdout, stderr) => {
            if (error) {
                // If the command simply found no results (e.g., pgrep with no matches),
                // it exits with code 1 and empty stdout. Treat that as an empty result.
                if (error.code === 1 && stdout.trim() === '') {
                    resolve('');
                    return;
                }
                reject(new Error(`Command failed: ${command}\n${stderr || error.message}`));
                return;
            }
            resolve(stdout);
        });
    });
}

// ─── Linux / macOS ──────────────────────────────────────────────────────────────

/**
 * Gets direct child PIDs of a given parent PID using pgrep.
 */
async function getChildPidsUnix(parentPid: number): Promise<number[]> {
    try {
        const stdout = await execAsync(`pgrep -P ${parentPid}`);
        if (!stdout.trim()) {
            return [];
        }
        return stdout
            .trim()
            .split('\n')
            .map(pid => parseInt(pid.trim(), 10))
            .filter(pid => !isNaN(pid));
    } catch {
        return [];
    }
}

/**
 * Gets the command name (executable basename) for a given PID using ps.
 */
async function getProcessNameUnix(pid: number): Promise<string> {
    try {
        const stdout = await execAsync(`ps -p ${pid} -o comm=`);
        return stdout.trim();
    } catch {
        return '';
    }
}

/**
 * Recursively finds all Python process PIDs in the descendant tree of a given
 * parent PID on Linux/macOS.
 */
async function findPythonPidsUnix(shellPid: number): Promise<number[]> {
    const pythonPids: number[] = [];

    async function recurse(parentPid: number): Promise<void> {
        const childPids = await getChildPidsUnix(parentPid);
        for (const childPid of childPids) {
            const name = await getProcessNameUnix(childPid);
            if (isPythonProcess(name)) {
                pythonPids.push(childPid);
            }
            // Always recurse deeper — Python might have spawned non-Python
            // intermediaries (e.g., bash -> make -> python)
            await recurse(childPid);
        }
    }

    await recurse(shellPid);
    return pythonPids;
}

// ─── Windows ────────────────────────────────────────────────────────────────────

interface WindowsProcessInfo {
    pid: number;
    parentPid: number;
    name: string;
}

/**
 * Fetches the full process list on Windows using Get-CimInstance and parses it
 * into structured data. We fetch the entire list once and build the tree in
 * memory to avoid repeated shell invocations.
 */
async function getWindowsProcessList(): Promise<WindowsProcessInfo[]> {
    const psCommand = `Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId, Name | ConvertTo-Json -Compress`;
    const stdout = await execAsync(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${psCommand}"`);
    if (!stdout.trim()) {
        return [];
    }

    const parsed = JSON.parse(stdout);
    // PowerShell returns a single object (not array) if there's only one result
    const items: any[] = Array.isArray(parsed) ? parsed : [parsed];

    return items.map(item => ({
        pid: item.ProcessId,
        parentPid: item.ParentProcessId,
        name: item.Name || ''
    }));
}

/**
 * Builds a parent-to-children mapping and recursively finds all Python
 * descendant PIDs of a given shell PID on Windows.
 */
async function findPythonPidsWindows(shellPid: number): Promise<number[]> {
    const processList = await getWindowsProcessList();

    // Build a parent -> children[] map
    const childrenMap = new Map<number, WindowsProcessInfo[]>();
    for (const proc of processList) {
        if (!childrenMap.has(proc.parentPid)) {
            childrenMap.set(proc.parentPid, []);
        }
        childrenMap.get(proc.parentPid)!.push(proc);
    }

    // Recursively collect Python PIDs
    const pythonPids: number[] = [];

    function recurse(parentPid: number): void {
        const children = childrenMap.get(parentPid);
        if (!children) {
            return;
        }
        for (const child of children) {
            if (isPythonProcess(child.name)) {
                pythonPids.push(child.pid);
            }
            recurse(child.pid);
        }
    }

    recurse(shellPid);
    return pythonPids;
}

// ─── Public API ─────────────────────────────────────────────────────────────────

/**
 * Finds all Python process PIDs that are descendants of the given shell PID.
 * Automatically dispatches to the platform-specific implementation.
 *
 * @param shellPid - The PID of the terminal shell process (from VS Code API).
 * @returns An array of PIDs belonging to Python processes in the shell's process tree.
 */
export async function findPythonPids(shellPid: number): Promise<number[]> {
    const platform = os.platform();
    if (platform === 'win32') {
        return findPythonPidsWindows(shellPid);
    } else {
        // linux, darwin, and other unix-like
        return findPythonPidsUnix(shellPid);
    }
}
