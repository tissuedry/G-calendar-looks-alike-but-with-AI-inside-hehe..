(function(){
'use strict';
const PALETTE=['p1','p2','p3','p4','p5','p6','p7','p8','p9','p10'];
const PALETTE_NAMES={p1:'Biru',p2:'Ungu',p3:'Hijau tua',p4:'Jingga',p5:'Merah muda',p6:'Kuning',p7:'Hijau',p8:'Lavender',p9:'Merah',p10:'Abu-abu'};
const LIGHT_COLORS=new Set(['p6']); // need dark text on solid fills
const DEFAULT_CATS=[
  {id:'kerja',label:'Kerja',color:'p1'},{id:'kuliah',label:'Kuliah',color:'p2'},{id:'pribadi',label:'Pribadi',color:'p3'},
  {id:'olahraga',label:'Olahraga',color:'p4'},{id:'keluarga',label:'Keluarga',color:'p5'},{id:'organisasi',label:'Organisasi',color:'p6'}];
const STATUS={rencana:'Direncanakan',selesai:'Selesai',tunda:'Ditunda',batal:'Dibatalkan'};
const VIEWS={day:{label:'Hari',key:'D'},x3:{label:'3 hari',key:'X'},week:{label:'Minggu',key:'W'},month:{label:'Bulan',key:'M'},schedule:{label:'Jadwal',key:'A'},summary:{label:'Dashboard',key:'R'}};
const CAL_VIEWS=['day','x3','week','month'];
const MAX_REPEAT=120, API_CHUNK=200;
const $=s=>document.getElementById(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad=n=>String(n).padStart(2,'0');
const ymd=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
const parse=s=>{const [y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d)};
const addDays=(d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x};
const addMonths=(d,n)=>{const x=new Date(d.getFullYear(),d.getMonth()+n,1);x.setDate(Math.min(d.getDate(),new Date(x.getFullYear(),x.getMonth()+1,0).getDate()));return x};
const midnight=d=>{const x=new Date(d);x.setHours(0,0,0,0);return x};
const mins=t=>{const [h,m]=(t||'0:0').split(':').map(Number);return h*60+m};
const dur=e=>Math.max(0,mins(e.end)-mins(e.start));
const fmtH=m=>(Math.round(m/6)/10).toString().replace('.',',');
const uid=()=>(crypto.randomUUID?crypto.randomUUID():'e'+Date.now().toString(36)+Math.random().toString(36).slice(2,10));
const fDay=new Intl.DateTimeFormat('id-ID',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
const fDayShort=new Intl.DateTimeFormat('id-ID',{weekday:'long',day:'numeric',month:'long'});
const fDM=new Intl.DateTimeFormat('id-ID',{day:'numeric',month:'short'});
const fMonth=new Intl.DateTimeFormat('id-ID',{month:'long',year:'numeric'});
const fMonShort=new Intl.DateTimeFormat('id-ID',{month:'short'});
const fWd=new Intl.DateTimeFormat('id-ID',{weekday:'short'});
const fWdLong=new Intl.DateTimeFormat('id-ID',{weekday:'long'});
const sortEv=(a,b)=>a.date.localeCompare(b.date)||a.start.localeCompare(b.start);
const mqMobile=matchMedia('(max-width:900px)');
const store={get(k){try{return localStorage.getItem(k)}catch(e){return null}},set(k,v){try{localStorage.setItem(k,v)}catch(e){}}};

// restarts a one-shot CSS animation class on an element, then removes it so later re-renders stay still
const playTimers=new WeakMap();
function play(el,cls,ms=600){
  if(!el)return;
  el.classList.remove(cls);void el.offsetWidth;el.classList.add(cls);
  clearTimeout(playTimers.get(el));playTimers.set(el,setTimeout(()=>el.classList.remove(cls),ms));
}

let now=new Date();
let real=[], cats=DEFAULT_CATS.slice(), loaded=false, loadErr=null, backend=null, authOn=false;
let view='summary', lastCalView=CAL_VIEWS.includes(store.get('agenda-cal-view'))?store.get('agenda-cal-view'):'week', cursor=midnight(now), miniMonth=new Date(now.getFullYear(),now.getMonth(),1);
let editing=null, returnDay=null, openDayStr=null, detailId=null;
let weekOff=0, catRange='week', scrollPending=true;
let hiddenCats=new Set(JSON.parse(store.get('agenda-hidden-cats')||'[]'));

const getCat=id=>cats.find(c=>c.id===id)||null;
const catKey=id=>getCat(id)?id:'';
const catColor=id=>getCat(id)?.color||'';
const catStyle=id=>{const c=getCat(id);return c?`--cat:var(--${c.color})`:'--cat:var(--faint)'};
const catLabel=id=>getCat(id)?.label||'Tanpa kategori';
const lightCls=id=>LIGHT_COLORS.has(catColor(id))?'light':'';
const visible=e=>!hiddenCats.has(catKey(e.cat));
function events(){return real}

/* ---------- storage ---------- */
const LS='agenda-saya-events', LSC='agenda-saya-cats';
async function api(path,{method='GET',body}={}){
  const r=await fetch('/api/'+path,{method,credentials:'same-origin',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
  let data=null;try{data=await r.json()}catch(e){}
  if(r.status===401&&path!=='auth')showLogin();
  if(!r.ok){const err=new Error(data?.error||'Gagal ('+r.status+')');err.status=r.status;err.code=data?.code;throw err}
  return data;
}
function loadLocal(){
  backend='local';loadErr=null;
  try{real=JSON.parse(localStorage.getItem(LS)||'[]')}catch(e){real=[]}
  try{const c=JSON.parse(localStorage.getItem(LSC)||'null');if(Array.isArray(c))cats=c}catch(e){}
  if(!Array.isArray(real))real=[];
  loaded=true;render();
}
function persistLocal(){try{localStorage.setItem(LS,JSON.stringify(real));localStorage.setItem(LSC,JSON.stringify(cats))}catch(e){toast('Tidak bisa menyimpan di browser ini')}}
function applyState(s){
  real=Array.isArray(s.events)?s.events:[];
  if(Array.isArray(s.cats))cats=s.cats;
  backend='api';loaded=true;loadErr=null;render();
}
async function loadRemote(){applyState(await api('state'))}
// (re)loads from the server. A failure shows an error banner with a retry button, never an endless "loading".
async function reload(){
  loadErr=null;render();
  try{await loadRemote()}
  catch(e){if(e.status===401)return;loadErr=e.message||'Tidak bisa memuat jadwal.';render()}
}
async function initStore(){
  // fetch the schedule in parallel with the auth check: one round trip less
  const stateP=api('state').then(s=>({s}),e=>({e}));
  let auth;
  try{auth=await api('auth')}catch(e){loadLocal();toast('Server tidak terjangkau. Data disimpan di browser ini saja.');return}
  authOn=auth.authEnabled;$('logoutBtn').hidden=!authOn;
  backend='api';
  if(authOn&&!auth.authed){showLogin();return}
  const r=await stateP;
  if(r.s)return applyState(r.s);
  if(r.e.status===401)return;
  loadErr=r.e.message||'Tidak bisa memuat jadwal.';render();
}
function showLogin(){$('login').hidden=false;setTimeout(()=>($('loginUser').value?$('loginPw'):$('loginUser')).focus(),30)}
$('loginForm').addEventListener('submit',async e=>{
  e.preventDefault();
  $('loginBtn').disabled=true;$('loginErr').hidden=true;
  try{await api('auth',{method:'POST',body:{username:$('loginUser').value,password:$('loginPw').value}});$('login').hidden=true;$('loginPw').value='';aiProviders=null;if(!$('aiPanel').hidden)loadProviders();reload()}
  catch(er){$('loginErr').textContent=er.message;$('loginErr').hidden=false}
  finally{$('loginBtn').disabled=false}
});
$('logoutBtn').onclick=async()=>{try{await api('auth',{method:'DELETE'})}catch(e){}real=[];loaded=false;loadErr=null;render();showLogin()};

const clean=e=>e;
const chunks=(l,n)=>Array.from({length:Math.ceil(l.length/n)},(_,i)=>l.slice(i*n,i*n+n));
function mergeLocal(list){list.forEach(e=>{const i=real.findIndex(x=>x.id===e.id);if(i>=0)real[i]=e;else real.push(e)})}
async function saveMany(list){
  if(!list.length)return;
  if(backend==='api'){for(const part of chunks(list.map(clean),API_CHUNK)){const r=await api('events',{method:'POST',body:{events:part}});mergeLocal(r.events)}}
  else{mergeLocal(list);persistLocal()}
  render();
}
async function removeMany(ids){
  if(backend==='api'){for(const part of chunks(ids,API_CHUNK))await api('events',{method:'DELETE',body:{ids:part}})}
  real=real.filter(e=>!ids.includes(e.id));
  if(backend!=='api')persistLocal();
  render();
}
async function saveCats(next){
  if(backend==='api')await api('cats',{method:'PUT',body:{cats:next}});
  cats=next;
  if(backend!=='api')persistLocal();
  render();
}
async function setStatus(id,status){
  const e=events().find(x=>x.id===id);if(!e)return;
  try{await saveMany([{...e,status}]);toast('Ditandai: '+STATUS[status])}catch(err){toast('Gagal menyimpan. '+err.message)}
}

/* ---------- shared bits ---------- */
function evButton(e,extra=''){
  return `<button class="ev ${e.status==='batal'?'is-batal':''}" data-open="${esc(e.id)}" style="${catStyle(e.cat)}">
    <span class="bar"></span><span class="body"><span class="title">${esc(e.title)}</span>
    <span class="sub"><span class="catdot">${esc(catLabel(e.cat))}</span>${e.status!=='rencana'?`<span class="pill st-${e.status}">${STATUS[e.status]}</span>`:''}${extra}</span></span></button>`;
}
function weekStart(d){const x=midnight(d);return addDays(x,-((x.getDay()+6)%7))}
function rangeLabel(a,b){
  const sameY=a.getFullYear()===b.getFullYear();
  return (a.getMonth()===b.getMonth()&&sameY?a.getDate():fDM.format(a))+' – '+fDM.format(b)+' '+b.getFullYear();
}
function inRange(ev,a,b){return ev.filter(e=>e.date>=a&&e.date<=b)}
const active=e=>e.status!=='batal';
function catOrder(byCat){return [...cats.map(c=>c.id),''].filter(id=>byCat[id])}
const statusIcon=e=>e.status==='selesai'?'<span class="ms">check</span>':'';

function renderBanner(){
  const b=$('banner');
  b.classList.toggle('bad',!!loadErr);
  if(loadErr){
    b.hidden=false;
    b.innerHTML=`<span><b>Jadwal belum bisa dimuat.</b> ${esc(loadErr)}</span><button class="btn small" data-act="retry">Coba lagi</button>`;
  }else b.hidden=true;
}

/* ---------- app bar, sidebar ---------- */
function gridDays(){
  if(view==='day')return [cursor];
  if(view==='x3')return [0,1,2].map(i=>addDays(cursor,i));
  const ws=weekStart(cursor);return [...Array(7)].map((_,i)=>addDays(ws,i));
}
function renderTitle(){
  let t;
  if(view==='day')t=(mqMobile.matches?fDayShort:fDay).format(cursor);
  else if(view==='week'||view==='x3'){
    const d=gridDays(),a=d[0],b=d[d.length-1];
    t=a.getMonth()===b.getMonth()?fMonth.format(a):a.getFullYear()===b.getFullYear()?fMonShort.format(a)+' – '+fMonShort.format(b)+' '+b.getFullYear():fMonShort.format(a)+' '+a.getFullYear()+' – '+fMonShort.format(b)+' '+b.getFullYear();
  }else if(view==='month')t=fMonth.format(cursor);
  else t=VIEWS[view].label;
  $('periodTitle').textContent=t;
  document.title=t+' · Agenda Saya';
  $('navArrows').hidden=view==='schedule'||view==='summary';
  $('viewLabel').textContent=VIEWS[CAL_VIEWS.includes(view)?view:lastCalView].label;
  $('viewBtn').classList.toggle('idle',!CAL_VIEWS.includes(view));
  $('dashBtn').setAttribute('aria-pressed',view==='summary');
  const navOn={navDash:view==='summary',navCal:CAL_VIEWS.includes(view),navList:view==='schedule'};
  Object.entries({...navOn,tabDash:navOn.navDash,tabCal:navOn.navCal,tabList:navOn.navList}).forEach(([id,on])=>on?$(id).setAttribute('aria-current','page'):$(id).removeAttribute('aria-current'));
}
function renderViewMenu(){
  $('viewMenu').innerHTML=CAL_VIEWS.map(k=>[k,VIEWS[k]]).map(([k,v])=>`<button role="menuitemradio" aria-checked="${k===view}" data-view="${k}"><span>${v.label}</span><kbd>${v.key}</kbd></button>`).join('');
}
function renderMini(){
  const today=ymd(now),sel=new Set((view==='day'||view==='x3'||view==='week')?gridDays().map(ymd):[]);
  const start=weekStart(miniMonth);
  let cells='';
  for(let i=0;i<42;i++){
    const d=addDays(start,i),s=ymd(d);
    cells+=`<button class="${d.getMonth()!==miniMonth.getMonth()?'out':''} ${s===today?'today':sel.has(s)?'sel':''}" data-mini-day="${s}" aria-label="${fDay.format(d)}">${d.getDate()}</button>`;
  }
  $('mini').innerHTML=`<div class="mini-h"><span>${fMonth.format(miniMonth)}</span><span><button class="icon-btn sm" data-mini="-1" aria-label="Bulan sebelumnya"><span class="ms">chevron_left</span></button><button class="icon-btn sm" data-mini="1" aria-label="Bulan berikutnya"><span class="ms">chevron_right</span></button></span></div>
    <div class="mini-g">${['S','S','R','K','J','S','M'].map(w=>`<span class="w">${w}</span>`).join('')}${cells}</div>`;
}
function renderCatVis(){
  const ev=events(),cnt={};ev.forEach(e=>{const k=catKey(e.cat);cnt[k]=(cnt[k]||0)+1});
  const rows=[...cats.map(c=>({id:c.id,label:c.label})),...(cnt['']?[{id:'',label:'Tanpa kategori'}]:[])];
  $('catVis').innerHTML=rows.map(c=>`<li><label style="${catStyle(c.id)}"><input type="checkbox" data-catvis="${esc(c.id)}" ${hiddenCats.has(c.id)?'':'checked'}><span class="lbl">${esc(c.label)}</span><span class="cnt num">${cnt[c.id]||''}</span></label></li>`).join('')||'<li class="empty">Belum ada kategori.</li>';
}

/* ---------- time grid ---------- */
function layoutDay(list){
  const items=list.map(e=>{const s=mins(e.start);return {e,s,en:Math.max(mins(e.end),s+20)}}).sort((a,b)=>a.s-b.s||b.en-a.en);
  const out=[];let cluster=[],cEnd=-1;
  const flush=()=>{const cols=[];cluster.forEach(it=>{let c=cols.findIndex(end=>end<=it.s);if(c<0){c=cols.length;cols.push(0)}cols[c]=it.en;it.col=c});cluster.forEach(it=>{it.cols=cols.length;out.push(it)});cluster=[]};
  items.forEach(it=>{if(cluster.length&&it.s>=cEnd){flush();cEnd=-1}cluster.push(it);cEnd=Math.max(cEnd,it.en)});
  if(cluster.length)flush();
  return out;
}
function renderGrid(){
  const days=gridDays(),today=ymd(now),H=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--H'))||48;
  const nowM=now.getHours()*60+now.getMinutes();
  const byDay={};events().filter(visible).forEach(e=>(byDay[e.date]=byDay[e.date]||[]).push(e));
  const tz=-now.getTimezoneOffset()/60;
  const head=`<div class="gutter">GMT${tz>=0?'+':''}${tz}</div>`+days.map(d=>{
    const s=ymd(d),l=(byDay[s]||[]).filter(active);
    return `<button class="tg-dh ${s===today?'today':''}" data-goday="${s}" aria-label="${fDay.format(d)}"><span class="wd">${fWd.format(d)}</span><span class="dnum">${d.getDate()}</span><span class="load num">${l.length?fmtH(l.reduce((a,e)=>a+dur(e),0))+' j':''}</span></button>`;
  }).join('');
  const gut=`<div class="tg-gut">${[...Array(23)].map((_,i)=>`<span style="top:${(i+1)*H}px">${pad(i+1)}:00</span>`).join('')}</div>`;
  const cols=days.map((d,ci)=>{
    const s=ymd(d),wk=d.getDay()===0||d.getDay()===6;
    const blocks=layoutDay(byDay[s]||[]).map(({e,s:st,en,col,cols})=>{
      const h=Math.max(18,(en-st)/60*H-2),cls=h<36?'short':h>90?'tall':'';
      return `<button class="tev ${e.status} ${cls} ${lightCls(e.cat)}" data-open="${esc(e.id)}" style="${catStyle(e.cat)};top:${st/60*H}px;height:${h}px;left:calc(${col/cols*100}% + 1px);width:calc(${100/cols}% - 4px)" title="${esc(e.title)} · ${e.start}–${e.end}">
        <span class="tt">${statusIcon(e)}${esc(e.title)}</span><span class="tm">${cls==='short'?e.start:e.start+' – '+e.end}</span></button>`;
    }).join('');
    return `<div class="tg-col ${s===today?'today':''} ${wk?'weekend':''}" data-slot="${s}" style="--ci:${ci}">${blocks}${s===today?`<div class="nowline" style="top:${nowM/60*H}px"></div>`:''}</div>`;
  }).join('');
  const tg=$('tg');
  tg.style.setProperty('--n',days.length);
  tg.innerHTML=`<div class="tg-head">${head}</div><div class="tg-body">${gut}${cols}</div>`;
  if(scrollPending){
    scrollPending=false;
    const showsToday=days.some(d=>ymd(d)===today);
    $('main').scrollTop=Math.max(0,(showsToday?nowM/60-2:7)*H);
  }
}

/* ---------- month ---------- */
function renderMonth(){
  const ev=events().filter(visible),today=ymd(now),m0=new Date(cursor.getFullYear(),cursor.getMonth(),1);
  const start=weekStart(m0),last=new Date(m0.getFullYear(),m0.getMonth()+1,0),end=addDays(weekStart(last),6);
  const byDay={};ev.forEach(e=>(byDay[e.date]=byDay[e.date]||[]).push(e));
  let html=['Sen','Sel','Rab','Kam','Jum','Sab','Min'].map(d=>`<div class="dow">${d}</div>`).join(''),weeks=0;
  for(let d=new Date(start);d<=end;d=addDays(d,1)){
    if(d.getDay()===1)weeks++;
    const s=ymd(d),list=(byDay[s]||[]).sort(sortEv);
    html+=`<div class="mcell ${d.getMonth()!==m0.getMonth()?'out':''} ${s===today?'today':''}" data-day="${s}" role="button" tabindex="0" aria-label="${fDay.format(d)}, ${list.length} kegiatan">
      <button class="mdn" data-goday="${s}">${d.getDate()===1?fDM.format(d):d.getDate()}</button>
      ${list.slice(0,3).map(e=>`<button class="mchip ${e.status} ${dur(e)>=360?'long '+lightCls(e.cat):''}" data-open="${esc(e.id)}" style="${catStyle(e.cat)}"><i></i><span class="mt">${e.start}</span><span class="mtt">${esc(e.title)}</span></button>`).join('')}
      ${list.length>3?`<button class="mmore" data-day="${s}">${list.length-3} lainnya</button>`:''}
      <span class="dots">${list.slice(0,6).map(e=>`<i style="${catStyle(e.cat)}"></i>`).join('')}</span></div>`;
  }
  $('monthGrid').style.setProperty('--w',weeks);
  $('monthGrid').innerHTML=html;
}

/* ---------- day sheet ---------- */
function openDay(s){
  openDayStr=s;
  const list=events().filter(e=>e.date===s).sort(sortEv);
  $('dTitle').textContent=fDay.format(parse(s));
  $('dSum').textContent=list.length?list.length+' kegiatan · '+fmtH(list.filter(active).reduce((a,e)=>a+dur(e),0))+' jam':'';
  $('dList').innerHTML=list.length?list.map(e=>`<li><span class="t num">${e.start}–${e.end}</span>${evButton(e)}
    ${e.status==='selesai'?`<button class="btn text small" data-status="rencana" data-id="${esc(e.id)}">Batalkan tanda</button>`:`<button class="btn tonal small" data-status="selesai" data-id="${esc(e.id)}">Selesai</button>`}</li>`).join('')
    :'<li class="empty" style="display:block">Belum ada kegiatan di tanggal ini.</li>';
  $('dayOv').hidden=false;
}
function closeDay(){$('dayOv').hidden=true;openDayStr=null}

/* ---------- schedule ---------- */
function renderList(){
  const fcSel=$('fcat'),prev=fcSel.value;
  fcSel.innerHTML='<option value="">Semua kategori</option>'+cats.map(c=>`<option value="${esc(c.id)}">${esc(c.label)}</option>`).join('')+'<option value="__none">Tanpa kategori</option>';
  fcSel.value=[...fcSel.options].some(o=>o.value===prev)?prev:'';
  const q=$('fq').value.trim().toLowerCase(),per=$('fperiod').value,fc=fcSel.value,fs=$('fstatus').value;
  const today=ymd(now),mPre=today.slice(0,7);
  let ev=events().filter(e=>{
    if(!visible(e))return false;
    if(fc==='__none'&&getCat(e.cat))return false;
    if(fc&&fc!=='__none'&&e.cat!==fc)return false;
    if(fs&&e.status!==fs)return false;
    if(q&&!(e.title.toLowerCase().includes(q)||(e.notes||'').toLowerCase().includes(q)))return false;
    if(per==='upcoming'&&e.date<today)return false;
    if(per==='past'&&e.date>=today)return false;
    if(per==='month'&&e.date.slice(0,7)!==mPre)return false;
    return true;
  }).sort(sortEv);
  if(per==='past')ev.reverse();
  if(!ev.length){$('listOut').innerHTML=`<div class="empty">${hiddenCats.size?'Tidak ada kegiatan yang cocok. Beberapa kategori sedang disembunyikan di panel samping.':'Tidak ada kegiatan yang cocok dengan filter ini.'}</div>`;return}
  const groups=[];ev.forEach(e=>{const g=groups[groups.length-1];if(g&&g.date===e.date)g.items.push(e);else groups.push({date:e.date,items:[e]})});
  $('listOut').innerHTML=`<p class="smeta">${ev.length} kegiatan · ${fmtH(ev.filter(active).reduce((a,e)=>a+dur(e),0))} jam</p>`+groups.map(g=>{
    const d=parse(g.date);
    return `<div class="sday ${g.date===today?'today':''}"><button class="sdate" data-goday="${g.date}" aria-label="${fDay.format(d)}"><span class="sdn">${d.getDate()}</span><span class="swd">${fMonShort.format(d)} ${d.getFullYear()!==now.getFullYear()?d.getFullYear():''}<br>${fWd.format(d)}</span></button>
      <div class="sitems">${g.items.map(e=>`<button class="srow ${e.status}" data-open="${esc(e.id)}" style="${catStyle(e.cat)}"><span class="dot"></span><span class="stime num">${e.start} – ${e.end}</span><span class="stitle">${esc(e.title)}<span class="scat">${esc(catLabel(e.cat))}</span></span><span class="pill st-${e.status}">${STATUS[e.status]}</span></button>`).join('')}</div></div>`;
  }).join('');
}

/* ---------- summary (dashboard) ---------- */
function renderDashboard(){
  const ev=events(), today=ymd(now), nowM=now.getHours()*60+now.getMinutes();
  const isPast=e=>e.date<today||(e.date===today&&mins(e.end)<=nowM);
  const ws=weekStart(now), wsS=ymd(ws), weS=ymd(addDays(ws,6));
  const ms=ymd(new Date(now.getFullYear(),now.getMonth(),1)), me=ymd(new Date(now.getFullYear(),now.getMonth()+1,0));
  const todayEv=ev.filter(e=>e.date===today).sort(sortEv);
  const weekEv=inRange(ev,wsS,weS).filter(active), monthEv=inRange(ev,ms,me).filter(active);
  const monthPast=monthEv.filter(isPast), monthDone=monthPast.filter(e=>e.status==='selesai').length;
  const pct=monthPast.length?Math.round(monthDone/monthPast.length*100):0;
  const in14=ymd(addDays(now,14));
  const upcoming=ev.filter(e=>active(e)&&(e.date>today||(e.date===today&&mins(e.start)>nowM))&&e.date<=in14).sort(sortEv);
  const sum=l=>l.reduce((a,e)=>a+dur(e),0);
  const monthName=new Intl.DateTimeFormat('id-ID',{month:'long'}).format(now);

  $('stats').innerHTML=`
    <div class="stat"><div class="label">Hari ini</div><div class="value num">${todayEv.length}<small>kegiatan</small></div><div class="sub">${todayEv.filter(e=>active(e)&&mins(e.end)>nowM).length} tersisa · ${fmtH(sum(todayEv.filter(active)))} jam</div></div>
    <div class="stat"><div class="label">Minggu ini</div><div class="value num">${fmtH(sum(weekEv))}<small>jam</small></div><div class="sub">${weekEv.length} kegiatan · ${rangeLabel(ws,addDays(ws,6))}</div></div>
    <div class="stat"><div class="label">Bulan ${esc(monthName)}</div><div class="value num">${monthEv.length}<small>kegiatan</small></div><div class="sub">${fmtH(sum(monthEv))} jam terjadwal</div></div>
    <div class="stat"><div class="label">Terlaksana bulan ini</div><div class="value num">${monthDone}/${monthPast.length}</div><div class="meter" aria-hidden="true"><i style="width:${pct}%"></i></div><div class="sub">${monthPast.length?pct+'% dari yang sudah lewat':'Belum ada yang lewat'}</div></div>
    <div class="stat"><div class="label">14 hari ke depan</div><div class="value num">${upcoming.length}<small>kegiatan</small></div><div class="sub">${upcoming[0]?'Berikutnya: '+esc(upcoming[0].title):'Kosong'}</div></div>`;

  // friendly one-paragraph summary of the day
  const hr=now.getHours(), greet=hr<4?'Selamat malam':hr<11?'Selamat pagi':hr<15?'Selamat siang':hr<18?'Selamat sore':'Selamat malam';
  const todayAct=todayEv.filter(active), curEv=todayAct.find(e=>mins(e.start)<=nowM&&nowM<mins(e.end)), laterEv=todayAct.filter(e=>mins(e.start)>nowM);
  const hmsg=[];
  if(curEv)hmsg.push(`Sekarang berlangsung <b>${esc(curEv.title)}</b> sampai ${curEv.end}.`);
  if(laterEv.length)hmsg.push(curEv?`Setelah itu ada ${laterEv.length} kegiatan lagi, berikutnya <b>${esc(laterEv[0].title)}</b> pukul ${laterEv[0].start}.`:`Hari ini ada ${laterEv.length} kegiatan, yang pertama <b>${esc(laterEv[0].title)}</b> pukul ${laterEv[0].start}.`);
  else if(todayAct.length&&!curEv)hmsg.push('Semua kegiatan hari ini sudah selesai. Kerja bagus!');
  else if(!todayAct.length)hmsg.push(upcoming[0]?`Hari ini kosong. Kegiatan berikutnya: <b>${esc(upcoming[0].title)}</b>, ${fDayShort.format(parse(upcoming[0].date))}.`:'Hari ini kosong dan belum ada rencana dalam 14 hari ke depan.');
  if(!ev.length){hmsg.length=0;hmsg.push('Belum ada kegiatan. Klik <b>Buat</b>, atau minta Asisten AI menambahkannya, misalnya: "tambah rapat besok jam 10".')}
  $('hello').innerHTML=`<div class="hdate">${fDay.format(now)}</div><h2>${greet}</h2><p>${hmsg.join(' ')}</p>`;

  $('todayMeta').textContent=todayEv.length?fmtH(sum(todayEv.filter(active)))+' jam terjadwal':'';
  let nextMarked=false;
  $('todayList').innerHTML=todayEv.length?todayEv.map(e=>{
    const s=mins(e.start),en=mins(e.end),isNow=s<=nowM&&nowM<en&&active(e);
    let flag='';
    if(isNow)flag='<span class="flag now">Berlangsung</span>';
    else if(!nextMarked&&s>nowM&&active(e)){nextMarked=true;flag='<span class="flag next">Berikutnya</span>'}
    return `<li class="${isNow?'now':''} ${(en<=nowM||e.status==='selesai')?'done':''}"><div class="t num">${e.start}<span>${e.end}</span></div>${evButton(e,flag)}</li>`;
  }).join(''):`<li class="empty" style="display:block"><b>Tidak ada kegiatan hari ini.</b><br>Tambahkan dengan tombol Buat, atau minta Asisten AI.</li>`;

  document.querySelectorAll('#catRangeSeg button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.range===catRange));
  const src=catRange==='week'?weekEv:monthEv;
  const byCat={};src.forEach(e=>{const k=catKey(e.cat);byCat[k]=(byCat[k]||0)+dur(e)});
  const ids=catOrder(byCat).sort((a,b)=>byCat[b]-byCat[a]);
  const max=Math.max(60,...Object.values(byCat)), tot=sum(src)||1;
  $('catBars').innerHTML=ids.length?ids.map(id=>`<div class="catrow" style="${catStyle(id)}" title="${Math.round(byCat[id]/tot*100)}% dari total"><span class="catdot">${esc(catLabel(id))}</span><div class="track"><div class="fill" style="width:${byCat[id]/max*100}%"></div></div><span class="h num">${fmtH(byCat[id])} j</span></div>`).join('')
    :`<div class="empty">Belum ada kegiatan ${catRange==='week'?'minggu':'bulan'} ini.</div>`;

  const from=ymd(addDays(now,-7));
  const att=ev.filter(e=>e.status==='rencana'&&e.date>=from&&isPast(e)).sort(sortEv).reverse();
  $('attList').innerHTML=att.length?att.slice(0,5).map(e=>`<li style="${catStyle(e.cat)}"><span class="ev" style="flex:1;min-width:0"><span class="bar"></span><span class="body"><span class="title">${esc(e.title)}</span><span class="sub">${fDayShort.format(parse(e.date))} · ${e.start}</span></span></span>
    <span class="acts"><button class="btn tonal small" data-status="selesai" data-id="${esc(e.id)}">Selesai</button><button class="btn text small" data-status="batal" data-id="${esc(e.id)}">Batal</button></span></li>`).join('')+(att.length>5?`<li class="empty">+${att.length-5} lainnya di tampilan Jadwal</li>`:'')
    :'<li class="empty">Semua kegiatan yang lewat sudah ditandai.</li>';

  const t0=midnight(now);
  $('upList').innerHTML=upcoming.length?upcoming.slice(0,8).map(e=>{
    const d=parse(e.date),days=Math.round((d-t0)/864e5);
    let c=days===1?'Besok':days+' hari lagi';
    if(days===0){const m=mins(e.start)-nowM;c=m<60?m+' menit lagi':Math.floor(m/60)+' jam lagi'}
    return `<li><div class="datebox"><div class="m">${fMonShort.format(d)}</div><div class="d num">${d.getDate()}</div></div>${evButton(e,`<span class="num">${e.start}–${e.end}</span>`)}<span class="count ${days<=1?'soon':''}">${c}</span></li>`;
  }).join(''):'<li class="empty" style="display:block">Tidak ada kegiatan dalam 14 hari ke depan.</li>';

  const ws2=addDays(ws,weekOff*7), days=[...Array(7)].map((_,i)=>addDays(ws2,i));
  const wEv=inRange(ev,ymd(ws2),ymd(days[6])).filter(active);
  const per=days.map(d=>{const s=ymd(d),l=wEv.filter(e=>e.date===s),byC={};l.forEach(e=>{const k=catKey(e.cat);byC[k]=(byC[k]||0)+dur(e)});return {d,s,total:sum(l),byC}});
  const wmax=Math.max(240,...per.map(p=>p.total));
  const label=weekOff===0?'Minggu ini':weekOff===1?'Minggu depan':weekOff===-1?'Minggu lalu':(weekOff>0?weekOff+' minggu lagi':(-weekOff)+' minggu lalu');
  $('weekRange').textContent=rangeLabel(ws2,days[6]);
  $('wNow').disabled=weekOff===0;
  const busiest=per.reduce((a,b)=>b.total>a.total?b:a,per[0]);
  $('weekMeta').textContent=label+' · '+fmtH(sum(wEv))+' jam'+(busiest.total?' · terpadat '+fWd.format(busiest.d):'');
  $('weekLoad').innerHTML=per.map(p=>`<button class="wday ${p.s===today?'today':''}" data-day="${p.s}" title="${fDayShort.format(p.d)}: ${fmtH(p.total)} jam">
    <span class="hrs num">${p.total?fmtH(p.total):'–'}</span>
    <span class="col">${catOrder(p.byC).map(id=>`<i style="${catStyle(id)};background:var(--cat);height:${p.byC[id]/wmax*100}%"></i>`).join('')}</span>
    <span class="dn">${fWd.format(p.d)} ${p.d.getDate()}</span></button>`).join('');
  const usedIds=[...new Set(per.flatMap(p=>catOrder(p.byC)))];
  $('weekLegend').innerHTML=usedIds.map(id=>`<span class="catdot" style="${catStyle(id)}">${esc(catLabel(id))}</span>`).join('');
}

function render(){
  now=new Date();
  $('main').classList.toggle('loading',!loaded&&!loadErr);
  renderTitle();renderMini();renderCatVis();renderBanner();
  if(!$('catOv').hidden)renderCatManager();
  if(!loaded){
    $('stats').innerHTML='';
    $('hello').innerHTML='';
    const wait=loadErr?'Jadwal belum bisa dimuat.':'Memuat jadwal…';
    ['todayList','attList','upList'].forEach(id=>$(id).innerHTML=`<li class="empty">${wait}</li>`);
  }
  if(openDayStr&&!$('dayOv').hidden)openDay(openDayStr);
  if(detailId&&!$('detOv').hidden)openDetail(detailId);
  if(view==='day'||view==='x3'||view==='week')renderGrid();
  else if(view==='month')renderMonth();
  else if(view==='schedule')renderList();
  else if(loaded)renderDashboard();
}

/* ---------- navigation ---------- */
const VIEW_SECTION={day:'grid',x3:'grid',week:'grid',month:'month',schedule:'schedule',summary:'summary'};
function setView(v){
  if(!VIEWS[v])return;
  view=v;scrollPending=true;
  if(CAL_VIEWS.includes(v)){lastCalView=v;store.set('agenda-cal-view',v)}
  ['grid','month','schedule','summary'].forEach(x=>$('view-'+x).hidden=x!==VIEW_SECTION[v]);
  store.set('agenda-saya-view',v);
  history.replaceState(null,'','#'+v);
  renderViewMenu();play($('view-'+VIEW_SECTION[v]),'enter',1000);
  $('main').scrollTop=0;
  render();
}
function goto(d){cursor=midnight(d);miniMonth=new Date(cursor.getFullYear(),cursor.getMonth(),1);scrollPending=true;render()}
function step(dir){
  if(view==='day')goto(addDays(cursor,dir));
  else if(view==='x3')goto(addDays(cursor,3*dir));
  else if(view==='week')goto(addDays(cursor,7*dir));
  else if(view==='month')goto(new Date(cursor.getFullYear(),cursor.getMonth()+dir,1));
  if(CAL_VIEWS.includes(view))play(view==='month'?$('monthGrid'):$('tg'),dir>0?'slide-next':'slide-prev',320);
}
function openDayView(s){goto(parse(s));setView('day');closeDrawer()}
$('todayBtn').onclick=()=>{weekOff=0;goto(new Date())};
$('prevBtn').onclick=()=>step(-1);
$('nextBtn').onclick=()=>step(1);

function toggleViewMenu(open){
  const m=$('viewMenu'),show=open??m.hidden;
  m.hidden=!show;$('viewBtn').setAttribute('aria-expanded',show);
  if(show)(m.querySelector('[aria-checked="true"]')||m.querySelector('button'))?.focus();
}
$('viewBtn').onclick=e=>{e.stopPropagation();toggleViewMenu()};
$('viewMenu').addEventListener('click',e=>{const b=e.target.closest('[data-view]');if(b){toggleViewMenu(false);setView(b.dataset.view)}});
$('viewMenu').addEventListener('keydown',e=>{
  if(e.key!=='ArrowDown'&&e.key!=='ArrowUp')return;
  e.preventDefault();
  const items=[...$('viewMenu').querySelectorAll('button')],i=items.indexOf(document.activeElement);
  items[(i+(e.key==='ArrowDown'?1:-1)+items.length)%items.length].focus();
});
document.addEventListener('click',e=>{if(!$('viewMenu').hidden&&!e.target.closest('.menuwrap'))toggleViewMenu(false)});

function closeDrawer(){$('shell').classList.remove('drawer');$('sideScrim').hidden=true}
$('menuBtn').onclick=()=>{
  if(mqMobile.matches){const open=!$('shell').classList.contains('drawer');$('shell').classList.toggle('drawer',open);$('sideScrim').hidden=!open}
  else{const c=$('shell').classList.toggle('collapsed');store.set('agenda-sidebar',c?'0':'1')}
};
$('sideScrim').onclick=closeDrawer;
if(store.get('agenda-sidebar')==='0')$('shell').classList.add('collapsed');

$('mini').addEventListener('click',e=>{
  const m=e.target.closest('[data-mini]');
  if(m){miniMonth=new Date(miniMonth.getFullYear(),miniMonth.getMonth()+Number(m.dataset.mini),1);renderMini();return}
  const d=e.target.closest('[data-mini-day]');
  if(d){
    const date=parse(d.dataset.miniDay);
    if(view==='schedule'||view==='summary')view='day';
    goto(date);setView(view);closeDrawer();
  }
});
$('catVis').addEventListener('change',e=>{
  const c=e.target.closest('[data-catvis]');if(!c)return;
  if(c.checked)hiddenCats.delete(c.dataset.catvis);else hiddenCats.add(c.dataset.catvis);
  store.set('agenda-hidden-cats',JSON.stringify([...hiddenCats]));
  render();
});
$('searchBtn').onclick=()=>{setView('schedule');$('fperiod').value='all';renderList();$('fq').focus()};

// click on empty time slot -> create event there
$('tg').addEventListener('click',e=>{
  if(e.target.closest('.tev'))return;
  const col=e.target.closest('.tg-col');if(!col)return;
  const H=col.offsetHeight/24,y=e.clientY-col.getBoundingClientRect().top;
  const m=Math.min(23*60,Math.floor(y/H*2)*30);
  openForm(null,col.dataset.slot,pad(Math.floor(m/60))+':'+pad(m%60));
});

/* ---------- event detail ---------- */
const linkify=s=>esc(s).replace(/\bhttps?:\/\/[^\s<]+[^\s<.,;:!?)\]'"]/g,u=>`<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`);
function openDetail(id){
  const e=events().find(x=>x.id===id);
  if(!e){closeDetail();return}
  detailId=id;
  const grp=e.groupId?events().filter(x=>x.groupId===e.groupId).length:0;
  $('detBody').innerHTML=`
    <div class="det-row" style="${catStyle(e.cat)}"><span class="det-sw"></span><div><h2 id="detTitle" class="${e.status==='batal'?'strike':''}">${esc(e.title)}</h2><div class="det-when">${fDayShort.format(parse(e.date))} · ${e.start} – ${e.end} <span class="num">(${fmtH(dur(e))} jam)</span></div></div></div>
    <div class="det-row"><span class="ms">sell</span><span>${esc(catLabel(e.cat))}</span></div>
    ${grp>1?`<div class="det-row"><span class="ms">event_repeat</span><span>Bagian dari kegiatan berulang (${grp} kegiatan)</span></div>`:''}
    ${e.notes?`<div class="det-row"><span class="ms">notes</span><div class="det-notes">${linkify(e.notes)}</div></div>`:''}
    <div class="det-row"><span class="ms">check_circle</span><div class="seg" role="group" aria-label="Status">${Object.entries(STATUS).map(([k,v])=>`<button data-status="${k}" data-id="${esc(e.id)}" aria-pressed="${e.status===k}">${v}</button>`).join('')}</div></div>`;
  if(!$('detDel').dataset.confirm)$('detDel').innerHTML='';
  $('detOv').hidden=false;
}
function closeDetail(){
  $('detOv').hidden=true;detailId=null;$('detDel').innerHTML='';delete $('detDel').dataset.confirm;
  if(returnDay){const d=returnDay;returnDay=null;openDay(d)}
}
function showDetail(id){
  if(!$('dayOv').hidden){returnDay=openDayStr;$('dayOv').hidden=true}
  delete $('detDel').dataset.confirm;
  openDetail(id);
}
$('detOv').addEventListener('click',e=>{
  const b=e.target.closest('[data-det]');if(!b)return;
  const ev=events().find(x=>x.id===detailId);if(!ev)return;
  if(b.dataset.det==='edit'){$('detOv').hidden=true;detailId=null;$('detDel').innerHTML='';openForm(ev);return}
  $('detDel').dataset.confirm='1';$('detDel').innerHTML=delMarkup(ev,true);
});

/* ---------- delete (shared by detail + form) ---------- */
function delMarkup(ev,confirming){
  const grp=ev.groupId&&events().filter(x=>x.groupId===ev.groupId).length>1;
  return confirming
    ?`<span>Hapus kegiatan ini?</span><button type="button" class="btn small danger" data-del="one">Ya, hapus</button>${grp?'<button type="button" class="btn small danger" data-del="all">Hapus semua berulang</button>':''}<button type="button" class="btn small text" data-del="no">Tidak</button>`
    :'<button type="button" class="btn danger" data-del="ask">Hapus</button>';
}
async function handleDel(zone,ev,action,done){
  if(action==='ask'){zone.innerHTML=delMarkup(ev,true);return}
  if(action==='no'){zone.innerHTML=zone===$('detDel')?'':delMarkup(ev,false);delete zone.dataset.confirm;return}
  const ids=action==='all'?events().filter(x=>x.groupId===ev.groupId).map(x=>x.id):[ev.id];
  try{await removeMany(ids);done();toast(ids.length>1?ids.length+' kegiatan dihapus':'Dihapus')}catch(err){toast('Gagal menghapus. '+err.message)}
}
$('delZone').addEventListener('click',e=>{const b=e.target.closest('[data-del]');if(b&&editing)handleDel($('delZone'),editing,b.dataset.del,closeForm)});
$('detDel').addEventListener('click',e=>{
  const b=e.target.closest('[data-del]');const ev=events().find(x=>x.id===detailId);
  if(b&&ev)handleDel($('detDel'),ev,b.dataset.del,closeDetail);
});

/* ---------- event form ---------- */
function renderCatPick(selected){
  $('f-cats').innerHTML=cats.length?cats.map(c=>`<label style="--cat:var(--${c.color})"><input type="radio" name="cat" id="f-cat-${esc(c.id)}" value="${esc(c.id)}" ${c.id===selected?'checked':''}><span>${esc(c.label)}</span></label>`).join('')
    +`<label style="--cat:var(--faint)"><input type="radio" name="cat" id="f-cat-none" value="" ${!getCat(selected)?'checked':''}><span>Tanpa kategori</span></label>`
    :'<span class="note">Belum ada kategori. Tambahkan lewat "Kelola kategori".</span>';
}
function defaultUntil(){
  const d=parse($('f-date').value||ymd(now)),r=$('f-repeat').value;
  return ymd(r==='weekly'?addMonths(d,3):r==='monthly'?addMonths(d,6):addMonths(d,1));
}
function occurrences(start,rep,until){
  const out=[],d0=parse(start),u=parse(until);
  if(rep==='none')return [start];
  for(let i=0;out.length<MAX_REPEAT+1&&i<2000;i++){
    let d;
    if(rep==='daily'||rep==='weekdays')d=addDays(d0,i);
    else if(rep==='weekly')d=addDays(d0,i*7);
    else d=addMonths(d0,i);
    if(d>u)break;
    if(rep==='weekdays'&&(d.getDay()===0||d.getDay()===6))continue;
    out.push(ymd(d));
  }
  return out;
}
function updateRepeatUI(){
  const r=$('f-repeat').value;
  $('untilWrap').hidden=r==='none'||!!editing;
  if(r==='none'||editing)return;
  if(!$('f-until').value||$('f-until').value<$('f-date').value)$('f-until').value=defaultUntil();
  const n=occurrences($('f-date').value,r,$('f-until').value).length;
  $('repPreview').textContent=n>MAX_REPEAT?`Terlalu banyak (${MAX_REPEAT}+). Maksimal ${MAX_REPEAT} kegiatan, majukan tanggal akhir.`:`Akan dibuat ${n} kegiatan`;
}
function openForm(e,date,startTime){
  editing=e||null;
  closeDrawer();
  $('mTitle').textContent=e?'Ubah kegiatan':'Tambah kegiatan';
  $('f-title').value=e?e.title:'';
  $('f-date').value=e?e.date:(date||ymd(now));
  let s='09:00',en='10:00';
  if(startTime){const m=mins(startTime);s=startTime;const m2=Math.min(m+60,23*60+59);en=pad(Math.floor(m2/60))+':'+pad(m2%60)}
  else if(!e&&(!date||date===ymd(now))){const h=Math.min(22,now.getHours()+1);s=pad(h)+':00';en=pad(h+1)+':00'}
  $('f-start').value=e?e.start:s;$('f-end').value=e?e.end:en;
  renderCatPick(e?e.cat:(cats[0]?.id||''));
  $('f-status').value=e?e.status:'rencana';
  $('f-notes').value=e?(e.notes||''):'';
  $('f-repeat').value='none';$('f-until').value='';$('repeatWrap').hidden=!!e;
  updateRepeatUI();
  $('f-err').hidden=true;
  $('delZone').innerHTML=e?delMarkup(e,false):'';
  $('formOv').hidden=false;
  setTimeout(()=>$('f-title').focus(),30);
}
function closeForm(){
  $('formOv').hidden=true;editing=null;
  if(returnDay){const d=returnDay;returnDay=null;openDay(d)}
}
$('f-repeat').addEventListener('change',()=>{$('f-until').value=defaultUntil();updateRepeatUI()});
$('f-until').addEventListener('input',updateRepeatUI);
$('f-date').addEventListener('input',updateRepeatUI);

$('evForm').addEventListener('submit',async ev=>{
  ev.preventDefault();
  const title=$('f-title').value.trim(),date=$('f-date').value,start=$('f-start').value,end=$('f-end').value;
  const err=m=>{$('f-err').textContent=m;$('f-err').hidden=false};
  if(!title)return err('Isi judul kegiatan.');
  if(!date)return err('Pilih tanggal.');
  if(!start||!end)return err('Isi jam mulai dan selesai.');
  if(mins(end)<=mins(start))return err('Jam selesai harus setelah jam mulai.');
  const catIn=document.querySelector('input[name=cat]:checked');
  const base={title,date,start,end,cat:catIn?catIn.value:'',status:$('f-status').value,notes:$('f-notes').value.trim()};
  let list;
  const wasNew=!editing;
  if(editing){list=[{...editing,...base}]}
  else{
    const rep=$('f-repeat').value;
    if(rep!=='none'&&(!$('f-until').value||$('f-until').value<date))return err('Tanggal akhir pengulangan harus setelah tanggal mulai.');
    const dates=occurrences(date,rep,$('f-until').value||date);
    if(dates.length>MAX_REPEAT)return err(`Maksimal ${MAX_REPEAT} kegiatan sekali buat. Majukan tanggal akhir pengulangan.`);
    const gid=dates.length>1?uid():null;
    list=dates.map((d,i)=>{const e={id:uid(),...base,date:d,createdAt:Date.now()};if(gid)e.groupId=gid;if(i>0)e.status='rencana';return e});
  }
  $('saveBtn').disabled=true;$('saveBtn').textContent=list.length>1?'Menyimpan '+list.length+'…':'Menyimpan…';
  try{
    await saveMany(list);
    if(returnDay)returnDay=list[0].date;
    closeForm();
    toast(wasNew&&list.length>1?list.length+' kegiatan ditambahkan':'Tersimpan');
  }catch(e){err('Gagal menyimpan. '+e.message)}
  finally{$('saveBtn').disabled=false;$('saveBtn').textContent='Simpan'}
});

/* ---------- category manager ---------- */
let cmState={palette:null,del:null};
function catCount(id){return events().filter(e=>e.cat===id).length}
function renderCatManager(){
  $('cmList').innerHTML=cats.length?cats.map(c=>{
    const n=catCount(c.id);
    let extra='';
    if(cmState.palette===c.id)extra=`<div class="palette">${PALETTE.map(p=>`<button type="button" style="--cat:var(--${p})" aria-label="Warna ${PALETTE_NAMES[p]}" title="${PALETTE_NAMES[p]}" aria-pressed="${p===c.color}" data-color="${p}" data-cid="${esc(c.id)}"></button>`).join('')}</div>`;
    if(cmState.del===c.id){
      const others=cats.filter(x=>x.id!==c.id);
      extra=`<div class="cmdel">${n?`<span>${n} kegiatan di "${esc(c.label)}" dipindahkan ke</span><select id="cmMove">${others.map(o=>`<option value="${esc(o.id)}">${esc(o.label)}</option>`).join('')}<option value="">Tanpa kategori</option></select>`:`<span>Hapus kategori "${esc(c.label)}"?</span>`}
        <button type="button" class="btn small danger" data-cmdel-yes="${esc(c.id)}">Hapus kategori</button><button type="button" class="btn small text" data-cmdel-no>Batal</button></div>`;
    }
    return `<div class="cmrow" style="--cat:var(--${c.color})">
      <button type="button" class="sw" data-swatch="${esc(c.id)}" aria-label="Ganti warna ${esc(c.label)}" title="Ganti warna"></button>
      <input id="cm-name-${esc(c.id)}" value="${esc(c.label)}" maxlength="30" data-rename="${esc(c.id)}" aria-label="Nama kategori">
      <span class="cnt num">${n} kegiatan</span>
      <button type="button" class="icon-btn sm" data-cmdel="${esc(c.id)}" aria-label="Hapus ${esc(c.label)}" title="Hapus"><span class="ms">delete</span></button>${extra}</div>`;
  }).join(''):'<div class="empty">Belum ada kategori.</div>';
}
function openCats(){cmState={palette:null,del:null};renderCatManager();$('catOv').hidden=false;closeDrawer()}
function closeCats(){$('catOv').hidden=true;if(!$('formOv').hidden){const cur=document.querySelector('input[name=cat]:checked');renderCatPick(cur?cur.value:'')}}
$('cmList').addEventListener('click',async e=>{
  const sw=e.target.closest('[data-swatch]');
  if(sw){cmState.palette=cmState.palette===sw.dataset.swatch?null:sw.dataset.swatch;cmState.del=null;return renderCatManager()}
  const col=e.target.closest('[data-color]');
  if(col){const next=cats.map(c=>c.id===col.dataset.cid?{...c,color:col.dataset.color}:c);cmState.palette=null;try{await saveCats(next)}catch(er){toast('Gagal menyimpan kategori')}return}
  const d=e.target.closest('[data-cmdel]');
  if(d){cmState.del=d.dataset.cmdel;cmState.palette=null;return renderCatManager()}
  if(e.target.closest('[data-cmdel-no]')){cmState.del=null;return renderCatManager()}
  const y=e.target.closest('[data-cmdel-yes]');
  if(y){
    const id=y.dataset.cmdelYes,target=$('cmMove')?$('cmMove').value:'';
    y.disabled=true;
    try{
      const moved=events().filter(x=>x.cat===id).map(x=>({...x,cat:target}));
      if(moved.length)await saveMany(moved);
      cmState.del=null;
      await saveCats(cats.filter(c=>c.id!==id));
      toast(moved.length?`Kategori dihapus, ${moved.length} kegiatan dipindahkan`:'Kategori dihapus');
    }catch(er){toast('Gagal menghapus kategori. Coba lagi.');y.disabled=false}
  }
});
$('cmList').addEventListener('change',async e=>{
  const inp=e.target.closest('[data-rename]');if(!inp)return;
  const v=inp.value.trim(),id=inp.dataset.rename;
  if(!v){inp.value=getCat(id)?.label||'';return toast('Nama kategori tidak boleh kosong')}
  if(v===getCat(id)?.label)return;
  try{await saveCats(cats.map(c=>c.id===id?{...c,label:v}:c));toast('Nama kategori diubah')}catch(er){toast('Gagal menyimpan kategori')}
});
$('cmList').addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.matches('[data-rename]')){e.preventDefault();e.target.blur()}});
$('cmAdd').addEventListener('submit',async e=>{
  e.preventDefault();
  const v=$('cmNew').value.trim();if(!v)return;
  if(cats.some(c=>c.label.toLowerCase()===v.toLowerCase()))return toast('Kategori itu sudah ada');
  const used=cats.map(c=>c.color),color=PALETTE.find(p=>!used.includes(p))||PALETTE[cats.length%PALETTE.length];
  try{await saveCats([...cats,{id:'c'+uid().replace(/-/g,'').slice(0,10),label:v,color}]);$('cmNew').value='';toast('Kategori ditambahkan')}catch(er){toast('Gagal menyimpan kategori')}
});

/* ---------- AI assistant ---------- */
const AI_CHIPS=[
  {t:'Ringkas minggu ini',d:'Apa saja yang sudah dan akan saya kerjakan',p:'Buat ringkasan minggu ini: apa yang sudah terlaksana, apa yang tersisa, dan berapa jam per kategori. Tutup dengan 1–2 hal yang perlu saya perhatikan.'},
  {t:'Evaluasi bulan ini',d:'Tingkat penyelesaian dan pola',p:'Evaluasi bulan ini: tingkat penyelesaian kegiatan, kategori yang paling banyak memakan waktu, kegiatan yang sering dibatalkan/ditunda, dan pola yang terlihat. Beri 3 saran konkret.'},
  {t:'Cek keseimbangan',d:'Kerja vs pribadi vs istirahat',p:'Apakah jadwal saya 30 hari terakhir dan 14 hari ke depan seimbang antara kerja/studi, kesehatan, keluarga, dan waktu pribadi? Tunjukkan angka jam per kategori dan beri saran penyesuaian.'},
  {t:'Hari terlalu padat',d:'Deteksi hari overload & bentrok',p:'Periksa 14 hari ke depan: hari mana yang terlalu padat (lebih dari 8 jam atau tanpa jeda), dan apakah ada kegiatan yang jamnya bertabrakan. Sarankan apa yang bisa digeser.'},
  {t:'Cari waktu kosong',d:'Slot luang minggu depan',p:'Cari slot waktu kosong minimal 2 jam antara jam 08:00–21:00 di minggu depan (Senin–Minggu). Tampilkan per hari.'},
];
const AI_MAX_LINES=250; // keeps the prompt within free-tier token-per-minute limits
let aiTurns=[], aiBusy=false, aiCtl=null;
let aiProv=store.get('agenda-ai-provider'), aiProviders=null;
async function loadProviders(){
  if(aiProviders)return;
  try{
    const r=await api('ai');
    aiProviders=r.providers;
    const ok=id=>aiProviders.some(p=>p.id===id&&p.available);
    if(!ok(aiProv))aiProv=ok(r.default)?r.default:(aiProviders.find(p=>p.available)?.id||r.default);
  }catch(e){aiProviders=null}
  renderProv();
}
function renderProv(){
  document.querySelectorAll('#aiProv [data-prov]').forEach(b=>{
    const p=aiProviders?.find(x=>x.id===b.dataset.prov);
    b.setAttribute('aria-pressed',b.dataset.prov===aiProv);
    b.setAttribute('aria-checked',b.dataset.prov===aiProv);
    b.disabled=aiBusy||(aiProviders?!p?.available:false);
    b.title=p?(p.available?p.model:'API key '+p.name+' belum diatur di server'):'';
  });
  const cur=aiProviders?.find(p=>p.id===aiProv);
  $('aiModel').textContent=cur?cur.model:'';
}
$('aiProv').addEventListener('click',e=>{
  const b=e.target.closest('[data-prov]');if(!b||b.disabled)return;
  aiProv=b.dataset.prov;store.set('agenda-ai-provider',aiProv);renderProv();
  toast('Asisten sekarang memakai '+b.textContent);
});
const provName=id=>aiProviders?.find(p=>p.id===id)?.name||id;
let aiRefs=new Map(); // "#n" shown to the model -> real event id
function aiContext(){
  const ev=events(),from=ymd(addDays(now,-60)),to=ymd(addDays(now,60)),t0=midnight(now);
  const dist=e=>Math.abs(parse(e.date)-t0);
  const picked=inRange(ev,from,to).sort((a,b)=>dist(a)-dist(b)).slice(0,AI_MAX_LINES).sort(sortEv);
  aiRefs=new Map();
  const lines=picked.map((e,i)=>{aiRefs.set(String(i+1),e.id);return `#${i+1} ${e.date} ${fWd.format(parse(e.date))} ${e.start}-${e.end} | ${catLabel(e.cat)} | ${e.title} | ${STATUS[e.status]}${e.notes?' | catatan: '+e.notes.replace(/\s+/g,' ').slice(0,100):''}`});
  const ws=weekStart(now);
  return `Kamu asisten jadwal pribadi di aplikasi "Agenda Saya". Jawab dalam Bahasa Indonesia yang santai tapi jelas, ringkas dan praktis.
Aturan:
- Gunakan HANYA data kegiatan di bawah. Jika data tidak cukup untuk menjawab, katakan terus terang.
- Hitung jam dengan teliti dari jam mulai-selesai. Kegiatan berstatus Dibatalkan tidak dihitung sebagai waktu terpakai.
- Format: paragraf pendek dan poin berawalan "- ". Boleh **tebal** dan subjudul "### ". Jangan pakai tabel.
- Kamu BISA mengusulkan perubahan jadwal (tambah/ubah/hapus) lewat alat usulkan_perubahan_jadwal. Pengguna akan menyetujui atau menolak tiap usulan, jadi jangan bilang jadwal sudah berubah; sebut sebagai "usulan".
- Pakai alat HANYA jika pengguna jelas meminta menambah, mengubah, memindahkan, atau menghapus kegiatan. Untuk analisis atau pertanyaan biasa, jawab dengan teks saja.
- Untuk ubah/hapus, isi "ref" dengan nomor kegiatan dari data (mis. "#12"). Untuk ubah, isi hanya kolom yang berubah. Jangan menebak: jika kegiatan yang dimaksud tidak jelas atau ada beberapa kemungkinan, tanyakan dulu.
- Tanggal relatif (besok, lusa, Kamis depan) ubah menjadi YYYY-MM-DD berdasarkan waktu sekarang. Jam format 24 jam HH:MM. Kategori harus salah satu dari daftar kategori.
- Setelah memanggil alat, tulis 1-2 kalimat ringkasan.

Waktu sekarang: ${fDay.format(now)}, pukul ${pad(now.getHours())}:${pad(now.getMinutes())}. Tanggal hari ini (ISO): ${ymd(now)}.
Minggu ini: ${rangeLabel(ws,addDays(ws,6))} (Senin–Minggu).
Kalender 14 hari ke depan (pakai ini untuk mengubah "besok", "Kamis", "Jumat depan", dll menjadi tanggal): ${[...Array(14)].map((_,i)=>{const d=addDays(t0,i);return `${fWdLong.format(d)} ${ymd(d)}${i===0?' (hari ini)':i===1?' (besok)':i===2?' (lusa)':''}`}).join(', ')}.
Kategori: ${cats.map(c=>c.label).join(', ')||'(belum ada)'}.

Data kegiatan (${lines.length} baris${picked.length===AI_MAX_LINES?', dibatasi ke yang paling dekat dengan hari ini':''}, ${from} s/d ${to}; tiap baris diawali nomor #n):
${lines.join('\n')||'(tidak ada kegiatan)'}`;
}
function md(s){
  const out=[];let list=null;
  const inline=t=>esc(t).replace(/\*\*(.+?)\*\*/g,'<b>$1</b>').replace(/(^|[^*])\*([^*\s][^*]*?)\*(?!\*)/g,'$1<i>$2</i>');
  const flush=()=>{if(list){out.push(`<${list.tag}>${list.items.join('')}</${list.tag}>`);list=null}};
  for(const raw of s.split('\n')){
    const l=raw.trim();
    let m;
    if(!l){flush();continue}
    if((m=l.match(/^#{1,4}\s+(.*)/))){flush();out.push(`<h4>${inline(m[1])}</h4>`);continue}
    if((m=l.match(/^[-*•]\s+(.*)/))){if(!list||list.tag!=='ul'){flush();list={tag:'ul',items:[]}}list.items.push(`<li>${inline(m[1])}</li>`);continue}
    if((m=l.match(/^\d+[.)]\s+(.*)/))){if(!list||list.tag!=='ol'){flush();list={tag:'ol',items:[]}}list.items.push(`<li>${inline(m[1])}</li>`);continue}
    flush();out.push(`<p>${inline(l)}</p>`);
  }
  flush();return out.join('');
}
/* ---- AI proposals: the model only suggests, the user presses Terapkan ---- */
const OP_LABEL={tambah:'Tambah',ubah:'Ubah',hapus:'Hapus'};
const whenOf=e=>`${fWd.format(parse(e.date))}, ${fDM.format(parse(e.date))} · ${e.start}–${e.end}`;
const clockAfter=(start,minutes)=>{const m=mins(start)+minutes;return m<1440?pad(Math.floor(m/60))+':'+pad(m%60):null};
function buildProposals(raw){
  const out=[];
  raw.slice(0,20).forEach((a,i)=>{
    const p={key:'p'+i+'-'+Date.now().toString(36),op:a.op,reason:a.alasan||'',status:'pending',warn:[]};
    out.push(p);
    const fail=msg=>{p.status='invalid';p.error=msg;p.title=p.title||a.judul||''};
    const catId=a.kategori?cats.find(c=>c.label.toLowerCase()===a.kategori.toLowerCase())?.id:undefined;
    if(a.kategori&&catId===undefined)p.warn.push(`Kategori "${a.kategori}" tidak ditemukan.`);
    if(a.op==='tambah'){
      if(!a.judul||!a.tanggal||!a.mulai||!a.selesai)return fail('Usulan kurang lengkap (judul, tanggal, atau jam).');
      if(a.selesai<=a.mulai)return fail('Jam selesai harus setelah jam mulai.');
      p.next={id:uid(),title:a.judul,date:a.tanggal,start:a.mulai,end:a.selesai,cat:catId??'',status:a.status||'rencana',notes:a.catatan||'',createdAt:Date.now()};
      p.title=a.judul;
      return;
    }
    const id=aiRefs.get(String(a.ref||'').replace(/^#/,''));
    const ev=id&&events().find(e=>e.id===id);
    if(!ev)return fail('Kegiatan yang dimaksud tidak ditemukan di jadwal.');
    p.id=ev.id;p.before=ev;p.title=ev.title;
    if(a.op==='hapus')return;
    const patch={};
    if(a.judul&&a.judul!==ev.title)patch.title=a.judul;
    if(a.tanggal&&a.tanggal!==ev.date)patch.date=a.tanggal;
    if(a.mulai&&a.mulai!==ev.start)patch.start=a.mulai;
    if(a.selesai&&a.selesai!==ev.end)patch.end=a.selesai;
    if(patch.start&&!patch.end&&!a.selesai){const e2=clockAfter(patch.start,dur(ev));if(e2)patch.end=e2} // moved start only: keep the duration
    if(catId!==undefined&&catId!==ev.cat)patch.cat=catId;
    if(a.status&&a.status!==ev.status)patch.status=a.status;
    if(a.catatan!==undefined&&a.catatan!==(ev.notes||''))patch.notes=a.catatan;
    if(!Object.keys(patch).length)return fail('Tidak ada yang berubah dari kegiatan ini.');
    const next={...ev,...patch};
    if(next.end<=next.start)return fail('Jam selesai harus setelah jam mulai.');
    p.patch=patch;p.next=next;
  });
  // overlap warnings, ignoring events that are being deleted in the same batch
  const gone=new Set(out.filter(p=>p.op==='hapus'&&p.id).map(p=>p.id));
  out.forEach(p=>{
    if(!p.next||p.status==='invalid'||p.next.status==='batal')return;
    events().filter(e=>e.id!==p.next.id&&!gone.has(e.id)&&e.date===p.next.date&&active(e)&&mins(e.start)<mins(p.next.end)&&mins(p.next.start)<mins(e.end))
      .slice(0,2).forEach(e=>p.warn.push(`Bentrok dengan "${e.title}" (${e.start}–${e.end}).`));
  });
  return out;
}
function proposalHtml(p,ti){
  const a=(act,label,cls)=>`<button type="button" class="btn small ${cls}" data-aact="${act}" data-aturn="${ti}" data-akey="${p.key}"${p.status==='working'?' disabled':''}>${label}</button>`;
  let body='';
  if(p.status==='invalid')body=`<div class="adet bad">${esc(p.error)}</div>`;
  else if(p.op==='tambah')body=`<div class="adet">${esc(whenOf(p.next))}${p.next.cat?' · '+esc(catLabel(p.next.cat)):''}</div>`;
  else if(p.op==='hapus')body=`<div class="adet">${esc(whenOf(p.before))}${p.before.groupId?' · hanya kegiatan ini, bukan seluruh seri berulang':''}</div>`;
  else{
    const c=p.patch,rows=[];
    if(c.date||c.start||c.end)rows.push(['Waktu',whenOf(p.before),whenOf(p.next)]);
    if(c.title)rows.push(['Judul',p.before.title,p.next.title]);
    if(c.cat!==undefined)rows.push(['Kategori',catLabel(p.before.cat),catLabel(p.next.cat)]);
    if(c.status)rows.push(['Status',STATUS[p.before.status],STATUS[p.next.status]]);
    if(c.notes!==undefined)rows.push(['Catatan',p.before.notes||'(kosong)',p.next.notes||'(kosong)']);
    body=rows.map(([l,o,n])=>`<div class="adet"><span class="alab">${l}</span><s>${esc(o)}</s> → <b>${esc(n)}</b></div>`).join('');
  }
  const warn=p.status==='invalid'?'':p.warn.map(w=>`<div class="awarn"><span class="ms">schedule</span>${esc(w)}</div>`).join('');
  let acts='';
  if(p.status==='pending')acts=a('apply','Terapkan','primary')+a('reject','Tolak','text');
  else if(p.status==='working')acts='<span class="astate">Menerapkan…</span>';
  else if(p.status==='applied')acts='<span class="astate ok">Diterapkan</span>'+a('undo','Urungkan','text');
  else if(p.status==='rejected')acts='<span class="astate">Ditolak</span>';
  return `<div class="acard ${p.status}"><div class="ahead"><span class="aop ${p.op}">${OP_LABEL[p.op]}</span><b class="atitle">${esc(p.title||'(tanpa judul)')}</b></div>${body}${warn}${p.reason&&p.status!=='invalid'?`<div class="areason">${esc(p.reason)}</div>`:''}${acts?`<div class="aacts">${acts}</div>`:''}</div>`;
}
function proposalsHtml(t,ti){
  const pend=t.proposals.filter(p=>p.status==='pending');
  const foot=pend.length>1?`<div class="afoot"><button type="button" class="btn small tonal" data-aact="apply-all" data-aturn="${ti}">Terapkan semua (${pend.length})</button><button type="button" class="btn small text" data-aact="reject-all" data-aturn="${ti}">Tolak semua</button></div>`:'';
  return `<div class="aprops"><div class="aprops-h">Usulan perubahan · ${t.proposals.length}</div>${t.proposals.map(p=>proposalHtml(p,ti)).join('')}${foot}</div>`;
}
async function applyProposals(turn,keys){
  const todo=turn.proposals.filter(p=>keys.includes(p.key)&&p.status==='pending');
  if(!todo.length)return;
  todo.forEach(p=>p.status='working');renderAI();
  const ups=[],dels=[],upP=[],delP=[];
  for(const p of todo){
    if(p.op==='tambah'){ups.push(p.next);upP.push(p);continue}
    const cur=events().find(e=>e.id===p.id); // re-read: the event may have changed since the proposal
    if(!cur){p.status='invalid';p.error='Kegiatan ini sudah tidak ada di jadwal.';continue}
    p.snapshot=cur;
    if(p.op==='ubah'){ups.push({...cur,...p.patch});upP.push(p)}else{dels.push(cur.id);delP.push(p)}
  }
  let fail=null;
  if(ups.length){try{await saveMany(ups);upP.forEach(p=>p.status='applied')}catch(e){fail=e}}
  if(dels.length&&!fail){try{await removeMany(dels);delP.forEach(p=>p.status='applied')}catch(e){fail=e}}
  todo.forEach(p=>{if(p.status==='working')p.status='pending'});
  renderAI();
  const n=todo.filter(p=>p.status==='applied').length;
  if(fail)toast('Gagal menerapkan sebagian perubahan. '+fail.message);
  else if(n)toast(n>1?n+' perubahan diterapkan':'Perubahan diterapkan');
}
async function undoProposal(turn,key){
  const p=turn.proposals.find(x=>x.key===key);
  if(!p||p.status!=='applied')return;
  p.status='working';renderAI();
  try{
    if(p.op==='tambah')await removeMany([p.next.id]);
    else await saveMany([p.snapshot]); // ubah and hapus both restore the earlier version
    p.status='pending';toast('Perubahan diurungkan');
  }catch(e){p.status='applied';toast('Gagal mengurungkan. '+e.message)}
  renderAI();
}

function renderAI(){
  const log=$('aiLog'),chipBtns=(cls)=>AI_CHIPS.map((c,i)=>`<button type="button" data-chip="${i}" ${aiBusy?'disabled':''}>${cls?`<b>${c.t}</b><span>${c.d}</span>`:c.t}</button>`).join('');
  if(!aiTurns.length){
    log.innerHTML=`<div class="msg bot"><p>Halo! Saya bisa membaca jadwal Anda, menganalisisnya, dan <b>mengusulkan perubahan</b> yang baru berlaku setelah Anda menekan Terapkan. Coba misalnya:</p><ul><li>Tambahkan rapat tim besok jam 10 sampai 11</li><li>Pindahkan futsal hari Kamis jadi jam 17:00</li><li>Berapa jam saya olahraga bulan ini?</li></ul></div><div class="chips">${chipBtns(true)}</div>`;
    $('aiChipRow').innerHTML='';
    return;
  }
  log.innerHTML=aiTurns.map((t,ti)=>{
    if(t.role==='user')return `<div class="msg user${t.shown?'':' new'}">${esc(t.content)}</div>`;
    const props=t.proposals?.length&&!t.pending?proposalsHtml(t,ti):'';
    const via=t.via&&!t.pending?`<div class="via"><span class="ms">auto_awesome</span>${esc(t.via)}${t.asked&&aiProviders&&t.via!==provName(t.asked)?' · dialihkan otomatis karena '+esc(provName(t.asked))+' tidak tersedia':''}</div>`:'';
    return `<div class="msg bot ${t.error?'err':''}${props?' has-props':''}${t.shown?'':' new'}">${t.pending?'<span class="thinking">Sedang menganalisis…</span>':md(t.content)}${props}${via}</div>`;
  }).join('');
  $('aiChipRow').innerHTML=chipBtns(false);
  aiTurns.forEach(t=>t.shown=true); // only brand-new bubbles animate in
  renderProv();
}
const AI_ERRORS={no_key:'API key AI belum diatur di server. Isi GROQ_API_KEY atau GEMINI_API_KEY.',rate_limited:'Batas pemakaian gratis tercapai. Coba lagi beberapa saat lagi.',too_large:'Data jadwal terlalu besar untuk model ini. Coba pertanyaan yang lebih spesifik.',bad_key:'API key AI ditolak. Periksa kembali key-nya di pengaturan server.',unauthorized:'Sesi berakhir. Silakan masuk lagi.'};
async function askAI(text){
  if(aiBusy||!text.trim())return;
  aiTurns.push({role:'user',content:text});
  const reply={role:'assistant',content:'',pending:true,asked:aiProv};aiTurns.push(reply);
  aiBusy=true;$('aiStop').hidden=false;$('aiSend').disabled=true;renderAI();
  const hist=aiTurns.filter(t=>t!==reply&&!t.error)
    .map(t=>({role:t.role,content:t.content||(t.proposals?.length?`(Mengusulkan ${t.proposals.length} perubahan jadwal.)`:'')}))
    .filter(t=>t.content).slice(-12);
  aiCtl=new AbortController();
  const bubble=()=>$('aiLog').lastElementChild;
  bubble()?.scrollIntoView({block:'end'});
  try{
    const context=aiContext(); // also rebuilds the #ref -> event id map used by buildProposals
    const r=await fetch('/api/ai',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({system:context,messages:hist,provider:aiProv||undefined}),signal:aiCtl.signal});
    if(!r.ok){let d={};try{d=await r.json()}catch(e){}if(r.status===401)showLogin();const er=new Error(d.error||'Terjadi gangguan ('+r.status+').');er.code=d.code;throw er}
    reply.via=r.headers.get('X-AI-Provider')||'';
    const onLine=line=>{
      let o;try{o=JSON.parse(line)}catch(e){return}
      if(o.type==='text'){reply.content+=o.text;reply.pending=false;const b=bubble();if(b){b.innerHTML=md(reply.content);b.scrollIntoView({block:'nearest'})}}
      else if(o.type==='actions'){reply.pending=false;reply.proposals=buildProposals(o.actions||[])}
    };
    const reader=r.body.getReader(),dec=new TextDecoder();let buf='';
    for(;;){
      const {done,value}=await reader.read();if(done)break;
      buf+=dec.decode(value,{stream:true});
      let i;while((i=buf.indexOf('\n'))>=0){const l=buf.slice(0,i).trim();buf=buf.slice(i+1);if(l)onLine(l)}
    }
    if(buf.trim())onLine(buf.trim());
    reply.pending=false;
    if(!reply.content.trim()&&!reply.proposals?.length){reply.content='Tidak ada jawaban dari AI. Coba kirim lagi.';reply.error=true}
  }catch(e){
    reply.pending=false;
    if(e.name==='AbortError')reply.content=(reply.content?reply.content+'\n\n':'')+'(Dihentikan)';
    else if(reply.content||reply.proposals?.length)reply.content+='\n\n(Koneksi terputus.)';
    else{reply.content=AI_ERRORS[e.code]||e.message||'Terjadi gangguan. Coba kirim lagi.';reply.error=true}
  }finally{
    aiBusy=false;aiCtl=null;$('aiStop').hidden=true;$('aiSend').disabled=false;renderAI();
    $('aiLog').lastElementChild?.scrollIntoView({block:'nearest'});
  }
}
function setAI(open){
  $('aiPanel').hidden=!open;$('aiBtn').setAttribute('aria-pressed',open);$('tabAI').setAttribute('aria-pressed',open);
  store.set('agenda-ai',open?'1':'0');
  if(open){renderAI();closeDrawer();loadProviders();setTimeout(()=>$('aiInput').focus(),30)}
}
$('navAI').onclick=()=>setAI(true);
$('tabAI').onclick=()=>setAI($('aiPanel').hidden);
$('aiBtn').onclick=()=>setAI($('aiPanel').hidden);
$('aiClose').onclick=()=>setAI(false);
$('aiForm').addEventListener('submit',e=>{e.preventDefault();const v=$('aiInput').value;$('aiInput').value='';$('aiInput').style.height='auto';askAI(v)});
$('aiInput').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();$('aiForm').requestSubmit()}});
$('aiInput').addEventListener('input',e=>{e.target.style.height='auto';e.target.style.height=Math.min(140,e.target.scrollHeight)+'px'});
$('aiStop').onclick=()=>aiCtl?.abort();
$('aiReset').onclick=()=>{if(aiBusy)aiCtl?.abort();aiTurns=[];renderAI()};
$('aiPanel').addEventListener('click',e=>{
  const b=e.target.closest('[data-chip]');if(b){askAI(AI_CHIPS[+b.dataset.chip].p);return}
  const ab=e.target.closest('[data-aact]');if(!ab)return;
  const turn=aiTurns[+ab.dataset.aturn];if(!turn?.proposals)return;
  const act=ab.dataset.aact,key=ab.dataset.akey;
  if(act==='apply')applyProposals(turn,[key]);
  else if(act==='apply-all')applyProposals(turn,turn.proposals.map(p=>p.key));
  else if(act==='undo')undoProposal(turn,key);
  else if(act==='reject'){const p=turn.proposals.find(x=>x.key===key);if(p&&p.status==='pending'){p.status='rejected';renderAI()}}
  else if(act==='reject-all'){turn.proposals.forEach(p=>{if(p.status==='pending')p.status='rejected'});renderAI()}
});

/* ---------- wiring ---------- */
$('dAdd').onclick=()=>{const d=openDayStr;returnDay=d;$('dayOv').hidden=true;openForm(null,d)};
$('dOpen').onclick=()=>{const d=openDayStr;closeDay();openDayView(d)};
document.body.addEventListener('click',e=>{
  const cl=e.target.closest('[data-close]');
  if(cl){({form:closeForm,day:closeDay,cats:closeCats,det:closeDetail})[cl.dataset.close]();return}
  const vg=e.target.closest('[data-view-go]');
  if(vg){
    const v=vg.dataset.viewGo;
    // the dashboard icon in the app bar toggles: click again to return to the calendar
    const back=vg.id==='dashBtn'&&view==='summary';
    setView(back||v==='calendar'?lastCalView:v);closeDrawer();return;
  }
  const op=e.target.closest('[data-open]');
  if(op){showDetail(op.dataset.open);return}
  const st=e.target.closest('[data-status]');
  if(st){setStatus(st.dataset.id,st.dataset.status);return}
  const gd=e.target.closest('[data-goday]');
  if(gd){openDayView(gd.dataset.goday);return}
  const day=e.target.closest('[data-day]');
  if(day){openDay(day.dataset.day);return}
  if(e.target.closest('[data-act="add"]'))return openForm(null,(view==='day'||view==='x3')?ymd(cursor):undefined);
  if(e.target.closest('[data-act="cats"]'))return openCats();
  if(e.target.closest('[data-act="retry"]'))return reload();
  const rg=e.target.closest('[data-range]');
  if(rg){catRange=rg.dataset.range;renderDashboard()}
});
$('monthGrid').addEventListener('keydown',e=>{const c=e.target.closest('.mcell');if(c&&e.target===c&&(e.key==='Enter'||e.key===' ')){e.preventDefault();openDay(c.dataset.day)}});
const OVERLAYS={formOv:closeForm,dayOv:closeDay,catOv:closeCats,detOv:closeDetail};
Object.keys(OVERLAYS).forEach(id=>$(id).addEventListener('click',e=>{if(e.target===$(id))OVERLAYS[id]()}));
const anyOverlay=()=>Object.keys(OVERLAYS).some(id=>!$(id).hidden)||!$('login').hidden;
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){
    if(!$('viewMenu').hidden){toggleViewMenu(false);$('viewBtn').focus();return}
    if(!$('catOv').hidden)closeCats();else if(!$('formOv').hidden)closeForm();else if(!$('detOv').hidden)closeDetail();else if(!$('dayOv').hidden)closeDay();
    else if($('shell').classList.contains('drawer'))closeDrawer();
    else if(!$('aiPanel').hidden&&mqMobile.matches)setAI(false);
    return;
  }
  if(e.ctrlKey||e.metaKey||e.altKey||anyOverlay()||e.target.closest('input,textarea,select,[contenteditable]'))return;
  const k=e.key.toLowerCase();
  const byKey={d:'day',x:'x3',w:'week',m:'month',a:'schedule',r:'summary'};
  if(byKey[k]){setView(byKey[k]);e.preventDefault()}
  else if(k==='t')$('todayBtn').click();
  else if(k==='j'||k==='n')step(1);
  else if(k==='k'||k==='p')step(-1);
  else if(k==='c'){e.preventDefault();openForm(null)}
  else if(k==='/'){e.preventDefault();$('searchBtn').click()}
});
$('wPrev').onclick=()=>{weekOff--;renderDashboard()};
$('wNext').onclick=()=>{weekOff++;renderDashboard()};
$('wNow').onclick=()=>{weekOff=0;renderDashboard()};
['fq','fperiod','fcat','fstatus'].forEach(id=>$(id).addEventListener('input',renderList));
mqMobile.addEventListener('change',()=>{closeDrawer();render()});
window.addEventListener('focus',()=>{if(backend==='api'&&!anyOverlay())loadRemote().catch(()=>{})});

// swipe left/right on the calendar to move to the next/previous period (phones)
(()=>{
  let x0=0,y0=0,t0=0,on=false;
  const m=$('main');
  m.addEventListener('touchstart',e=>{
    on=e.touches.length===1&&CAL_VIEWS.includes(view)&&!anyOverlay();
    if(on){x0=e.touches[0].clientX;y0=e.touches[0].clientY;t0=Date.now()}
  },{passive:true});
  m.addEventListener('touchend',e=>{
    if(!on)return;on=false;
    const t=e.changedTouches[0],dx=t.clientX-x0,dy=t.clientY-y0;
    if(Date.now()-t0<600&&Math.abs(dx)>70&&Math.abs(dx)>Math.abs(dy)*1.6)step(dx<0?1:-1);
  },{passive:true});
})();

let tt;function toast(m){const t=$('toast');t.textContent=m;t.hidden=false;clearTimeout(tt);tt=setTimeout(()=>t.hidden=true,3200)}

const hashView=location.hash.slice(1),savedView=store.get('agenda-saya-view');
view=VIEWS[hashView]?hashView:VIEWS[savedView]?savedView:'summary';
if(!store.get('agenda-cal-view')&&matchMedia('(max-width:640px)').matches)lastCalView='x3';
setView(view);
if(store.get('agenda-ai')==='1'&&!mqMobile.matches)setAI(true);
initStore();
setInterval(()=>{if(loaded&&!anyOverlay()&&!aiBusy)render()},60000);
})();
