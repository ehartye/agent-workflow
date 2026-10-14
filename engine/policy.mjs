import { createHash } from 'node:crypto';
import { fault } from '../foundation/client.mjs';


export function parentLaunch(launch){
  return{...launch,args:[...launch.args,'-c','features.multi_agent=false','-c','features.multi_agent_v2=false','-c','agents.enabled=false']};
}
export function assertNoDelegation(config){
  if(config?.features?.multi_agent!==false||config?.features?.multi_agent_v2!==false||config?.agents?.enabled!==false)throw fault('WORKER_CAPABILITIES','Worker delegation must remain disabled');
}

export function integrationFacts(config,inventory){
  const fail=()=>{throw fault('WORKER_CAPABILITIES','Native integration inventory exceeded its safe observation contract');};
  const name=value=>{if(typeof value!=='string'||!value||value.length>256||/[\u0000-\u001f\u007f]/.test(value))fail();return value;};
  const configured={};
  for(const key of ['plugins','mcp_servers','apps']){
    const table=config?.[key]??{};if(typeof table!=='object'||Array.isArray(table)||Object.keys(table).length>256)fail();
    configured[key]=Object.entries(table).map(([id,value])=>({name:name(id),enabled:value?.enabled!==false})).sort((a,b)=>a.name.localeCompare(b.name));
  }
  const servers=[];
  if(inventory!==undefined){
    if(!Array.isArray(inventory?.data)||inventory.data.length>100||inventory.nextCursor!=null)fail();
    for(const server of inventory.data){
      const tools=server.tools??{};if(!tools||typeof tools!=='object'||Array.isArray(tools)||Object.keys(tools).length>2000)fail();
      servers.push({name:name(server.name),status:['ready','starting','failed','disabled','stopped','notReady'].includes(server.runtimeStatus)?server.runtimeStatus:'unknown',toolCount:Object.keys(tools).length});
    }
    servers.sort((a,b)=>a.name.localeCompare(b.name));if(new Set(servers.map(server=>server.name)).size!==servers.length)fail();
  }
  const observation={configured,servers,inventory:inventory===undefined?'notObserved':'observed',invocation:'notVerified',hostConnections:'notVerified'};
  return{...observation,fingerprint:fingerprint(observation)};
}

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
