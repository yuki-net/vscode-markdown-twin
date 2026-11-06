import * as fs from 'fs';
import * as path from 'path';
import { repositoryRoot } from '../support/paths';

const MIN_SIZE = 128;
const MAX_SIZE = 1024;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function readPngSize(filePath: string): { width: number; height: number } {
  const buffer = fs.readFileSync(filePath);
  expect(buffer.length).toBeGreaterThanOrEqual(24);
  expect(buffer.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
  expect(buffer.toString('ascii', 12, 16)).toBe('IHDR');
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

describe('marketplace icon asset', () => {
  it('stays within the Marketplace upload dimension limits', () => {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8')
    ) as { icon?: unknown };

    expect(typeof packageJson.icon).toBe('string');
    const icon = packageJson.icon as string;
    expect(icon.toLowerCase().endsWith('.png')).toBe(true);

    const { width, height } = readPngSize(path.join(repositoryRoot, icon));

    expect(width).toBeGreaterThanOrEqual(MIN_SIZE);
    expect(height).toBeGreaterThanOrEqual(MIN_SIZE);
    expect(width).toBeLessThanOrEqual(MAX_SIZE);
    expect(height).toBeLessThanOrEqual(MAX_SIZE);
  });
});
