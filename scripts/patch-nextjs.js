/**
 * Patch script for Next.js 14.0.4 bug (GitHub issue #55802).
 * Guards `_res.setHeader.bind(_res)` against undefined response/socket objects
 * during HTTP/HTTPS protocol mismatch, HMR upgrades, or websocket handshakes.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const targetFiles = [
  path.join(__dirname, '..', 'node_modules', 'next', 'dist', 'server', 'base-server.js'),
  path.join(__dirname, '..', 'node_modules', 'next', 'dist', 'esm', 'server', 'base-server.js')
];

const targetPattern = 'const origSetHeader = _res.setHeader.bind(_res);';
const safePattern = 'const origSetHeader = typeof _res?.setHeader === "function" ? _res.setHeader.bind(_res) : () => {};';

let totalPatched = 0;

for (const targetFile of targetFiles) {
  if (!fs.existsSync(targetFile)) {
    continue;
  }

  let content = fs.readFileSync(targetFile, 'utf8');

  // Fix any unclosed if statement from previous run
  content = content.replace('if (origSetHeader) {\n                _res.setHeader = (name, val)=>{', '_res.setHeader = (name, val)=>{');
  content = content.replace('if (origSetHeader) {\n            _res.setHeader = (name, val)=>{', '_res.setHeader = (name, val)=>{');

  if (content.includes(targetPattern)) {
    content = content.replace(targetPattern, safePattern);
    fs.writeFileSync(targetFile, content, 'utf8');
    console.log(`[patch-nextjs] Patched: ${path.relative(process.cwd(), targetFile)}`);
    totalPatched++;
  } else if (content.includes(safePattern)) {
    // Write back cleaned file in case of bracket fixes
    fs.writeFileSync(targetFile, content, 'utf8');
    console.log(`[patch-nextjs] Already patched & cleaned: ${path.relative(process.cwd(), targetFile)}`);
    totalPatched++;
  } else {
    // If it has typeof _res?.setHeader but with different formatting, normalize it
    const regex = /const origSetHeader = typeof _res\?\.setHeader === "function" \? _res\.setHeader\.bind\(_res\) : [^;]+;/;
    if (regex.test(content)) {
      content = content.replace(regex, safePattern);
      fs.writeFileSync(targetFile, content, 'utf8');
      console.log(`[patch-nextjs] Normalized patch: ${path.relative(process.cwd(), targetFile)}`);
      totalPatched++;
    } else {
      console.warn(`[patch-nextjs] Could not find pattern in: ${path.relative(process.cwd(), targetFile)}`);
    }
  }

  // Syntax check
  try {
    execSync(`node -c "${targetFile}"`, { stdio: 'pipe' });
    console.log(`[patch-nextjs] Syntax OK: ${path.relative(process.cwd(), targetFile)}`);
  } catch (err) {
    console.error(`[patch-nextjs] Syntax check failed on ${targetFile}:`, err.message);
  }
}

console.log(`[patch-nextjs] Complete. ${totalPatched} file(s) verified.`);
