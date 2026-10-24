const test=require('node:test'),assert=require('node:assert/strict'),{spawn}=require('node:child_process'),{gzipSync}=require('node:zlib'),path=require('node:path');
// Run the parser in a disposable child: a fatal decoder error must fail this
// regression without terminating the other checkout or database tests.
test('Compressed JSON and trailing-byte rejection leave the HTTP process usable',{timeout:15000},async()=>{
 const child=spawn(process.execPath,['-e',`
  const express=require('express');const app=express();
  app.use(express.json({limit:'1mb'}));
  app.post('/echo',(req,res)=>res.json(req.body));
  app.get('/health',(req,res)=>res.json({ready:true}));
  app.use((err,req,res,next)=>res.status(err.status||500).json({error:'Invalid body'}));
  const server=app.listen(0,'127.0.0.1',()=>process.send({port:server.address().port}));
  process.on('SIGTERM',()=>server.close(()=>process.exit(0)));
 `],{cwd:path.resolve(__dirname,'..'),stdio:['ignore','pipe','pipe','ipc']});
 let output='';for(const s of[child.stdout,child.stderr])s.on('data',b=>output=(output+b).slice(-12000));
 const exit=new Promise(r=>child.once('exit',r));
 try{
  const port=await new Promise((resolve,reject)=>{child.once('message',m=>resolve(m.port));child.once('error',reject);child.once('exit',code=>reject(Error('Parser process exited before ready: '+code+' '+output)));});
  const base='http://127.0.0.1:'+port,body=gzipSync(Buffer.from(JSON.stringify({message:'accepted'})));
  let res=await fetch(base+'/echo',{method:'POST',headers:{'Content-Type':'application/json','Content-Encoding':'gzip'},body});assert.equal(res.status,200);assert.equal((await res.json()).message,'accepted');
  res=await fetch(base+'/echo',{method:'POST',headers:{'Content-Type':'application/json','Content-Encoding':'gzip'},body:Buffer.concat([body,Buffer.from('invalid trailing bytes')])});assert.ok([200,400].includes(res.status));await res.arrayBuffer();
  for(let i=0;i<3;i++){const health=await fetch(base+'/health');assert.equal(health.status,200);assert.equal((await health.json()).ready,true);}
  res=await fetch(base+'/echo',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:'still working'})});assert.equal(res.status,200);assert.equal((await res.json()).message,'still working');assert.equal(child.exitCode,null,output);
 }finally{if(child.exitCode===null)child.kill('SIGTERM');const code=await exit;assert.equal(code,0,output);}
});
