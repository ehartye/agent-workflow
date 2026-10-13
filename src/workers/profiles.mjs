import { lstat, readFile } from 'node:fs/promises';
import path from 'node:path';
import Ajv from 'ajv';
import { workerError } from './shared.mjs';

const validate = new Ajv({ allErrors: true }).compile({
  type: 'object', additionalProperties: false, required: ['agentProfiles'], properties: {
    agentProfiles: { type: 'object', maxProperties: 100, additionalProperties: {
      type: 'object', additionalProperties: false, properties: {
        model: { type: 'string', minLength: 1 }, effort: { type: 'string', minLength: 1 }, developerInstructions: { type: 'string', maxLength: 65536 },
        permissions: { type: 'object', additionalProperties: false, properties: {
          sandbox: { enum: ['read-only', 'workspace-write'] }, networkAccess: { type: 'boolean' }, approvalPolicy: { enum: ['never', 'on-request'] },
        } },
      },
    } },
  },
});

export async function readProjectProfiles(cwd) {
  if (typeof cwd !== 'string') throw workerError('INVALID_REQUEST', 'Worker cwd is required', 'not-started');
  const directory = path.join(cwd, '.agents');
  const filename = path.join(directory, 'agent-workflow.json');
  try {
    if ((await lstat(directory)).isSymbolicLink() || (await lstat(filename)).isSymbolicLink()) throw new Error('Agent profile config symlinks are refused');
    const bytes = await readFile(filename);
    if (bytes.length > 262144) throw new Error('Agent profile config exceeds byte limit');
    const parsed = JSON.parse(bytes.toString('utf8'));
    if (!validate(parsed)) throw new Error(`Agent profile config schema mismatch: ${JSON.stringify(validate.errors)}`);
    return parsed.agentProfiles;
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw workerError('INVALID_AGENT_CONFIG', `Cannot load .agents/agent-workflow.json: ${error.message}`, 'not-started');
  }
}

export async function loadProfileConfig(input, config) {
  if (!input.agentType || input.agentType === 'default' || (config.agentProfiles && Object.hasOwn(config.agentProfiles, input.agentType))) return config;
  return { ...config, agentProfiles: { ...await readProjectProfiles(input.cwd), ...config.agentProfiles } };
}
