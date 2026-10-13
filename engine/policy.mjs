import { createHash } from 'node:crypto';
import { fault } from '../foundation/client.mjs';

const disabledFeatures = ['apps','hooks','codex_hooks','remote_plugin','multi_agent','browser_use','browser_use_external','browser_use_full_cdp_access','computer_use'];

// Empty TOML tables merge with inherited tables; disable each actual entry.
// These overrides belong to the child process and never edit user configuration.
export function restrictLaunch(launch, config = {}) {
  const settings = [
    ...disabledFeatures.map(key => `features.${key}=false`),
    'agents.enabled=false', 'notify=[]', 'web_search="disabled"', 'allow_login_shell=false',
  ];
  for (const table of ['mcp_servers','plugins']) {
    const entries = [];
    for (const key of Object.keys(config[table] ?? {}).sort()) {
      if (!key || /[\u0000-\u001f\u007f]/.test(key)) throw fault('WORKER_CAPABILITIES', 'Unsupported integration identifier');
      entries.push(`${JSON.stringify(key)}={enabled=false}`);
    }
    // Codex -c splits key paths on dots without parsing quoted key segments.
    // Put identifiers inside a TOML value, where quoting is honored.
    if (entries.length) settings.push(`${table}={${entries.join(',')}}`);
  }
  return {...launch,args:[...launch.args,...settings.flatMap(setting => ['-c',setting])]};
}

export function assertRestricted(config) {
  if (!config || disabledFeatures.some(key => config.features?.[key] !== false)
    || config.agents?.enabled !== false || config.allow_login_shell !== false || config.web_search !== 'disabled'
    || !Array.isArray(config.notify) || config.notify.length
    || ['mcp_servers','plugins'].some(table => Object.values(config[table] ?? {}).some(entry => entry?.enabled !== false))) {
    throw fault('WORKER_CAPABILITIES', 'Worker external tools, hooks or delegation were not disabled');
  }
}

export function fingerprint(value) {
  const canonical = item => Array.isArray(item) ? `[${item.map(canonical).join(',')}]`
    : item && typeof item === 'object' ? `{${Object.keys(item).sort().map(key => `${JSON.stringify(key)}:${canonical(item[key])}`).join(',')}}`
    : JSON.stringify(item);
  return createHash('sha256').update(canonical(value)).digest('hex');
}

export function assertDisabledInventory(inventory) {
  if (!Array.isArray(inventory?.data) || inventory.nextCursor
    || inventory.data.some(server => server.runtimeStatus !== 'disabled'
      || !server.tools || Object.keys(server.tools).length
      || !Array.isArray(server.resources) || server.resources.length
      || !Array.isArray(server.resourceTemplates) || server.resourceTemplates.length)) {
    throw fault('WORKER_CAPABILITIES', 'Worker thread exposes an active or unknown MCP capability');
  }
}
