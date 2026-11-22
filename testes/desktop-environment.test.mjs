import test from 'node:test';
import assert from 'node:assert/strict';
import { withCargoPath } from '../desktop/environment.mjs';

test('Build preserva Bun e ferramentas do Windows ao acrescentar Cargo ao Path', () => {
  const original = { Path: 'C:\\Bun;C:\\Windows\\System32', OTHER: 'preservar' };
  const env = withCargoPath(original, 'C:\\Cargo', 'win32');
  assert.equal(env.Path, 'C:\\Cargo;C:\\Bun;C:\\Windows\\System32');
  assert.equal(Object.hasOwn(env, 'PATH'), false);
  assert.equal(original.Path, 'C:\\Bun;C:\\Windows\\System32');
  assert.equal(env.OTHER, 'preservar');
  assert.equal(withCargoPath({ PATH: '/usr/bin:/bun' }, '/cargo', 'darwin').PATH, '/cargo:/usr/bin:/bun');
});
