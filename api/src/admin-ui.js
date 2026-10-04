/* Admin dashboard, served by the Worker at /admin. Single file, no build,
   no external requests (the CSP forbids them). */
export const dashboardHTML = () => `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>Lost Diary — Admin</title>
<style>
:root{--paper:#F4F3F1;--card:#fff;--ink:#0B0B0B;--ink2:#57565A;--ink3:#8E8D8A;--line:#DCDAD6;
 --ok:#1B6B3A;--warn:#8A5A00;--bad:#8E1116;--sans:'Jost',ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;
 --serif:'Bodoni Moda',Georgia,'Times New Roman',serif}
*,*::before,*::after{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font:400 14px/1.6 var(--sans);-webkit-font-smoothing:antialiased}
a{color:inherit}button{font:inherit;cursor:pointer}
.meta{font-size:10px;letter-spacing:.26em;text-transform:uppercase;color:var(--ink3)}
header{display:flex;align-items:center;justify-content:space-between;gap:16px;
 padding:16px clamp(16px,3vw,32px);background:var(--card);border-bottom:1px solid var(--line);
 position:sticky;top:0;z-index:5;flex-wrap:wrap}
.brand{font-family:var(--serif);font-size:19px;letter-spacing:.02em}
nav{display:flex;gap:4px;flex-wrap:wrap}
nav button{background:none;border:0;padding:9px 13px;font-size:10.5px;letter-spacing:.2em;
 text-transform:uppercase;color:var(--ink3);border-radius:2px}
nav button.on{background:var(--ink);color:#fff}
main{padding:clamp(18px,3vw,34px);max-width:1240px;margin:0 auto}
h2{font-family:var(--serif);font-weight:400;font-size:clamp(22px,3vw,32px);margin:0 0 18px;letter-spacing:-.01em}
.grid{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(190px,1fr))}
.card{background:var(--card);border:1px solid var(--line);padding:18px;border-radius:3px}
.card .v{font-family:var(--serif);font-size:27px;line-height:1.1;margin-top:6px}
table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);font-size:13px}
th,td{text-align:left;padding:11px 12px;border-bottom:1px solid var(--line);vertical-align:top}
th{font-size:9.5px;letter-spacing:.2em;text-transform:uppercase;color:var(--ink3);font-weight:400;background:#FAF9F8}
tbody tr:hover{background:#FBFAF9;cursor:pointer}
.pill{display:inline-block;font-size:9px;letter-spacing:.16em;text-transform:uppercase;
 padding:3px 7px;border:1px solid var(--line);border-radius:2px;white-space:nowrap}
.pill.paid{border-color:var(--ok);color:var(--ok)}.pill.pending{border-color:var(--warn);color:var(--warn)}
.pill.bad{border-color:var(--bad);color:var(--bad)}.pill.pre{border-color:var(--ink);color:var(--ink)}
.bar{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:0 0 14px}
input,select,textarea{font:inherit;padding:9px 10px;border:1px solid var(--line);background:var(--card);
 color:var(--ink);border-radius:2px;max-width:100%}
textarea{width:100%;min-height:70px;resize:vertical}
.btn{background:var(--ink);color:#fff;border:0;padding:11px 18px;font-size:10px;letter-spacing:.22em;
 text-transform:uppercase;border-radius:2px}
.btn.ghost{background:none;color:var(--ink2);border:1px solid var(--line)}
.btn.danger{background:var(--bad)}
.btn:disabled{opacity:.4;pointer-events:none}
.mono{font-variant-numeric:tabular-nums}
.right{text-align:right}
#login{min-height:100dvh;display:grid;place-items:center;padding:24px}
[hidden]{display:none!important}   /* the line above would otherwise keep the sign-in box on screen after signing in */
#login form{width:min(390px,100%);background:var(--card);border:1px solid var(--line);padding:32px;display:grid;gap:14px}
.msg{font-size:12px;min-height:18px;color:var(--bad)}
.msg.ok{color:var(--ok)}
dialog{border:1px solid var(--line);border-radius:3px;padding:0;max-width:min(760px,94vw);width:100%;background:var(--card)}
dialog::backdrop{background:rgba(20,18,16,.42)}
.dlg-hd{display:flex;justify-content:space-between;align-items:center;gap:14px;padding:18px 22px;border-bottom:1px solid var(--line)}
.dlg-bd{padding:22px;max-height:70vh;overflow:auto}
.kv{display:grid;grid-template-columns:150px 1fr;gap:6px 14px;font-size:13px}
.kv div:nth-child(odd){color:var(--ink3);font-size:10px;letter-spacing:.18em;text-transform:uppercase;padding-top:3px}
.sizes{display:flex;gap:10px;flex-wrap:wrap;margin:8px 0 0}
.sizes span{border:1px solid var(--line);padding:6px 10px;font-size:12px}
.empty{padding:44px;text-align:center;color:var(--ink3);background:var(--card);border:1px solid var(--line)}
.note{font-size:11.5px;line-height:1.7;color:var(--ink3);margin-top:12px}

/* ---- visitors ---- */
.vrange{display:flex;gap:6px;flex-wrap:wrap}
.vrange .btn.ghost.on{background:var(--ink);color:#fff;border-color:var(--ink)}
.vtoday{margin:0 0 0 auto}
.vwrap .card .v{font-variant-numeric:normal}
.vchart{margin-top:14px}
.vplot{position:relative;margin-top:10px;outline:none;border-radius:2px}
.vplot:focus-visible{box-shadow:0 0 0 2px var(--ink)}
.vplot svg{display:block;width:100%;height:230px;overflow:visible}
.vgrid{stroke:var(--line);stroke-width:1;shape-rendering:crispEdges}
.vaxis{stroke:#C4C1BC;stroke-width:1;shape-rendering:crispEdges}
.vtick{font:11px var(--sans);fill:var(--ink3);font-variant-numeric:tabular-nums}
.vpeak{font:600 12px var(--sans);fill:var(--ink)}
.vb{fill:var(--ink)}
.vb.on{fill:var(--ink2)}
.vhit{fill:transparent}
.vtip{position:absolute;top:0;left:0;transform:translate(-50%,calc(-100% - 10px));background:var(--ink);color:#fff;
 padding:8px 11px;border-radius:3px;font-size:12px;line-height:1.45;pointer-events:none;white-space:nowrap;
 box-shadow:0 8px 24px rgba(0,0,0,.18);z-index:2}
.vtip b{display:block;font-size:15px;font-weight:600}
.vtip span{display:block;color:rgba(255,255,255,.72)}
.vtable{margin-top:12px}
.vtable summary{cursor:pointer;font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:var(--ink3)}
.vtable table{margin-top:10px}
.vtable tbody tr:hover,.vpieces tbody tr:hover{cursor:default}
.vtiles{grid-template-columns:repeat(4,minmax(0,1fr))}
@media (max-width:900px){ .vtiles{grid-template-columns:repeat(2,minmax(0,1fr))} .vtiles .card{padding:15px} }
.grid3{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));margin-top:14px}
.vlist{display:grid;gap:11px;margin-top:14px}
.vrow{display:grid;grid-template-columns:minmax(84px,40%) 1fr auto;gap:10px;align-items:center;font-size:13px}
.vname{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.vtrack i{display:block;height:8px;background:var(--ink);border-radius:0 4px 4px 0}
.vval{font-size:12.5px;white-space:nowrap;font-variant-numeric:tabular-nums}
.vval small{color:var(--ink3);margin-left:6px;font-size:11px}
.vhow{margin-top:26px;max-width:78ch}
.vhow a{color:var(--ink)}
@media (max-width:640px){ .vtoday{margin:4px 0 0;flex-basis:100%} .vplot svg{height:200px} .vrange .btn{padding:10px 11px;letter-spacing:.14em} }
</style></head><body>

<div id="login">
  <form id="loginForm">
    <div class="brand">Lost Diary</div>
    <p class="meta">Admin sign in</p>
    <input id="email" type="email" placeholder="Email" autocomplete="username" required>
    <input id="pw" type="password" placeholder="Password" autocomplete="current-password" required>
    <p class="msg" id="loginMsg"></p>
    <button class="btn" type="submit">Sign in</button>
    <p class="note">First time? Run the bootstrap command in DEPLOYMENT.md section 13 to create your account.</p>
  </form>
</div>

<div id="app" hidden>
  <header>
    <div class="brand">Lost Diary <span class="meta" style="margin-left:8px">Admin</span></div>
    <nav>
      <button data-t="overview" class="on">Overview</button>
      <button data-t="visitors">Visitors</button>
      <button data-t="orders">Orders</button>
      <button data-t="preorders">Pre-orders</button>
      <button data-t="supplier">Supplier</button>
      <button data-t="products">Products</button>
      <button data-t="settings">Settings</button>
    </nav>
    <div style="display:flex;gap:10px;align-items:center">
      <span class="meta" id="who"></span>
      <button class="btn ghost" id="out">Sign out</button>
    </div>
  </header>
  <main id="view"></main>
</div>

<dialog id="dlg"><div class="dlg-hd"><span class="meta" id="dlgTitle">Order</span>
  <button class="btn ghost" id="dlgClose">Close</button></div>
  <div class="dlg-bd" id="dlgBody"></div></dialog>

<script>
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const api=async(p,o={})=>{
  const r=await fetch('/admin/api'+p,{credentials:'same-origin',
    headers:{'Content-Type':'application/json'},...o});
  const d=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(d.error||('HTTP '+r.status));
  return d;
};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=s=>s?new Date(s.replace(' ','T')+(s.includes('Z')?'':'Z')).toLocaleString('en-GB',
  {day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}):'—';
const label=s=>String(s||'').replace(/_/g,' ');
const pillClass=s=>s==='paid'?'paid':['pending','processing'].includes(s)?'pending':
  ['failed','cancelled','refunded','partially_refunded'].includes(s)?'bad':'';

/* ---------- auth ---------- */
$('#loginForm').addEventListener('submit',async e=>{
  e.preventDefault(); const m=$('#loginMsg'); m.textContent=''; m.className='msg';
  try{ await api('/login',{method:'POST',body:JSON.stringify({email:$('#email').value,password:$('#pw').value})});
       await boot(); }
  catch(err){ m.textContent=err.message; }
});
$('#out').addEventListener('click',async()=>{ await api('/logout',{method:'POST'}); location.reload(); });
$('#dlgClose').addEventListener('click',()=>$('#dlg').close());

async function boot(){
  try{ const me=await api('/me');
    $('#login').hidden=true; $('#app').hidden=false; $('#who').textContent=me.email; render('overview'); }
  catch{ $('#login').hidden=false; $('#app').hidden=true; }
}
$$('nav button').forEach(b=>b.addEventListener('click',()=>{
  $$('nav button').forEach(x=>x.classList.toggle('on',x===b)); render(b.dataset.t);
}));

/* ---------- views ---------- */
async function render(tab){
  const v=$('#view'); v.innerHTML='<p class="meta">Loading…</p>';
  try{ await ({overview,visitors,orders,preorders,supplier,products,settings})[tab](v); }
  catch(e){ v.innerHTML='<div class="empty">'+esc(e.message)+'</div>'; }
}


/* ---------- visitors: anonymous daily totals ---------- */
let vDays=7, vSeries=null;
const VSRC={instagram:'Instagram',tiktok:'TikTok',google:'Google',facebook:'Facebook',snapchat:'Snapchat',
  x:'X (Twitter)',youtube:'YouTube',pinterest:'Pinterest',whatsapp:'WhatsApp',bing:'Other search engines',
  email:'Email',direct:'Direct',other:'Other websites'};
const VDEV={mobile:'Phone',desktop:'Computer',tablet:'Tablet'};
let vRegion=null; try{ vRegion=new Intl.DisplayNames(['en-GB'],{type:'region'}); }catch(e){}
const vCountry=k=>k==='XX'?'Unknown':(vRegion?(vRegion.of(k)||k):k);
const nf=n=>Number(n||0).toLocaleString('en-GB');
const pct=(a,b)=>b?(Math.round(a/b*1000)/10).toLocaleString('en-GB')+'%':'—';
const dShort=s=>new Date(s+'T12:00:00Z').toLocaleDateString('en-GB',{day:'numeric',month:'short',timeZone:'UTC'});
const dLong=s=>new Date(s+'T12:00:00Z').toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short',timeZone:'UTC'});
const niceStep=max=>{ const raw=max/4, p=Math.pow(10,Math.floor(Math.log10(raw||1))); const m=raw/p;
  return Math.max(1,(m<=1?1:m<=2?2:m<=5?5:10)*p); };

async function visitors(v){
  if(v.querySelector('.vwrap')) v.style.opacity='.45';          // keep the frame while it reloads
  let d; try{ d=await api('/visitors?days='+vDays); } finally { v.style.opacity=''; }
  const t=d.totals;
  const tile=(l,val,sub)=>'<div class="card"><span class="meta">'+l+'</span><div class="v">'+val+'</div>'+
    (sub?'<p class="note" style="margin-top:4px">'+sub+'</p>':'')+'</div>';
  const R=[[1,'Today'],[7,'7 days'],[30,'30 days'],[90,'90 days']];
  let h='<div class="vwrap"><h2>Visitors</h2><div class="bar"><div class="vrange" role="group" aria-label="Date range">'+
    R.map(r=>'<button class="btn ghost'+(r[0]===vDays?' on':'')+'" data-days="'+r[0]+'" aria-pressed="'+(r[0]===vDays)+'">'+r[1]+'</button>').join('')+
    '</div><span class="note vtoday">Today so far: <b>'+nf(d.today.visits)+'</b> '+(d.today.visits===1?'visit':'visits')+
    ' · '+nf(d.today.pageviews)+' page '+(d.today.pageviews===1?'view':'views')+'</span></div>';
  h+='<div class="grid vtiles">'+
    tile('Visits',nf(t.visits),'People arriving at the shop')+
    tile('Page views',nf(t.pageviews))+
    tile('Pieces opened',nf(t.productViews),'Each time a piece is opened')+
    tile('Added to bag',nf(t.bagAdds))+
    tile('Checkouts started',nf(t.checkouts),t.checkouts?nf(t.checkoutsNotCompleted)+' not completed':'')+
    tile('Orders',nf(t.orders),'Paid in this period')+
    tile('Sales',t.sales,'From those orders')+
    tile('Conversion',d.conversion==null?'—':pct(t.orders,t.visits),'Orders ÷ visits')+'</div>';
  vSeries=vDays>1?d.series:null;
  if(vSeries) h+='<div class="card vchart"><span class="meta">Visits per day</span><div class="vchart-in"></div></div>';

  h+='<h2 style="margin-top:30px">Pieces people look at</h2>'+(d.pieces.length?
    '<table class="vpieces"><thead><tr><th>Piece</th><th class="right">Opened</th><th class="right">Added to bag</th><th class="right">Added ÷ opened</th></tr></thead><tbody>'+
    d.pieces.map(p=>'<tr><td>'+esc(p.name)+'</td><td class="right mono">'+nf(p.views)+'</td><td class="right mono">'+nf(p.bagAdds)+
      '</td><td class="right mono">'+pct(p.bagAdds,p.views)+'</td></tr>').join('')+'</tbody></table>'
    :'<div class="empty">No pieces opened in this period yet.</div>');

  const list=(title,rows,name)=>{
    if(!rows.length) return '<div class="card"><span class="meta">'+title+'</span><p class="note">Nothing in this period yet.</p></div>';
    const max=rows[0].n, all=rows.reduce((a,r)=>a+r.n,0);
    return '<div class="card"><span class="meta">'+title+'</span><div class="vlist">'+rows.slice(0,8).map(r=>
      '<div class="vrow"><span class="vname" title="'+esc(name(r.key))+'">'+esc(name(r.key))+'</span><span class="vtrack"><i style="width:'+
      Math.max(2,r.n/max*100)+'%"></i></span><span class="vval">'+nf(r.n)+'<small>'+pct(r.n,all)+'</small></span></div>').join('')+
      (rows.length>8?'<p class="note" style="margin:0">+ '+(rows.length-8)+' more</p>':'')+'</div></div>';
  };
  h+='<div class="grid3">'+list('Where visitors come from',d.sources,k=>VSRC[k]||k)+
    list('Devices',d.devices,k=>VDEV[k]||k)+list('Countries',d.countries,vCountry)+'</div>';

  const site=String(d.siteUrl||'').replace(/[/]+$/,'');
  h+='<p class="note vhow"><b>How this is counted.</b> Each visit adds one to anonymous daily totals. Nothing that identifies a person is kept: '+
    'no cookies, no IP addresses. People who chose <i>Essential only</i> on the cookie banner, or whose browser asks not to be tracked, '+
    'are not counted, so real traffic is a little higher. Reloads and coming back from the payment page are not new visits, and the same '+
    'person visiting twice counts twice. <b>Direct</b> means the address was typed in, saved, or opened from an app that hides where the visit came from. '+
    'Checkouts and orders come from your order records.<br><br>'+
    '<b>Leave out your own visits:</b> open <a href="'+esc(site)+'/?nocount=1" target="_blank" rel="noopener">'+esc(site.replace('https://',''))+'/?nocount=1</a> '+
    'once on each phone and computer you use. Open it with <code>?nocount=0</code> to undo.</p></div>';

  v.innerHTML=h;
  $$('.vrange button').forEach(b=>b.addEventListener('click',()=>{ vDays=+b.dataset.days; visitors(v); }));
  vDraw();
}

/* Drawn at the real width, so the text stays readable on a phone. */
function vDraw(){
  const box=document.querySelector('.vchart-in'); if(!box||!vSeries) return;
  const S=vSeries, W=Math.max(280,box.clientWidth), H=box.clientWidth<640?200:230;
  const n=S.length, L=40, Rt=8, T=24, B=n<=7?40:30, pw=W-L-Rt, ph=H-T-B;
  const max=Math.max(0,...S.map(s=>s.visits));
  if(!max){ box.innerHTML='<p class="note">No visits counted in this period yet. They appear here as people visit the shop.</p>'; return; }
  const step=niceStep(max), top=Math.ceil(max/step)*step, y=val=>T+ph-val/top*ph;
  const slot=pw/n, gap=slot>8?2:1, bw=Math.min(24,Math.max(1,slot-gap));
  let g='', bars='', hits='', lab='';
  for(let k=0;k<=top;k+=step){ const yy=Math.round(y(k))+.5;
    g+=(k?'<line class="vgrid" x1="'+L+'" x2="'+(W-Rt)+'" y1="'+yy+'" y2="'+yy+'"/>':'')+
       '<text class="vtick" x="'+(L-8)+'" y="'+(yy+4)+'" text-anchor="end">'+nf(k)+'</text>'; }
  const every=n<=7?1:Math.ceil(n/(W<640?4:7));
  let iMax=0; S.forEach((s,i)=>{ if(s.visits>S[iMax].visits) iMax=i; });
  S.forEach((s,i)=>{
    const x=L+i*slot+(slot-bw)/2, yy=y(s.visits), base=T+ph;
    if(s.visits>0){ const r=Math.min(4,bw/2,base-yy);
      bars+='<path class="vb" data-i="'+i+'" d="M'+x+','+base+'V'+(yy+r)+'Q'+x+','+yy+' '+(x+r)+','+yy+'H'+(x+bw-r)+
        'Q'+(x+bw)+','+yy+' '+(x+bw)+','+(yy+r)+'V'+base+'Z"/>'; }
    hits+='<rect class="vhit" data-i="'+i+'" x="'+(L+i*slot)+'" y="'+T+'" width="'+slot+'" height="'+ph+'"/>';
    const cx=L+i*slot+slot/2;
    if(n<=7){
      const wd=new Date(s.day+'T12:00:00Z').toLocaleDateString('en-GB',{weekday:'short',timeZone:'UTC'});
      lab+='<text class="vtick" x="'+cx+'" y="'+(H-21)+'" text-anchor="middle">'+esc(wd)+'</text>'+
           '<text class="vtick" x="'+cx+'" y="'+(H-7)+'" text-anchor="middle">'+(+s.day.slice(8))+'</text>';
    } else if(i%every===0) lab+='<text class="vtick" x="'+cx+'" y="'+(H-8)+'" text-anchor="middle">'+esc(dShort(s.day))+'</text>';
  });
  lab+='<text class="vpeak" x="'+(L+iMax*slot+slot/2)+'" y="'+(y(S[iMax].visits)-8)+'" text-anchor="middle">'+nf(S[iMax].visits)+'</text>';
  box.innerHTML='<div class="vplot" tabindex="0" aria-label="Visits per day. Use the arrow keys to read each day. The same numbers are in the table below.">'+
    '<svg width="'+W+'" height="'+H+'" viewBox="0 0 '+W+' '+H+'" aria-hidden="true">'+g+
    '<line class="vaxis" x1="'+L+'" x2="'+(W-Rt)+'" y1="'+(T+ph+.5)+'" y2="'+(T+ph+.5)+'"/>'+bars+lab+hits+'</svg>'+
    '<div class="vtip" role="status" aria-live="polite" hidden></div></div>'+
    '<details class="vtable"><summary>Daily numbers</summary><table><thead><tr><th>Day</th><th class="right">Visits</th>'+
    '<th class="right">Page views</th><th class="right">Orders</th></tr></thead><tbody>'+
    S.slice().reverse().map(s=>'<tr><td>'+esc(dLong(s.day))+'</td><td class="right mono">'+nf(s.visits)+'</td><td class="right mono">'+
      nf(s.pageviews)+'</td><td class="right mono">'+nf(s.orders)+'</td></tr>').join('')+'</tbody></table></details>';

  const plot=box.querySelector('.vplot'), tip=box.querySelector('.vtip');
  let cur=-1;
  const show=i=>{
    cur=i; const s=S[i];
    box.querySelectorAll('.vb').forEach(p=>p.classList.toggle('on',+p.dataset.i===i));
    tip.textContent='';
    const b=document.createElement('b'); b.textContent=nf(s.visits)+' '+(s.visits===1?'visit':'visits'); tip.appendChild(b);
    const a=document.createElement('span'); a.textContent=dLong(s.day); tip.appendChild(a);
    const c=document.createElement('span'); c.textContent=nf(s.pageviews)+' page views · '+nf(s.orders)+' '+(s.orders===1?'order':'orders'); tip.appendChild(c);
    tip.hidden=false;
    const pk=box.querySelector('.vpeak'); if(pk) pk.style.visibility=i===iMax?'hidden':'';
    const cx=L+i*slot+slot/2, w=tip.offsetWidth, half=w/2;
    tip.style.left=Math.min(W-half,Math.max(half,cx))+'px';
    tip.style.top=Math.max(0,y(s.visits))+'px';
  };
  const hide=()=>{ cur=-1; tip.hidden=true; const pk=box.querySelector('.vpeak'); if(pk) pk.style.visibility=''; box.querySelectorAll('.vb.on').forEach(p=>p.classList.remove('on')); };
  box.querySelectorAll('.vhit').forEach(r=>{
    r.addEventListener('pointerenter',()=>show(+r.dataset.i));
    r.addEventListener('click',()=>show(+r.dataset.i));
  });
  plot.addEventListener('pointerleave',hide);
  plot.addEventListener('focus',()=>show(cur<0?n-1:cur));
  plot.addEventListener('blur',hide);
  plot.addEventListener('keydown',e=>{
    if(e.key==='ArrowLeft'){ show(Math.max(0,(cur<0?n:cur)-1)); e.preventDefault(); }
    if(e.key==='ArrowRight'){ show(Math.min(n-1,(cur<0?-1:cur)+1)); e.preventDefault(); }
    if(e.key==='Home'){ show(0); e.preventDefault(); }
    if(e.key==='End'){ show(n-1); e.preventDefault(); }
    if(e.key==='Escape') hide();
  });
}
let vResize=0;
addEventListener('resize',()=>{ clearTimeout(vResize); vResize=setTimeout(vDraw,120); });

async function overview(v){
  const d=await api('/overview');
  const c=(l,val,sub)=>'<div class="card"><span class="meta">'+l+'</span><div class="v mono">'+val+'</div>'+
    (sub?'<p class="note" style="margin-top:4px">'+sub+'</p>':'')+'</div>';
  v.innerHTML='<h2>Overview</h2><div class="grid">'+
    c('Paid orders',d.orders)+c('Paid pre-orders',d.preorders)+
    c('Customer payments',d.money.gross)+c('Payment fees',d.money.fees)+
    c('Net received',d.money.net)+c('Refunded',d.money.refunded)+
    c('Supplier cost',d.money.supplierCost,'From supplier_cost_pence on each product')+
    c('Estimated gross margin',d.money.margin,'Net − refunds − supplier cost')+
    '</div><h2 style="margin-top:30px">Fulfilment</h2><div class="grid">'+
    c('Awaiting supplier order',d.stages.awaitingSupplierOrder)+c('Ordered from supplier',d.stages.orderedFromSupplier)+
    c('Received',d.stages.received)+c('Ready to ship',d.stages.readyToShip)+
    c('Shipped',d.stages.shipped)+c('Delivered',d.stages.delivered)+
    '</div><p class="note">'+esc(d.settlementNote)+'</p>';
}

async function orderTable(v,{preorder}={}){
  const p=new URLSearchParams(); if(preorder) p.set('preorder','1');
  const st=$('#fStatus')?.value, q=$('#fQ')?.value;
  if(st) p.set('status',st); if(q) p.set('q',q);
  const d=await api('/orders?'+p);
  const rows=d.orders.map(o=>'<tr data-id="'+o.id+'"><td class="mono">'+o.id+'</td>'+
    '<td>'+esc(o.name||'—')+'<br><span class="meta">'+esc(o.email)+'</span></td>'+
    '<td class="right mono">'+o.total+'</td>'+
    '<td><span class="pill '+pillClass(o.payment_status)+'">'+label(o.payment_status)+'</span>'+
      (o.is_preorder?' <span class="pill pre">Pre-order</span>':'')+'</td>'+
    '<td><span class="pill">'+label(o.fulfilment_status)+'</span></td>'+
    '<td>'+esc(o.provider)+'</td><td>'+date(o.created_at)+'</td></tr>').join('');
  const tbl=d.orders.length? '<table><thead><tr><th>Order</th><th>Customer</th><th class="right">Total</th>'+
    '<th>Payment</th><th>Fulfilment</th><th>Via</th><th>Placed</th></tr></thead><tbody>'+rows+'</tbody></table>'
    : '<div class="empty">No orders yet.</div>';
  v.querySelector('#tbl').innerHTML=tbl;
  v.querySelectorAll('tbody tr').forEach(tr=>tr.addEventListener('click',()=>openOrder(tr.dataset.id)));
}

function filterBar(){
  return '<div class="bar"><input id="fQ" placeholder="Search order, name or email">'+
    '<select id="fStatus"><option value="">All payment states</option>'+
    ['paid','pending','failed','cancelled','refunded','partially_refunded']
      .map(s=>'<option value="'+s+'">'+label(s)+'</option>').join('')+'</select>'+
    '<button class="btn ghost" id="fGo">Filter</button></div><div id="tbl"></div>';
}
async function orders(v){
  v.innerHTML='<h2>Orders</h2>'+filterBar();
  v.querySelector('#fGo').addEventListener('click',()=>orderTable(v));
  await orderTable(v);
}
async function preorders(v){
  v.innerHTML='<h2>Pre-orders</h2><p class="note" style="margin:0 0 14px">Paid pre-orders. '+
    'Move them through the supplier stages as you go — each change emails the customer.</p>'+filterBar();
  v.querySelector('#fGo').addEventListener('click',()=>orderTable(v,{preorder:1}));
  await orderTable(v,{preorder:1});
}

async function openOrder(id){
  const dlg=$('#dlg'); $('#dlgTitle').textContent='Order '+id;
  $('#dlgBody').innerHTML='<p class="meta">Loading…</p>'; dlg.showModal();
  const {order:o,fulfilmentOptions,carriers}=await api('/orders/'+id);
  const items=o.items.map(i=>'<tr><td>'+esc(i.name)+(i.is_preorder?' <span class="pill pre">Pre-order</span>':'')+
    '<br><span class="meta">'+[i.colour,'Size '+i.size].filter(Boolean).map(esc).join(' · ')+
    (i.sku?' · '+esc(i.sku):'')+'</span></td><td class="right mono">'+i.qty+'</td>'+
    '<td class="right mono">'+i.line+'</td><td><span class="pill">'+label(i.supplier_status)+'</span></td></tr>').join('');
  const addr=[o.name,o.ship_line1,o.ship_line2,o.ship_city,o.ship_postcode,o.ship_country].filter(Boolean).map(esc).join('<br>');
  const refunded=(o.refunds||[]).filter(r=>r.status==='succeeded').reduce((n,r)=>n+r.amount_pence,0);
  $('#dlgBody').innerHTML=
    '<div class="kv"><div>Payment</div><div><span class="pill '+pillClass(o.payment_status)+'">'+
      label(o.payment_status)+'</span> · '+esc(o.provider)+' · <span class="mono">'+esc(o.provider_payment_id||'—')+'</span></div>'+
    '<div>Customer</div><div>'+esc(o.name||'—')+' &lt;'+esc(o.email)+'&gt;</div>'+
    '<div>Ship to</div><div>'+(addr||'—')+'</div>'+
    '<div>Placed</div><div>'+date(o.created_at)+'</div>'+
    '<div>Paid</div><div>'+date(o.paid_at)+'</div>'+
    '<div>Customer paid</div><div class="mono">'+o.total+'</div>'+
    '<div>Fee / net</div><div class="mono">'+o.fee+' / '+o.net+'</div>'+
    (refunded?'<div>Refunded</div><div class="mono">£'+(refunded/100).toFixed(2)+'</div>':'')+'</div>'+
    '<table style="margin-top:18px"><thead><tr><th>Item</th><th class="right">Qty</th>'+
      '<th class="right">Line</th><th>Supplier</th></tr></thead><tbody>'+items+'</tbody></table>'+
    '<h2 style="font-size:18px;margin:26px 0 10px">Fulfilment</h2>'+
    '<div class="bar"><select id="fs">'+fulfilmentOptions.map(f=>
      '<option value="'+f+'"'+(f===o.fulfilment_status?' selected':'')+'>'+label(f)+'</option>').join('')+'</select>'+
    '<select id="tc"><option value="">Carrier…</option>'+Object.entries(carriers).map(([k,c])=>
      '<option value="'+k+'"'+(k===o.tracking_carrier?' selected':'')+'>'+esc(c.name)+'</option>').join('')+'</select>'+
    '<input id="tn" placeholder="Tracking number" value="'+esc(o.tracking_number||'')+'">'+
    '<button class="btn" id="save">Save &amp; email customer</button></div>'+
    '<textarea id="notes" placeholder="Internal notes">'+esc(o.notes||'')+'</textarea>'+
    '<p class="msg" id="oMsg"></p>'+
    '<h2 style="font-size:18px;margin:22px 0 10px">Refund</h2>'+
    '<div class="bar"><input id="rAmt" type="number" step="0.01" min="0.01" placeholder="Amount in £">'+
    '<input id="rWhy" placeholder="Reason (optional)">'+
    '<button class="btn danger" id="ref">Refund through '+esc(o.provider)+'</button></div>'+
    '<p class="note">Refunds go through the payment provider for real. Configure your own returns policy '+
    'in Settings — nothing is assumed here.</p>';

  $('#save').addEventListener('click',async e=>{
    e.target.disabled=true; const m=$('#oMsg'); m.className='msg';
    try{ await api('/orders/'+id,{method:'PATCH',body:JSON.stringify({
        fulfilment_status:$('#fs').value, tracking_carrier:$('#tc').value,
        tracking_number:$('#tn').value, notes:$('#notes').value })});
      m.className='msg ok'; m.textContent='Saved. Customer notified where that stage sends an email.'; }
    catch(err){ m.textContent=err.message; }
    e.target.disabled=false;
  });
  $('#ref').addEventListener('click',async e=>{
    const pounds=parseFloat($('#rAmt').value); const m=$('#oMsg'); m.className='msg';
    if(!(pounds>0)){ m.textContent='Enter an amount.'; return; }
    if(!confirm('Refund £'+pounds.toFixed(2)+' for '+id+'? This moves real money.')) return;
    e.target.disabled=true;
    try{ const r=await api('/orders/'+id+'/refund',{method:'POST',
        body:JSON.stringify({amountPence:Math.round(pounds*100),reason:$('#rWhy').value})});
      m.className='msg ok'; m.textContent='Refund '+r.providerStatus+' — '+r.amount; }
    catch(err){ m.textContent=err.message; }
    e.target.disabled=false;
  });
}

async function supplier(v){
  const d=await api('/supplier');
  if(!d.groups.length){ v.innerHTML='<h2>Supplier order summary</h2>'+
    '<div class="empty">Nothing waiting to be ordered. Paid pre-orders appear here automatically.</div>'; return; }
  v.innerHTML='<h2>Supplier order summary</h2>'+
    '<div class="bar"><span class="meta">'+d.totalUnits+' units to buy · customers paid '+d.totalPaid+'</span></div>'+
    d.groups.map((g,k)=>'<div class="card" style="margin-bottom:14px">'+
      '<div style="display:flex;justify-content:space-between;gap:14px;flex-wrap:wrap">'+
      '<div><div style="font-family:var(--serif);font-size:20px">'+esc(g.name)+
        (g.colour?' — '+esc(g.colour):'')+'</div>'+
      '<div class="sizes">'+g.sizes.map(s=>'<span>'+esc(s.size)+' × <b class="mono">'+s.qty+'</b></span>').join('')+
      '</div></div><div class="right"><div class="meta">Total units</div>'+
      '<div class="v mono">'+g.totalQty+'</div></div></div>'+
      '<div class="kv" style="margin-top:14px"><div>Customers paid</div><div class="mono">'+g.customerPaid+'</div>'+
      '<div>Supplier cost</div><div class="mono">'+g.supplierCost+'</div>'+
      '<div>Est. margin</div><div class="mono">'+g.margin+'</div></div>'+
      '<div class="bar" style="margin:14px 0 0"><input id="ref'+k+'" placeholder="Supplier reference">'+
      '<input id="cost'+k+'" type="number" step="0.01" placeholder="Actual cost £">'+
      '<button class="btn" data-place="'+k+'">Mark ordered from supplier</button></div></div>').join('')+
    '<p class="note">Marking a group ordered links every customer line to one supplier order and moves those '+
    'orders to “ordered from supplier”, which emails each customer.</p>';
  v.querySelectorAll('[data-place]').forEach(b=>b.addEventListener('click',async()=>{
    const k=b.dataset.place, g=d.groups[k];
    b.disabled=true;
    try{ await api('/supplier/place',{method:'POST',body:JSON.stringify({
        productId:g.productId, colour:g.colour, reference:$('#ref'+k).value,
        costPence:Math.round((parseFloat($('#cost'+k).value)||0)*100) })});
      render('supplier'); }
    catch(e){ alert(e.message); b.disabled=false; }
  }));
}

async function products(v){
  const d=await api('/products');
  v.innerHTML='<h2>Products</h2><div id="plist"></div>'+
    '<p class="note">Stock edits save immediately. To add a product or change pre-order dates, use the JSON '+
    'form below — it posts straight to the products endpoint.</p>'+
    '<details style="margin-top:14px"><summary class="meta" style="cursor:pointer">Add or update a product</summary>'+
    '<textarea id="pjson" style="min-height:210px;margin-top:12px">'+esc(JSON.stringify({
      id:'new-hoodie', name:'Premium Hoodie', category:'Hoodies', pricePence:8000,
      description:'Heavyweight loopback, boxed shoulder.', images:['https://yoursite/img/hoodie.png'],
      type:'preorder', preorderOpensAt:'2026-09-10T00:00:00Z', preorderClosesAt:'2026-09-20T23:59:59Z',
      preorderEta:'1–10 October', preorderMax:100, preorderMaxPerOrder:3, supplierCostPence:3200,
      variants:[{size:'S',colour:'Black',stock:0},{size:'M',colour:'Black',stock:0},
                {size:'L',colour:'Black',stock:0},{size:'XL',colour:'Black',stock:0}]
    },null,2))+'</textarea><button class="btn" id="psave" style="margin-top:10px">Save product</button>'+
    '<p class="msg" id="pMsg"></p></details>';
  $('#plist').innerHTML=d.products.map(p=>'<div class="card" style="margin-bottom:12px">'+
    '<div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap">'+
    '<div><div style="font-family:var(--serif);font-size:19px">'+esc(p.name)+'</div>'+
    '<span class="meta">'+esc(p.category)+' · '+esc(p.type)+' · £'+(p.price_pence/100).toFixed(2)+
    (p.active?'':' · INACTIVE')+'</span>'+
    (p.type==='preorder'?'<p class="note" style="margin:6px 0 0">Pre-orders '+
      esc((p.preorder_opens_at||'—').slice(0,10))+' → '+esc((p.preorder_closes_at||'—').slice(0,10))+
      ' · ETA '+esc(p.preorder_eta||'—')+' · cap '+(p.preorder_max??'none')+'</p>':'')+
    '</div></div><table style="margin-top:12px"><thead><tr><th>Variant</th><th>SKU</th>'+
    '<th class="right">Stock</th><th class="right">Pre-ordered</th><th></th></tr></thead><tbody>'+
    p.variants.map(x=>'<tr><td>'+esc([x.colour,x.size].filter(Boolean).join(' / '))+'</td>'+
      '<td class="meta">'+esc(x.sku||'—')+'</td>'+
      '<td class="right"><input style="width:80px" type="number" min="0" value="'+x.stock+
        '" data-v="'+x.id+'"></td>'+
      '<td class="right mono">'+x.preorder_taken+(x.preorder_cap!=null?' / '+x.preorder_cap:'')+'</td>'+
      '<td><button class="btn ghost" data-save="'+x.id+'">Save</button></td></tr>').join('')+
    '</tbody></table></div>').join('') || '<div class="empty">No products yet.</div>';
  v.querySelectorAll('[data-save]').forEach(b=>b.addEventListener('click',async()=>{
    const id=b.dataset.save, val=v.querySelector('[data-v="'+id+'"]').value;
    b.disabled=true; b.textContent='…';
    try{ await api('/variants/'+id,{method:'PATCH',body:JSON.stringify({stock:parseInt(val,10)})});
      b.textContent='Saved'; }catch(e){ b.textContent='Failed'; alert(e.message); }
    setTimeout(()=>{b.disabled=false;b.textContent='Save';},1200);
  }));
  $('#psave')?.addEventListener('click',async()=>{
    const m=$('#pMsg'); m.className='msg';
    try{ const body=JSON.parse($('#pjson').value);
      const r=await api('/products',{method:'POST',body:JSON.stringify(body)});
      m.className='msg ok'; m.textContent='Saved '+r.id; render('products'); }
    catch(e){ m.textContent=e.message; }
  });
}

async function settings(v){
  const {settings:s}=await api('/settings');
  const me=await api('/me');
  const row=(k,hint)=>'<div><span class="meta">'+k.replace(/_/g,' ')+'</span>'+
    (hint?'<p class="note" style="margin:2px 0 6px">'+hint+'</p>':'')+
    (k.endsWith('policy')||k.endsWith('terms')
      ? '<textarea data-k="'+k+'">'+esc(s[k]||'')+'</textarea>'
      : '<input style="width:100%" data-k="'+k+'" value="'+esc(s[k]||'')+'">')+'</div>';
  v.innerHTML='<h2>Settings</h2><div class="card" style="display:grid;gap:16px">'+
    row('shipping_standard','JSON: {"label":"…","pence":495,"eta":"…"}')+
    row('shipping_express','JSON, same shape')+
    row('free_shipping_over','Pence. 0 disables free shipping.')+
    row('ship_to','JSON array of ISO country codes you post to')+
    row('dispatch_days','Shown to customers, e.g. "three working days"')+
    row('stripe_fee_percent','Only used for the margin estimate when the provider has not reported a real fee')+
    row('stripe_fee_fixed_pence')+row('paypal_fee_percent')+row('paypal_fee_fixed_pence')+
    row('returns_policy','Your own words. Nothing is assumed for you.')+
    row('preorder_terms','Shown on pre-order products and at checkout.')+
    '<div><button class="btn" id="ssave">Save settings</button> <span class="msg" id="sMsg"></span></div></div>'+
    '<h2 style="margin-top:34px">Your account</h2>'+
    '<div class="card" style="display:grid;gap:14px;max-width:460px">'+
    '<p class="note" style="margin:0">Signed in as '+esc(me.email)+'. Changing your password signs you out '+
    'of any other browser you are logged in on.</p>'+
    '<div><span class="meta">Current password</span>'+
    '<input type="password" style="width:100%" id="pwOld" autocomplete="current-password"></div>'+
    '<div><span class="meta">New password</span>'+
    '<input type="password" style="width:100%" id="pwNew" autocomplete="new-password"></div>'+
    '<div><span class="meta">New password again</span>'+
    '<input type="password" style="width:100%" id="pwNew2" autocomplete="new-password"></div>'+
    '<div><button class="btn" id="pwSave">Change password</button> <span class="msg" id="pwMsg"></span></div></div>';
  $('#pwSave').addEventListener('click',async e=>{
    const m=$('#pwMsg'); m.className='msg';
    const cur=$('#pwOld').value, nxt=$('#pwNew').value, rpt=$('#pwNew2').value;
    if(nxt!==rpt){ m.textContent='The two new passwords do not match.'; return; }
    if(nxt.length<12){ m.textContent='Use at least 12 characters.'; return; }
    e.target.disabled=true;
    try{ await api('/password',{method:'POST',body:JSON.stringify({current:cur,next:nxt})});
      m.className='msg ok'; m.textContent='Password changed.';
      $('#pwOld').value=$('#pwNew').value=$('#pwNew2').value=''; }
    catch(err){ m.textContent=err.message; }
    e.target.disabled=false;
  });
  $('#ssave').addEventListener('click',async()=>{
    const body={}; v.querySelectorAll('[data-k]').forEach(el=>body[el.dataset.k]=el.value);
    const m=$('#sMsg'); m.className='msg';
    try{ const r=await api('/settings',{method:'PATCH',body:JSON.stringify(body)});
      m.className='msg ok'; m.textContent=r.updated+' saved'; }catch(e){ m.textContent=e.message; }
  });
}

boot();
</script></body></html>`;
