// No credentials, response bodies or raw error messages are printed.
import dns from 'node:dns/promises';
import net from 'node:net';
import tls from 'node:tls';
for(const key of ['HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','NO_PROXY','NODE_USE_ENV_PROXY']){
  const v=process.env[key];let value=v?'set':'unset';
  if(v&&key.endsWith('_PROXY')&&key!=='NO_PROXY'){try{const u=new URL(v);value=`${u.protocol}//${u.hostname}:${u.port}`;}catch{value='set (not parsed)';}}
  console.log(JSON.stringify({setting:key,value}));
}
const host='opendata.trudvsem.ru';
for(const rr of ['A','AAAA'])try{console.log(JSON.stringify({dns:rr,addresses:await dns.resolve(host,rr)}));}catch(e){console.log(JSON.stringify({dns:rr,code:e.code}));}
async function connection(host,secure,maxVersion){return new Promise(resolve=>{
  const options={host,port:443,timeout:8000,...(secure?{servername:host,minVersion:'TLSv1.2',...(maxVersion?{maxVersion}:{})}:{})};
  const socket=secure?tls.connect(options):net.connect(options);
  let done=false;const finish=value=>{if(done)return;done=true;console.log(JSON.stringify({host,stage:secure?'TLS':'TCP',maxVersion,...value}));socket.destroy();resolve();};
  socket.once(secure?'secureConnect':'connect',()=>finish({status:'connected',...(secure?{version:socket.getProtocol()}:{} )}));
  socket.once('timeout',()=>finish({code:'TIMEOUT'}));socket.once('error',e=>finish({code:e.code}));
});}
await connection(host,false);
await connection(host,true);
await connection(host,true,'TLSv1.2');
await connection('github.com',true);
try{const r=await fetch(`https://${host}/api/v1/vacancies?limit=5&offset=0`,{signal:AbortSignal.timeout(15000)});console.log(JSON.stringify({stage:'API',status:r.status}));await r.body?.cancel();}
catch(e){console.log(JSON.stringify({stage:'API',name:e.name,cause:e.cause?.code}));}
