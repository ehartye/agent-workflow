#!/usr/bin/env node
import {main} from './launch-v2.mjs';
main(['setup',...process.argv.slice(2)]).then(code=>{process.exitCode=code;},error=>{console.error(`Agent Workflow: ${error.message}`);process.exitCode=1;});
