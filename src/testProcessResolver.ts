/**
 * Step 2 Verification Script
 * 
 * This script:
 * 1. Spawns a long-running Python process as a child of this Node process.
 * 2. Runs findPythonPids() with this Node process's PID as the "shell" PID.
 * 3. Asserts that the spawned Python PID is found in the results.
 * 4. Also runs isPythonProcess() unit tests against known variants.
 */

import { findPythonPids, isPythonProcess } from './processResolver';
import { spawn } from 'child_process';

// ─── Unit tests for isPythonProcess ─────────────────────────────────────────────

function testIsPythonProcess(): boolean {
    const shouldMatch = [
        'python', 'python3', 'python3.11', 'python.exe', 'python3.exe',
        'pythonw.exe', 'Python', 'PYTHON.EXE', 'Python3'
    ];
    const shouldNotMatch = [
        'node', 'bash', 'zsh', 'powershell', 'cmd.exe', 'make',
        'pythonic', 'mypython', 'java', ''
    ];

    let allPassed = true;

    for (const name of shouldMatch) {
        if (!isPythonProcess(name)) {
            console.error(`  FAIL: isPythonProcess("${name}") should be true but got false`);
            allPassed = false;
        }
    }

    for (const name of shouldNotMatch) {
        if (isPythonProcess(name)) {
            console.error(`  FAIL: isPythonProcess("${name}") should be false but got true`);
            allPassed = false;
        }
    }

    return allPassed;
}

// ─── Integration test for findPythonPids ────────────────────────────────────────

async function testFindPythonPids(): Promise<boolean> {
    // Spawn a dummy Python process that sleeps for 30 seconds
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
    const child = spawn(pythonCmd, ['-c', 'import time; time.sleep(30)'], {
        stdio: 'ignore'
    });

    if (!child.pid) {
        console.error('  FAIL: Could not spawn Python child process. Is Python installed?');
        return false;
    }

    const expectedPid = child.pid;
    console.log(`  Spawned Python process with PID: ${expectedPid}`);
    console.log(`  Current Node process PID (acting as "shell"): ${process.pid}`);

    // Give the process a moment to start
    await new Promise(resolve => setTimeout(resolve, 1000));

    try {
        const foundPids = await findPythonPids(process.pid);
        console.log(`  Found Python PIDs: [${foundPids.join(', ')}]`);

        if (foundPids.includes(expectedPid)) {
            console.log(`  PASS: Successfully found spawned Python PID ${expectedPid}`);
            return true;
        } else {
            console.error(`  FAIL: Expected PID ${expectedPid} not found in results [${foundPids.join(', ')}]`);
            return false;
        }
    } catch (err) {
        console.error(`  FAIL: findPythonPids threw an error: ${err}`);
        return false;
    } finally {
        // Clean up the spawned process
        child.kill();
    }
}

// ─── Main ───────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
    console.log('\n=== Step 2 Verification ===\n');

    console.log('Test 1: isPythonProcess() unit tests');
    const unitResult = testIsPythonProcess();
    console.log(unitResult ? '  ✓ All unit tests passed\n' : '  ✗ Some unit tests failed\n');

    console.log('Test 2: findPythonPids() integration test');
    const integrationResult = await testFindPythonPids();
    console.log(integrationResult ? '  ✓ Integration test passed\n' : '  ✗ Integration test failed\n');

    const allPassed = unitResult && integrationResult;
    console.log(allPassed ? '=== ALL TESTS PASSED ===' : '=== SOME TESTS FAILED ===');
    process.exit(allPassed ? 0 : 1);
}

main();
