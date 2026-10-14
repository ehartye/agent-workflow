import {createHash} from 'node:crypto';
import {types,isDeepStrictEqual} from 'node:util';
import {fault} from '../foundation/client.mjs';

const invalid=()=>fault('ACCESS_POLICY','Worker access requires a supported mode and bounded originating session identity');
const invalidParent=()=>fault('PARENT_ACCESS_INVALID','Parent access must match the originating session and supported explicit authority');

// Read only own data descriptors. Neither accessors nor proxy traps are a
// supported admission format; JSON snapshots do not need either mechanism.
function data(value,keys,error){
  if(!value||typeof value!=='object'||types.isProxy(value)||Array.isArray(value))throw error();
  const prototype=Object.getPrototypeOf(value);
  if(prototype!==Object.prototype&&prototype!==null)throw error();
  const names=Reflect.ownKeys(value);
  if(names.length>keys.length||names.some(key=>typeof key!=='string'||!keys.includes(key)))throw error();
  const result=Object.create(null);
  for(const name of names){
    const descriptor=Object.getOwnPropertyDescriptor(value,name);
    if(!descriptor.enumerable||!Object.hasOwn(descriptor,'value'))throw error();
    result[name]=descriptor.value;
  }
  return result;
}

function freeze(value){
  if(value&&typeof value==='object'){for(const item of Object.values(value))freeze(item);Object.freeze(value);}
  return value;
}

/** Resolve a caller-supplied host-context snapshot, not a child-config guess.
 * This validates provenance fields; it does not authenticate the calling host,
 * discover its tools, or prove that the snapshot was obtained from that host.
 * The coordinator must supply and persist the actual originating context.
 */
export function resolveAccess(input){
  const value=data(input,['access','sessionId','parentAccess'],invalid);
  const access=value.access===undefined?'parent':value.access,sessionId=value.sessionId;
  if(!['parent','restricted'].includes(access)||typeof sessionId!=='string'||!sessionId||sessionId.length>256||/[\u0000-\u001f\u007f]/.test(sessionId))throw invalid();
  let parentAccess=null;
  if(access==='parent'){
    if(value.parentAccess===undefined||value.parentAccess===null)throw fault('PARENT_ACCESS_REQUIRED','Parent access requires an explicit originating-session permission snapshot');
    const parent=data(value.parentAccess,['version','sessionId','provenance','filesystem','networkAccess','approvalPolicy'],invalidParent);
    if(parent.version!==1||parent.sessionId!==sessionId||parent.provenance!=='codex-session-context'||parent.filesystem!=='unrestricted'||parent.networkAccess!==true||parent.approvalPolicy!=='never')throw invalidParent();
    parentAccess={version:1,sessionId,provenance:parent.provenance,filesystem:parent.filesystem,networkAccess:true,approvalPolicy:'never'};
  }else if(value.parentAccess!==undefined&&value.parentAccess!==null)throw invalid();
  const parent=access==='parent',sandbox=parent?'danger-full-access':'read-only';
  const policy={version:1,access,sessionId,parentAccess,permissions:{sandbox,networkAccess:parent,approvalPolicy:'never'}};
  // All fields above are normalized in fixed order. Input property ordering and
  // later caller mutations cannot change this retained authority identity.
  const fingerprint=createHash('sha256').update(JSON.stringify(policy)).digest('hex');
  const sandboxPolicy=parent?{type:'dangerFullAccess'}:{type:'readOnly',networkAccess:false};
  return freeze({policy,fingerprint,native:{
    launchArgs:['-c',`sandbox_mode="${sandbox}"`,'-c','approval_policy="never"'],
    thread:{sandbox,approvalPolicy:'never'},
    turn:{sandboxPolicy:{...sandboxPolicy},approvalPolicy:'never'},
    command:{sandboxPolicy:{...sandboxPolicy}},
  }});
}

export function validateAccessPolicy(value,{sessionId}={}){
  const reject=()=>{throw fault('ACCESS_POLICY','Admitted access policy identity or native mapping changed');};
  let count=0;
  function plain(item,depth=0){
    if(++count>128||depth>8)reject();
    if(item===null||typeof item==='boolean'||typeof item==='number'&&Number.isFinite(item))return item;
    if(typeof item==='string'){if(item.length>4096)reject();return item;}
    if(!item||typeof item!=='object'||types.isProxy(item))reject();
    const array=Array.isArray(item);if(!array&&![Object.prototype,null].includes(Object.getPrototypeOf(item)))reject();
    const out=array?[]:{};
    for(const key of Reflect.ownKeys(item)){
      if(array&&key==='length')continue;
      const descriptor=Object.getOwnPropertyDescriptor(item,key);
      if(typeof key!=='string'||!descriptor.enumerable||!Object.hasOwn(descriptor,'value')||key==='__proto__')reject();
      out[key]=plain(descriptor.value,depth+1);
    }
    return out;
  }
  const supplied=plain(value),policy=supplied.policy;
  if(!policy||sessionId!==undefined&&policy.sessionId!==sessionId)reject();
  const normalized=resolveAccess({access:policy.access,sessionId:policy.sessionId,parentAccess:policy.parentAccess});
  if(!isDeepStrictEqual(supplied,normalized))reject();
  return normalized;
}
