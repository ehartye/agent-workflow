import { validateSchema } from '../runtime/script.mjs';

export function workerError(code, message, outcome = 'failed', details = {}) {
  return Object.assign(new Error(message), { code, outcome, ...details });
}
export function usageOf(value = {}) {
  const number = (...keys) => { for (const key of keys) if (typeof value[key] === 'number' && Number.isFinite(value[key]) && value[key] >= 0) return value[key]; return 0; };
  const usage = {
    observed: ['inputTokens', 'input_tokens', 'outputTokens', 'output_tokens'].some(key => Object.hasOwn(value, key)),
    inputTokens: number('inputTokens', 'input_tokens'), cachedInputTokens: number('cachedInputTokens', 'cached_input_tokens'),
    outputTokens: number('outputTokens', 'output_tokens'), reasoningOutputTokens: number('reasoningOutputTokens', 'reasoning_output_tokens'),
    cacheWriteInputTokens: number('cacheWriteInputTokens', 'cache_write_input_tokens'),
  };
  usage.totalTokens = number('totalTokens', 'total_tokens') || usage.inputTokens + usage.outputTokens;
  return usage;
}
export function resultValidator(schema) {
  if (schema === undefined) return text => text;
  let validate;
  try { validate = validateSchema(schema); }
  catch (error) { throw workerError('INVALID_SCHEMA', `Invalid output schema: ${error.message}`, 'not-started'); }
  return text => {
    let value;
    try { value = JSON.parse(text); } catch { throw workerError('INVALID_OUTPUT', 'Worker final output is not JSON'); }
    if (!validate(value)) throw workerError('SCHEMA_MISMATCH', `Worker output violates schema: ${JSON.stringify(validate.errors)}`);
    return value;
  };
}

export function effectiveRequest(input, config) {
  if (!input || typeof input.id !== 'string' || !input.id || typeof input.prompt !== 'string' || typeof input.cwd !== 'string') throw workerError('INVALID_REQUEST', 'Worker requires id, prompt and cwd', 'not-started');
  if (input.disallowedTools !== undefined || input.bashCommandClamp !== undefined) throw workerError('UNSUPPORTED_OPTION', 'Codex worker transport cannot enforce disallowedTools or bashCommandClamp', 'not-started');
  const profile = input.agentType && input.agentType !== 'default' && config.agentProfiles && Object.hasOwn(config.agentProfiles, input.agentType) ? config.agentProfiles[input.agentType] : undefined;
  if (input.agentType && input.agentType !== 'default' && !profile) throw workerError('UNKNOWN_AGENT_TYPE', `Unknown configured agent type: ${input.agentType}`, 'not-started');
  const defaults = { sandbox: 'read-only', networkAccess: false, approvalPolicy: 'never' };
  const validate = value => {
    if (!['read-only', 'workspace-write'].includes(value.sandbox) || typeof value.networkAccess !== 'boolean' || !['never', 'on-request'].includes(value.approvalPolicy)) throw workerError('INVALID_PERMISSIONS', 'Worker permissions must use read-only/workspace-write, boolean networkAccess, and never/on-request approvals', 'not-started');
    return value;
  };
  let permissions = validate({ ...defaults, ...input.permissions });
  for (const ceiling of [config.permissions, profile?.permissions].filter(Boolean)) {
    const limit = validate({ ...defaults, ...ceiling });
    permissions = {
      sandbox: permissions.sandbox === 'workspace-write' && limit.sandbox === 'workspace-write' ? 'workspace-write' : 'read-only',
      networkAccess: permissions.networkAccess && limit.networkAccess,
      approvalPolicy: permissions.approvalPolicy === 'on-request' && limit.approvalPolicy === 'on-request' ? 'on-request' : 'never',
    };
  }
  return { ...input, model: input.model || profile?.model, effort: input.effort || profile?.effort, developerInstructions: profile?.developerInstructions, permissions };
}

export function cancellationError(signal) {
  return signal.reason?.code ? signal.reason : workerError('CANCELLED', 'Worker cancelled', 'cancelled');
}

export const TOOL_TYPES = new Set(['commandExecution', 'command_execution', 'fileChange', 'file_change', 'mcpToolCall', 'mcp_tool_call', 'dynamicToolCall', 'dynamic_tool_call', 'collabToolCall', 'collab_tool_call', 'collabAgentToolCall', 'collab_agent_tool_call', 'subAgentActivity', 'sub_agent_activity', 'webSearch', 'web_search', 'imageView', 'image_view', 'imageGeneration', 'image_generation']);
export const WAIT_ITEM_TYPES = new Set([...TOOL_TYPES, 'sleep', 'contextCompaction', 'context_compaction']);

export function isQuotaError(error) {
  const info = error.turnError?.codexErrorInfo ?? error.rpcError?.data?.codexErrorInfo;
  return ['usageLimitExceeded', 'rateLimitExceeded', 'UsageLimitExceeded', 'RateLimitExceeded'].includes(info);
}

export async function classifyQuota(error, potentialEffects, context) {
  if (!isQuotaError(error)) return error;
  error.code = 'QUOTA';
  error.outcome = potentialEffects ? 'unknown' : 'not-started';
  if (potentialEffects) return error;
  context.setWaiting('quota-account-read', true);
  try {
    const limits = await context.readRateLimits();
    const windows = [limits?.rateLimits?.primary, limits?.rateLimits?.secondary].filter(window => window && typeof window.usedPercent === 'number' && window.usedPercent >= 100);
    if (windows.length && windows.every(window => Number.isSafeInteger(window.resetsAt) && window.resetsAt > 0 && Number.isSafeInteger(window.resetsAt * 1000))) error.resetAt = Math.max(...windows.map(window => window.resetsAt * 1000));
  } catch (lookupError) {
    if (lookupError.code === 'DRAIN_FAILED') { lookupError.usage = error.usage; throw lookupError; }
    if (context.signal.aborted) throw cancellationError(context.signal);
    error.rateLimitsError = { code: lookupError.code || 'RATE_LIMIT_READ_FAILED', message: lookupError.message };
  } finally { context.setWaiting('quota-account-read', false); }
  return error;
}
