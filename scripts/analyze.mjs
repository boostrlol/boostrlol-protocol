import fs from 'node:fs';
import sharp from 'sharp';
const files = fs.readdirSync('brand').map(f=>'brand/'+f).concat(fs.readdirSync('reference').map(f=>'reference/'+f));
for (const f of files) {
  const b = fs.readFileSync(f);
  let ct = null, bd=null;
  if (b.slice(1,4).toString()==='PNG') { bd=b[24]; ct=b[25]; }
  const {data,info} = await sharp(b).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const n = info.width*info.height;
  const hist = new Array(8).fill(0); let blackTransparent=0; const q = new Map();
  for (let i=0;i<n;i++){const r=data[i*4],g=data[i*4+1],bl=data[i*4+2],a=data[i*4+3];
    hist[a>>5]++; if(a<255&&r+g+bl===0)blackTransparent++;
    const k=((r>>5)<<6)|((g>>5)<<3)|(bl>>5); q.set(k,(q.get(k)||0)+1);}
  const top=[...q.entries()].sort((a,b)=>b[1]-a[1]).slice(0,4).map(([k,c])=>`rgb~(${((k>>6)<<5)+16},${(((k>>3)&7)<<5)+16},${((k&7)<<5)+16}) ${(100*c/n).toFixed(1)}%`);
  console.log(f, `${info.width}x${info.height}`, 'fmt', info.format, 'IHDR colourtype', ct, 'bitdepth', bd);
  console.log('  alpha hist(8 bins)', hist.join(','), 'nonopaque pure-black px', blackTransparent);
  console.log('  dominant', top.join(' | '));
}
