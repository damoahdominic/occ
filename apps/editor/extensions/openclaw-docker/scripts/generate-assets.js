#!/usr/bin/env node
// Build-time codegen: reads docker/docker-compose.openclaw.yml from the
// project root and writes src/assets.generated.ts so the extension can
// embed the current compose file without a manually-maintained string.
//
// Run automatically via the "precompile" npm script before tsc.

'use strict';

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '../../../../..');
const composeSrc  = path.join(projectRoot, 'docker', 'docker-compose.openclaw.yml');
const outFile     = path.join(__dirname, '..', 'src', 'assets.generated.ts');

if (!fs.existsSync(composeSrc)) {
	console.error(`[generate-assets] Source not found: ${composeSrc}`);
	process.exit(1);
}

const content = fs.readFileSync(composeSrc, 'utf-8');
const escaped = content.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');

const output = `// AUTO-GENERATED — do not edit. Run "npm run compile" to regenerate.
// Source: docker/docker-compose.openclaw.yml
export const COMPOSE_YML = \`${escaped}\`;
`;

fs.writeFileSync(outFile, output, 'utf-8');
console.log(`[generate-assets] Written ${path.relative(process.cwd(), outFile)}`);
