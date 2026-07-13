import * as path from 'path';

export const repositoryRoot = path.resolve(__dirname, '..', '..', '..');
export const sourceRoot = path.join(repositoryRoot, 'src');
export const testSupportRoot = path.join(sourceRoot, 'test', 'support');
