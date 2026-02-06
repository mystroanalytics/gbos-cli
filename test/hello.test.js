const fs = require('fs');
const path = require('path');
const assert = require('assert');

const filePath = path.join(__dirname, '..', 'hello.txt');

// Test 1: File exists
assert.ok(fs.existsSync(filePath), 'hello.txt should exist in the project root');

// Test 2: Content matches exactly
const content = fs.readFileSync(filePath, 'utf8');
assert.strictEqual(content, 'Hello from GBOS Orchestrator!', 'hello.txt should contain exactly "Hello from GBOS Orchestrator!"');

console.log('All tests passed.');
