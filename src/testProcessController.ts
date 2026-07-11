/**
 * Step 3 Verification Script
 *
 * This script:
 * 1. Spawns a Python process that writes a timestamp to a file every 500ms.
 * 2. Waits for initial output to confirm it's running.
 * 3. Suspends it using processController.
 * 4. Verifies the file stops being updated (process is truly paused).
 * 5. Resumes it using processController.
 * 6. Verifies the file starts being updated again (process is truly resumed).
 */

import { suspendProcesses, resumeProcesses } from './processController';
import { findPythonPids } from './processResolver';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const MARKER_FILE = path.join(__dirname, '..', '_test_marker.txt');

const PYTHON_SCRIPT = `
import time, os
marker = r'${MARKER_FILE.replace(/\\/g, '\\\\')}'
counter = 0
while True:
    counter += 1
    with open(marker, 'w') as f:
        f.write(str(counter))
    time.sleep(0.5)
`;

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function readMarker(): string {
    try {
        return fs.readFileSync(MARKER_FILE, 'utf-8').trim();
    } catch {
        return '';
    }
}

function cleanup(child: ReturnType<typeof spawn>): void {
    try { child.kill(); } catch { /* ignore */ }
    try { fs.unlinkSync(MARKER_FILE); } catch { /* ignore */ }
}

async function main(): Promise<void> {
    console.log('\n=== Step 3 Verification ===\n');

    // 1. Spawn Python process
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
    const child = spawn(pythonCmd, ['-c', PYTHON_SCRIPT], { stdio: 'ignore' });

    if (!child.pid) {
        console.error('FAIL: Could not spawn Python process.');
        process.exit(1);
    }
    console.log(`Spawned Python process PID: ${child.pid}`);

    try {
        // 2. Wait for the Python process to start writing
        console.log('Waiting for Python process to start writing...');
        await sleep(2000);

        const initialValue = readMarker();
        if (!initialValue) {
            console.error('FAIL: Python process did not write to marker file.');
            cleanup(child);
            process.exit(1);
        }
        console.log(`  Marker value after startup: ${initialValue}`);

        // 3. Resolve Python PIDs (use this process as the "shell")
        const pythonPids = await findPythonPids(process.pid);
        console.log(`  Resolved Python PIDs: [${pythonPids.join(', ')}]`);

        if (pythonPids.length === 0) {
            console.error('FAIL: Could not resolve any Python PIDs.');
            cleanup(child);
            process.exit(1);
        }

        // 4. SUSPEND
        console.log('\nSuspending Python process...');
        await suspendProcesses(pythonPids);

        // Record the marker value right after suspending
        await sleep(500);
        const valueAfterSuspend = readMarker();
        console.log(`  Marker value right after suspend: ${valueAfterSuspend}`);

        // Wait 3 seconds and check the value hasn't changed
        await sleep(3000);
        const valueAfterWait = readMarker();
        console.log(`  Marker value after 3s wait: ${valueAfterWait}`);

        if (valueAfterSuspend === valueAfterWait) {
            console.log('  ✓ PASS: Process is confirmed PAUSED (marker did not change)');
        } else {
            console.error(`  ✗ FAIL: Marker changed from ${valueAfterSuspend} to ${valueAfterWait} while suspended!`);
            cleanup(child);
            process.exit(1);
        }

        // 5. RESUME
        console.log('\nResuming Python process...');
        await resumeProcesses(pythonPids);

        // Wait 2 seconds and check the value has changed
        await sleep(2000);
        const valueAfterResume = readMarker();
        console.log(`  Marker value after resume + 2s: ${valueAfterResume}`);

        if (valueAfterResume !== valueAfterWait) {
            console.log('  ✓ PASS: Process is confirmed RESUMED (marker changed)');
        } else {
            console.error('  ✗ FAIL: Marker did not change after resume!');
            cleanup(child);
            process.exit(1);
        }

        console.log('\n=== ALL TESTS PASSED ===');
    } finally {
        cleanup(child);
    }
}

main();
