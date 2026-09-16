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
  try{ await ({overview,orders,preorders,supplier,products,settings})[tab](v); }
  catch(e){ v.innerHTML='<div class="empty">'+esc(e.message)+'</div>'; }
}

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
    '<div><button class="btn" id="ssave">Save settings</button> <span class="msg" id="sMsg"></span></div></div>';
  $('#ssave').addEventListener('click',async()=>{
    const body={}; v.querySelectorAll('[data-k]').forEach(el=>body[el.dataset.k]=el.value);
    const m=$('#sMsg'); m.className='msg';
    try{ const r=await api('/settings',{method:'PATCH',body:JSON.stringify(body)});
      m.className='msg ok'; m.textContent=r.updated+' saved'; }catch(e){ m.textContent=e.message; }
  });
}

boot();
</script></body></html>`;
