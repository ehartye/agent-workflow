import { isAbsolute, resolve } from 'node:path';
import { fault } from './client.mjs';

export function createLaunch({ executable, cwd, backend = 'configured', platform = process.platform, env = process.env, capabilityEnvironment }) {
  if (!executable || !isAbsolute(executable) || !cwd || !['configured', 'mxc'].includes(backend) || (backend === 'mxc' && platform !== 'win32')) {
    throw fault('LAUNCH_INVALID', 'Provide an absolute native executable, cwd and supported backend');
  }
  const allowed = new Set(['PATH', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'PATHEXT', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'HOME', 'APPDATA', 'LOCALAPPDATA', 'TEMP', 'TMP', 'TMPDIR', 'LANG', 'LC_ALL', 'CODEX_HOME', 'PROGRAMFILES', 'PROGRAMFILES(X86)', 'PROGRAMDATA', 'NUMBER_OF_PROCESSORS','PLAYWRIGHT_BROWSERS_PATH']);
  const filtered = Object.fromEntries(Object.entries(env).filter(([key]) => allowed.has(key.toUpperCase())));
  if(capabilityEnvironment!==undefined){
    if(!capabilityEnvironment||typeof capabilityEnvironment!=='object'||Array.isArray(capabilityEnvironment)||Object.entries(capabilityEnvironment).some(([key,value])=>!['AGENT_BEEPS_HOME','AGENT_SPRITES_HOME','PLAYWRIGHT_BROWSERS_PATH'].includes(key)||typeof value!=='string'||!isAbsolute(value)||value.length>4096||/[\u0000-\u001f\u007f]/.test(value)))throw fault('LAUNCH_INVALID','Capability environment requires explicitly named absolute managed home/cache values');
    for(const key of Object.keys(filtered))if(key.toUpperCase()==='PLAYWRIGHT_BROWSERS_PATH')delete filtered[key];
    Object.assign(filtered,capabilityEnvironment);
  }
  const browserCache=Object.entries(filtered).find(([key])=>key.toUpperCase()==='PLAYWRIGHT_BROWSERS_PATH');
  if(browserCache){
    const [key,value]=browserCache;
    if(typeof value!=='string'||!isAbsolute(value)||value.length>4096||/[\u0000-\u001f\u007f]/.test(value))throw fault('LAUNCH_INVALID','PLAYWRIGHT_BROWSERS_PATH must name an absolute browser cache directory');
    delete filtered[key];filtered.PLAYWRIGHT_BROWSERS_PATH=value;
  }
  const args = ['app-server', '--listen', 'stdio://',
    '-c', 'model_provider="openai"', '-c', 'forced_login_method="chatgpt"',
    '-c', 'approval_policy="never"', '-c', 'sandbox_mode="read-only"',
  ];
  if (backend === 'mxc') args.push('-c', 'windows.sandbox="mxc"');
  return { command: executable, cwd: resolve(cwd), env: filtered, args };
}

export function assertChatgptLogin({ stdout, stderr }) {
  if (`${stdout}\n${stderr}`.trim() !== 'Logged in using ChatGPT') {
    throw fault('AUTH_UNSUPPORTED', 'An existing managed ChatGPT login is required; login state was not changed');
  }
}
