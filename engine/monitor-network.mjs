import {strictJSON,exact,digest,isSha} from './composition-contracts.mjs';
import {fault} from '../foundation/client.mjs';
const fail=()=>{throw fault('MONITOR_NETWORK','Dashboard network requires an exact current local private IPv4 interface');};
export const LOOPBACK_NETWORK=Object.freeze({schemaVersion:1,mode:'loopback',address:'127.0.0.1'});
function ipv4(value){if(typeof value!=='string'||! /^(0|[1-9][0-9]{0,2})(\.(0|[1-9][0-9]{0,2})){3}$/.test(value))fail();const parts=value.split('.').map(Number);if(parts.some(n=>n>255))fail();return parts;}
function requestValue(input){const r=strictJSON(input,{code:'MONITOR_NETWORK',maxBytes:1024});exact(r,['schemaVersion','mode','address'],[],'MONITOR_NETWORK');if(r.schemaVersion!==1||!['loopback','lan'].includes(r.mode))fail();const p=ipv4(r.address);if(r.mode==='loopback'?r.address!=='127.0.0.1':!(p[0]===10||p[0]===172&&p[1]>=16&&p[1]<=31||p[0]===192&&p[1]===168))fail();return r;}
export function selectMonitorNetwork({request,interfaces}){
 const r=requestValue(request);let base={schemaVersion:1,mode:r.mode,family:'IPv4',address:r.address,interfaceName:null,interfaceMac:null,prefixLength:null};
 if(r.mode==='lan'){
  const inv=strictJSON(interfaces,{code:'MONITOR_NETWORK',maxBytes:4*1024*1024});if(!inv||Array.isArray(inv)||typeof inv!=='object'||Object.keys(inv).length>256)fail();let count=0;const matches=[];
  for(const [name,entries]of Object.entries(inv)){if(!name||name.length>256||/[\x00-\x1f\x7f]/.test(name)||!Array.isArray(entries))fail();for(const e of entries){if(++count>4096||!e||!['IPv4','IPv6'].includes(e.family)||typeof e.internal!=='boolean'||typeof e.address!=='string')fail();if(e.family==='IPv4'){ipv4(e.address);if(e.address===r.address&&!e.internal)matches.push({name,e});}}}
  if(matches.length!==1)fail();const {name,e}=matches[0];if(typeof e.mac!=='string'||!/^([a-f0-9]{2}:){5}[a-f0-9]{2}$/.test(e.mac))fail();
  const mask=ipv4(e.netmask).map(n=>n.toString(2).padStart(8,'0')).join('');if(!/^1{1,32}0*$/.test(mask))fail();const prefix=mask.indexOf('0')<0?32:mask.indexOf('0');
  const num=p=>p.reduce((v,n)=>v*256+n,0),ip=num(ipv4(r.address)),m=num(ipv4(e.netmask));if(prefix<=30&&(ip===(ip&m)>>>0||ip===((ip&m)|(~m))>>>0))fail();
  base={...base,interfaceName:name,interfaceMac:e.mac,prefixLength:prefix};
 }return{...base,networkKey:digest(base)};
}
export function validateMonitorSelection(input){const s=strictJSON(input,{code:'MONITOR_NETWORK',maxBytes:2048});exact(s,['schemaVersion','mode','family','address','interfaceName','interfaceMac','prefixLength','networkKey'],[],'MONITOR_NETWORK');requestValue({schemaVersion:s.schemaVersion,mode:s.mode,address:s.address});const {networkKey,...base}=s;if(s.family!=='IPv4'||!isSha(networkKey)||digest(base)!==networkKey)fail();if(s.mode==='loopback'?s.interfaceName!==null||s.interfaceMac!==null||s.prefixLength!==null:typeof s.interfaceName!=='string'||!s.interfaceName||s.interfaceName.length>256||/[\x00-\x1f\x7f]/.test(s.interfaceName)||!/^([a-f0-9]{2}:){5}[a-f0-9]{2}$/.test(s.interfaceMac)||!Number.isInteger(s.prefixLength)||s.prefixLength<1||s.prefixLength>32)fail();return s;}
export function sameMonitorNetwork({expected,actual}){return digest(validateMonitorSelection(expected))===digest(validateMonitorSelection(actual));}
export function verifyMonitorNetwork({selection,interfaces}){const s=validateMonitorSelection(selection),current=selectMonitorNetwork({request:{schemaVersion:1,mode:s.mode,address:s.address},interfaces});if(!sameMonitorNetwork({expected:s,actual:current}))fail();return current;}
