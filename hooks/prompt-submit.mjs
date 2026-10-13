import { promptContext } from '../src/mode.mjs';
let text='';for await(const chunk of process.stdin){text+=chunk;if(Buffer.byteLength(text)>1048576)process.exit(0);}
try{const context=await promptContext(JSON.parse(text));if(context)process.stdout.write(JSON.stringify({hookSpecificOutput:{hookEventName:'UserPromptSubmit',additionalContext:context}})+'\n');}catch(error){process.stderr.write(`Agent Workflow hook: ${error.message}\n`);process.exitCode=1;}
