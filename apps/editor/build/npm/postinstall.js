/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

const fs = require('fs');
const path = require('path');
const os = require('os');
const cp = require('child_process');
const { dirs } = require('./dirs');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const root = path.dirname(path.dirname(__dirname));

function log(dir, message) {
	if (process.stdout.isTTY) {
		console.log(`\x1b[34m[${dir}]\x1b[0m`, message);
	} else {
		console.log(`[${dir}]`, message);
	}
}

function run(command, args, opts) {
	log(opts.cwd || '.', '$ ' + command + ' ' + args.join(' '));

	const result = cp.spawnSync(command, args, opts);

	if (result.error) {
		console.error(`ERR Failed to spawn process: ${result.error}`);
		process.exit(1);
	} else if (result.status !== 0) {
		console.error(`ERR Process exited with code: ${result.status}`);
		process.exit(result.status);
	}
}

/**
 * @param {string} dir
 * @param {*} [opts]
 */
function npmInstall(dir, opts) {
	opts = {
		env: { ...process.env },
		...(opts ?? {}),
		cwd: dir,
		stdio: 'inherit',
		shell: true
	};

	const command = process.env['npm_command'] || 'install';

	if (process.env['VSCODE_REMOTE_DEPENDENCIES_CONTAINER_NAME'] && /^(.build\/distro\/npm\/)?remote$/.test(dir)) {
		const userinfo = os.userInfo();
		log(dir, `Installing dependencies inside container ${process.env['VSCODE_REMOTE_DEPENDENCIES_CONTAINER_NAME']}...`);

		opts.cwd = root;
		if (process.env['npm_config_arch'] === 'arm64') {
			run('sudo', ['docker', 'run', '--rm', '--privileged', 'multiarch/qemu-user-static', '--reset', '-p', 'yes'], opts);
		}
		run('sudo', ['docker', 'run', '-e', 'GITHUB_TOKEN', '-v', `${process.env['VSCODE_HOST_MOUNT']}:/root/vscode`, '-v', `${process.env['VSCODE_HOST_MOUNT']}/.build/.netrc:/root/.netrc`, '-w', path.resolve('/root/vscode', dir), process.env['VSCODE_REMOTE_DEPENDENCIES_CONTAINER_NAME'], 'sh', '-c', `\"chown -R root:root ${path.resolve('/root/vscode', dir)} && npm i -g node-gyp-build && npm ci\"`], opts);
		run('sudo', ['chown', '-R', `${userinfo.uid}:${userinfo.gid}`, `${path.resolve(root, dir)}`], opts);
	} else {
		log(dir, 'Installing dependencies...');
		run(npm, command.split(' '), opts);
	}
	removeParcelWatcherPrebuild(dir);
}

/**
 * Async npm install via cp.spawn — returns a promise.
 * @param {string} dir
 */
function npmInstallAsync(dir) {
	const command = process.env['npm_command'] || 'install';
	const args = command.split(' ');

	return new Promise((resolve, reject) => {
		const pkgPath = path.join(root, dir, 'package.json');
		if (!fs.existsSync(pkgPath)) {
			log(dir, 'Skipped (no package.json)');
			resolve();
			return;
		}

		log(dir, 'Installing dependencies...');
		const child = cp.spawn(npm, args, {
			cwd: dir,
			env: { ...process.env },
			stdio: ['ignore', 'pipe', 'pipe'],
			shell: true,
		});

		let stderr = '';
		child.stderr.on('data', (chunk) => { stderr += chunk; });
		child.stdout.on('data', () => {}); // drain

		child.on('close', (code) => {
			removeParcelWatcherPrebuild(dir);
			if (code !== 0) {
				console.error(`[${dir}] ERR exited with code ${code}\n${stderr}`);
				reject(new Error(`${dir} exited with ${code}`));
			} else {
				log(dir, 'Done');
				resolve();
			}
		});

		child.on('error', (err) => {
			reject(err);
		});
	});
}

/**
 * Run an array of async functions with a concurrency limit.
 * @param {Array<() => Promise<void>>} tasks
 * @param {number} concurrency
 */
async function runParallel(tasks, concurrency) {
	let i = 0;
	const results = [];
	const workers = [];

	async function worker() {
		while (i < tasks.length) {
			const idx = i++;
			await tasks[idx]();
		}
	}

	for (let w = 0; w < Math.min(concurrency, tasks.length); w++) {
		workers.push(worker());
	}
	await Promise.all(workers);
	return results;
}

function setNpmrcConfig(dir, env) {
	const npmrcPath = path.join(root, dir, '.npmrc');
	const lines = fs.readFileSync(npmrcPath, 'utf8').split('\n');

	for (const line of lines) {
		const trimmedLine = line.trim();
		if (trimmedLine && !trimmedLine.startsWith('#')) {
			const [key, value] = trimmedLine.split('=');
			env[`npm_config_${key}`] = value.replace(/^"(.*)"$/, '$1');
		}
	}

	// Force node-gyp to use process.config on macOS
	if ((dir === 'remote' || dir === 'build') && process.platform === 'darwin') {
		env['npm_config_force_process_config'] = 'true';
	} else {
		delete env['npm_config_force_process_config'];
	}

	if (dir === 'build') {
		env['npm_config_target'] = process.versions.node;
		env['npm_config_arch'] = process.arch;
	}
}

function removeParcelWatcherPrebuild(dir) {
	const parcelModuleFolder = path.join(root, dir, 'node_modules', '@parcel');
	if (!fs.existsSync(parcelModuleFolder)) {
		return;
	}

	const parcelModules = fs.readdirSync(parcelModuleFolder);
	for (const moduleName of parcelModules) {
		if (moduleName.startsWith('watcher-')) {
			const modulePath = path.join(parcelModuleFolder, moduleName);
			fs.rmSync(modulePath, { recursive: true, force: true });
			log(dir, `Removed @parcel/watcher prebuilt module ${modulePath}`);
		}
	}
}

/**
 * Rebuild native modules explicitly on Windows.
 * @param {string} dir
 * @param {*} [opts]
 */
function npmRebuild(dir, opts) {
	opts = {
		env: { ...process.env },
		...(opts ?? {}),
		cwd: dir,
		stdio: 'inherit',
		shell: true
	};

	// Only rebuild on Windows where build_from_source might need explicit rebuild
	if (process.platform === 'win32') {
		log(dir, 'Rebuilding native modules...');
		run(npm, ['rebuild'], opts);
	}
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
	const plainDirs = [];

	for (const dir of dirs) {
		if (dir === '') {
			removeParcelWatcherPrebuild(dir);
			continue; // already executed in root
		}

		// build/ — sequential, special env (native modules, npmrc config)
		if (dir === 'build') {
			const opts = { env: { ...process.env } };
			if (process.env['CC']) { opts.env['CC'] = 'gcc'; }
			if (process.env['CXX']) { opts.env['CXX'] = 'g++'; }
			if (process.env['CXXFLAGS']) { opts.env['CXXFLAGS'] = ''; }
			if (process.env['LDFLAGS']) { opts.env['LDFLAGS'] = ''; }
			setNpmrcConfig('build', opts.env);
			npmInstall('build', opts);
			continue;
		}

		// remote/ — sequential, special env (cross-compilation vars)
		if (/^(.build\/distro\/npm\/)?remote$/.test(dir)) {
			const opts = { env: { ...process.env } };
			if (process.env['VSCODE_REMOTE_CC']) {
				opts.env['CC'] = process.env['VSCODE_REMOTE_CC'];
			} else {
				delete opts.env['CC'];
			}
			if (process.env['VSCODE_REMOTE_CXX']) {
				opts.env['CXX'] = process.env['VSCODE_REMOTE_CXX'];
			} else {
				delete opts.env['CXX'];
			}
			if (process.env['CXXFLAGS']) { delete opts.env['CXXFLAGS']; }
			if (process.env['CFLAGS']) { delete opts.env['CFLAGS']; }
			if (process.env['LDFLAGS']) { delete opts.env['LDFLAGS']; }
			if (process.env['VSCODE_REMOTE_CXXFLAGS']) { opts.env['CXXFLAGS'] = process.env['VSCODE_REMOTE_CXXFLAGS']; }
			if (process.env['VSCODE_REMOTE_LDFLAGS']) { opts.env['LDFLAGS'] = process.env['VSCODE_REMOTE_LDFLAGS']; }
			if (process.env['VSCODE_REMOTE_NODE_GYP']) { opts.env['npm_config_node_gyp'] = process.env['VSCODE_REMOTE_NODE_GYP']; }

			const globalGypPath = path.join(os.homedir(), '.gyp');
			const globalInclude = path.join(globalGypPath, 'include.gypi');
			const tempGlobalInclude = path.join(globalGypPath, 'include.gypi.bak');
			if (process.platform === 'linux' &&
				(process.env['CI'] || process.env['BUILD_ARTIFACTSTAGINGDIRECTORY'])) {
				if (fs.existsSync(globalInclude)) {
					fs.renameSync(globalInclude, tempGlobalInclude);
				}
			}
			setNpmrcConfig('remote', opts.env);
			npmInstall(dir, opts);
			if (process.platform === 'linux' &&
				(process.env['CI'] || process.env['BUILD_ARTIFACTSTAGINGDIRECTORY'])) {
				if (fs.existsSync(tempGlobalInclude)) {
					fs.renameSync(tempGlobalInclude, globalInclude);
				}
			}
			continue;
		}

		// Everything else is a plain dir — collect for parallel install.
		plainDirs.push(dir);
	}

	// ── Parallel phase: extensions, tests, etc. ─────────────────────────────
	const concurrency = Math.max(os.cpus().length, 4);
	log('.', `Installing ${plainDirs.length} directories in parallel (concurrency: ${concurrency})...`);
	const t0 = Date.now();

	const tasks = plainDirs.map(dir => () => npmInstallAsync(dir));
	await runParallel(tasks, concurrency);

	const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
	log('.', `Parallel install done — ${plainDirs.length} dirs in ${elapsed}s`);

	// ── Native module rebuild (Windows) ─────────────────────────────────────
	// On Windows, explicitly rebuild native modules after npm install
	// to ensure modules like vscode-policy-watcher.node are compiled
	if (process.platform === 'win32') {
		npmRebuild('', { env: { ...process.env } });
	}

	// ── Git config ──────────────────────────────────────────────────────────
	try {
		cp.execSync('git config pull.rebase merges', { cwd: root });
		cp.execSync('git config blame.ignoreRevsFile .git-blame-ignore-revs', { cwd: root });
	} catch { /* not in a git directory — skip */ }
}

main().catch(err => {
	console.error('ERR postinstall failed:', err);
	process.exit(1);
});
