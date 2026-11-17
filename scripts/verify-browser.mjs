const targets=await (await fetch('http://127.0.0.1:9223/json/list')).json();
const target=targets.find(item=>item.type==='page'&&(item.url==='about:blank'||item.url.startsWith('http://127.0.0.1:8766/')));
if(!target)throw Error('Chrome about:blank target not found');
const socket=new WebSocket(target.webSocketDebuggerUrl);
const pending=new Map(),events=[];let sequence=0;
await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
socket.onmessage=event=>{const data=JSON.parse(event.data);if(data.id){const item=pending.get(data.id);pending.delete(data.id);data.error?item.reject(Error(data.error.message)):item.resolve(data.result);}else events.push(data);};
function command(method,params={}){const id=++sequence;return new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});}
async function until(predicate,timeout=10000){const start=Date.now();while(Date.now()-start<timeout){if(await predicate())return;await new Promise(resolve=>setTimeout(resolve,50));}throw Error('Chrome timed out');}
let navigationNumber=0;
async function navigate(path){events.length=0;const separator=path.includes('?')?'&':'?';await command('Page.navigate',{url:'http://127.0.0.1:8766'+path+separator+'browser-check='+ ++navigationNumber});await until(()=>events.some(e=>e.method==='Page.loadEventFired'));await new Promise(resolve=>setTimeout(resolve,150));}
async function evaluate(expression){const result=await command('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value;}
await command('Page.enable');await command('Network.enable');await command('Network.clearBrowserCache');
function staticResources(){
  const cached=new Set(events.filter(e=>e.method==='Network.requestServedFromCache').map(e=>e.params.requestId));
  return events.filter(e=>e.method==='Network.responseReceived'&&/style-|app-|hero-ocean-/.test(e.params.response.url)).map(e=>({asset:e.params.response.url.split('/').at(-1),cached:cached.has(e.params.requestId)||e.params.response.fromDiskCache||false}));
}
await navigate('/');const first=staticResources();
await navigate('/submit');const second=staticResources();
await navigate('/');const third=staticResources();
console.log(JSON.stringify({firstStatic:first,submitStatic:second,repeatHomeStatic:third}));
await navigate('/admin');
await evaluate(`window.__calls=[];const originalFetch=window.fetch.bind(window);window.fetch=(...args)=>{window.__calls.push(String(args[0]));return originalFetch(...args);};document.querySelector('#login-name').value='preview@example.com';document.querySelector('#login-password').value='PreviewOnly123!';document.querySelector('#login-button').click();`);
await until(async()=>await evaluate("!document.querySelector('#admin-content').classList.contains('hidden')"));
await new Promise(resolve=>setTimeout(resolve,300));
const loginCalls=await evaluate('window.__calls');
console.log(JSON.stringify({loginCalls:loginCalls.filter(url=>url.includes('/api/admin/')).map(url=>new URL(url,'http://127.0.0.1:8766').pathname)}));
await evaluate(`window.__calls=[];const field=document.querySelector('#search-name');for(const value of ['张','张三','张三丰','张三丰甲','张三丰甲乙']){field.value=value;field.dispatchEvent(new Event('input',{bubbles:true}));}`);
await new Promise(resolve=>setTimeout(resolve,450));
const searchCalls=await evaluate("window.__calls.filter(url=>url.includes('/api/admin/records?')).length");
console.log(JSON.stringify({rapidSearchRequests:searchCalls}));

await evaluate(`window.__calls=[];const search=document.querySelector('#search-name');search.value='张';search.dispatchEvent(new Event('input',{bubbles:true}));const group=document.querySelector('#filter-group');group.value='departed';group.dispatchEvent(new Event('change',{bubbles:true}));`);
await new Promise(resolve=>setTimeout(resolve,450));
const crossFilterCalls=await evaluate("window.__calls.filter(url=>url.includes('/api/admin/records?')).length");
console.log(JSON.stringify({crossFilterRequests:crossFilterCalls}));
if(crossFilterCalls!==1)throw Error('Search debounce triggered a stale second request after group change');
socket.close();
