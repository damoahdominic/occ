const fs = require('fs');
const path = require('path');

const INTERNAL_ASSETS_DIR = path.join(__dirname, '..', '..', 'assets');
const EXTERNAL_ASSETS_DIR = process.resourcesPath
  ? path.join(process.resourcesPath, 'assets')
  : null;

function resolveExistingDir(candidate) {
  if (!candidate) return null;
  try {
    return fs.existsSync(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

const assetBase =
  resolveExistingDir(EXTERNAL_ASSETS_DIR) ||
  resolveExistingDir(INTERNAL_ASSETS_DIR) ||
  INTERNAL_ASSETS_DIR;

function getAssetPath(...segments) {
  return path.join(assetBase, ...segments);
}

module.exports = {
  assetBase,
  getAssetPath,
};
