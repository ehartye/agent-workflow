#!/usr/bin/env node
import {main} from './launch-v2.mjs';
main().then(code=>{process.exitCode=code;},error=>{console.error(`Agent Workflow: ${error.message}`);process.exitCode=1;});
