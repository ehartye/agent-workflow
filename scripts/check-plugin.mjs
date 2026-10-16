import {readFile,readdir,stat} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import Ajv2020 from 'ajv/dist/2020.js';
import {pluginRoot,noLinks,sourceDigest} from '../bin/managed-runtime.mjs';
import {parseScript} from '../engine/script.mjs';
import {packageSkillResources} from './package-skill-resources.mjs';
const json=async relative=>JSON.parse(await readFile(path.join(pluginRoot,relative),'utf8'));
const ajv=new Ajv2020({allErrors:true,strict:false}),validate=ajv.compile(await json('scripts/schemas/plugin.schema.json'));
const plugin=await json('plugin.json'),codex=await json('.codex-plugin/plugin.json'),pkg=await json('package.json');assert(validate(plugin),JSON.stringify(validate.errors));
for(const manifest of[plugin,codex]){assert.equal(manifest.name,pkg.name);assert.equal(manifest.version,pkg.version);assert.equal(manifest.mcpServers,undefined);}
for(const name of['mcp.json','.mcp.json'])await assert.rejects(stat(path.join(pluginRoot,name)),error=>error.code==='ENOENT');
for(const[name,version]of Object.entries(pkg.dependencies))assert(/^\d+\.\d+\.\d+$/.test(version),`Dependency ${name} must be pinned`);
assert.equal(pkg.dependencies['@modelcontextprotocol/sdk'],undefined);assert.equal(pkg.dependencies.zod,undefined);assert.equal(pkg.dependencies['@openai/codex'],'0.162.1');
const extension=plugin.extensions['com.openai'];assert.equal(extension.hooks,'./hooks/hooks.json');assert.equal(codex.hooks,extension.hooks);assert.equal(codex.skills,'./skills/');assert((await stat(path.join(pluginRoot,extension.onboardingSkill))).isFile());
const hooks=await json('hooks/hooks.json');assert.deepEqual(Object.keys(hooks.hooks),['UserPromptSubmit']);assert(hooks.hooks.UserPromptSubmit[0].hooks[0].command.includes('${PLUGIN_ROOT}'));
const marketplace=await json('.agents/plugins/marketplace.json');assert.equal(marketplace.plugins[0].source.path,'./');
const names=new Set();for(const dir of await readdir(path.join(pluginRoot,'skills'))){const file=path.join(pluginRoot,'skills',dir,'SKILL.md');await noLinks(file);const source=await readFile(file,'utf8');assert(source.startsWith('---\n'));assert(source.split('\n').length<=500);assert(!/[\u{E0000}-\u{E007F}\u200B-\u200F\u202A-\u202E\u2060-\u206F]/u.test(source),'Invisible skill instructions');assert.match(source,new RegExp(`name: ${dir}(?:\\r?\\n)`));assert.match(source,/description: .{30,}/);names.add(dir);for(const match of source.matchAll(/\]\(([^)]+\.md)\)/g)){if(!/^https?:/.test(match[1]))await stat(path.resolve(path.dirname(file),match[1]));}}
assert(names.has('agent-workflow')&&names.has('workflow-mode')&&names.has('workflow-setup'));
await packageSkillResources({root:pluginRoot,check:true});
let recipes=0;for(const file of await readdir(path.join(pluginRoot,'workflows'))){if(!file.endsWith('.js'))continue;const parsed=parseScript(await readFile(path.join(pluginRoot,'workflows',file),'utf8'));assert.equal(parsed.meta.name,file.slice(0,-3));recipes++;}
await sourceDigest(pluginRoot);for(const name of['launch.mjs','agent-workflow.mjs','setup.mjs','command.mjs'])assert((await stat(path.join(pluginRoot,'bin',name))).isFile());
console.log(`Plugin manifests, CLI entrypoints, skills, pinned dependencies and ${recipes} recipes verified; no custom MCP server.`);
