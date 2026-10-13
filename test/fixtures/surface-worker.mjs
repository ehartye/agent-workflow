const input=JSON.parse(process.argv[2]);
if(input.prompt==='hold'){process.stdout.write(JSON.stringify({progress:'alive'})+'\n');await new Promise(resolve=>setTimeout(resolve,3000));}
process.stdout.write(JSON.stringify({value:'fixture:'+input.prompt,usage:{inputTokens:3,outputTokens:2}})+'\n');
