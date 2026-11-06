#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const MIN_SIZE = 128;
const MAX_SIZE = 1024;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const repositoryRoot = path.resolve(__dirname, '..');

function readPngSize(filePath) {
  const buffer = fs.readFileSync(filePath);
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error(`${filePath} is not a valid PNG file`);
  }
  if (buffer.toString('ascii', 12, 16) !== 'IHDR') {
    throw new Error(`${filePath} does not contain an IHDR chunk`);
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function main() {
  const packageJsonPath = path.join(repositoryRoot, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const icon = packageJson.icon;

  if (typeof icon !== 'string' || !icon) {
    throw new Error('package.json does not declare an "icon" file');
  }

  const iconPath = path.resolve(repositoryRoot, icon);
  if (!fs.existsSync(iconPath)) {
    throw new Error(`icon file not found: ${icon}`);
  }

  const { width, height } = readPngSize(iconPath);
  const errors = [];

  if (!/\.png$/i.test(icon)) {
    errors.push(`icon must be a PNG file: ${icon}`);
  }
  if (width > MAX_SIZE || height > MAX_SIZE) {
    errors.push(
      `icon is ${width}x${height}, exceeding the Marketplace upload limit of ${MAX_SIZE}x${MAX_SIZE}`
    );
  }
  if (width < MIN_SIZE || height < MIN_SIZE) {
    errors.push(`icon is ${width}x${height}, smaller than the recommended minimum of ${MIN_SIZE}x${MIN_SIZE}`);
  }

  console.log(`Icon: ${icon} (${width}x${height})`);

  if (width !== height) {
    console.warn(`Warning: icon is not square (${width}x${height}); the Marketplace crops it to a square.`);
  }

  if (errors.length > 0) {
    for (const error of errors) console.error(`ERROR: ${error}`);
    return 1;
  }

  console.log(`Icon check passed (${MIN_SIZE}-${MAX_SIZE}px).`);
  return 0;
}

if (require.main === module) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

module.exports = { readPngSize, MIN_SIZE, MAX_SIZE };
