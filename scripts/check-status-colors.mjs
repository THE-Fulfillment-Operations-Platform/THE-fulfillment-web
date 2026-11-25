import colors from 'tailwindcss/colors.js'
export const hex2rgb=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16))
const lin=c=>{c/=255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4}
export function lab(h){const [r,g,b]=hex2rgb(h).map(lin);
 let x=(.4124564*r+.3575761*g+.1804375*b)/.95047,y=.2126729*r+.7151522*g+.072175*b,z=(.0193339*r+.119192*g+.9503041*b)/1.08883;
 const f=t=>t>216/24389?Math.cbrt(t):(24389/27*t+16)/116;return [116*f(y)-16,500*(f(x)-f(y)),200*(f(y)-f(z))]}
export function de00(a,b){const [L1,a1,b1]=a,[L2,a2,b2]=b,rad=Math.PI/180,deg=180/Math.PI;
 const C1=Math.hypot(a1,b1),C2=Math.hypot(a2,b2),Cb=(C1+C2)/2,G=.5*(1-Math.sqrt(Cb**7/(Cb**7+25**7)));
 const a1p=(1+G)*a1,a2p=(1+G)*a2,C1p=Math.hypot(a1p,b1),C2p=Math.hypot(a2p,b2);
 const h=(y,x)=>{if(x===0&&y===0)return 0;let t=Math.atan2(y,x)*deg;return t<0?t+360:t};
 const h1=h(b1,a1p),h2=h(b2,a2p);let dh=0;if(C1p*C2p!==0){dh=h2-h1;if(dh>180)dh-=360;else if(dh<-180)dh+=360}
 const dL=L2-L1,dC=C2p-C1p,dH=2*Math.sqrt(C1p*C2p)*Math.sin(dh*rad/2);
 const Lb=(L1+L2)/2,Cbp=(C1p+C2p)/2;let hb=h1+h2;if(C1p*C2p===0)hb=h1+h2;else if(Math.abs(h1-h2)<=180)hb/=2;else hb=(hb+(hb<360?360:-360))/2;
 const T=1-.17*Math.cos((hb-30)*rad)+.24*Math.cos(2*hb*rad)+.32*Math.cos((3*hb+6)*rad)-.2*Math.cos((4*hb-63)*rad);
 const dt=30*Math.exp(-(((hb-275)/25)**2)),Rc=2*Math.sqrt(Cbp**7/(Cbp**7+25**7)),Sl=1+.015*(Lb-50)**2/Math.sqrt(20+(Lb-50)**2),Sc=1+.045*Cbp,Sh=1+.015*Cbp*T,Rt=-Math.sin(2*dt*rad)*Rc;
 return Math.sqrt((dL/Sl)**2+(dC/Sc)**2+(dH/Sh)**2+Rt*(dC/Sc)*(dH/Sh))}
export const lum=h=>{const [r,g,b]=hex2rgb(h).map(lin);return .2126*r+.7152*g+.0722*b}
export const cr=(a,b)=>{const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)}
export {colors}

// ---- Kiểm tra bảng màu utils/statusColors.ts: node scripts/check-status-colors.mjs
import fs from 'node:fs'
const src = fs.readFileSync(new URL('../utils/statusColors.ts', import.meta.url), 'utf8')
const tones = {}
for (const m of src.matchAll(/^\s{2}(\w+): '([^']+)'/gm)) {
  const cls = m[2]
  const bg = cls.match(/\bbg-(\w+)-(\d+)\b/)
  const tx = cls.match(/\btext-(white|black|(\w+)-(\d+))\b/)
  const hex = bg ? colors[bg[1]][bg[2]] : '#ffffff'
  const txt = tx[1] === 'white' ? '#ffffff' : tx[1] === 'black' ? '#000000' : colors[tx[2]][tx[3]]
  tones[m[1]] = { bg: bg ? `${bg[1]}-${bg[2]}` : 'white', hex, txt, cr: cr(hex, txt) }
}
const names = Object.keys(tones)
let worst = null, bad = 0
for (const n of names) {
  const t = tones[n]
  console.log(n.padEnd(10), t.bg.padEnd(13), t.hex, 'chữ', t.txt, 'tương phản', t.cr.toFixed(2), t.cr >= 4.5 ? 'OK' : 'KHÔNG ĐẠT')
  if (t.cr < 4.5) bad++
}
const pairs = []
for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++)
  pairs.push([de00(lab(tones[names[i]].hex), lab(tones[names[j]].hex)), names[i], names[j]])
pairs.sort((a, b) => a[0] - b[0])
console.log('\n5 cặp gần nhất (ΔE2000):')
for (const p of pairs.slice(0, 5)) console.log(' ', p[0].toFixed(1), p[1], '/', p[2])
if (pairs[0][0] < 25 || bad) { console.log('\nKHÔNG ĐẠT'); process.exit(1) }
console.log(`\nĐẠT: ${names.length} tông, ΔE nhỏ nhất ${pairs[0][0].toFixed(1)} >= 25, tương phản chữ >= 4.5`)
