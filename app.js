/* ===================================================================
   DATA LAYER — everything below loads live from the Google Sheet.
   No hardcoded customers/users. Add/edit/delete in the Sheet and it
   shows up here automatically on next load.
   =================================================================== */
let TODAY = new Date();
const MAX_FU = 5;
const fmtINR = n => '₹' + Number(n).toLocaleString('en-IN');
const d = s => new Date(s+'T00:00:00');
const dayDiff = (a,b)=>Math.round((a-b)/86400000);
const fmtD = dt => dt.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'2-digit'});

const FALLBACK_COLORS = ['#0F766E','#7C3AED','#C2540F','#2563EB','#B45309','#9D174D'];
let USERS = {};      // populated from Sheet "Users" tab
let currentUser = '';
const initials = n => (n||'').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
const uColor = n => {
  if ((USERS[n]||{}).color) return USERS[n].color;
  const keys = Object.keys(USERS);
  const idx = keys.indexOf(n);
  return FALLBACK_COLORS[idx % FALLBACK_COLORS.length] || '#6B6E76';
};

let DATA = [];        // populated from Sheet "Invoices" + "FollowUps" tabs
let dataLoaded = false;

function showLoading(msg){
  document.getElementById('list').innerHTML = `<div class="empty"><b>${msg||'Loading…'}</b>Sheet se data laa rahe hai.</div>`;
}
function showLoadError(err){
  document.getElementById('list').innerHTML = `<div class="empty"><b>Data load nahi ho paya</b>${err && err.message ? err.message : err}</div>`;
}

/**
 * JSONP helper — GAS Web App ko GitHub Pages se cross-origin call karne ka
 * standard tarika (fetch/CORS ka jhanjhat nahi, seedha <script> tag load hota hai).
 */
function gasCall(action, params, onSuccess, onError){
  const cbName = 'gascb_' + Date.now() + '_' + Math.floor(Math.random()*100000);
  window[cbName] = function(data){
    delete window[cbName];
    if (scriptEl.parentNode) scriptEl.parentNode.removeChild(scriptEl);
    if (data && data.error) { if (onError) onError(data.error); return; }
    onSuccess(data);
  };
  const qs = new URLSearchParams({ action, callback: cbName, ...params }).toString();
  const scriptEl = document.createElement('script');
  scriptEl.src = GAS_URL + '?' + qs;
  scriptEl.onerror = () => { if (onError) onError('GAS se connect nahi ho paya. config.js me GAS_URL check karo.'); };
  document.body.appendChild(scriptEl);
}

function loadData(){
  showLoading('Loading…');
  gasCall('getData', {}, onDataLoaded, showLoadError);
}
function onDataLoaded(resp){
  DATA = resp.invoices || [];
  USERS = resp.users || {};
  if (resp.today) TODAY = d(resp.today);
  if (!currentUser || !USERS[currentUser]) {
    const crmNames = Object.keys(USERS).filter(u=>USERS[u].role==='crm');
    currentUser = crmNames[0] || Object.keys(USERS)[0] || '';
  }
  document.getElementById('user').dataset.built = '';
  dataLoaded = true;
  render();
}

function compute(r){
  const due = new Date(d(r.date)); due.setDate(due.getDate()+r.terms);
  const bal = r.amt - r.recvd;
  const overdue = dayDiff(TODAY,due);
  const done = r.followups.length;
  let stage='new';
  if(r.paid || bal<=0) stage='paid';
  else if(done>=5) stage='fu5';
  else if(done===4) stage='fu4';
  else if(done===3) stage='fu3';
  else if(done===2) stage='fu2';
  else if(done===1) stage='fu1';
  const escalate = (stage==='fu5');
  const nextDt = r.next ? d(r.next) : null;
  const dueTill = nextDt ? dayDiff(TODAY,nextDt)>=0 : overdue>=0;
  return {...r, due, bal, overdue, done, stage, escalate, nextDt, dueTill};
}
const C = () => DATA.map(compute);
function scope(rows){ return (USERS[currentUser]||{}).role==='director' ? rows : rows.filter(r=>r.assignedTo===currentUser); }

let filter='today', search='';
const FILTERS=[
  {k:'today',t:'Due today',dot:null},
  {k:'new', t:'New',dot:'var(--new)'},
  {k:'fu1', t:'1',dot:'var(--fu1)'},
  {k:'fu2', t:'2',dot:'var(--fu2)'},
  {k:'fu3', t:'3',dot:'var(--fu3)'},
  {k:'fu4', t:'4',dot:'var(--fu4)'},
  {k:'fu5', t:'5 · Escalate',dot:'var(--fu5)'},
  {k:'all', t:'All',dot:null},
  {k:'paid',t:'Paid',dot:'var(--paid)'},
];
function passFilter(r){
  if(search){const s=search.toLowerCase();
    if(!(r.cust.toLowerCase().includes(s)||r.inv.toLowerCase().includes(s))) return false;}
  switch(filter){
    case 'today': return !r.paid && r.dueTill;
    case 'new':   return r.stage==='new' && !r.paid;
    case 'fu1': case 'fu2': case 'fu3': case 'fu4': case 'fu5': return r.stage===filter;
    case 'paid':  return r.paid;
    case 'all':   return !r.paid;
  }
}
function odClass(o){ return o>7?'over':o>=0?'soon':'ok'; }
function odText(o){ return o>0?o+' days overdue':o===0?'due today':Math.abs(o)+' days left'; }
function edgeColor(s){ return {new:'var(--new)',fu1:'var(--fu1)',fu2:'var(--fu2)',fu3:'var(--fu3)',fu4:'var(--fu4)',fu5:'var(--fu5)',paid:'var(--paid)'}[s]; }
function pipLabel(r){ return r.paid?'✓ Paid':r.done===0?'Not called yet':r.done>=5?'Escalate':'Called '+r.done+'×'; }

function switchUser(u){ currentUser=u; if(USERS[u].role==='crm' && filter==='today'){} render(); }

function render(){
  if(!dataLoaded) { showLoading('Loading…'); return; }
  document.getElementById('td').textContent = fmtD(TODAY);
  // user box
  document.getElementById('uav').style.background = uColor(currentUser);
  document.getElementById('uav').textContent = initials(currentUser);
  const usel = document.getElementById('user');
  if(!usel.dataset.built){ usel.innerHTML = Object.keys(USERS).map(u=>`<option>${u}</option>`).join(''); usel.dataset.built=1; }
  usel.value = currentUser;
  document.getElementById('teamBtn').style.display = (USERS[currentUser]||{}).role==='director' ? '' : 'none';

  const rows = scope(C());

  const chased = rows.filter(r=>!r.paid);
  const outstanding = chased.reduce((s,r)=>s+r.bal,0);
  const dueToday = chased.filter(r=>r.dueTill).length;
  const overdue  = chased.filter(r=>r.overdue>0).length;
  const esc = rows.filter(r=>r.escalate).length;
  document.getElementById('stats').innerHTML = `
    <button class="stat ${filter==='all'?'on':''}" onclick="setF('all')">
      <div class="lab">Outstanding</div><div class="val num">${fmtINR(outstanding)}</div>
      <div class="sub">${chased.length} live invoices</div></button>
    <button class="stat ${filter==='today'?'on':''}" onclick="setF('today')">
      <div class="lab">Due today</div><div class="val num">${dueToday}</div>
      <div class="sub">new + pending follow-ups</div></button>
    <button class="stat" onclick="setF('all')">
      <div class="lab">Overdue</div><div class="val num">${overdue}</div>
      <div class="sub">past due date</div></button>
    <button class="stat danger ${filter==='fu5'?'on':''}" onclick="setF('fu5')">
      <div class="lab">🔴 Escalations</div><div class="val num">${esc}</div>
      <div class="sub">5 follow-ups · director</div></button>`;

  document.getElementById('chips').innerHTML = FILTERS.map(f=>{
    let cnt;
    if(f.k==='today') cnt=rows.filter(r=>!r.paid&&r.dueTill).length;
    else if(f.k==='all') cnt=rows.filter(r=>!r.paid).length;
    else if(f.k==='paid') cnt=rows.filter(r=>r.paid).length;
    else cnt=rows.filter(r=>r.stage===f.k).length;
    return `<button class="chip ${filter===f.k?'on':''}" onclick="setF('${f.k}')">
      ${f.dot?`<span class="dot" style="background:${f.dot}"></span>`:''}${f.t}<span class="cnt">${cnt}</span></button>`;
  }).join('');

  const titles={today:'Today’s follow-ups',new:'New invoices — not yet contacted',
    fu1:'After follow-up 1',fu2:'After follow-up 2',fu3:'After follow-up 3',fu4:'After follow-up 4',
    fu5:'Escalations — 5 follow-ups done, director needed',all:'All chased invoices',paid:'Paid & closed'};
  const who = USERS[currentUser].role==='director' ? 'all CRMs' : currentUser;
  document.getElementById('segTitle').innerHTML = `${titles[filter]} <span id="cntspan"></span> · ${who}`;

  let list = scope(C()).filter(passFilter).sort((a,b)=>(b.escalate-a.escalate)||(b.overdue-a.overdue));
  document.getElementById('cntspan').textContent = `· ${list.length} invoice${list.length!==1?'s':''}`;

  const L=document.getElementById('list');
  if(!list.length){
    L.innerHTML=`<div class="empty"><b>Nothing here right now.</b>
      ${search?'No invoice matches “'+search+'”.':'All clear for this view.'}</div>`;
    return;
  }
  L.innerHTML = list.map(r=>{
    const idx = DATA.findIndex(x=>x.inv===r.inv);
    const tabTxt = r.paid ? '✓' : (r.done + '<s>/5</s>');
    const isToday = r.next && dayDiff(TODAY,r.nextDt)===0;
    const nextTxt = r.next ? fmtD(r.nextDt) : (r.paid?'—':'set');
    const overTxt = r.overdue>0 ? r.overdue+'d' : r.overdue===0 ? 'today' : '—';
    return `
    <div class="row ${r.escalate?'esc':''} ${r.paid?'paidrow':''}" onclick="openDrawer(${idx})" tabindex="0" onkeydown="if(event.key==='Enter')openDrawer(${idx})" title="${r.cust} — called ${r.done}× · ${fmtINR(r.bal)} due">
      <div class="edge" style="background:${edgeColor(r.stage)}"></div>
      <div class="c cust">
        <div class="av" style="background:${uColor(r.assignedTo)}" title="Assigned: ${r.assignedTo}">${initials(r.assignedTo)}</div>
        <div class="nm"><b>${r.cust}${r.escalate?' ⚠':''}</b><small>${r.inv} · ${r.city}</small></div>
      </div>
      <div class="c amt">${fmtINR(r.bal)}</div>
      <div class="c fu"><span class="tab ${r.stage}" title="Called ${r.done} of 5">${tabTxt}</span></div>
      <div class="c over ${odClass(r.overdue)}">${overTxt}</div>
      <div class="c next ${isToday?'today':''}">${nextTxt}</div>
      <div class="c go">›</div>
    </div>`;
  }).join('');
}
function setF(k){ filter=k; render(); }

let openIdx=-1;
function openDrawer(i){
  openIdx=i; const r=compute(DATA[i]);
  const fc = n => {
    const f=r.followups.find(x=>x.n===n);
    if(!f) return `<div class="fcard f${n} empty-f">Follow-up ${n} — not done yet</div>`;
    return `<div class="fcard f${n}">
      <div class="ft"><b>FOLLOW-UP ${n}</b><span class="dt">${fmtD(d(f.date))}</span>
        <span class="by"><span class="mini" style="background:${uColor(f.by)}">${initials(f.by)}</span>${f.by}</span></div>
      <div class="rm">${f.rm}</div>
      ${f.promise>0?`<div class="pr">Promised: <b>${fmtINR(f.promise)}</b></div>`:''}</div>`;
  };
  const dirCards = r.dirNotes.map(dn=>`<div class="fcard dir">
      <div class="ft"><b>DIRECTOR NOTE</b><span class="dt">${fmtD(d(dn.date))}</span>
        <span class="by"><span class="mini" style="background:${uColor(dn.by)}">${initials(dn.by)}</span>${dn.by}</span></div>
      <div class="rm">${dn.rm}</div></div>`).join('');
  const isDir = USERS[currentUser].role==='director';
  const assignField = isDir
    ? `<select class="assign" onchange="reassign(this.value)">${Object.keys(USERS).filter(u=>USERS[u].role==='crm').map(u=>`<option ${u===r.assignedTo?'selected':''}>${u}</option>`).join('')}</select>`
    : `<div class="v">${r.assignedTo}</div>`;
  const nextFU = r.done+1;
  const escNote = r.escalate ? `<div class="done-note"><b>5 follow-ups completed and still unpaid.</b>
     This invoice now needs the director. Logging here records a <b>director note</b>, not a 6th follow-up.</div>` : '';

  const payHistory = (r.payments && r.payments.length) ? `
      <div class="sectitle">Payment history</div>
      <div class="fcards">${r.payments.map(p=>`
        <div class="payrow"><div><b>${fmtINR(p.amount)}</b><small>${p.mode} · ${fmtD(d(p.date))} · recorded by ${p.by}</small></div></div>`).join('')}</div>` : '';

  const paymentForm = !r.paid ? `
      <div class="logform">
        <h4>Record a payment</h4>
        <div class="who">Balance due: <b>${fmtINR(r.bal)}</b></div>
        <div class="two">
          <div class="fld"><label>Amount received (₹)</label><input id="p_amt" type="number" inputmode="numeric" placeholder="0"></div>
          <div class="fld"><label>Mode</label><select id="p_mode"><option>Cash</option><option>NEFT</option><option>UPI</option><option>Cheque</option><option>Other</option></select></div>
        </div>
        <button class="save" onclick="recordPayment()">Save payment</button>
        <button class="markpaid" onclick="markPaid()">Mark as fully paid</button>
      </div>` : '';

  document.getElementById('drawer').innerHTML = `
    <div class="dhead"><button class="x" onclick="closeDrawer()">×</button>
      <div class="dhead-actions">
        <button class="iconbtn" title="Edit invoice" onclick="openInvoiceForm(${i})">✎</button>
        <button class="iconbtn danger" title="Delete invoice" onclick="deleteInvoiceConfirm('${r.inv}')">🗑</button>
      </div>
      <h2>${r.cust}</h2>
      <div class="meta">${r.inv} · ${fmtINR(r.bal)} outstanding · ${odText(r.overdue)}</div></div>
    <div class="dbody">
      <div class="info">
        <div><div class="k">Contact person</div><div class="v">${r.contact}</div></div>
        <div><div class="k">Phone</div><div class="v"><a class="call" href="tel:${r.phone.replace(/\s/g,'')}">${r.phone}</a></div></div>
        <div><div class="k">Invoice date</div><div class="v">${fmtD(d(r.date))}</div></div>
        <div><div class="k">Credit terms</div><div class="v">${r.terms} days</div></div>
        <div><div class="k">Due date</div><div class="v">${fmtD(r.due)}</div></div>
        <div><div class="k">Invoice amount</div><div class="v">${fmtINR(r.amt)}</div></div>
        <div><div class="k">Assigned CRM</div>${assignField}</div>
        <div><div class="k">Status</div><div class="v" style="color:${edgeColor(r.stage)}">${pipLabel(r)}</div></div>
        <div class="wide"><div class="k">Ship to</div><div class="v" style="font-weight:400">${r.ship}</div></div>
      </div>
      ${payHistory}
      ${paymentForm}
      <div class="sectitle">Call history</div>
      <div class="fcards">${fc(1)}${fc(2)}${fc(3)}${fc(4)}${fc(5)}${dirCards}</div>
      ${r.paid ? `<div class="done-note" style="background:var(--paid-bg);border-color:#BBE3C7;color:#15692F"><b>Paid &amp; closed.</b> No further follow-up needed.</div>`
      : `${escNote}
      <div class="logform">
        <h4>${r.escalate?'Add director note':'Log follow-up '+nextFU+' of 5'}</h4>
        <div class="who">Recording as <b>${currentUser}</b></div>
        <div class="fld"><label>What did the customer say?</label>
          <textarea id="f_rm" placeholder="e.g. Promised payment by Friday, owner out of town…"></textarea></div>
        <div class="two">
          <div class="fld"><label>Amount promised (₹)</label><input id="f_pr" type="number" inputmode="numeric" placeholder="0"></div>
          <div class="fld"><label>Next follow-up date</label><input id="f_nx" type="date" value="${r.next||''}"></div>
        </div>
        <button class="save" onclick="saveFU()">${r.escalate?'Save director note':'Save follow-up '+nextFU}</button>
      </div>`}
    </div>`;
  document.getElementById('scrim').classList.add('on');
  document.getElementById('drawer').classList.add('on');
}
function closeDrawer(){
  document.getElementById('scrim').classList.remove('on');
  document.getElementById('drawer').classList.remove('on');
  openIdx=-1;
}
function reassign(name){
  const inv = DATA[openIdx].inv;
  toast('Saving…');
  gasCall('reassign', { inv, user: name }, resp=>{
    DATA = resp.invoices||[]; USERS = resp.users||{};
    const i = DATA.findIndex(x=>x.inv===inv); openIdx = i;
    render(); openDrawer(i); toast('Assigned to '+name);
  }, err=>toast('Error: '+err));
}
function saveFU(){
  const r=DATA[openIdx];
  const rm=document.getElementById('f_rm').value.trim();
  const pr=+document.getElementById('f_pr').value||0;
  const nx=document.getElementById('f_nx').value;
  if(!rm){ document.getElementById('f_rm').focus(); return; }
  const c=compute(r);
  const inv = r.inv;
  toast('Saving…');
  gasCall('saveFollowUp', { inv, remark: rm, promise: pr, next: nx, user: currentUser, isDirector: c.escalate }, resp=>{
    DATA = resp.invoices||[]; USERS = resp.users||{};
    closeDrawer(); render();
    toast(c.escalate?'Director note saved':'Follow-up saved by '+currentUser);
  }, err=>toast('Error: '+err));
}
function markPaid(){
  const inv = DATA[openIdx].inv;
  toast('Saving…');
  gasCall('markPaid', { inv, user: currentUser }, resp=>{
    DATA = resp.invoices||[]; USERS = resp.users||{};
    closeDrawer(); render(); toast('Marked as paid');
  }, err=>toast('Error: '+err));
}
function recordPayment(){
  const inv = DATA[openIdx].inv;
  const amt = +document.getElementById('p_amt').value || 0;
  const mode = document.getElementById('p_mode').value;
  if(amt<=0){ document.getElementById('p_amt').focus(); return; }
  toast('Saving…');
  gasCall('recordPayment', { inv, amount: amt, mode, user: currentUser }, resp=>{
    DATA = resp.invoices||[]; USERS = resp.users||{};
    const i = DATA.findIndex(x=>x.inv===inv); openIdx=i;
    render(); openDrawer(i); toast('Payment of '+fmtINR(amt)+' recorded');
  }, err=>toast('Error: '+err));
}
function toast(msg){ document.getElementById('toastMsg').textContent=msg; const t=document.getElementById('toast'); t.classList.add('on'); setTimeout(()=>t.classList.remove('on'),2300); }

/* ===================== ADD / EDIT / DELETE INVOICE ===================== */
function openInvoiceForm(idx){
  const isEdit = idx>=0;
  const r = isEdit ? DATA[idx] : null;
  const crmOptions = Object.keys(USERS).filter(u=>USERS[u].role==='crm');
  document.getElementById('drawer').innerHTML = `
    <div class="dhead"><button class="x" onclick="closeDrawer()">×</button>
      <h2>${isEdit?'Edit invoice':'Naya invoice'}</h2>
      <div class="meta">${isEdit?r.inv:'Invoice number apne aap ban jayega'}</div></div>
    <div class="dbody">
      <div class="fld"><label>Customer name</label><input id="if_cust" value="${isEdit?r.cust:''}" placeholder="e.g. Shree Balaji Battery House"></div>
      <div class="two">
        <div class="fld"><label>City</label><input id="if_city" value="${isEdit?r.city:''}"></div>
        <div class="fld"><label>Contact person</label><input id="if_contact" value="${isEdit?r.contact:''}"></div>
      </div>
      <div class="two">
        <div class="fld"><label>Phone</label><input id="if_phone" value="${isEdit?r.phone:''}"></div>
        <div class="fld"><label>Assigned CRM</label>
          <select id="if_assigned">${crmOptions.map(u=>`<option ${isEdit&&u===r.assignedTo?'selected':''}>${u}</option>`).join('')}</select></div>
      </div>
      <div class="fld"><label>Ship to / Address</label><input id="if_ship" value="${isEdit?r.ship:''}"></div>
      <div class="two">
        <div class="fld"><label>Invoice date</label><input id="if_date" type="date" value="${isEdit?r.date:new Date().toISOString().slice(0,10)}"></div>
        <div class="fld"><label>Credit days</label><input id="if_terms" type="number" value="${isEdit?r.terms:30}"></div>
      </div>
      <div class="two">
        <div class="fld"><label>Invoice amount (₹)</label><input id="if_amt" type="number" value="${isEdit?r.amt:''}"></div>
        <div class="fld"><label>Next follow-up date</label><input id="if_next" type="date" value="${isEdit?r.next:''}"></div>
      </div>
      <button class="save" onclick="saveInvoiceForm(${isEdit?idx:-1})">${isEdit?'Save changes':'Add invoice'}</button>
      ${isEdit?`<button class="markpaid" style="border-color:#D6534F;color:#B4231F" onclick="deleteInvoiceConfirm('${r.inv}')">Delete invoice</button>`:''}
    </div>`;
  document.getElementById('scrim').classList.add('on');
  document.getElementById('drawer').classList.add('on');
}
function saveInvoiceForm(idx){
  const isEdit = idx>=0;
  const cust = document.getElementById('if_cust').value.trim();
  if(!cust){ document.getElementById('if_cust').focus(); return; }
  const payload = {
    cust, city: document.getElementById('if_city').value.trim(),
    contact: document.getElementById('if_contact').value.trim(),
    phone: document.getElementById('if_phone').value.trim(),
    assignedTo: document.getElementById('if_assigned').value,
    ship: document.getElementById('if_ship').value.trim(),
    date: document.getElementById('if_date').value,
    terms: document.getElementById('if_terms').value,
    amt: document.getElementById('if_amt').value,
    next: document.getElementById('if_next').value
  };
  toast('Saving…');
  if(isEdit){
    payload.inv = DATA[idx].inv;
    gasCall('updateInvoice', payload, resp=>{
      DATA = resp.invoices||[]; USERS = resp.users||{};
      closeDrawer(); render(); toast('Invoice updated');
    }, err=>toast('Error: '+err));
  } else {
    gasCall('addInvoice', payload, resp=>{
      DATA = resp.invoices||[]; USERS = resp.users||{};
      closeDrawer(); render(); toast('Naya invoice add ho gaya');
    }, err=>toast('Error: '+err));
  }
}
function deleteInvoiceConfirm(inv){
  if(!confirm('Pakka '+inv+' delete karna hai? Follow-up aur payment history bhi delete ho jayegi. Ye undo nahi ho sakta.')) return;
  toast('Deleting…');
  gasCall('deleteInvoice', { inv }, resp=>{
    DATA = resp.invoices||[]; USERS = resp.users||{};
    closeDrawer(); render(); toast('Invoice delete kar diya');
  }, err=>toast('Error: '+err));
}

/* ===================== TEAM MANAGEMENT (director only) ===================== */
function openTeamPanel(){
  document.getElementById('drawer').innerHTML = `
    <div class="dhead"><button class="x" onclick="closeDrawer()">×</button>
      <h2>Manage Team</h2>
      <div class="meta">CRM aur Director add/edit/delete karo</div></div>
    <div class="dbody">
      <div class="sectitle">Current team</div>
      <div id="teamList"></div>
      <div class="logform">
        <h4>Add new</h4>
        <div class="fld"><label>Name</label><input id="tu_name" placeholder="e.g. Rajesh Kumar"></div>
        <div class="two">
          <div class="fld"><label>Role</label><select id="tu_role"><option value="crm">CRM</option><option value="director">Director</option></select></div>
          <div class="fld"><label>Color (optional)</label><input id="tu_color" type="color" value="#0F766E"></div>
        </div>
        <button class="save" onclick="addTeamMember()">Add member</button>
      </div>
    </div>`;
  renderTeamList();
  document.getElementById('scrim').classList.add('on');
  document.getElementById('drawer').classList.add('on');
}
function renderTeamList(){
  document.getElementById('teamList').innerHTML = Object.keys(USERS).map(name=>{
    const u = USERS[name];
    return `<div class="userlistrow">
      <div class="av" style="width:32px;height:32px;border-radius:50%;display:grid;place-items:center;font-size:12px;font-weight:700;color:#fff;background:${uColor(name)}">${initials(name)}</div>
      <div class="nm"><b>${name}</b><small>${u.role}</small></div>
      <div class="actions">
        <button class="iconbtn" title="Rename" onclick="renameTeamMember('${name}')">✎</button>
        <button class="iconbtn danger" title="Remove" onclick="deleteTeamMember('${name}')">🗑</button>
      </div>
    </div>`;
  }).join('');
}
function addTeamMember(){
  const name = document.getElementById('tu_name').value.trim();
  const role = document.getElementById('tu_role').value;
  const color = document.getElementById('tu_color').value;
  if(!name){ document.getElementById('tu_name').focus(); return; }
  toast('Saving…');
  gasCall('addUser', { name, role, color }, resp=>{
    DATA = resp.invoices||[]; USERS = resp.users||{};
    document.getElementById('user').dataset.built='';
    openTeamPanel(); toast(name+' added');
  }, err=>toast('Error: '+err));
}
function renameTeamMember(oldName){
  const name = prompt('Naya naam:', oldName);
  if(!name || name.trim()===oldName) return;
  toast('Saving…');
  gasCall('updateUser', { oldName, name: name.trim() }, resp=>{
    DATA = resp.invoices||[]; USERS = resp.users||{};
    document.getElementById('user').dataset.built='';
    if(currentUser===oldName) currentUser = name.trim();
    openTeamPanel(); toast('Updated');
  }, err=>toast('Error: '+err));
}
function deleteTeamMember(name){
  if(Object.keys(USERS).length<=1){ toast('Kam se kam ek user rehna chahiye'); return; }
  if(!confirm(name+' ko team se hatana hai?')) return;
  toast('Removing…');
  gasCall('deleteUser', { name }, resp=>{
    DATA = resp.invoices||[]; USERS = resp.users||{};
    document.getElementById('user').dataset.built='';
    if(currentUser===name) currentUser = Object.keys(USERS)[0];
    openTeamPanel(); toast('Removed');
  }, err=>toast('Error: '+err));
}

document.getElementById('q').addEventListener('input',e=>{ search=e.target.value; render(); });
document.addEventListener('keydown',e=>{ if(e.key==='Escape') closeDrawer(); });
loadData();
