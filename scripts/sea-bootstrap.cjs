'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sea = require('node:sea');

function getBaseCacheDir() {
  if (process.platform === 'win32') {
    return process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  }

  return process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache');
}

function ensureDirSync(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeAssetSync(targetPath, assetKey, expectedSize) {
  const asset = Buffer.from(sea.getAsset(assetKey));

  if (fs.existsSync(targetPath)) {
    const stat = fs.statSync(targetPath);
    if (stat.size === expectedSize) {
      return;
    }
  }

  ensureDirSync(path.dirname(targetPath));
  fs.writeFileSync(targetPath, asset);
}

const manifest = JSON.parse(Buffer.from(sea.getAsset('asset-manifest.json')).toString('utf8'));
const extractRoot = path.join(getBaseCacheDir(), 'asurascan-dl', 'sea', manifest.cacheKey);

for (const asset of manifest.assets) {
  writeAssetSync(path.join(extractRoot, asset.path), asset.key, asset.size);
}

process.env.ASURASCAN_DL_SEA_ROOT = extractRoot;
require(path.join(extractRoot, manifest.entryPoint));
