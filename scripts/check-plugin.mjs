import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import Ajv2020 from 'ajv/dist/2020.js';
import { pluginRoot, assertNoSymlink } from '../src/paths.mjs';
import { parseScript } from '../src/runtime/script.mjs';
const json=async relative=>JSON.parse(await readFile(path.join(pluginRoot,relative),'utf8'));
const ajv=new Ajv2020({allErrors:true,strict:false});
for(const file of ['plugin','mcp']){const schema=await json(`scripts/schemas/${file}.schema.json`);const validate=ajv.compile(schema);assert(validate(await json(`${file}.json`)),`${file}.json: ${JSON.stringify(validate.errors)}`);}
const plugin=await json('plugin.json');const pkg=await json('package.json');assert.equal(plugin.name,pkg.name);assert.equal(plugin.version,pkg.version);
for(const [name,version] of Object.entries(pkg.dependencies))assert(/^\d+\.\d+\.\d+/.test(version)&&!/[~^*><|]/.test(version),`Dependency ${name} must be pinned`);
const extension=plugin.extensions['com.openai'];assert.equal(extension.hooks,'./hooks/hooks.json');assert(extension.onboardingSkill.endsWith('/SKILL.md'));assert((await stat(path.join(pluginRoot,extension.onboardingSkill))).isFile());
const portable=await json('mcp.json');assert.equal(portable.mcpServers.workflow.type,'stdio');assert.equal(portable.mcpServers.workflow.command,'node');
for(const arg of portable.mcpServers.workflow.args){const expanded=arg.replaceAll('${PLUGIN_ROOT}',pluginRoot).replaceAll('${PLUGIN_DATA}',path.join(pluginRoot,'test-data'));assert(!expanded.includes('${'),'Unsupported placeholder');if(arg.includes('/bin/')){assert(path.resolve(expanded).startsWith(path.resolve(pluginRoot)+path.sep));await stat(expanded);}}
const legacy=await json('.mcp.json');assert.deepEqual(legacy.mcpServers.workflow.args,portable.mcpServers.workflow.args);
const hooks=await json('hooks/hooks.json');assert.deepEqual(Object.keys(hooks.hooks),['UserPromptSubmit']);assert(hooks.hooks.UserPromptSubmit[0].hooks[0].command.includes('${PLUGIN_ROOT}'));
const marketplace=await json('.agents/plugins/marketplace.json');assert.equal(marketplace.plugins[0].source.path,'./');
const names=new Set();for(const dir of await readdir(path.join(pluginRoot,'skills'))){const file=path.join(pluginRoot,'skills',dir,'SKILL.md');await assertNoSymlink(file);const source=await readFile(file,'utf8');assert(source.startsWith('---\n'));assert(source.split('\n').length<=500);assert(!/[\u{E0000}-\u{E007F}\u200B-\u200F\u202A-\u202E\u2060-\u206F]/u.test(source),'Invisible skill instructions');assert.match(source,new RegExp(`name: ${dir}(?:\\r?\\n)`));assert.match(source,/description: .{30,}/);names.add(dir);for(const match of source.matchAll(/\]\(([^)]+\.md)\)/g)){if(!/^https?:/.test(match[1]))await stat(path.resolve(path.dirname(file),match[1]));}}
assert(names.has('agent-workflow')&&names.has('workflow-mode')&&names.has('workflow-setup'));
for(const file of await readdir(path.join(pluginRoot,'workflows'))){if(!file.endsWith('.js'))continue;const parsed=parseScript(await readFile(path.join(pluginRoot,'workflows',file),'utf8'));assert.equal(parsed.meta.name,file.slice(0,-3));}
process.stdout.write('Plugin schemas, entry points, skills, pinned dependencies and six recipes verified.\n');
