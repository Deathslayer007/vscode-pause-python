import { suspendProcesses, resumeProcesses } from './processController';
import { findPythonPids } from './processResolver';

async function runTests() {
    console.log('--- Running Edge Case Tests ---');

    // 1. Zombie Process Test
    console.log('\n[Test 1] The "Zombie" Process');
    const fakePid = 999999; // Very unlikely to exist
    try {
        console.log(`Attempting to suspend non-existent PID: ${fakePid}`);
        await suspendProcesses([fakePid]);
        console.log('Suspend zombie: SUCCESS (No crash)');
        
        console.log(`Attempting to resume non-existent PID: ${fakePid}`);
        await resumeProcesses([fakePid]);
        console.log('Resume zombie: SUCCESS (No crash)');
    } catch (e: any) {
        console.error('Zombie Test FAILED: ', e.message);
    }

    // 2. Windows Execution Policy
    console.log('\n[Test 2] Execution Policy Check (Process Resolver)');
    try {
        // Just try resolving for current PID to see if PS fails
        const pids = await findPythonPids(process.pid);
        console.log(`Process resolver executed successfully, found ${pids.length} python PIDs.`);
    } catch (e: any) {
        console.error('Execution Policy Test FAILED: ', e.message);
    }
}

runTests().catch(console.error);
