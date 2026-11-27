import "@fontsource/manrope/400.css";
import "@fontsource/manrope/500.css";
import "@fontsource/manrope/600.css";
import "@fontsource/manrope/700.css";
import "@fontsource-variable/bricolage-grotesque";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/instrument-serif/400-italic.css";
import "@fontsource-variable/quicksand";
import "@fontsource-variable/nunito";
import "@fontsource-variable/baloo-2";
import "@fontsource-variable/dm-sans";
import "@fontsource-variable/fredoka";
import "@fontsource-variable/outfit";
import "@fontsource-variable/karla";
import "@fontsource/gochi-hand/400.css"; // the splash's hand-written "A-CHOO!"
import "./styles.css";
import { applyLook, onSystemThemeChange } from "./theme.js";
applyLook(); // before anything draws
import JSZip from "jszip";
import { esc, uid, DAY, sod, KNOWN, guessCat, titleCase, catVar, cc, parseWhen, parseQuick, fmtDue, toLocalInput, sampleTasks, parseDictation, collapseRepeats, briefText, REPEATS, repLabel, nextDue } from "./core.js";
import { dictationSupported, startDictation } from "./speech.js";
import { doBackup } from "./settings.js";
import { infoBtn, infoText, wireInfo } from "./info.js";
import { initWidget, pushWidget } from "./widget.js";
import { holidayOn } from "./holidays.js";
import { encodeList, decodeList, linkFor, appLink, qrSVG, planImport } from "./share.js";
import { playSplashSound } from "./splash-sound.js";
import { pref, setPref } from "./prefs.js";
import { loadAll, putTask, putTasks, deleteTask, clearTasks, migrateFromLocalStorage, requestPersist } from "./store.js";
import { isNative, saveFile, haptic, initNativeShell, onResume } from "./platform.js";
import { initNotifications, scheduleSync, webNotify, focusAlarm } from "./notify.js";
import { remindersPanelHTML, wireRemindersPanel, openSheet, closeSheet, initSheet } from "./settings.js";


const $=s=>document.querySelector(s);
/* doodle splash (markup and timing live in index.html): tap to skip; removed once it has faded.
   On the web it is already playing; in the native app it starts once the launch screen has gone. */
let splashSound=null;
function startSplash(){
  const d=document.documentElement,sp=document.getElementById("splash");
  if(!sp||d.classList.contains("no-splash"))return;
  if(d.classList.contains("sp-wait")){d.classList.remove("sp-wait");window.__ddSplashT0=performance.now()}
  if(pref("splashSound")&&!matchMedia("(prefers-reduced-motion: reduce)").matches)splashSound=playSplashSound(window.__ddSplashT0||performance.now());
}
{const sp=document.getElementById("splash");
  if(sp){
    if(document.documentElement.classList.contains("no-splash"))sp.remove();
    else{
      sp.addEventListener("click",()=>{sp.classList.add("bye");splashSound&&splashSound.stop()},{once:true});
      sp.addEventListener("animationend",e=>{if(e.target===sp&&e.animationName==="sp-out")sp.remove()});
      if(!isNative)startSplash();
    }
  }}
/* ---------- storage (IndexedDB on this device) ---------- */
let tasks=[],examples=false,loaded=false,persisted=null;
function lsGet(k,d){try{const v=localStorage.getItem(k);return v?JSON.parse(v):d}catch(e){return d}}
function lsSet(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}
const bc=("BroadcastChannel" in window)?new BroadcastChannel("dd-sync"):null; // keep two open tabs in step
function told(){bc&&bc.postMessage("changed")}
if(bc)bc.onmessage=async()=>{tasks=await loadAll();examples=examples&&tasks.length===0;render();syncOut()};

async function initStore(){
  try{
    await migrateFromLocalStorage();
    tasks=await loadAll();
  }catch(e){
    tasks=[];
    toast({t:"Storage is blocked",s:"This browser isn't letting the app save. Private windows often do this; open it in a normal window.",sticky:true});
  }
  loaded=true;afterLoad();
  persisted=await requestPersist();storageLabel();
}
function storageLabel(){
  const el=$("#sync");if(!el)return;
  el.textContent=isNative?"Saved on this phone":persisted?"Saved on this device · protected":"Saved on this device";
  el.classList.toggle("on",isNative||!!persisted);
}
function wantExamples(){return tasks.length===0&&pref("start")==="examples"} // only when they chose to look around
let widgetReady=false;
function startWidget(){
  if(widgetReady)return;widgetReady=true;
  initWidget({
    done:id=>{const t=tasks.find(x=>x.id===id);if(t&&!t.done){save({...t,done:true,doneAt:Date.now()});toast({t:"Dusted from your widget ✓",s:t.title,ttl:2500,undo:()=>save({...t})})}},
    share:text=>{
      const clean=String(text).replace(/\s+/g," ").trim().slice(0,240);
      closeOv();setView(HOME);q.value=clean;q.dispatchEvent(new Event("input"));openAdd();
      setTimeout(()=>{q.setSelectionRange(clean.length,clean.length)},250);
      toast({t:"Shared in",s:"Add a date or #category if you like, then tap Add.",ttl:3500});
    },
    import:code=>{setView(HOME);receiveList(code)},
    shortcut:k=>{
      closeOv();
      if(k==="add"){setView(HOME);openAdd()}
      else if(k==="dictate"){setView(HOME);openAdd(false);setTimeout(()=>micBtn.click(),400)}
      else {tmCat=null;setView(HOME)}
    }});
  pushWidget(widgetData);
}
document.addEventListener("visibilitychange",()=>{if(!document.hidden){pushWidget(widgetData);calSyncSoon(300)}}); // a new day, or the calendar changed
function afterLoad(){setTimeout(startWidget,800);setTimeout(checkShareHash,300);calSyncSoon(2000);setTimeout(maybeWebBrief,1500);if(!q.value)$("#parse").innerHTML=parseHint();if(tasks.length&&!pref("start"))setPref("start","had");examples=wantExamples();render();syncOut()}
function view(){return examples?exList:tasks}
let exList=sampleTasks();
function failed(e){toast({t:"Couldn't save that change",s:(e&&e.message)||"Your device storage may be full.",ttl:5000})}

let quietMove=false; // dust-off decisions are deliberate, so they don't count as putting things off
async function save(t){
  if(t.src==="example"){Object.assign(exList.find(x=>x.id===t.id),t);render();return}
  if(examples){examples=false}
  const i=tasks.findIndex(x=>x.id===t.id),prev=i>=0?tasks[i]:null;
  let extra=null,gone=null;
  if(t.rep&&t.due&&t.done&&prev&&!prev.done){ // a repeating task was finished: line up the next one
    const due=nextDue(t.due,t.rep);
    if(due){
      extra={...t,id:uid(),due,done:false,doneAt:null,createdAt:Date.now(),reminded:false,spawned:null};t={...t,spawned:extra.id};
      toast({t:"Repeats "+repLabel(t.rep).toLowerCase(),s:"Next one: "+fmtDue(due),ttl:3000});
    }
  }else if(prev&&prev.done&&!t.done&&prev.spawned){ // un-finished (Undo): take back the one that was lined up
    const n=tasks.find(x=>x.id===prev.spawned);if(n&&!n.done)gone=n;t={...t,spawned:null};
  }
  if(prev&&!quietMove&&!t.done&&!prev.done&&prev.due&&t.due&&sod(t.due).getTime()>sod(prev.due).getTime()){ // pushed to a later day
    t={...t,moves:(prev.moves||0)+1};
    if(t.moves===4||(t.moves>4&&t.moves%3===1)){const nt=t;setTimeout(()=>postponeNudge(nt),900)}
  }
  if(i>=0)tasks[i]=t; else tasks.push(t);
  if(extra)tasks.push(extra);
  if(gone)tasks=tasks.filter(x=>x.id!==gone.id);
  render();
  try{await putTask(t);if(extra)await putTask(extra);if(gone)await deleteTask(gone.id);told()}catch(e){failed(e)}
  syncOut();
}
function snooze(t){ // "not today": same time tomorrow
  const now=Date.now(),next=placeOn(t,sod(now).getTime()+DAY,now);
  haptic();save(next);
  toast({t:"Moved to "+fmtDue(next.due),s:t.title,ttl:3000,undo:()=>save({...t})});
}
async function remove(t){
  if(t.src==="example"){exList=exList.filter(x=>x.id!==t.id);render();return}
  tasks=tasks.filter(x=>x.id!==t.id);examples=false;render();
  try{await deleteTask(t.id);told()}catch(e){failed(e)}
  syncOut();
}
async function updateMany(list){
  if(!list.length)return;
  const byId=new Map(list.map(t=>[t.id,t]));
  if(list[0].src==="example"){exList=exList.map(t=>byId.get(t.id)||t);render();return}
  tasks=tasks.map(t=>byId.get(t.id)||t);render();
  try{await putTasks(list);told()}catch(e){failed(e)}
  syncOut();
}
async function saveMany(list,progress){
  examples=false;tasks.push(...list);render();
  try{await putTasks(list);told()}catch(e){failed(e)}
  progress&&progress(list.length,list.length);
  syncOut();
}

/* ---------- state ---------- */
let filter="All",openEdit=null,currentView="dash";
const HOME="dash"; // the Task map is the home screen
let tmDone=false,popEdit=false,tmDay=null; // tmDay: the week-view tile opened, as a bucket key // show finished tasks on the map; task pop-up in edit mode
let animIn=true,lastAdded=null,prevGreet={today:null,over:null},D=0,doneOpen=false;
const dueTodayOpen=()=>{const e=sod(Date.now()).getTime()+DAY;return view().filter(t=>!t.done&&t.due&&t.due<e).length};
const alarms=new Map(); // id -> until timestamp
const REDUCED=matchMedia("(prefers-reduced-motion: reduce)");

/* ---------- confetti / particles ---------- */
const fx=$("#fx"),ctx=fx.getContext("2d");let parts=[],raf=0;
function sizeFx(){const r=devicePixelRatio||1;fx.width=innerWidth*r;fx.height=innerHeight*r;ctx.setTransform(r,0,0,r,0,0)}
addEventListener("resize",sizeFx);sizeFx();
function tok(v){return getComputedStyle(document.documentElement).getPropertyValue(v).trim()||"#E39A14"}
onSystemThemeChange(()=>render());
function burst(x,y,n=26,colors,power=1){
  if(REDUCED.matches)return;
  colors=colors||[tok("--accent"),tok("--c1"),tok("--c3"),tok("--c4"),tok("--c5")];
  for(let i=0;i<n;i++){const a=Math.random()*Math.PI*2,s=(2+Math.random()*5)*power;
    parts.push({x,y,vx:Math.cos(a)*s,vy:Math.sin(a)*s-3*power,r:3+Math.random()*4,c:colors[i%colors.length],rot:Math.random()*6,vr:(Math.random()-.5)*.4,life:1,sh:Math.random()<.5})}
  if(!raf)raf=requestAnimationFrame(stepFx);
}
function puff(x,y,w=60){ // soft dust cloud that drifts up and fades: the brand's sign-off
  if(REDUCED.matches)return;
  const c=tok("--muted");
  for(let i=0;i<14;i++)parts.push({dust:1,x:x+(Math.random()-.3)*w,y:y+(Math.random()-.5)*14,vx:.6+Math.random()*1.6,vy:-(.2+Math.random()*.7),r:4+Math.random()*7,c,life:.9+Math.random()*.3});
  if(!raf)raf=requestAnimationFrame(stepFx);
}
function dustBrand(){const b=$("#brand");if(!b||REDUCED.matches)return;b.classList.remove("dusting");void b.offsetWidth;b.classList.add("dusting")}
function rain(){ // big celebration from the top
  if(REDUCED.matches)return;
  for(let k=0;k<6;k++)setTimeout(()=>burst(innerWidth*(.15+Math.random()*.7),innerHeight*.25,30,null,1.4),k*140);
}
function stepFx(){
  ctx.clearRect(0,0,innerWidth,innerHeight);
  parts=parts.filter(p=>p.life>0);
  for(const p of parts){
    if(p.dust){p.x+=p.vx;p.y+=p.vy;p.vx*=.97;p.r+=.35;p.life-=.016;
      ctx.save();ctx.globalAlpha=Math.max(0,p.life)*.32;ctx.fillStyle=p.c;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,7);ctx.fill();ctx.restore();continue}
    p.vy+=.22;p.vx*=.985;p.x+=p.vx;p.y+=p.vy;p.rot+=p.vr;p.life-=.012;
    ctx.save();ctx.globalAlpha=Math.max(0,Math.min(1,p.life*1.6));ctx.translate(p.x,p.y);ctx.rotate(p.rot);ctx.fillStyle=p.c;
    if(p.sh)ctx.fillRect(-p.r,-p.r/2.5,p.r*2,p.r/1.25);else{ctx.beginPath();ctx.arc(0,0,p.r/1.4,0,7);ctx.fill()}ctx.restore()}
  raf=parts.length?requestAnimationFrame(stepFx):0;
  if(!raf)ctx.clearRect(0,0,innerWidth,innerHeight);
}
function countUp(el,to){
  if(REDUCED.matches||to===0){el.textContent=to;return}
  const t0=performance.now(),dur=700+Math.min(to,40)*12;
  const f=now=>{const k=Math.min(1,(now-t0)/dur),e=1-Math.pow(1-k,3);el.textContent=Math.round(to*e);if(k<1)requestAnimationFrame(f)};
  el.textContent="0";requestAnimationFrame(f);
}
function partOfDay(){const h=new Date().getHours();return h<5?"Working late":h<12?"Good morning":h<17?"Good afternoon":"Good evening"}

/* ---------- quick add ---------- */
// the typing tip retires once you've got a few tasks in
function fmtMins(m){return m>=60?(m%60?`${Math.floor(m/60)}h ${m%60}m`:`${m/60}h`):`${m} min`}
function parseHint(){return tasks.length<5?'<span>Try <b>#Home</b>, <b>fri 5pm</b>, <b>!</b> for important, <b>every monday</b>.</span>':""}
const q=$("#quick");
q.addEventListener("input",()=>{
  const v=q.value.trim();
  if(!v){$("#parse").innerHTML=parseHint();return}
  const p=parseQuick(v);
  $("#parse").innerHTML=`<span class="pchip" style="color:${cc(p.cat)}">● ${esc(p.cat)}${p.catGuessed?" (guessed)":""}</span>`+
   (p.due?`<span class="pchip">⏰ ${esc(fmtDue(p.due))}</span>`:`<span class="pchip">No date</span>`)+(p.rep?`<span class="pchip">↻ ${esc(repLabel(p.rep))}</span>`:"")+(p.pri?`<span class="pchip" style="color:var(--danger)">Important</span>`:"")+(p.who?`<span class="pchip">👤 ${esc(p.who)}</span>`:"")+(p.effort?`<span class="pchip">${p.effort==="quick"?"⚡ Quick":"⛰ Big"}${p.mins?" · "+fmtMins(p.mins):""}</span>`:p.mins?`<span class="pchip">⏱ ${fmtMins(p.mins)}</span>`:"");
});
$("#addForm").addEventListener("submit",e=>{
  e.preventDefault();const v=q.value.trim();
  const p=v?parseQuick(v):null;
  if(!p||!p.title){const f=$("#addForm");f.classList.remove("shake");void f.offsetWidth;f.classList.add("shake");q.focus();return}
  if(examples){examples=false;animIn=true}
  const nid=uid();lastAdded=nid;haptic();
  const br=$("#addForm button").getBoundingClientRect();burst(br.left+br.width/2,br.top+br.height/2,14,[tok(catVar(p.cat)),tok("--accent")],.7);
  save({id:nid,title:titleCase(p.title),cat:p.cat,due:p.due,pri:p.pri,rep:p.rep||null,who:p.who||null,effort:p.effort||null,mins:p.mins||null,done:false,doneAt:null,createdAt:Date.now(),src:"manual"});
  q.value="";q.dispatchEvent(new Event("input"));
  toast({t:"Added",s:`${titleCase(p.title)}${p.due?" · "+fmtDue(p.due):""}${p.rep?" · repeats "+repLabel(p.rep).toLowerCase():""}`,ttl:2500});
  afterAdd();
});

/* ---------- keep the phone's reminders and the home-screen widget in step ---------- */
function syncOut(){scheduleSync(view);pushWidget(widgetData);calSyncSoon()}
const hexOf=(()=>{let cx=null;return c=>{try{cx=cx||document.createElement("canvas").getContext("2d");cx.fillStyle="#E39A14";cx.fillStyle=c;return cx.fillStyle}catch{return "#E39A14"}}})();
function widgetData(){
  const now=Date.now(),t0=sod(now).getTime(),open=tasks.filter(t=>!t.done&&t.due&&t.due<t0+DAY).sort((a,b)=>a.due-b.due);
  const late=open.filter(t=>t.due<now).length,today=open.length-late;
  const tf=ms=>new Date(ms).toLocaleTimeString("en-IN",{hour:"numeric",minute:"2-digit"}).replace(" ","").toLowerCase();
  const items=open.slice(0,5).map(t=>({id:t.id,title:(t.pri?"! ":"")+t.title,color:hexOf(tok(catVar(t.cat))),late:t.due<now,
    when:t.due<now?(t.due<t0?Math.max(1,Math.floor((now-t.due)/DAY)||1)+"d late":tf(t.due)):tf(t.due)}));
  const next=tasks.filter(t=>!t.done&&t.due&&t.due>=t0+DAY).sort((a,b)=>a.due-b.due)[0];
  const sub=[today?`${today} due today`:"",late?`${late} overdue`:""].filter(Boolean).join(" · ")||"All clear";
  return {head:new Date(now).toLocaleDateString("en-IN",{weekday:"long",day:"numeric",month:"short"}),sub,items,more:Math.max(0,open.length-5),
    empty:next?`Nothing due today 🎉  Next: ${next.title}, ${fmtDue(next.due)}`:"Nothing due today 🎉",day:t0};
}

/* ---------- phone calendar, both ways (Android) ----------
   Meetings show on Plan and fill up the day for Auto-plan. Task events we added stay in step:
   move the event in Google Calendar and the task follows; move the task here and the event follows. */
let calEvents=[],calTimer=0;
function calLinks(){ // taskId -> {e: event id, at: the due time both sides last agreed on}
  const v=lsGet("dd.calSync",null);if(v)return v;
  const old=lsGet("dd.calIds",{}),n={};Object.entries(old).forEach(([k,e])=>{const t=tasks.find(x=>x.id===k);n[k]={e,at:t?.due||0}});
  lsSet("dd.calSync",n);return n;
}
async function calPlugin(){const {registerPlugin}=await import("@capacitor/core");return registerPlugin("DDCalendar")}
function calSyncSoon(ms=1200){if(!isNative)return;clearTimeout(calTimer);calTimer=setTimeout(calSync,ms)}
async function calSync(){
  if(!isNative||pref("calOnPlan")===false||examples)return;
  try{
    const Cal=await calPlugin();
    if((await Cal.checkPermissions()).calendar!=="granted")return;
    const t0=sod(Date.now()).getTime(),links=calLinks(),ids=Object.values(links).map(l=>l.e);
    const r=await Cal.getEvents({from:t0,to:t0+8*DAY,ids});
    calEvents=(r.events||[]).filter(e=>!e.allDay&&e.busy);
    const byE=new Map((r.ours||[]).map(o=>[o.eventId,o]));
    const moved=[],push=[];
    for(const [tid,l] of Object.entries(links)){
      const t=tasks.find(x=>x.id===tid),o=byE.get(l.e);
      if(!t||t.done||!o){continue}
      if(o.gone){delete links[tid];continue}
      if(Math.abs(o.start-l.at)>6e4){moved.push({...t,due:o.start,reminded:false});l.at=o.start}        // moved in the calendar
      else if(t.due&&Math.abs(t.due-l.at)>6e4){push.push(t);l.at=t.due}                                  // moved in the app
    }
    lsSet("dd.calSync",links);
    if(moved.length){quietMove=true;await updateMany(moved);quietMove=false;
      toast({t:moved.length===1?"Moved from your calendar":`${moved.length} tasks moved from your calendar`,s:moved.length===1?`${moved[0].title} · ${fmtDue(moved[0].due)}`:"",ttl:3500})}
    if(push.length)await Cal.addEvents({events:push.map(t=>({title:t.title,start:t.due,minutes:15,rrule:RRULE[t.rep]||"",description:"Done & Dusted · "+t.cat,eventId:links[t.id].e}))}).catch(()=>{});
    if(currentView==="plan")render();
  }catch(e){}
}
function eventsOn(s){return calEvents.filter(e=>e.start<s+DAY&&e.end>s)}

/* ---------- shared lists: a link or QR that carries the tasks ---------- */
async function shareList(cat){
  const code=await encodeList(cat,tasks),url=linkFor(code),n=tasks.filter(t=>t.cat===cat&&!t.done).length,qr=qrSVG(url);
  const text=`My ${cat} list on Done & Dusted (${n} task${n===1?"":"s"}). Tap to add it to yours:`;
  haptic();openOv("share");
  ovBody.innerHTML=`<div class="ov-top"><h2 id="ovTitle">Share ${esc(cat)}</h2><button class="btn sm" data-ovx>Close</button></div>
    <div class="sh">${qr?`<div class="sh-qr" role="img" aria-label="QR code for the ${esc(cat)} list">${qr}</div><p class="sh-sub">Scan with the other phone's camera.</p>`:`<p class="sh-sub">This list is too long for a QR code, so send the link instead.</p>`}
      <div class="fo-acts"><button class="btn pri" id="shSend">Send link</button><button class="btn" id="shCopy">Copy link</button></div>
      <p class="sh-note">This sends a copy of ${n} open task${n===1?"":"s"}. When things change, share again and their copy updates: new tasks are added, finished ones get ticked off.</p></div>`;
  ovBody.querySelector("#shSend").onclick=async()=>{
    try{
      if(isNative){const {Share}=await import("@capacitor/share");await Share.share({title:`${cat} list`,text,url,dialogTitle:"Send your "+cat+" list"});return}
      if(navigator.share){await navigator.share({title:`${cat} list`,text,url});return}
    }catch(e){if(e?.name==="AbortError"||/cancel/i.test(e?.message||""))return}
    copyLink(url);
  };
  ovBody.querySelector("#shCopy").onclick=()=>copyLink(url);
}
async function copyLink(url){try{await navigator.clipboard.writeText(url);haptic("success");toast({t:"Link copied",s:"Paste it into WhatsApp or a message.",ttl:2500})}catch{toast({t:"Couldn't copy",s:"Long-press the QR code or use Send link.",ttl:3000})}}
async function receiveList(code){
  let got;
  try{got=await decodeList(code)}catch{toast({t:"That link didn't work",s:"Ask for the list to be shared again.",ttl:4000});return}
  const plan=planImport(got,tasks),n=plan.add.length+plan.update.length+plan.done.length;
  openOv("recv");
  const row=(t,tag)=>`<li><span class="tag ${tag}">${tag==="new"?"New":tag==="upd"?"Updated":"Done"}</span>${esc(t.title)}${t.due?` <small class="mono">${esc(fmtDue(t.due))}</small>`:""}</li>`;
  ovBody.innerHTML=`<div class="ov-top"><h2 id="ovTitle">${esc(got.cat)} list</h2><button class="btn sm" data-ovx>Close</button></div>
    <p class="sh-sub">Shared ${esc(fmtDue(got.at))} · ${got.tasks.filter(t=>!t.done).length} open task${got.tasks.filter(t=>!t.done).length===1?"":"s"}</p>
    ${!isNative&&/Android/i.test(navigator.userAgent)?`<a class="btn sh-app" href="${appLink(code)}">Have the app? Open it there</a>`:""}
    ${n?`<ul class="sh-list">${plan.add.map(t=>row(t,"new")).join("")}${plan.update.map(u=>row(u.x,"upd")).join("")}${plan.done.map(t=>row(t,"done")).join("")}</ul>
      <div class="fo-acts"><button class="btn pri" id="rcGo">${plan.add.length&&!plan.update.length&&!plan.done.length?`Add ${plan.add.length} task${plan.add.length===1?"":"s"}`:"Bring my list up to date"}</button></div>`
      :`<p class="do-week">You're already up to date with this list. ✓</p><div class="fo-acts"><button class="btn pri" data-ovx>Lovely</button></div>`}`;
  const go=ovBody.querySelector("#rcGo");if(!go)return;
  go.onclick=async()=>{
    const now=Date.now(),out=[
      ...plan.add.map((x,i)=>({...x,cat:got.cat,done:false,doneAt:null,createdAt:now+i,reminded:false,src:"shared"})),
      ...plan.update.map(({t,x})=>({...t,title:x.title,due:x.due,pri:x.pri,rep:x.rep,note:x.note,who:x.who,effort:x.effort,mins:x.mins,reminded:x.due!==t.due?false:t.reminded})),
      ...plan.done.map(t=>({...t,done:true,doneAt:now}))];
    if(examples)examples=false;
    tasks=[...tasks.filter(t=>!out.some(o=>o.id===t.id)),...out];
    try{await putTasks(out);told()}catch(e){failed(e)}
    syncOut();closeOv();tmCat=got.cat;setView(HOME);rain();
    toast({t:`${got.cat} list ${plan.add.length===n?"added":"updated"}`,s:[plan.add.length?`${plan.add.length} new`:"",plan.update.length?`${plan.update.length} updated`:"",plan.done.length?`${plan.done.length} ticked off`:""].filter(Boolean).join(" · "),ttl:3500});
  };
}
window.addEventListener("hashchange",()=>checkShareHash());
function checkShareHash(){
  const m=location.hash.match(/^#share=([zj]\.[A-Za-z0-9_-]+)/);if(!m)return false;
  history.replaceState(null,"",location.pathname+location.search);receiveList(m[1]);return true;
}

/* ---------- full-screen overlay: weekly dust-off and focus mode ---------- */
const ov=$("#ov"),ovBody=$("#ovBody");let ovMode=null,ovBack=null;
function openOv(mode){ovMode=mode;ovBack=document.activeElement;ov.hidden=false;requestAnimationFrame(()=>ov.classList.add("open"));document.body.style.overflow="hidden"}
function closeOv(){if(!ovMode)return;const m=ovMode;ovMode=null;ov.classList.remove("open");document.body.style.overflow="";
  setTimeout(()=>{if(!ovMode){ov.hidden=true;ovBody.innerHTML=""}},REDUCED.matches?0:220);
  if(m==="focus")stopFocus();if(m==="dust"&&dust&&dust.i>0&&!dust.over)finishDust(true);
  ovBack?.focus?.();render()}
ov.addEventListener("click",e=>{if(e.target===ov||e.target.closest("[data-ovx]"))closeOv()});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&ovMode)closeOv()});

/* ---------- weekly dust-off: decide on each stale task ---------- */
function staleTasks(){
  const now=Date.now();
  return tasks.filter(t=>!t.done&&((t.due&&now-t.due>=2*DAY)||(!t.due&&now-(t.createdAt||now)>=7*DAY)||(t.moves||0)>=3))
    .sort((a,b)=>(a.due||a.createdAt||0)-(b.due||b.createdAt||0));
}
function staleWhy(t){
  const now=Date.now(),days=ms=>Math.floor(ms/DAY),bits=[];
  if(t.due&&t.due<now)bits.push(`${days(now-t.due)} days overdue`);
  if(!t.due)bits.push(`no date for ${Math.max(1,Math.round(days(now-(t.createdAt||now))/7))} week${days(now-(t.createdAt||now))>=14?"s":""}`);
  if((t.moves||0)>=2)bits.push(`moved ${t.moves} times`);
  return bits.join(" · ");
}
function dustOffDue(){
  if(examples)return false;
  const last=pref("dustOff")||0,now=Date.now(),t0=sod(now).getTime();
  if(pref("dustSkip")===t0||now-last<6*DAY)return false;
  return staleTasks().length>=3&&(new Date().getDay()===0||now-last>9*DAY);
}
let dust=null;
function startDust(){
  const list=staleTasks();if(!list.length){toast({t:"Nothing gathering dust",s:"Every task is on time. Nice.",ttl:3000});return}
  dust={ids:list.map(t=>t.id),i:0,done:0,moved:0,dropped:[],over:false};haptic();openOv("dust");drawDust();
}
function nextSat(t0){const d=new Date(t0),k=(6-d.getDay()+7)%7||7;return t0+k*DAY}
function nextMon(t0){const d=new Date(t0),k=(8-d.getDay())%7||7;return t0+k*DAY}
function drawDust(){
  const n=dust.ids.length;
  while(dust.i<n&&!tasks.some(t=>t.id===dust.ids[dust.i]&&!t.done))dust.i++;
  if(dust.i>=n){finishDust();return}
  const t=tasks.find(x=>x.id===dust.ids[dust.i]);
  ovBody.innerHTML=`<div class="ov-top"><h2 id="ovTitle">Weekly dust-off</h2><span class="mono">${dust.i+1} / ${n}</span><button class="btn sm" data-ovx>Close</button></div>
    <div class="do-bar" aria-hidden="true"><i style="width:${Math.round(dust.i/n*100)}%"></i></div>
    <div class="do-card" style="--cc:${cc(t.cat)}"><span class="cat">${esc(t.cat)}</span><div class="do-t">${esc(t.title)}</div><p class="do-why">${esc(staleWhy(t))}</p></div>
    <div class="do-q">Still want this?</div>
    <div class="do-acts">
      <button class="btn pri" data-do="done">Already done ✓</button>
      <div class="do-row"><button class="btn" data-do="tmr">Tomorrow</button><button class="btn" data-do="sat">Weekend</button><button class="btn" data-do="mon">Next week</button></div>
      <div class="do-row"><button class="btn" data-do="someday">Someday</button><button class="btn warn" data-do="drop">Drop it</button></div>
      <button class="do-skip" data-do="skip">Skip for now</button></div>`;
  ovBody.querySelector("[data-do=done]").focus({preventScroll:true});
}
ovBody.addEventListener("click",e=>{
  const b=e.target.closest("[data-do]");if(!b||ovMode!=="dust")return;
  const t=tasks.find(x=>x.id===dust.ids[dust.i]);if(!t)return;
  const a=b.dataset.do,now=Date.now(),t0=sod(now).getTime();
  quietMove=true;
  if(a==="done"){dust.done++;haptic("success");const r=b.getBoundingClientRect();burst(r.left+r.width/2,r.top+r.height/2,16);save({...t,done:true,doneAt:now})}
  else if(a==="drop"){dust.dropped.push(t);haptic("warn");remove(t)}
  else if(a!=="skip"){dust.moved++;haptic();
    save(a==="someday"?{...t,due:null,moves:0,reminded:false}:{...placeOn(t,a==="tmr"?t0+DAY:a==="sat"?nextSat(t0):nextMon(t0),now),moves:0})}
  quietMove=false;
  const card=ovBody.querySelector(".do-card");card?.classList.add(a==="drop"?"out-l":"out-r");
  dust.i++;setTimeout(()=>{if(ovMode==="dust")drawDust()},REDUCED.matches?0:260);
});
function finishDust(early){
  dust.over=true;setPref("dustOff",Date.now());
  if(early){const d=dust;toast({t:"Dust-off saved",s:`${d.done} done · ${d.moved} moved · ${d.dropped.length} dropped`,ttl:3500});return}
  const now=Date.now(),t0=sod(now).getTime(),done=tasks.filter(t=>t.done&&t.doneAt);
  const week=done.filter(t=>t.doneAt>=t0-6*DAY).length;
  let streak=0;for(let i=0;i<60;i++){const s0=t0-i*DAY;if(done.some(t=>t.doneAt>=s0&&t.doneAt<s0+DAY))streak++;else if(i>0)break}
  const d=dust;
  ovBody.innerHTML=`<div class="ov-top"><h2 id="ovTitle">All dusted 🧹</h2><button class="btn sm" data-ovx>Close</button></div>
    <div class="do-sum"><div><b>${d.done}</b><span>done</span></div><div><b>${d.moved}</b><span>rescheduled</span></div><div><b>${d.dropped.length}</b><span>dropped</span></div></div>
    <p class="do-week">This week you finished <b>${week}</b> task${week===1?"":"s"}${streak>1?` and kept a <b>${streak}-day</b> streak${streak>=3?" 🔥":""}`:""}.</p>
    <div class="do-acts">${d.dropped.length?`<button class="btn" id="doUndo">Bring back the ${d.dropped.length} dropped</button>`:""}<button class="btn pri" data-ovx>Lovely</button></div>`;
  rain();dustBrand();haptic("success");
  const u=ovBody.querySelector("#doUndo");if(u)u.onclick=()=>{d.dropped.forEach(t=>save(t));d.dropped=[];u.remove();toast({t:"Brought back",ttl:2500})};
}

/* ---------- focus mode: one task, a timer, nothing else ---------- */
let focus=null,wake=null;
function startFocus(id){
  const t=view().find(x=>x.id===id);if(!t)return;
  const len=t.mins&&t.mins<=120?t.mins:t.effort==="quick"?15:t.effort==="big"?45:(pref("focusLen")||25);
  focus={id,len,end:null,left:len*6e4,tick:0,up:false};
  haptic();openOv("focus");drawFocus();
}
function drawFocus(){
  const t=view().find(x=>x.id===focus.id);if(!t){closeOv();return}
  const run=!!focus.end;
  ovBody.innerHTML=`<div class="ov-top"><h2 id="ovTitle">Focus</h2><button class="btn sm" data-ovx>Exit</button></div>
    <div class="fo" style="--cc:${cc(t.cat)}"><span class="cat">${esc(t.cat)}</span><div class="fo-t">${esc(t.title)}</div>
    <div class="fo-ring${run?" run":""}${focus.up?" up":""}"><svg viewBox="0 0 120 120" aria-hidden="true"><circle class="bg" cx="60" cy="60" r="54"/><circle class="fg" cx="60" cy="60" r="54" pathLength="100"/></svg><div class="fo-time mono" id="foTime" role="timer" aria-live="off"></div></div>
    ${run||focus.up?"":`<div class="fo-len" role="group" aria-label="Minutes">${[...new Set([15,25,45,focus.len])].sort((a,b)=>a-b).map(m=>`<button class="chip${m===focus.len?" on":""}" data-fl="${m}" aria-pressed="${m===focus.len}">${m} min</button>`).join("")}</div>`}
    <div class="fo-acts">${focus.up?`<button class="btn" id="foMore">+5 min</button>`:`<button class="btn" id="foGo">${run?"Pause":focus.left<focus.len*6e4?"Resume":"Start"}</button>`}<button class="btn pri" id="foDone">Done ✓</button></div>
    <p class="fo-sub">${focus.up?"Time's up. Finished, or five more minutes?":run?"Phone stays awake. Everything else can wait.":"Pick a length and start. One thing at a time."}</p></div>`;
  paintFocus();
  ovBody.querySelectorAll("[data-fl]").forEach(b=>b.onclick=()=>{focus.len=+b.dataset.fl;focus.left=focus.len*6e4;setPref("focusLen",focus.len);haptic();drawFocus()});
  const go=ovBody.querySelector("#foGo");if(go)go.onclick=()=>{focus.end?pauseFocus():runFocus();drawFocus()};
  const more=ovBody.querySelector("#foMore");if(more)more.onclick=()=>{focus.up=false;focus.left=5*6e4;focus.len=Math.max(focus.len,5);runFocus();drawFocus()};
  ovBody.querySelector("#foDone").onclick=e=>{
    const t=view().find(x=>x.id===focus.id),r=e.currentTarget.getBoundingClientRect();
    burst(r.left+r.width/2,r.top+r.height/2,30,[tok(catVar(t.cat)),tok("--accent")],1.1);dustBrand();haptic("success");
    save({...t,done:true,doneAt:Date.now()});toast({t:"Dusted ✓",s:t.title,ttl:2500,undo:()=>save({...t})});
    setTimeout(closeOv,REDUCED.matches?0:650);
  };
}
function paintFocus(){
  if(!focus)return;const el=$("#foTime");if(!el)return;
  const left=focus.end?Math.max(0,focus.end-Date.now()):focus.left,sec=Math.ceil(left/1000);
  el.textContent=focus.up?"0:00":`${Math.floor(sec/60)}:${String(sec%60).padStart(2,"0")}`;
  ovBody.querySelector(".fo-ring .fg")?.style.setProperty("stroke-dashoffset",String(100-left/(focus.len*6e4)*100));
  if(focus.end&&left<=0){focus.end=null;focus.left=0;focus.up=true;clearInterval(focus.tick);chime();haptic("warn");focusAlarm(null);drawFocus()}
}
async function runFocus(){
  focus.end=Date.now()+focus.left;clearInterval(focus.tick);focus.tick=setInterval(paintFocus,500);
  try{wake=await navigator.wakeLock?.request("screen")}catch{}
  const t=view().find(x=>x.id===focus.id);focusAlarm(focus.end,t?.title);
}
function pauseFocus(){focus.left=Math.max(0,focus.end-Date.now());focus.end=null;clearInterval(focus.tick);focusAlarm(null);try{wake?.release()}catch{};wake=null}
function stopFocus(){if(!focus)return;clearInterval(focus.tick);focusAlarm(null);try{wake?.release()}catch{};wake=null;focus=null}
document.addEventListener("visibilitychange",()=>{if(!document.hidden&&focus){paintFocus();if(focus.end)navigator.wakeLock?.request("screen").then(w=>wake=w).catch(()=>{})}});

/* ---------- morning brief, in the app (the phone gets a notification instead) ---------- */
function briefLine(at){
  const s=sod(at).getTime(),open=tasks.filter(t=>!t.done&&t.due);
  const due=open.filter(t=>t.due>=s&&t.due<s+DAY),late=open.filter(t=>t.due<s);
  return briefText(due,late);
}
function maybeWebBrief(){
  if(isNative||examples||!pref("brief")||!pref("alerts"))return;
  const now=Date.now(),t0=sod(now).getTime(),[h,m]=String(pref("briefAt")||"08:00").split(":").map(Number);
  if(now<t0+(h*60+m)*6e4||pref("briefShown")===t0)return;
  setPref("briefShown",t0);
  const b=briefLine(now),hd=holidayOn(now);if(!b&&!hd)return;
  toast({t:"Good morning ☀️"+(hd?" · Happy "+hd.name:""),s:b,sticky:true,actions:[["Plan my week",()=>{setView(HOME);autoPlan()},"go"]]});
}

/* ---------- onboarding: how to start, where data lives, a short checklist ---------- */
const WHERE=isNative?"on this phone":"in this browser, on this device";
function startHTML(){
  const o=(id,icon,t,sub)=>`<button class="start-opt" id="${id}"><span class="start-ic" aria-hidden="true">${icon}</span><span><b>${t}</b><small>${sub}</small></span></button>`;
  return `<div class="start panel"><h2>Welcome to Done &amp; Dusted</h2><p class="start-sub">How do you want to start?</p>
    <div class="start-opts">${o("stKeep","📥","Import from Google Keep","Bring your Keep notes in as tasks, sorted by label.")}
    ${o("stFresh","✏️","Start fresh","An empty list. Type or say your first task.")}
    ${o("stEx","👀","Look around first","Explore with example tasks. They go away when you add your own.")}</div>
    <p class="start-data"><b>Your tasks stay ${WHERE}.</b> No account, no cloud. Save a backup from Settings now and then so you never lose them.</p></div>`;
}
function wireStart(el){
  const go=(v,fn)=>()=>{setPref("start",v);haptic();animIn=true;fn()};
  el.querySelector("#stKeep").onclick=go("import",()=>{examples=wantExamples();setView("import")});
  el.querySelector("#stFresh").onclick=go("fresh",()=>{examples=false;render();openAdd()});
  el.querySelector("#stEx").onclick=go("examples",()=>{examples=true;render()});
}
function steps(){
  const real=tasks;
  return [
    ["add","Add your first task",real.length>0,"Tap + on the Task map, or import from Keep in Settings."],
    ["time","Give a task a time",real.some(t=>t.due),"Add “tomorrow 6pm” to a task. You'll get a reminder."],
    ...(canDictate?[["voice","Say a task out loud",real.some(t=>t.src==="voice"),"Tap the mic and speak. Say several at once."]]:[]),
    ["done","Finish one",real.some(t=>t.done),"Tap a task on the map, then Done."],
    ["plan","Plan your week",!!pref("autoPlanned"),"Tap ✦ Plan my week. Tasks without a day get spread over the week."],
    ["backup","Save a backup",!!pref("backedUp"),`Your tasks live only ${WHERE}. Keep a copy safe.`],
  ];
}
function getDustedHTML(){
  if(pref("gdHidden")||!pref("start")||pref("start")==="had")return "";
  const st=steps(),n=st.filter(x=>x[2]).length;
  if(n===st.length){setPref("gdHidden",true);setTimeout(()=>{dustBrand();toast({t:"All dusted ✓",s:"You've got the hang of it. Enjoy!",ttl:3500})},400);return ""}
  const next=st.find(x=>!x[2])[0];
  return `<div class="panel gd" style="--d:0"><div class="gd-head"><h4>Get dusted <small>${n} of ${st.length}</small></h4><button class="gd-x" id="gdHide" aria-label="Hide this checklist">Hide</button></div>
    <div class="gd-bar" aria-hidden="true"><i style="width:${Math.round(n/st.length*100)}%"></i></div>
    <ul class="gd-list">${st.map(([k,t,ok,sub])=>`<li class="${ok?"ok":""}${k===next?" next":""}"><button data-gd="${k}"${ok?" disabled":""}><span class="gd-tick" aria-hidden="true">${ok?"✓":""}</span><span><b>${t}</b>${k===next?`<small>${sub}</small>`:""}</span></button></li>`).join("")}</ul></div>`;
}
function dataNoteDue(){return !examples&&tasks.length>=5&&!pref("backedUp")&&!pref("dataNoteOk")}
function dataNoteHTML(){return `<div class="note" style="--d:0"><span>Your tasks live only ${WHERE}. No account, no cloud. A backup keeps them safe.</span><span class="note-acts"><button id="dnBackup">Save a backup</button><button id="dnOk">Later</button></span></div>`}
function wireOnboard(el){
  const b=id=>el.querySelector("#"+id);
  if(b("goFresh"))b("goFresh").onclick=()=>{setPref("start","fresh");examples=false;animIn=true;render();openAdd()};
  if(b("gdHide"))b("gdHide").onclick=()=>{setPref("gdHidden",true);render()};
  if(b("dnOk"))b("dnOk").onclick=()=>{setPref("dataNoteOk",true);render()};
  if(b("dnBackup"))b("dnBackup").onclick=()=>doBackup();
  el.querySelectorAll("[data-gd]").forEach(x=>x.onclick=()=>{
    const k=x.dataset.gd;haptic();
    if(k==="add"||k==="time"){openAdd();if(k==="time"&&!q.value){q.value="Call the plumber tomorrow 6pm";q.dispatchEvent(new Event("input"));q.select()}}
    else if(k==="voice"){openAdd(false);setTimeout(()=>micBtn.click(),300)}
    else if(k==="plan")autoPlan();
    else if(k==="backup")doBackup();
    else if(k==="done")el.querySelector(".task-tile:not(.done)")?.focus();
  });
}

/* ---------- dictation: speak several tasks, review, add ---------- */
const dict={open:false,listening:false,text:"",items:[],session:null,note:""};
const micBtn=$("#mic"),dictEl=$("#dict");
$("#hdrAdd").onclick=()=>{haptic();setView(HOME);openAdd()};
/* ---------- pop-up sheets: add a task, and the list ---------- */
let listOpen=false;
function showSheet(id){const s=$(id);s.hidden=false;requestAnimationFrame(()=>s.classList.add("open"))}
function hideSheet(id){const s=$(id);if(s.hidden)return;s.classList.remove("open");setTimeout(()=>{s.hidden=true},250)}
function openAdd(focus=true){haptic();showSheet("#addSheet");if(focus)setTimeout(()=>q.focus(),60)}
function closeAdd(){closeDict();hideSheet("#addSheet");q.blur()}
function afterAdd(){closeAdd();if(currentView==="import")setView(HOME)}
function openList(cat){filter=cat||"All";listOpen=true;animIn=true;showSheet("#listSheet");render()}
function closeList(){listOpen=false;openEdit=null;hideSheet("#listSheet")}
$("#addClose").onclick=closeAdd;$("#listClose").onclick=closeList;
$("#addSheet").addEventListener("click",e=>{if(e.target.id==="addSheet")closeAdd()});
$("#listSheet").addEventListener("click",e=>{if(e.target.id==="listSheet")closeList()});
document.addEventListener("keydown",e=>{if(e.key!=="Escape"||!$("#pop").hidden)return;if(!$("#addSheet").hidden)closeAdd();else if(listOpen)closeList()});
$("#backHome").onclick=()=>{haptic();setView(HOME)};
wireInfo($("#v-dash"),()=>render());
let canDictate=false;
dictationSupported().then(ok=>{micBtn.hidden=!ok;canDictate=ok;if(currentView!=="import")render()});
micBtn.onclick=()=>{dict.listening?stopListening():startListening()};
function reparse(){dict.items=parseDictation(dict.text,[...new Set(tasks.map(t=>t.cat))])}
async function startListening(){
  if(dict.listening)return;
  const keep=dict.open?dict.text:"";
  dict.open=true;dict.listening=true;dict.note="";dict.text=keep;reparse();drawDict();haptic();
  micBtn.classList.add("live");micBtn.setAttribute("aria-label","Stop dictating");
  dict.session=await startDictation({lang:pref("dictLang")||"en-IN",
    onText:t=>{dict.text=collapseRepeats((keep?keep+" ":"")+t);reparse();drawDict(true)},
    onEnd:why=>{
      dict.listening=false;dict.session=null;micBtn.classList.remove("live");micBtn.setAttribute("aria-label","Dictate tasks");
      dict.note=why==="denied"?"The microphone is blocked. Allow microphone access for Done & Dusted in your "+(isNative?"phone's app settings":"browser's site settings")+", then tap the mic again."
        :why==="error"?"Couldn't hear that. Check your connection and tap the mic to try again."
        :!dict.text?"Didn't catch anything. Tap the mic and try again.":"";
      drawDict();
    }});
}
function stopListening(){dict.session&&dict.session.stop()}
const DLANGS=[["en-IN","English"],["hi-IN","हिन्दी"],["kn-IN","ಕನ್ನಡ"],["ta-IN","தமிழ்"]];
function langsHTML(){const cur=pref("dictLang")||"en-IN";
  return `<div class="dict-langs" role="group" aria-label="Language you speak">${DLANGS.map(([c,n])=>`<button class="chip" data-lang="${c}" lang="${c}" aria-pressed="${c===cur}">${n}</button>`).join("")}</div>`}
function closeDict(){stopListening();dict.open=false;dict.text="";dict.items=[];dict.note="";dictEl.hidden=true;dictEl.innerHTML=""}
function drawDict(liveOnly){
  if(!dict.open){dictEl.hidden=true;return}
  dictEl.hidden=false;
  const cards=dict.items.map((x,i)=>`<div class="dcard" style="--cc:${cc(x.cat)};--d:${Math.min(i,8)}"><span class="cdot"></span><div class="body"><div class="t">${x.pri?'<span class="cflag">! </span>':""}${esc(x.title)}</div>
      <div class="meta"><span class="cat">${esc(x.cat)}${x.catGuessed&&x.cat!=="Inbox"?" (guessed)":""}</span><span>${x.due?"⏰ "+esc(fmtDue(x.due)):"No date"}</span>${x.pri?'<span class="flag">● Important</span>':""}</div></div>
      ${dict.listening?"":`<button class="more" data-drop="${i}" aria-label="Remove this task">✕</button>`}</div>`).join("");
  // while listening, only the transcript and cards change, so the text box keeps its cursor when editing afterwards
  if(liveOnly&&dictEl.querySelector("#dictLive")){
    dictEl.querySelector("#dictLive").textContent=dict.text||"Listening…";
    dictEl.querySelector("#dictCards").innerHTML=cards;
    dictEl.querySelector("#dictCount").textContent=dict.items.length?`${dict.items.length} task${dict.items.length>1?"s":""} heard`:"";
    return;
  }
  const n=dict.items.length;
  dictEl.innerHTML=`<div class="dict-head">${dict.listening
      ?`<span class="wave" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span><b>Listening</b><span class="mono" id="dictCount">${n?`${n} task${n>1?"s":""} heard`:""}</span>`
      :`<b>${n?"Check what I heard":"Dictate tasks"}</b><span class="mono" id="dictCount"></span>`}
      <button class="btn sm" id="dictClose">Cancel</button></div>
    ${langsHTML()}
    ${dict.listening
      ?`<p class="dict-live" id="dictLive">${esc(dict.text)||"Listening…"}</p><p class="dict-tip">Say several in one go: “Pay the electricity bill tomorrow at 6 pm, then call the plumber on Friday. It's important.”</p>`
      :`<textarea class="dict-text" id="dictText" rows="3" aria-label="What was heard. Edit to correct it." placeholder="Tap the mic and speak, or type here">${esc(dict.text)}</textarea>`}
    ${dict.note?`<p class="rem-p warnline">${esc(dict.note)}</p>`:""}
    <div class="dcards" id="dictCards">${cards}</div>
    <div class="acts">${dict.listening
      ?`<button class="btn pri" id="dictStop">Done speaking</button>`
      :`<button class="btn pri" id="dictAdd"${n?"":" disabled"}>Add ${n||""} task${n===1?"":"s"}</button><button class="btn" id="dictMore">🎤 Say more</button>`}</div>`;
  $("#dictClose").onclick=closeDict;
  dictEl.querySelectorAll("[data-lang]").forEach(b=>b.onclick=()=>{
    if(b.dataset.lang===(pref("dictLang")||"en-IN"))return;
    setPref("dictLang",b.dataset.lang);haptic();
    if(dict.listening){stopListening();setTimeout(startListening,350)}else drawDict(); // switch language mid-way: restart, keeping what was heard
  });
  if(dict.listening){$("#dictStop").onclick=stopListening;return}
  const ta=$("#dictText");
  ta.oninput=()=>{dict.text=ta.value;reparse();
    $("#dictCards").innerHTML=dict.items.map((x,i)=>`<div class="dcard" style="--cc:${cc(x.cat)}"><span class="cdot"></span><div class="body"><div class="t">${x.pri?'<span class="cflag">! </span>':""}${esc(x.title)}</div><div class="meta"><span class="cat">${esc(x.cat)}</span><span>${x.due?"⏰ "+esc(fmtDue(x.due)):"No date"}</span>${x.pri?'<span class="flag">● Important</span>':""}</div></div></div>`).join("");
    const b=$("#dictAdd"),k=dict.items.length;b.disabled=!k;b.textContent=`Add ${k||""} task${k===1?"":"s"}`};
  $("#dictMore").onclick=startListening;
  $("#dictCards").onclick=e=>{const b=e.target.closest("[data-drop]");if(!b)return;dict.items.splice(+b.dataset.drop,1);drawDictAfterDrop()};
  $("#dictAdd").onclick=()=>{
    const now=Date.now(),list=dict.items.map((x,i)=>({id:uid()+i,title:x.title,cat:x.cat,due:x.due,pri:x.pri,rep:x.rep||null,who:x.who||null,effort:x.effort||null,mins:x.mins||null,done:false,doneAt:null,createdAt:now+i,src:"voice"}));
    if(!list.length)return;
    if(examples)animIn=true;
    burstAt("#dictAdd",20);haptic("success");
    lastAdded=list[list.length-1].id;
    closeDict();saveMany(list);
    toast({t:`Added ${list.length} task${list.length>1?"s":""}`,s:list.slice(0,3).map(t=>t.title).join(", ")+(list.length>3?"…":""),ttl:3500});
    afterAdd();
  };
}
function drawDictAfterDrop(){ // a card was removed by hand: keep the remaining cards as they are
  const keep=dict.items.slice();drawDict();dict.items=keep;
  const n=keep.length,b=$("#dictAdd");if(b){b.disabled=!n;b.textContent=`Add ${n||""} task${n===1?"":"s"}`}
  $("#dictCards").innerHTML=keep.map((x,i)=>`<div class="dcard" style="--cc:${cc(x.cat)}"><span class="cdot"></span><div class="body"><div class="t">${x.pri?'<span class="cflag">! </span>':""}${esc(x.title)}</div><div class="meta"><span class="cat">${esc(x.cat)}</span><span>${x.due?"⏰ "+esc(fmtDue(x.due)):"No date"}</span>${x.pri?'<span class="flag">● Important</span>':""}</div></div><button class="more" data-drop="${i}" aria-label="Remove this task">✕</button></div>`).join("");
}

/* ---------- views ---------- */
function setView(v){
  const changed=currentView!==v;currentView=v;
  $("#v-plan").hidden=v!=="plan";$("#v-dash").hidden=v!=="dash";$("#v-import").hidden=v!=="import";
  if(v==="dash"&&!pref("sawDash"))setPref("sawDash",true);
  if(v==="plan"&&changed)setPref("planSeen",(pref("planSeen")||0)+1);
  document.body.dataset.view=v;
  $("#subTitle").textContent=v==="tasks"?(filter==="All"?"All tasks":filter):v==="import"?"Import":v==="plan"?"This week":"";
  if(changed){animIn=true;scrollTo(0,0);if(v==="import"){const s=$("#v-import");s.classList.remove("view-in");void s.offsetWidth;s.classList.add("view-in")}}
  render();
}

function render(){
  const list=view(),now=Date.now(),t0=sod(now).getTime();
  document.documentElement.style.setProperty("--ph",-(now%12000)+"ms");
  const open=list.filter(t=>!t.done);
  const over=open.filter(t=>t.due&&t.due<now).length;
  const today=open.filter(t=>t.due&&t.due>=now&&t.due<t0+DAY).length;
  const d=new Date();
  $("#greet").innerHTML=loaded?`${partOfDay()} · ${d.toLocaleDateString("en-IN",{weekday:"short",day:"numeric",month:"short"})} · <b id="g-today">${today}</b> due today${over?` · <b id="g-over" style="color:var(--danger)">${over}</b> overdue`:""}`:"Loading your tasks…";
  if(loaded){
    if(prevGreet.today!==null&&prevGreet.today!==today)$("#g-today")?.classList.add("bump");
    if(prevGreet.over!==null&&prevGreet.over!==over)$("#g-over")?.classList.add("bump");
    prevGreet={today,over};
  }
  if(listOpen) renderTasks(list,now,t0);
  if(currentView==="dash") renderDash(list,now,t0);
  if(currentView==="plan") renderPlan(list,now,t0);
  if(!$("#pop").hidden&&!popEdit)drawDayPop(); // keep an open day pop-up in step with changes
  if(loaded)animIn=false;
}

function cats(list){const m={};list.forEach(t=>{m[t.cat]=m[t.cat]||{open:0,done:0};t.done?m[t.cat].done++:m[t.cat].open++});return m}

function renderTasks(list,now,t0){
  const el=$("#v-tasks");
  if(!loaded){el.innerHTML='<div class="empty">Loading your tasks…</div>';return}
  const m=cats(list),names=Object.keys(m).sort((a,b)=>(m[b].open-m[a].open)||a.localeCompare(b));
  if(filter!=="All"&&!m[filter])filter="All";
  $("#listTitle").textContent=filter==="All"?"All tasks":filter+" tasks";
  const f=list.filter(t=>filter==="All"||t.cat===filter);
  const open=f.filter(t=>!t.done),done=f.filter(t=>t.done).sort((a,b)=>(b.doneAt||0)-(a.doneAt||0));
  const by=k=>(a,b)=>(a.due??Infinity)-(b.due??Infinity)||b.pri-a.pri;
  const groups=[
    ["Overdue","over",open.filter(t=>t.due&&t.due<now)],
    ["Today","tod",open.filter(t=>t.due&&t.due>=now&&t.due<t0+DAY)],
    ["Next 7 days","",open.filter(t=>t.due&&t.due>=t0+DAY&&t.due<t0+8*DAY)],
    ["Later","",open.filter(t=>t.due&&t.due>=t0+8*DAY)],
    ["No date","",open.filter(t=>!t.due).sort((a,b)=>b.pri-a.pri||b.createdAt-a.createdAt)],
  ];
  let h="";D=0;
  h+=`<div class="chips" role="group" aria-label="Filter by category"><button class="chip" aria-pressed="${filter==="All"}" data-f="All">All <span class="n">${list.filter(t=>!t.done).length}</span></button>`+
     names.map((c,i)=>`<button class="chip" style="--d:${Math.min(i+1,10)}" aria-pressed="${filter===c}" data-f="${esc(c)}"><span class="dot" style="background:${cc(c)}"></span>${esc(c)} <span class="n">${m[c].open}</span></button>`).join("")+`</div>`;
  if(!examples&&filter!=="All"&&tasks.some(t=>t.cat===filter&&!t.done))h+=`<div class="share-row"><button class="linkbtn" id="shareList">Share ${esc(filter)} list</button></div>`;
  if(!examples&&open.length&&!pref("swipeTip")&&matchMedia("(pointer:coarse)").matches)
    h+=`<div class="note" style="--d:0"><span>Tip: swipe a task right to finish it, or left to move it to tomorrow.</span><button id="tipOk">Got it</button></div>`;
  let any=false;
  for(const [name,cls,arr] of groups){
    if(!arr.length)continue;any=true;
    if(name!=="No date")arr.sort(by());
    h+=`<div class="sec ${cls}"><h3 style="--d:${Math.min(D++,14)}">${name} <span class="cnt">${arr.length}</span></h3><div class="list">${arr.map(t=>rowHTML(t)).join("")}</div></div>`;
  }
  if(!any) h+=`<div class="list" style="margin-top:14px"><div class="empty">${filter==="All"?"Nothing open. Add a task above or import from Keep.":"Nothing open in "+esc(filter)+"."}</div></div>`;
  if(done.length) h+=`<details class="sec donebox"${openEdit&&done.some(t=>t.id===openEdit)||doneOpen?" open":""}><summary><h3 style="--d:${Math.min(D++,14)}">Done ▸ <span class="cnt">${done.length}</span></h3></summary><div class="list">${done.slice(0,50).map(t=>rowHTML(t)).join("")}</div></details>`;
  el.classList.toggle("enter",animIn);
  el.innerHTML=h;
  const db=el.querySelector(".donebox");if(db)db.ontoggle=()=>{doneOpen=db.open};
  lastAdded=null;
  el.querySelectorAll("[data-f]").forEach(b=>b.onclick=()=>{filter=b.dataset.f;render()});
  const sl=el.querySelector("#shareList");if(sl)sl.onclick=()=>shareList(filter);
  const gi=el.querySelector("#goImp");if(gi)gi.onclick=()=>setView("import");
  wireOnboard(el);
  if(el.querySelector("#doGo")){el.querySelector("#doGo").onclick=startDust;el.querySelector("#doLater").onclick=()=>{setPref("dustSkip",sod(Date.now()).getTime());render()}}
  const tip=el.querySelector("#tipOk");if(tip)tip.onclick=()=>{setPref("swipeTip",true);render()};
  el.querySelectorAll(".row").forEach(r=>{
    const t=view().find(x=>x.id===r.dataset.id);if(!t)return;
    r.querySelector(".tick").onclick=e=>{
      if(t.done){save({...t,done:false,doneAt:null});return}
      if(r.classList.contains("completing"))return;
      const b=e.currentTarget.getBoundingClientRect();
      burst(b.left+b.width/2,b.top+b.height/2,16,[tok(catVar(t.cat)),tok("--accent"),tok(catVar(t.cat))],.8);
      const rr=r.getBoundingClientRect();setTimeout(()=>puff(rr.left+rr.width*.55,rr.top+rr.height/2,rr.width*.5),380);dustBrand();
      r.classList.add("completing");alarms.delete(t.id);haptic("success");
      setTimeout(()=>{
        const before=dueTodayOpen();
        save({...t,done:true,doneAt:Date.now()});
        const after=dueTodayOpen();
        if(before>0&&after===0){rain();toast({t:"Today: done & dusted",s:"Everything due today is finished. Put your feet up.",ttl:4500})}
        else toast({t:"Dusted ✓",s:t.title,ttl:2500,undo:()=>save({...t})});
      },REDUCED.matches?0:700);
    };
    r.querySelector(".more").onclick=()=>{openEdit=openEdit===t.id?null:t.id;render()};
    if(!t.done&&openEdit!==t.id)wireSwipe(r,t);
    const f=r.querySelector(".edit");if(f)wireEditForm(f,t,()=>{openEdit=null});
  });
}
/* Swipe a task: right to finish it, left to move it to tomorrow. Touch and pen only; vertical drags still scroll. */
function wireSwipe(r,t){
  let sx=0,sy=0,dx=0,pid=null,on=false,dead=false,armed=false,bg=null;
  const lim=()=>Math.min(120,r.offsetWidth*.32);
  const set=x=>{dx=x;r.style.setProperty("--sx",x+"px");
    if(bg){bg.className="swipe-bg "+(x>=0?"go":"later")+(Math.abs(x)>=lim()?" armed":"");bg.style.width=Math.abs(x)+"px";bg.firstChild.textContent=x>=0?"✓ Done":"Tomorrow →"}};
  const tidy=()=>{r.classList.remove("swiping","swipe-back");r.style.removeProperty("--sx");if(bg){bg.remove();bg=null}};
  r.addEventListener("pointerdown",e=>{
    if(e.pointerType==="mouse"||e.target.closest("button,input,select,textarea,.edit")||r.classList.contains("completing")||r.classList.contains("swipe-back"))return;
    sx=e.clientX;sy=e.clientY;dx=0;pid=e.pointerId;on=false;dead=false;armed=false;
  });
  r.addEventListener("pointermove",e=>{
    if(e.pointerId!==pid||dead)return;
    const x=e.clientX-sx,y=e.clientY-sy;
    if(!on){
      if(Math.abs(x)<10&&Math.abs(y)<10)return;
      if(Math.abs(x)<Math.abs(y)*1.3){dead=true;return} // mostly vertical: leave it to scrolling
      on=true;r.classList.add("swiping");try{r.setPointerCapture(pid)}catch{}
      bg=document.createElement("span");bg.innerHTML="<b></b>";r.appendChild(bg);
    }
    set(x);
    const a=Math.abs(x)>=lim();if(a&&!armed)haptic();armed=a;
  });
  const up=e=>{
    if(e.pointerId!==pid)return;pid=null;
    if(!on)return;on=false;
    const go=e.type==="pointerup"&&Math.abs(dx)>=lim(),right=dx>0;
    r.classList.remove("swiping");r.classList.add("swipe-back");
    if(go&&!pref("swipeTip"))setPref("swipeTip",true);
    if(!go){set(0);setTimeout(tidy,220)}
    else if(right){set(0);setTimeout(()=>{tidy();r.querySelector(".tick").click()},140)}
    else{const w=r.offsetWidth;r.style.setProperty("--sx",-w+"px");bg.style.width=w+"px";setTimeout(()=>snooze(t),REDUCED.matches?0:200)}
  };
  r.addEventListener("pointerup",up);r.addEventListener("pointercancel",up);
}
/* The edit form for one task. Used in the list and in the task pop-up on the map; px keeps field ids unique. */
function editFormHTML(t,px,inPop){
  const all=[...new Set([...Object.keys(KNOWN),...view().map(x=>x.cat)])],id=`${px}-${esc(t.id)}`;
  return `<div class="edit">
      <label class="full">Task<input name="title" id="${id}-title" value="${esc(t.title)}"></label>
      <label>Category<select name="cat" id="${id}-cat">${all.map(c=>`<option${c===t.cat?" selected":""}>${esc(c)}</option>`).join("")}<option value="__new">New category…</option></select>
        <input class="newcat" name="newcat" id="${id}-new" placeholder="Category name" hidden></label>
      <label>Due<input type="datetime-local" name="due" id="${id}-due" value="${toLocalInput(t.due)}"></label>
      <label>Priority<select name="pri" id="${id}-pri"><option value="0"${!t.pri?" selected":""}>Normal</option><option value="1"${t.pri?" selected":""}>Important</option></select></label>
      <label>Repeat<select name="rep" id="${id}-rep"><option value="">Doesn't repeat</option>${Object.entries(REPEATS).map(([k,n])=>`<option value="${k}"${t.rep===k?" selected":""}>${n}</option>`).join("")}</select></label>
      <label class="full">Note<textarea name="note" id="${id}-note">${esc(t.note||"")}</textarea></label>
      <div class="acts"><button class="btn pri" data-a="save">Save</button>${inPop?`<button class="btn" data-a="cancel">Cancel</button>`:""}${t.due?`<button class="btn" data-a="cal">Add to calendar</button>`:`<button class="btn" data-a="cal" hidden></button>`}${t.done||inPop?"":`<button class="btn" data-a="tmr">Move to tomorrow</button>`}${t.done?"":`<button class="btn" data-a="focus">Focus</button>`}${inPop?"":`<button class="btn warn" data-a="del">Delete</button>`}</div>
    </div>`;
}
function wireEditForm(f,t,close){
  f.querySelector("[data-a=save]").onclick=()=>{
    const v=n=>f.querySelector(`[name=${n}]`).value;
    let cat=v("cat")==="__new"?titleCase(v("newcat")||"Inbox"):v("cat");
    let due=v("due")?new Date(v("due")).getTime():null;const rp=v("rep")||null;
    if(rp&&!due){const n=new Date(),d=sod(n);d.setHours(9,0,0,0);if(d<=n)d.setDate(d.getDate()+1);due=d.getTime(); // a repeat needs a first date
      toast({t:"Starts "+fmtDue(due),s:"A repeating task needs a date, so it starts at the next 9am.",ttl:4000})}
    close();save({...t,title:v("title").trim()||t.title,cat,due,pri:+v("pri"),rep:rp,note:v("note"),reminded:due!==t.due?false:t.reminded});
    toast({t:"Saved",s:v("title").trim()||t.title,ttl:2000});
  };
  const tm=f.querySelector("[data-a=tmr]");if(tm)tm.onclick=()=>{close();snooze(t)};
  const fo=f.querySelector("[data-a=focus]");if(fo)fo.onclick=()=>{close();startFocus(t.id)};
  const de=f.querySelector("[data-a=del]");if(de)de.onclick=()=>{close();remove(t);toast({t:"Deleted",s:t.title,ttl:4000,undo:()=>save(t)})};
  const ca=f.querySelector("[data-a=cancel]");if(ca)ca.onclick=()=>{popEdit=false;drawDayPop()};
  f.querySelector("[data-a=cal]").onclick=()=>exportICS([t]);
  const sel=f.querySelector("[name=cat]");sel.onchange=()=>{f.querySelector(".newcat").hidden=sel.value!=="__new"};
}
function rowHTML(t){
  const now=Date.now(),late=!t.done&&t.due&&t.due<now;
  const mins=t.due?Math.round((t.due-now)/6e4):null;
  const soon=!t.done&&t.due&&mins>=0&&mins<=15;
  const alarm=!t.done&&alarms.has(t.id)&&alarms.get(t.id)>now;
  const t0=sod(now).getTime();
  const today=!t.done&&t.due&&t.due>=now&&t.due<t0+DAY;
  const close=today&&mins<=60;
  const lateMs=late?now-t.due:0;
  const lvl=!late?"":lateMs>=3*DAY?"l3":lateMs>=DAY?"l2":"l1";
  const age=!late?"":lateMs<3600e3?`${Math.max(1,Math.round(lateMs/6e4))} min late`:lateMs<DAY?`${Math.round(lateMs/3600e3)} hr late`:`${Math.floor(lateMs/DAY)} day${lateMs>=2*DAY?"s":""} late`;
  // fuse: share of time left between the start of its window (created or start of day, whichever is later) and the due time
  let left=100;if(today){const start=Math.max(t0,Math.min(t.createdAt||t0,t.due-6e4));left=Math.max(2,Math.min(100,(t.due-now)/(t.due-start)*100))}
  const cls=[t.done?"done":"",late?"late "+lvl:"",today?"today":"",close?"close":"",soon?"soon":"",alarm?"alarm":"",lastAdded===t.id?"new":""].filter(Boolean).join(" ");
  const when=soon?(mins<=0?"Due now":`Due in ${mins} min`):close?`Due in ${mins} min`:fmtDue(t.due);
  const icon=late?'<span class="warn">⚠</span> ':soon?'<span class="bell">🔔</span> ':today?'<span class="clock">⏰</span> ':"⏰ ";
  let h=`<div class="row ${cls}" data-id="${esc(t.id)}" style="--cc:${cc(t.cat)};--d:${Math.min(D++,14)}${today?`;--left:${left.toFixed(1)}%`:""}">
   <button class="tick" aria-label="${t.done?"Mark not done":"Mark done"}"></button>
   <div class="body"><div class="t">${esc(t.title)}</div><div class="meta">
     <span class="cat">${esc(t.cat)}</span>
     ${late?`<span class="age" title="Was due ${esc(fmtDue(t.due))}">${esc(age)}</span>`:t.due?`<span class="when">${icon}${esc(when)}</span>`:""}
     ${t.pri?`<span class="flag" role="img" aria-label="Important" title="Important">●</span>`:""}
     ${t.who?`<span class="who">👤 ${esc(t.who)}</span>`:""}${t.effort?`<span class="eff" title="${t.effort==="quick"?"Quick":"Big"}${t.mins?" · "+fmtMins(t.mins):""}">${t.effort==="quick"?"⚡":"⛰"}</span>`:""}
     ${t.rep?`<span class="rep">↻ ${esc(repLabel(t.rep))}</span>`:""}
     ${t.src==="keep"?`<span class="src">Keep</span>`:""}
     ${t.note?`<span style="overflow-wrap:anywhere">${esc(String(t.note).slice(0,80))}</span>`:""}
   </div></div>
   <button class="more" aria-label="Edit task" aria-expanded="${openEdit===t.id}">⋯</button>${today?'<span class="fuse" aria-hidden="true"></span>':""}`;
  if(openEdit===t.id)h+=editFormHTML(t,"e");
  return h+`</div>`;
}

/* ---------- dashboard ---------- */
/* The Dashboard's parts, in the order they show. All are on until the person hides them. */
const DASH=[["map","Task map"],["tiles","Summary numbers"],["heat","Status heatmap"],["ring","Today's progress"],["cats","By category"],["week","Coming up"],["chart","Last 14 days"],["rem","Reminders"]];
let dashEdit=false,dashOpening=false; // dashOpening: animate the chips panel only as it opens
function dashBarHTML(hide){
  return `<div class="dash-bar"><button class="btn sm" id="dashEdit" aria-expanded="${dashEdit}" aria-controls="dashPick">${dashEdit?"Done":"Customise"}</button></div>`+
  (dashEdit?`<div class="dash-pick${dashOpening?" in":""}" id="dashPick"><p>Tap a part to show or hide it on the Dashboard.</p>
    <div class="dash-chips" role="group" aria-label="Show on the Dashboard">${DASH.map(([k,n])=>`<button class="chip" data-dash="${k}" aria-pressed="${!hide.has(k)}">${n}</button>`).join("")}</div>
    ${hide.size?`<button class="btn sm" id="dashReset">Show all</button>`:""}</div>`:"");
}
/* Notes that sit above the Task map on the home screen: getting started, backup, weekly dust-off, examples */
function homeNotesHTML(){
  let h="";
  if(!examples){const g=getDustedHTML();if(g)h+=g;else if(dataNoteDue())h+=dataNoteHTML()}
  if(dustOffDue()){const n=staleTasks().length;h+=`<div class="note dust-note" style="--d:0"><span>🧹 <b>Weekly dust-off.</b> ${n} tasks are gathering dust. Two minutes to sort them.</span><span class="note-acts"><button id="doGo">Start</button><button id="doLater">Not now</button></span></div>`}
  if(examples) h+=`<div class="note" style="--d:0"><span>These are example tasks so you can see how Done &amp; Dusted works. They vanish when you add a task or import from Keep.</span><span class="note-acts"><button id="goFresh">Start fresh</button><button id="goImp">Import from Keep</button></span></div>`;
  return h;
}
function wireHomeNotes(el){
  wireOnboard(el);
  const gi=el.querySelector("#goImp");if(gi)gi.onclick=()=>setView("import");
  if(el.querySelector("#doGo")){el.querySelector("#doGo").onclick=startDust;el.querySelector("#doLater").onclick=()=>{setPref("dustSkip",sod(Date.now()).getTime());render()}}
}
function renderDash(list,now,t0){
  const el=$("#v-dash");
  if(!loaded){el.innerHTML='<div class="empty">Loading your tasks…</div>';return}
  if(!tasks.length&&!pref("start")){ // first run: ask how they want to start
    el.classList.toggle("enter",animIn);el.innerHTML=startHTML();wireStart(el);return;
  }
  const open=list.filter(t=>!t.done),done=list.filter(t=>t.done);
  const overdue=open.filter(t=>t.due&&t.due<now);
  const todayAll=list.filter(t=>t.due&&t.due>=t0&&t.due<t0+DAY);
  const todayDone=todayAll.filter(t=>t.done).length+done.filter(t=>t.doneAt>=t0&&!(t.due>=t0&&t.due<t0+DAY)).length;
  const todayTotal=todayAll.length+done.filter(t=>t.doneAt>=t0&&!(t.due>=t0&&t.due<t0+DAY)).length;
  const weekDone=done.filter(t=>t.doneAt>=t0-6*DAY).length;
  const pct=todayTotal?todayDone/todayTotal:0;
  // streak
  let streak=0;for(let i=0;i<60;i++){const s=t0-i*DAY;if(done.some(t=>t.doneAt>=s&&t.doneAt<s+DAY))streak++;else if(i>0)break;}
  // 14 day series
  const days=[...Array(14)].map((_,i)=>{const s=t0-(13-i)*DAY;return{s,done:done.filter(t=>t.doneAt>=s&&t.doneAt<s+DAY).length,added:list.filter(t=>t.createdAt>=s&&t.createdAt<s+DAY).length}});
  // next 7 load
  const week=[...Array(7)].map((_,i)=>{const s=t0+i*DAY;return{s,n:open.filter(t=>t.due>=s&&t.due<s+DAY).length}});
  const wmax=Math.max(...week.map(w=>w.n));
  const m=cats(list),names=Object.keys(m).sort((a,b)=>(m[b].open+m[b].done)-(m[a].open+m[a].done));
  const cmax=Math.max(1,...names.map(c=>m[c].open+m[c].done));
  const R=60,C=2*Math.PI*R;
  const next=open.filter(t=>t.due).sort((a,b)=>a.due-b.due).slice(0,4);

  let h=homeNotesHTML();
  // each part is built on its own; the person picks which ones show (Customise)
  const P={};
  P.tiles=`<div class="tiles">
    <div class="tile" style="--d:0"><div class="k">Open</div><div class="v" data-n="${open.length}">${open.length}</div><div class="s">${open.filter(t=>!t.due).length} without a date</div></div>
    <div class="tile ${todayAll.some(t=>!t.done)?"warm":""}" style="--d:1"><div class="k">Due today</div><div class="v" data-n="${todayAll.filter(t=>!t.done).length}">${todayAll.filter(t=>!t.done).length}</div><div class="s">${todayDone} done today</div></div>
    <div class="tile ${overdue.length?"bad":""}" style="--d:2"><div class="k">Overdue</div><div class="v" data-n="${overdue.length}">${overdue.length}</div><div class="s">${overdue.length?"oldest "+fmtDue(Math.min(...overdue.map(t=>t.due))):"all clear"}</div></div>
    <div class="tile" style="--d:3"><div class="k">Done · 7 days</div><div class="v" data-n="${weekDone}">${weekDone}</div><div class="s">${streak} day streak${streak>=3?" 🔥":""}</div></div>
  </div>`;
  if(tmCat&&!list.some(t=>t.cat===tmCat))tmCat=null;
  const mode=pref("mapMode")||"week";
  P.map=`<div class="panel home-map" style="--d:0"><div class="map-head"><h4>Task map ${infoBtn("map")}</h4>
      <div class="map-ctl"><div class="mode-seg" role="group" aria-label="Map view"><button data-mmode="day" aria-pressed="${mode==="day"}">Day</button><button data-mmode="week" aria-pressed="${mode==="week"}">Week</button></div>
      <button class="map-add" id="mapAdd" aria-label="Add a task"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button></div></div>
    ${mapHTML(list,now,t0,mode)}
    ${open.length?`<button class="btn auto plan-btn" id="autoBtn"><span class="spark">✦</span> Plan my week</button>`:""}</div>`;
  P.heat=`<div class="panel" style="--d:4"><h4>Status heatmap <small>% done per day ${infoBtn("heat")}</small></h4>${heatmapHTML(list,now,t0)}</div>`;
  P.ring=`<div class="panel ring" style="--d:4"><svg viewBox="0 0 150 150" role="img" aria-label="Today ${Math.round(pct*100)} percent complete">
      <circle cx="75" cy="75" r="${R}" fill="none" stroke="var(--sunk)" stroke-width="14"/>
      <circle class="prog" cx="75" cy="75" r="${R}" fill="none" stroke="var(--accent)" stroke-width="14" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C*(1-pct)}" transform="rotate(-90 75 75)" style="--c:${C}"/>
      <text x="75" y="80" text-anchor="middle" fill="var(--ink)" style="font:800 30px var(--f-display)"><tspan data-n="${Math.round(pct*100)}">${Math.round(pct*100)}</tspan>%</text>
      <text x="75" y="100" text-anchor="middle" fill="var(--muted)" style="font:600 11px var(--f-body)">${todayDone} of ${todayTotal}</text>
    </svg><div class="lbl">Today's progress</div></div>`;
  P.cats=`<div class="panel" style="--d:5"><h4>By category <small>open vs done</small></h4><div class="bars">${names.length?names.map((c,ci)=>{const o=m[c].open,d=m[c].done;return `<div class="bar" style="--d:${ci}"><span class="nm" style="color:${cc(c)}">${esc(c)}</span><span class="track" style="width:${Math.max(8,(o+d)/cmax*100)}%"><span style="width:${o/(o+d)*100}%;background:${cc(c)}"></span><span style="width:${d/(o+d)*100}%;background:color-mix(in srgb,${cc(c)} 35%,var(--sunk))"></span></span><span class="num mono">${o} / ${d}</span></div>`}).join(""):`<div class="empty">No tasks yet.</div>`}</div>
      <div class="legend"><span><i style="background:var(--muted)"></i>Open</span><span><i style="background:color-mix(in srgb,var(--muted) 35%,var(--sunk))"></i>Done</span></div></div>`;
  P.week=`<div class="panel" style="--d:6"><h4>Coming up <small>open tasks due, next 7 days</small></h4><div class="week">${week.map((w,i)=>`<div style="--d:${i}" class="day${w.n&&w.n===wmax?" max":w.n?" hot":""}">${i===0?"Today":new Date(w.s).toLocaleDateString("en-IN",{weekday:"short"})}<b>${w.n}</b>${new Date(w.s).getDate()}</div>`).join("")}</div>
    ${next.length?`<div class="list" style="margin-top:12px">${next.map(t=>`<div class="row" style="--cc:${cc(t.cat)};grid-template-columns:auto 1fr auto"><span class="tick" style="border-style:dotted"></span><div class="body"><div class="t">${esc(t.title)}</div><div class="meta"><span class="cat">${esc(t.cat)}</span></div></div><span class="mono ${t.due<now?"late":""}" style="color:${t.due<now?"var(--danger)":"var(--muted)"}">${esc(fmtDue(t.due))}</span></div>`).join("")}</div>`:""}
  </div>`;
  P.chart=`<div class="panel" style="--d:7"><h4>Last 14 days <small>tasks completed vs added</small></h4><div class="chart">${chart14(days)}</div>
    <div class="legend"><span><i style="background:var(--accent)"></i>Completed</span><span><i style="background:var(--muted)"></i>Added</span></div></div>`;
  P.rem=`<div class="panel" style="--d:8" id="remPanel">${remindersPanelHTML(open,now)}</div>`;
  const hide=new Set(pref("dashHidden")||[]),on=k=>!hide.has(k),parts=[];
  for(const [k] of DASH){
    if(!on(k))continue;
    if(k==="ring"&&on("cats")){parts.push(`<div class="two">${P.ring}${P.cats}</div>`);continue}
    if(k==="cats"&&on("ring"))continue;
    parts.push(P[k]);
  }
  h=h+(parts.join("")||`<div class="empty dash-empty">Every part of this screen is hidden. Tap Customise to bring some back.</div>`)+dashBarHTML(hide);
  el.classList.toggle("dash-in",animIn);
  el.innerHTML=h;
  if(animIn)el.querySelectorAll("[data-n]").forEach(n=>countUp(n,+n.dataset.n));
  dashOpening=false;
  $("#dashEdit").onclick=()=>{dashEdit=!dashEdit;dashOpening=dashEdit;haptic();render()};
  el.querySelectorAll("[data-dash]").forEach(b=>b.onclick=()=>{
    const hid=new Set(pref("dashHidden")||[]),k=b.dataset.dash;
    hid.has(k)?hid.delete(k):hid.add(k);setPref("dashHidden",[...hid]);haptic();render();
  });
  const dr=$("#dashReset");if(dr)dr.onclick=()=>{setPref("dashHidden",[]);haptic();render()};
  const tw=el.querySelector(".tm-wrap");
  if(tw)tw.addEventListener("click",e=>{
    const go=e.target.closest("[data-tmgo]"),tk=e.target.closest("[data-tid]"),b=e.target.closest("[data-tcat]"),sd=e.target.closest("[data-tmdone]"),dy=e.target.closest("[data-tday]"),up=e.target.closest("[data-tmup]");
    if(go){openList(tmCat);return}
    if(dy){tmDay=dy.dataset.tday;animIn=true;haptic();render();return}
    if(up){tmDay=null;animIn=true;haptic();render();return}
    if(sd){tmDone=!tmDone;haptic();render();return}
    if(tk){tmTask=tk.dataset.tid;popEdit=false;hmSel=null;haptic();openDayPop();return} // same pop-up as a heatmap day
    if(b){const c=b.dataset.tcat||null;tmCat=tmCat===c?null:c;animIn=true;haptic();render()}
  });
  const hm=el.querySelector(".hm");
  if(hm)hm.addEventListener("click",e=>{
    const b=e.target.closest(".hm-cell");if(!b||b.classList.contains("n"))return;
    const pick={cat:b.dataset.c,s:+b.dataset.s};
    hmSel=pick;tmTask=null;
    hm.querySelectorAll(".hm-cell.sel").forEach(x=>x.classList.remove("sel"));
    b.classList.add("sel");haptic();
    openDayPop();
  });
  const rs=el.querySelector("#ragSum");
  if(rs)rs.addEventListener("click",e=>{
    const b=e.target.closest("[data-rag]");if(!b)return;
    const k=b.dataset.rag;
    hmReview=hmReview&&hmReview.color===k?null:{color:k,idx:0,total:0};hmSel=null;
    if(hmReview){const r=b.getBoundingClientRect(),col=tok(k==="r"?"--danger":k==="a"?"--amber":"--ok");burst(r.left+r.width/2,r.top+r.height/2,12,[col,col,tok("--ink")],.6);haptic()}
    rs.querySelectorAll(".rag-pill").forEach(x=>{const on=!!hmReview&&x.dataset.rag===hmReview.color;x.classList.toggle("on",on);x.setAttribute("aria-pressed",on)});
    el.querySelectorAll(".hm-cell.sel").forEach(x=>x.classList.remove("sel"));
    redrawReview(false);
    if(hmReview)$("#hm-detail").scrollIntoView({block:"nearest",behavior:REDUCED.matches?"auto":"smooth"});
  });
  const hd=el.querySelector("#hm-detail");
  if(hd)hd.addEventListener("click",e=>{
    if(!hmReview)return;
    const b=e.target.closest("[data-rv]");
    if(b){reviewAct(b.dataset.rv,b.dataset.id,b);return}
    const it=e.target.closest("[data-rvi]");
    if(it&&+it.dataset.rvi!==hmReview.idx){hmReview.idx=+it.dataset.rvi;redrawReview(true)}
  });
  const ab=el.querySelector("#autoBtn");if(ab)ab.onclick=()=>{haptic();autoPlan()};
  const ma=el.querySelector("#mapAdd");if(ma)ma.onclick=()=>openAdd();
  el.querySelectorAll("[data-mmode]").forEach(b=>b.onclick=()=>{setPref("mapMode",b.dataset.mmode);tmDay=null;animIn=true;haptic();render()});
  wireHomeNotes(el);
  wireRemindersPanel();
}
/* ---------- Plan ---------- */
let picked=null,cap=lsGet("dd.cap",4);
function snapRects(){const m=new Map();document.querySelectorAll("#v-plan [data-pid]").forEach(e=>m.set(e.dataset.pid,e.getBoundingClientRect()));return m}
function flip(before,landed=[]){ // cards glide from their old spot to the new one
  if(REDUCED.matches)return;
  document.querySelectorAll("#v-plan [data-pid]").forEach(e=>{
    const a=before.get(e.dataset.pid),b=e.getBoundingClientRect();
    if(landed.includes(e.dataset.pid))e.classList.add("landed");
    if(!a)return;const dx=a.left-b.left,dy=a.top-b.top;if(!dx&&!dy)return;
    e.animate([{transform:`translate(${dx}px,${dy}px) scale(1.04)`,boxShadow:"0 12px 26px rgba(0,0,0,.2)"},{transform:"none",boxShadow:"none"}],{duration:520,easing:"cubic-bezier(.3,1.2,.5,1)"});
  });
}
/* The time you usually get things done: the middle of your last 60 finishes (needs 8+). Undated tasks land here. */
let uhCache=null;
function usualHour(){
  if(uhCache&&uhCache.n===tasks.length)return uhCache.h;
  const d=tasks.filter(t=>t.done&&t.doneAt).sort((a,b)=>b.doneAt-a.doneAt).slice(0,60).map(t=>{const x=new Date(t.doneAt);return x.getHours()+x.getMinutes()/60}).sort((a,b)=>a-b);
  const h=d.length<8?null:Math.min(21,Math.max(7,Math.round(d[Math.floor(d.length/2)]*2)/2));
  uhCache={n:tasks.length,h};return h;
}
function postponeNudge(t){
  const cur=tasks.find(x=>x.id===t.id);if(!cur||cur.done)return;
  haptic("warn");
  toast({t:`Moved ${cur.moves} times`,s:`“${cur.title}” keeps slipping. Break it into a first small step, or let it go?`,sticky:true,actions:[
    ["Break it down",()=>{setView(HOME);q.value=`First step: ${cur.title} today #${cur.cat}`;q.dispatchEvent(new Event("input"));openAdd();q.setSelectionRange(12,12+cur.title.length)},"go"],
    ["Drop it",()=>{remove(cur);toast({t:"Dropped",s:cur.title,ttl:4000,undo:()=>save(cur)})}]]});
}
function placeOn(t,dayStart,now,slot=0){ // keep the task's time of day; if that's already past today, use the next free hour
  if(dayStart===null)return {...t,due:null,reminded:false};
  const d=new Date(dayStart),src=t.due?new Date(t.due):null,uh=usualHour();
  if(src)d.setHours(src.getHours(),src.getMinutes(),0,0);else if(uh!==null)d.setHours(Math.floor(uh)+slot,uh%1?30:0,0,0);else d.setHours(9+slot,0,0,0);
  if(d.getTime()<=now){const n=new Date(now);n.setMinutes(0,0,0);n.setHours(n.getHours()+1+slot);d.setTime(Math.max(d.getTime(),n.getTime()))}
  if(sod(d).getTime()!==dayStart){d.setTime(dayStart);d.setHours(21,0,0,0)}
  return {...t,due:d.getTime(),reminded:false};
}
function moveTo(id,target){ // target: day start ms, or "tray"
  const t=view().find(x=>x.id===id);if(!t)return;
  const now=Date.now(),before=snapRects();
  const day=target==="tray"?null:+target;
  if(day!==null&&t.due&&sod(t.due).getTime()===day&&t.due>=now){picked=null;render();return}
  if(day===null&&!t.due){picked=null;render();return}
  picked=null;
  save(placeOn(t,day,now));
  requestAnimationFrame(()=>flip(before,[id]));
  toast({t:day===null?"Moved to To plan":"Planned for "+fmtDue(placeOn(t,day,now).due),s:t.title,ttl:2200,undo:()=>save(t)});
}
function autoPlan(){
  const list=view(),now=Date.now(),t0=sod(now).getTime();
  const open=list.filter(t=>!t.done);
  const pool=open.filter(t=>!t.due||t.due<now).sort((a,b)=>b.pri-a.pri||((a.due??Infinity)-(b.due??Infinity))||a.createdAt-b.createdAt);
  if(!pool.length){toast({t:"Nothing to plan",s:"Every open task already has a future day.",ttl:3000});return}
  const w=t=>t.effort==="big"?2:t.effort==="quick"?.5:1;
  const free=i=>pref("holidaysFree")!==false&&holidayOn(t0+i*DAY+12*3600e3)?.off;
  const meet=i=>pref("calOnPlan")===false?0:Math.min(2,eventsOn(t0+i*DAY).filter(e=>e.end-e.start>=30*6e4).length*.5); // meetings fill the day too
  const load=[...Array(7)].map((_,i)=>free(i)?Infinity:meet(i)+open.filter(t=>t.due>=now&&t.due>=t0+i*DAY&&t.due<t0+(i+1)*DAY).reduce((n,t)=>n+w(t),0));
  const before=snapRects(),prev=[],next=[];let spill=0;
  for(const t of pool){
    let i=load.findIndex(n=>n+w(t)<=cap);
    if(i<0){i=load.indexOf(Math.min(...load));spill++}
    const placed=placeOn({...t,due:null},t0+i*DAY,now,Math.floor(load[i]));
    load[i]+=w(t);prev.push(t);next.push(placed);
  }
  updateMany(next);setPref("autoPlanned",true);
  requestAnimationFrame(()=>flip(before,next.map(t=>t.id)));
  burstAt("#autoBtn",22);
  toast({t:`Planned ${next.length} task${next.length>1?"s":""}`,s:spill?`Your week is full, so ${spill} went on the lightest days.`:`Important and overdue first, up to ${cap} a day.`,ttl:5000,undo:()=>{const b=snapRects();updateMany(prev);requestAnimationFrame(()=>flip(b))}});
}
function burstAt(sel,n){const e=$(sel);if(!e)return;const r=e.getBoundingClientRect();burst(r.left+r.width/2,r.top+r.height/2,n)}
function cardHTML(t,now,i){
  const late=t.due&&t.due<now;
  const time=!t.due?"":late?fmtDue(t.due):new Date(t.due).toLocaleTimeString("en-IN",{hour:"numeric",minute:"2-digit"}).replace(" ","").toLowerCase();
  return `<button class="card${late?" late":""}${picked===t.id?" picked":""}" draggable="true" data-pid="${esc(t.id)}" style="--cc:${cc(t.cat)};--d:${Math.min(i,12)}" aria-pressed="${picked===t.id}" title="${esc(t.cat)}">
    <span class="cdot"></span><span class="ct">${t.pri?'<span class="cflag">! </span>':""}${esc(t.title)}</span>${time?`<span class="ctime">${esc(time)}</span>`:""}</button>`;
}
function renderPlan(list,now,t0){
  const el=$("#v-plan");
  const open=list.filter(t=>!t.done);
  const tray=open.filter(t=>!t.due||t.due<now).sort((a,b)=>b.pri-a.pri||(a.due??Infinity)-(b.due??Infinity));
  const later=open.filter(t=>t.due>=t0+7*DAY).length;
  const pt=picked?open.find(t=>t.id===picked):null;if(!pt)picked=null;
  const srcDay=pt?(pt.due&&pt.due>=now?sod(pt.due).getTime():"tray"):null;
  let h=(examples?`<div class="note" style="--d:0"><span>Planning the example tasks. Your own tasks appear here once you add or import them.</span></div>`:"")+
  `<div class="plan-bar"><h2>This week</h2><div class="plan-ctl">
    <div class="cap" role="group" aria-label="Tasks per day"><button id="capDown" aria-label="Fewer per day">−</button><span>Up to <b>${cap}</b> a day</span><button id="capUp" aria-label="More per day">+</button></div>
    <button class="btn auto" id="autoBtn"><span class="spark">✦</span> Auto-plan</button>${!examples&&staleTasks().length?`<button class="btn" id="dustBtn">🧹 Dust-off</button>`:""}</div></div>
  ${picked?`<p class="plan-hint">Now tap the day to move it to. Tap the task again to cancel.</p>`:(pref("planSeen")||0)<=3?`<p class="plan-hint">Tap a task, then tap a day to move it. Auto-plan fills each day up to your limit.</p>`:""}
  <div class="tray${srcDay==="tray"?" src":""}" data-drop="tray" style="--d:0"><h4>To plan <small>${tray.length?tray.length+" without a day or overdue":"all planned"}</small></h4>
    <div class="cards">${tray.map((t,i)=>cardHTML(t,now,i)).join("")||'<span class="free">Nothing waiting. Nice.</span>'}</div>
    <button class="dropbtn" data-to="tray">Move here (no date)</button></div>
  <div class="lanes">`;
  for(let i=0;i<7;i++){
    const s=t0+i*DAY,day=open.filter(t=>t.due>=now&&t.due>=s&&t.due<s+DAY).sort((a,b)=>a.due-b.due);
    const doneN=list.filter(t=>t.done&&t.due>=s&&t.due<s+DAY).length;
    const n=day.length,st=n>cap?"r":n===cap?"a":"g";
    const d=new Date(s);
    h+=`<div class="lane${i===0?" is-today":""}${srcDay===s?" src":""}" data-drop="${s}" style="--d:${i+1}">
      <h4><span class="dname">${i===0?'Today <span class="tag">'+d.toLocaleDateString("en-IN",{day:"numeric",month:"short"})+'</span>':i===1?"Tomorrow":d.toLocaleDateString("en-IN",{weekday:"long"})}${i>1?` <small>${d.toLocaleDateString("en-IN",{day:"numeric",month:"short"})}</small>`:""}${(()=>{const hd=pref("festivals")!==false&&holidayOn(s+12*3600e3);return hd?` <span class="hol${hd.off?" off":""}" title="${hd.off?"Public holiday":"Festival"}">${esc(hd.name)}</span>`:""})()}</span>
        <small class="mono">${n}/${cap}${doneN?` · ${doneN} done`:""}</small></h4>
      <div class="meter ${st}" style="--m:${Math.min(100,n/cap*100)}%"><span></span></div>
      ${(()=>{const ev=pref("calOnPlan")===false?[]:eventsOn(s);if(!ev.length)return "";const tf=ms=>new Date(ms).toLocaleTimeString("en-IN",{hour:"numeric",minute:"2-digit"}).replace(" ","").toLowerCase();
        return `<div class="evts">${ev.slice(0,4).map(e=>`<div class="evt"><span class="mono">${tf(Math.max(e.start,s))}</span> ${esc(e.title||"Busy")}</div>`).join("")}${ev.length>4?`<div class="evt more">+${ev.length-4} more in your calendar</div>`:""}</div>`})()}
      <div class="cards">${day.map((t,j)=>cardHTML(t,now,j+i)).join("")||(eventsOn(s).length&&pref("calOnPlan")!==false?"":'<span class="free">Free</span>')}</div>
      <button class="dropbtn" data-to="${s}">Move here</button></div>`;
  }
  h+=`</div>${later?`<p class="plan-hint" style="margin-top:12px">${later} more planned beyond this week.</p>`:""}`;
  el.classList.toggle("enter",animIn);el.classList.toggle("picking",!!picked);
  el.innerHTML=h;

  $("#capDown").onclick=()=>{cap=Math.max(1,cap-1);lsSet("dd.cap",cap);render()};
  $("#capUp").onclick=()=>{cap=Math.min(12,cap+1);lsSet("dd.cap",cap);render()};
  $("#autoBtn").onclick=autoPlan;
  if($("#dustBtn"))$("#dustBtn").onclick=startDust;
  el.querySelectorAll(".card").forEach(c=>{
    c.onclick=()=>{picked=picked===c.dataset.pid?null:c.dataset.pid;render()};
    c.ondragstart=e=>{e.dataTransfer.setData("text/plain",c.dataset.pid);e.dataTransfer.effectAllowed="move";requestAnimationFrame(()=>c.classList.add("dragging"))};
    c.ondragend=()=>{c.classList.remove("dragging");el.querySelectorAll(".over").forEach(x=>x.classList.remove("over"))};
  });
  el.querySelectorAll(".dropbtn").forEach(b=>b.onclick=e=>{e.stopPropagation();if(picked)moveTo(picked,b.dataset.to)});
  el.querySelectorAll("[data-drop]").forEach(z=>{
    z.ondragover=e=>{e.preventDefault();z.classList.add("over")};
    z.ondragleave=e=>{if(!z.contains(e.relatedTarget))z.classList.remove("over")};
    z.ondrop=e=>{e.preventDefault();z.classList.remove("over");const id=e.dataTransfer.getData("text/plain");if(id)moveTo(id,z.dataset.drop)};
  });
}

/* RAG rules
   past day  : anything still open = Red (missed), all done = Green
   today     : open & past its time = Red, open later today = Amber, all done = Green
   upcoming  : 3+ tasks or any Important = Amber (heavy / at risk), otherwise Green
   category  : Red if anything overdue, Amber if something due within 48 h, otherwise Green */
let tmTask=null; // task id shown in the pop-up after tapping a task tile
let tmCat=null; // task map drill-down: the category being shown task by task, or null for all categories
let hmSel=null,hmReview=null; // hmReview: {color:"r"|"a"|"g", idx, total}
const RAGW={r:"Red",a:"Amber",g:"Green"};
function cellStatus(arr,s,now,t0){
  if(!arr.length)return null;
  const open=arr.filter(t=>!t.done);
  if(s<t0)return open.length?"r":"g";
  if(s===t0)return open.some(t=>t.due<now)?"r":open.length?"a":"g";
  if(!open.length)return "g";
  return open.length>=3||open.some(t=>t.pri)?"a":"g";
}
function catStatus(arr,now){
  const open=arr.filter(t=>!t.done&&t.due);
  if(open.some(t=>t.due<now))return "r";
  if(open.some(t=>t.due<now+2*DAY))return "a";
  return "g";
}
function catChips(arr){ // "Work 3 · Home 2" as small labelled chips
  const m={};arr.forEach(t=>{m[t.cat]=(m[t.cat]||0)+1});
  return `<div class="cat-counts">${Object.keys(m).sort((x,y)=>m[y]-m[x]||x.localeCompare(y)).map(c=>`<span class="cat-chip" style="--cc:${cc(c)}"><i></i>${esc(c)} <b class="mono">${m[c]}</b></span>`).join("")}</div>`;
}
/* Task map: a treemap above the heat map. Tile size = number of tasks. Tap a category to open its tasks. Red / amber / green only.
   Category colour: red if over a quarter of its open tasks are overdue · amber if any are overdue or at risk · green otherwise.
   Task colour: red overdue · amber due today or at risk · green on track or done. */
function squarify(items,W,H){ // squarified treemap: items [{v}] -> same items with x,y,w,h in a W x H box
  const total=items.reduce((s,i)=>s+i.v,0)||1;
  const sorted=items.map((it,i)=>({i,a:it.v/total*W*H})).sort((p,q)=>q.a-p.a);
  const out=new Array(items.length),rect={x:0,y:0,w:W,h:H};
  const sum=r=>r.reduce((s,e)=>s+e.a,0);
  const worst=(r,s)=>{const A=sum(r),mx=Math.max(...r.map(e=>e.a)),mn=Math.min(...r.map(e=>e.a));return Math.max(s*s*mx/(A*A),A*A/(s*s*mn))};
  const place=r=>{
    const A=sum(r);
    if(rect.w>=rect.h){const cw=A/rect.h;let y=rect.y;for(const e of r){const h=e.a/cw;out[e.i]={...items[e.i],x:rect.x,y,w:cw,h};y+=h}rect.x+=cw;rect.w-=cw}
    else{const rh=A/rect.w;let x=rect.x;for(const e of r){const w=e.a/rh;out[e.i]={...items[e.i],x,y:rect.y,w,h:rh};x+=w}rect.y+=rh;rect.h-=rh}
  };
  let row=[];
  while(sorted.length){
    const s=Math.min(rect.w,rect.h),c=sorted[0];
    if(!row.length||worst([...row,c],s)<=worst(row,s)){row.push(c);sorted.shift()}
    else{place(row);row=[]}
  }
  if(row.length)place(row);
  return out;
}
function treemapHTML(list,now,t0){
  if(!list.length)return `<p class="rag-hint">Add tasks to see your task map.</p>`;
  // the map is shorter when there are few categories; H keeps tiles roughly square on a phone-width panel (~340px)
  const nCat=new Set(list.map(t=>t.cat)).size,px=nCat<=2?170:nCat<=4?230:300,W=1000,H=Math.round(W*px/340);
  let items;
  {
    const m={};list.forEach(t=>{(m[t.cat]=m[t.cat]||[]).push(t)});
    items=Object.keys(m).map(c=>{
      const arr=m[c],open=arr.filter(t=>!t.done),rg=ragTasks(arr,now,t0),od=rg.r.length,pct=Math.round((arr.length-open.length)/arr.length*100);
      // each tile is split into red / amber / green bands by task count, so every colour shows
      const n={r:rg.r.length,a:rg.a.length,g:arr.length-rg.r.length-rg.a.length};
      return {v:arr.length,cat:c,name:c,sub:`${pct}% done`,sub2:od?`${od} overdue`:`${arr.length} task${arr.length>1?"s":""}`,
        bands:["r","a","g"].map(k=>({k,n:n[k]}))};
    }).sort((a,b)=>b.v-a.v||a.name.localeCompare(b.name));
    // size by the square root of the task count, with a floor, so one big category can't squeeze the rest into slivers
    const floor=Math.min(.18,.6/items.length);
    items.forEach(it=>{it.v=Math.sqrt(it.v)});
    const tot=items.reduce((s,it)=>s+it.v,0);
    items.forEach(it=>{it.v=Math.max(it.v,floor*tot)});
  }
  const tiles=squarify(items,W,H).map((b,i)=>{
    const wpx=b.w/W*340,hpx=b.h/H*px; // approximate size on a phone
    const tiny=wpx<56||hpx<34,small=wpx<110||hpx<80,label=`${b.name}: ${b.sub}${b.sub2?", "+b.sub2:""}`,
      style=`left:${(b.x/W*100).toFixed(2)}%;top:${(b.y/H*100).toFixed(2)}%;width:${(b.w/W*100).toFixed(2)}%;height:${(b.h/H*100).toFixed(2)}%;--i:${Math.min(i,20)}`,
      inner=`<span class="nm">${esc(b.name)}</span>${small?"":`<span class="sb">${esc(b.sub)}${b.sub2?"<br>"+esc(b.sub2):""}</span>`}`;
    if(b.bands){
      const bands=b.bands.filter(x=>x.n).map(x=>`<i class="${x.k}" style="flex-grow:${x.n}"></i>`).join("");
      return `<button class="tmap-tile bands-tile${small?" small":""}" style="${style}" data-tcat="${esc(b.cat)}" aria-label="${esc(label)}" title="${esc(label)}"><span class="bands">${bands}</span>${tiny?"":`<span class="tlab">${inner}</span>`}</button>`;
    }
    return b.cat
      ?`<button class="tmap-tile ${b.k}" style="${style}" data-tcat="${esc(b.cat)}" aria-label="${esc(label)}" title="${esc(label)}">${inner}</button>`
      :`<div class="tmap-tile ${b.k}${b.k==="g"&&b.sub==="Done"?" done":""}" style="${style}" role="img" aria-label="${esc(label)}" title="${esc(label)}">${inner}</div>`;
  }).join("");
  return `<div class="tm-wrap"><div class="tmap" role="group" aria-label="Categories" style="height:${px}px">${tiles}</div>
    <div class="hm-legend"><span><i style="background:var(--danger)"></i>Red · overdue</span><span><i style="background:var(--amber)"></i>Amber · due today or at risk</span><span><i style="background:var(--ok)"></i>Green · on track or done</span></div>
    ${infoText("map","Bigger tiles have more tasks. Each tile is split into red, amber and green by its tasks. Tap a category to map its tasks.")}</div>`;
}
/* Which tile of the week view a task sits in: "late" (open, due before today), a day start (ms), "later" or "none" */
function dayKey(t,t0){
  if(!t.due)return "none";
  if(!t.done&&t.due<t0)return "late";
  const d=sod(t.due).getTime();
  return d<t0?"past":d>=t0+7*DAY?"later":String(d);
}
function dayName(k,t0){
  if(k==="late")return "Late";if(k==="none")return "No date";if(k==="later")return "Later";
  const d=+k;return d===t0?"Today":d===t0+DAY?"Tomorrow":new Date(d).toLocaleDateString("en-IN",{weekday:"short",day:"numeric"});
}
/* The Task map. Week: a tile per day (plus Late and No date), tap one to see its tasks. Day: today's and late tasks. */
function mapHTML(list,now,t0,mode){
  if(mode==="day"){
    const pick=t=>t.due&&t.due<t0+DAY&&(!t.done||(t.doneAt||0)>=t0);
    const rest=list.filter(t=>!t.done&&(!t.cat||!tmCat||t.cat===tmCat)&&!(t.due&&t.due<t0+DAY)).length;
    const head=`<p class="tm-crumb day-crumb"><b>Today</b>${rest?` · ${rest} more later or without a date`:""}</p>`;
    return taskTreemapHTML(list,now,t0,tmCat,pick,head,"Nothing due today. Enjoy the free day, or tap Week to look ahead.");
  }
  if(tmDay){
    const k=tmDay,pick=t=>dayKey(t,t0)===k;
    if(!list.some(t=>pick(t)&&(!tmCat||t.cat===tmCat)))tmDay=null;
    else{
      const head=`<div class="tm-head"><button class="btn tm-up" data-tmup aria-label="Back to the week">‹ Week</button><span class="tm-crumb"><b>${esc(dayName(k,t0))}</b>${k!=="late"&&k!=="none"&&k!=="later"?" · "+new Date(+k).toLocaleDateString("en-IN",{day:"numeric",month:"short"}):""}</span></div>`;
      return taskTreemapHTML(list,now,t0,tmCat,pick,head,"Nothing left here.");
    }
  }
  return weekMapHTML(list,now,t0);
}
function weekMapHTML(list,now,t0){
  const cat=tmCat,inCat=list.filter(t=>!cat||t.cat===cat),colour=taskColours(list,now,t0);
  const shown=inCat.filter(t=>tmDone||!t.done),doneN=inCat.filter(t=>t.done&&dayKey(t,t0)!=="past").length;
  const m=cats(list),names=Object.keys(m).filter(c=>m[c].open||tmDone||c===cat).sort((x,y)=>(m[y].open-m[x].open)||x.localeCompare(y));
  const chips=names.length>1||cat?`<div class="chips tm-chips" role="group" aria-label="Show a category"><button class="chip" data-tcat="" aria-pressed="${!cat}">All <span class="n">${list.filter(t=>!t.done).length}</span></button>`+
    names.map(c=>`<button class="chip" data-tcat="${esc(c)}" aria-pressed="${cat===c}"><span class="dot" style="background:${cc(c)}"></span>${esc(c)} <span class="n">${m[c].open}</span></button>`).join("")+`</div>`:"";
  const foot=`<div class="tm-foot">${doneN?`<button class="linkbtn" data-tmdone aria-pressed="${tmDone}">${tmDone?"Hide done":`Show done (${doneN})`}</button>`:"<span></span>"}<button class="linkbtn" data-tmgo>See as a list</button></div>`;
  const keys=["late",...[...Array(7)].map((_,i)=>String(t0+i*DAY)),"later","none"];
  const by={};shown.forEach(t=>{const k=dayKey(t,t0);(by[k]=by[k]||[]).push(t)});
  const items=keys.filter(k=>by[k]||(k!=="late"&&k!=="later"&&k!=="none")).map(k=>{
    const arr=by[k]||[],n={r:0,a:0,g:0};arr.forEach(t=>n[colour(t)]++);
    const open=arr.filter(t=>!t.done).length;
    return {v:arr.length,k,name:dayName(k,t0),sub:arr.length?(open?`${open} to do`:"All done"):"Free",
      bands:["r","a","g"].map(x=>({k:x,n:n[x]})),empty:!arr.length};
  });
  if(!shown.length&&!list.length)return `<div class="tm-wrap"><div class="tm-empty"><b>Nothing here yet</b><span>Tap + to add your first task.</span></div></div>`;
  // days with more tasks get bigger tiles; free days stay small but tappable
  const floor=.045,tot=Math.max(1,items.reduce((s,it)=>s+it.v,0));
  items.forEach(it=>{it.v=Math.max(Math.sqrt(it.v),floor*Math.sqrt(tot)*2,.35)});
  const px=300,W=1000,H=Math.round(W*px/340);
  const tiles=squarify(items,W,H).map((b,i)=>{
    const wpx=b.w/W*340,hpx=b.h/H*px,small=wpx<90||hpx<60,tiny=wpx<46||hpx<30;
    const style=`left:${(b.x/W*100).toFixed(2)}%;top:${(b.y/H*100).toFixed(2)}%;width:${(b.w/W*100).toFixed(2)}%;height:${(b.h/H*100).toFixed(2)}%;--i:${Math.min(i,20)}`;
    const label=`${b.name}: ${b.sub}`,inner=tiny?"":`<span class="nm">${esc(b.name)}</span>${small&&b.empty?"":`<span class="sb">${esc(b.sub)}</span>`}`;
    if(b.empty)return `<div class="tmap-tile day-free${small?" small":""}" style="${style}" role="img" aria-label="${esc(label)}" title="${esc(label)}"><span class="tlab">${inner}</span></div>`;
    const bands=b.bands.filter(x=>x.n).map(x=>`<i class="${x.k}" style="flex-grow:${x.n}"></i>`).join("");
    return `<button class="tmap-tile bands-tile${small?" small":""}" style="${style}" data-tday="${b.k}" aria-label="${esc(label)}" title="${esc(label)}"><span class="bands">${bands}</span><span class="tlab">${inner}</span></button>`;
  }).join("");
  return `<div class="tm-wrap">${chips}<div class="tmap" role="group" aria-label="Your week" style="height:${px}px">${tiles}</div>
    <div class="hm-legend"><span><i style="background:var(--danger)"></i>Late</span><span><i style="background:var(--amber)"></i>Due today or busy</span><span><i style="background:var(--ok)"></i>On track</span></div>
    ${foot}
    ${infoText("map","Each tile is a day. Bigger tiles have more tasks, and the colours show how they're going. Tap a day to see its tasks.")}</div>`;
}
/* Task map: one tile per task, for every category or the one picked in the chips above it.
   Colour = the task's RAG (done tasks green and struck through, shown only on "Show done").
   Size = how much it needs you: overdue 3, due today or at risk 2, on track 1.5, done 1; Important adds 1. */
function taskTreemapHTML(list,now,t0,cat,pick=()=>true,head="",emptyMsg=""){
  const inCat=list.filter(t=>(!cat||t.cat===cat)&&pick(t)),colour=taskColours(list,now,t0),RANK={r:0,a:1,g:2};
  const doneN=inCat.filter(t=>t.done).length,arr=tmDone?inCat:inCat.filter(t=>!t.done);
  const m=cats(list),names=Object.keys(m).filter(c=>m[c].open||tmDone||c===cat).sort((x,y)=>(m[y].open-m[x].open)||x.localeCompare(y));
  const chips=names.length>1||cat?`<div class="chips tm-chips" role="group" aria-label="Show a category"><button class="chip" data-tcat="" aria-pressed="${!cat}">All <span class="n">${list.filter(t=>!t.done).length}</span></button>`+
    names.map(c=>`<button class="chip" data-tcat="${esc(c)}" aria-pressed="${cat===c}"><span class="dot" style="background:${cc(c)}"></span>${esc(c)} <span class="n">${m[c].open}</span></button>`).join("")+`</div>`:"";
  const foot=`<div class="tm-foot">${doneN?`<button class="linkbtn" data-tmdone aria-pressed="${tmDone}">${tmDone?"Hide done":`Show done (${doneN})`}</button>`:"<span></span>"}<button class="linkbtn" data-tmgo>See as a list</button></div>`;
  if(!arr.length)return `<div class="tm-wrap">${chips}${head}<div class="tm-empty"><b>${list.length?"All done &amp; dusted ✨":"Nothing here yet"}</b><span>${list.length?(emptyMsg||"Nothing open"+(cat?" in "+esc(cat):"")+"."):"Tap + to add your first task."}</span></div>${list.length?foot:""}</div>`;
  const n={r:0,a:0,g:0};
  let items=arr.map(t=>{
    const k=colour(t);n[k]++;
    const sub=t.done?"Done":t.due?fmtDue(t.due):"No date";
    return {v:(t.done?1:k==="r"?3:k==="a"?2:1.5)+(t.pri&&!t.done?1:0),id:t.id,k,name:t.title,sub,done:t.done,pri:t.pri,
      ord:t.done?3:RANK[k],due:t.due||Infinity};
  }).sort((a,b)=>a.ord-b.ord||a.due-b.due||a.name.localeCompare(b.name));
  // more tasks get a taller map so tiles stay big enough to tap
  const px=arr.length<=3?190:arr.length<=8?250:arr.length<=16?320:Math.min(560,320+(arr.length-16)*12),W=1000,H=Math.round(W*px/340);
  const floor=Math.min(.12,.5/items.length),tot=items.reduce((s,it)=>s+it.v,0);
  items.forEach(it=>{it.v=Math.max(it.v,floor*tot)});
  const tiles=squarify(items,W,H).map((b,i)=>{
    const wpx=b.w/W*340,hpx=b.h/H*px,tiny=wpx<48||hpx<30,small=wpx<100||hpx<64;
    const label=`${b.name}: ${b.done?"done":RAGW[b.k].toLowerCase()}, ${b.sub}${b.pri&&!b.done?", Important":""}`;
    const style=`left:${(b.x/W*100).toFixed(2)}%;top:${(b.y/H*100).toFixed(2)}%;width:${(b.w/W*100).toFixed(2)}%;height:${(b.h/H*100).toFixed(2)}%;--i:${Math.min(i,20)}`;
    const inner=tiny?"":`<span class="nm">${b.pri&&!b.done?"● ":""}${esc(b.name)}</span>${small?"":`<span class="sb">${esc(b.sub)}</span>`}`;
    return `<button class="tmap-tile task-tile ${b.k}${b.done?" done":""}${small?" small":""}" style="${style}" data-tid="${esc(b.id)}" aria-label="${esc(label)}" title="${esc(label)}">${inner}</button>`;
  }).join("");
  return `<div class="tm-wrap">${chips}${head}
    <div class="tmap" role="group" aria-label="${cat?esc(cat)+" tasks":"Your tasks"}" style="height:${px}px">${tiles}</div>
    <div class="hm-legend"><span><i style="background:var(--danger)"></i>Late ${n.r}</span><span><i style="background:var(--amber)"></i>Today ${n.a}</span><span><i style="background:var(--ok)"></i>On track ${n.g}</span></div>
    ${foot}
    ${infoText("map","Each tile is a task. Red is late, amber is due today, green is on track. Bigger tiles need you sooner. Tap a task to finish it, move it, change it or delete it.")}</div>`;
}
/* One colour per task: Green = done, or open and on track · Amber = open and due today, Important, or on a day
   with 3+ open tasks · Red = open and past its time. A day's square is split by how many tasks are in each. */
function taskColours(list,now,t0){
  const perDay={};list.forEach(t=>{if(!t.done&&t.due&&t.due>=now){const k=sod(t.due).getTime();perDay[k]=(perDay[k]||0)+1}});
  return t=>t.done?"g":t.due<now?"r":(t.due<t0+DAY||t.pri||perDay[sod(t.due).getTime()]>=3)?"a":"g";
}
function heatmapHTML(list,now,t0){
  const rg=ragTasks(list,now,t0),colour=taskColours(list,now,t0);
  const pill=(k,i,sub)=>`<button class="rag-pill ${k}${hmReview&&hmReview.color===k?" on":""}" data-rag="${k}" style="--d:${i}" aria-pressed="${!!(hmReview&&hmReview.color===k)}"><span class="dot"></span><b data-n="${rg[k].length}">${rg[k].length}</b><span class="pl">${RAGW[k]}<small>${sub}</small></span></button>`;
  const cell=(s,i)=>{
    const d=new Date(s),day=list.filter(t=>t.due>=s&&t.due<s+DAY),st=cellStatus(day,s,now,t0);
    const n={r:0,a:0,g:0};day.forEach(t=>n[colour(t)]++);
    const pct=day.length?Math.round(day.filter(t=>t.done).length/day.length*100):0;
    const sel=hmSel&&hmSel.s===s;
    const parts=["r","a","g"].filter(k=>n[k]).map(k=>`${n[k]} ${RAGW[k].toLowerCase()}`).join(", ");
    const lbl=`${d.toLocaleDateString("en-IN",{weekday:"long",day:"numeric",month:"short"})}: ${day.length?day.length+" task"+(day.length>1?"s":"")+", "+pct+"% done ("+parts+")":"nothing due"}`;
    return `<button class="hm-cell ${st?"s-"+st:"n"}${n.r?" has-r":""}${s===t0?" today":""}${sel?" sel":""}" style="--w:${i}" data-c="All" data-s="${s}" aria-label="${esc(lbl)}" title="${esc(lbl)}"${st?"":" tabindex=\"-1\""}>
      <span class="hd"><span class="dw">${s===t0?"Today":d.toLocaleDateString("en-IN",{weekday:"short"})} ${d.getDate()}</span><b class="dp">${!st?"–":pct===100?"✓":pct+"%"}</b></span>
      <span class="mix">${["r","a","g"].filter(k=>n[k]).map(k=>`<i class="${k}" style="flex:${n[k]}"></i>`).join("")}</span></button>`;
  };
  const row=(from,label,off)=>`<div class="strip-grp"><div class="strip-lbl">${label}</div><div class="strip-row">${[...Array(7)].map((_,i)=>cell(t0+(from+i)*DAY,off+i)).join("")}</div></div>`;
  return `<div class="rag-sum" id="ragSum">${pill("r",0,"overdue")}${pill("a",1,"due today or at risk")}${pill("g",2,"on track")}</div>
  ${infoText("heat","Tap a day to open its tasks, or tap a colour to review its tasks one after another. Each square is split by how many of that day's tasks are in each colour. The % is how much is done.")}
  <div class="hm strip" role="group" aria-label="Status by day">${row(-7,"Last 7 days",0)}${row(0,"Today and the next 6 days",7)}</div>
  <div class="hm-detail" id="hm-detail">${hmDetail(list,now,t0)}</div>`;
}
/* Every open task with a due date falls under one colour:
   Red = overdue · Amber = still due today, or coming up and at risk (Important, or on a day with 3+ tasks) · Green = the rest */
function ragTasks(list,now,t0){
  const open=list.filter(t=>!t.done&&t.due).sort((a,b)=>a.due-b.due);
  const perDay={};open.forEach(t=>{if(t.due>=now){const k=sod(t.due).getTime();perDay[k]=(perDay[k]||0)+1}});
  const out={r:[],a:[],g:[]};
  for(const t of open){
    if(t.due<now)out.r.push(t);
    else if(t.due<t0+DAY||t.pri||perDay[sod(t.due).getTime()]>=3)out.a.push(t);
    else out.g.push(t);
  }
  return out;
}
const RAGSUB={r:"Overdue. Finish these or give them a new day.",a:"Due today, or coming up on a heavy day or marked Important.",g:"On track. Nothing needed unless plans changed."};
function reviewHTML(list,now,t0){
  const k=hmReview.color,arr=ragTasks(list,now,t0)[k];
  const total=Math.max(hmReview.total||0,arr.length);hmReview.total=total;
  if(!arr.length)return `<div class="rv"><div class="rv-head"><h5><span class="rag-tag ${k}">${RAGW[k]}</span> All reviewed</h5><button class="btn sm" data-rv="close">Close</button></div>
    <div class="rv-done">${k==="g"?"No on-track tasks to review.":"Nothing left under "+RAGW[k]+". Done & dusted."}</div></div>`;
  const i=hmReview.idx=Math.min(hmReview.idx,arr.length-1);
  const cleared=total-arr.length;
  const row=(t,j)=>{
    const late=t.due<now,cur=j===i;
    const reason=late?"Overdue":t.due<t0+DAY?"Due today":t.pri?"Important":k==="a"?"Heavy day":"On track";
    return `<div class="rv-item${cur?" cur":""}" data-rvi="${j}" style="--cc:${cc(t.cat)}">
      <div class="rv-top"><span class="rv-n mono">${j+1}</span><div class="body"><div class="t">${esc(t.title)}</div>
        <div class="meta"><span class="cat">${esc(t.cat)}</span><span class="${late?"late":""}">${esc(fmtDue(t.due))}</span><span class="rv-why">${reason}</span></div></div></div>
      ${cur?`<div class="rv-acts">
        <button class="btn pri" data-rv="done" data-id="${esc(t.id)}">Done ✓</button>
        ${late||t.due<t0+DAY?`<button class="btn" data-rv="hour" data-id="${esc(t.id)}">+1 hour</button>`:""}
        <button class="btn" data-rv="tomorrow" data-id="${esc(t.id)}">Tomorrow</button>
        <button class="btn" data-rv="week" data-id="${esc(t.id)}">Next week</button>
        ${arr.length>1?`<button class="btn" data-rv="skip">${i<arr.length-1?"Skip →":"Back to first"}</button>`:""}
      </div>`:""}</div>`};
  return `<div class="rv">
    <div class="rv-head"><h5><span class="rag-tag ${k}">${RAGW[k]}</span> Reviewing ${i+1} of ${arr.length}</h5><button class="btn sm" data-rv="close">Close</button></div>
    <p class="rv-sub">${RAGSUB[k]}</p>
    ${catChips(arr)}
    <div class="rv-bar ${k}"><span style="width:${total?cleared/total*100:0}%"></span></div>
    <div class="rv-list">${arr.map(row).join("")}</div></div>`;
}
function reviewAct(act,id,btn){
  const now=Date.now(),t0=sod(now).getTime();
  if(act==="close"){hmReview=null;render();return}
  if(act==="skip"){const n=ragTasks(view(),now,t0)[hmReview.color].length;hmReview.idx=(hmReview.idx+1)%Math.max(1,n);redrawReview(true);return}
  const t=view().find(x=>x.id===id);if(!t)return;
  const item=btn.closest(".rv-item");
  const go=next=>{
    if(item&&!REDUCED.matches){item.classList.add("leaving");setTimeout(()=>{save(next)},320)}else save(next);
  };
  if(act==="done"){
    const r=btn.getBoundingClientRect();burst(r.left+r.width/2,r.top+r.height/2,18,[tok(catVar(t.cat)),tok("--accent")],.8);
    if(item){const ir=item.getBoundingClientRect();setTimeout(()=>puff(ir.left+ir.width*.5,ir.top+ir.height/2,ir.width*.5),200)}
    dustBrand();haptic("success");
    go({...t,done:true,doneAt:now});
    toast({t:"Dusted ✓",s:t.title,ttl:2500,undo:()=>save({...t})});
  }else{
    const next=act==="hour"?{...t,due:now+3600e3,reminded:false}:placeOn(t,t0+(act==="week"?7:1)*DAY,now);
    haptic();go(next);
    toast({t:"Moved to "+fmtDue(next.due),s:t.title,ttl:2500,undo:()=>save({...t})});
  }
}
function redrawReview(scroll){
  const d=$("#hm-detail");if(!d)return;
  d.innerHTML=hmDetail(view(),Date.now(),sod(Date.now()).getTime());
  if(scroll)d.querySelector(".rv-item.cur")?.scrollIntoView({block:"nearest",behavior:REDUCED.matches?"auto":"smooth"});
}
function hmDetail(list,now,t0){
  return hmReview?reviewHTML(list,now,t0):"";
}
/* ---------- day pop-up (opens when a heatmap day is tapped) ---------- */
function openDayPop(){
  if(!drawDayPop())return;
  const pop=$("#pop");pop.hidden=false;requestAnimationFrame(()=>pop.classList.add("open"));
  $("#popClose").focus();
}
function closeDayPop(){
  const pop=$("#pop");if(pop.hidden)return;
  const back=hmSel?document.querySelector(`.hm-cell[data-s="${hmSel.s}"]`):tmTask?document.querySelector(`.task-tile[data-tid="${CSS.escape(tmTask)}"]`):null;
  hmSel=null;tmTask=null;popEdit=false;document.querySelectorAll(".hm-cell.sel").forEach(x=>x.classList.remove("sel"));
  pop.classList.remove("open");setTimeout(()=>{pop.hidden=true},250);
  back&&back.focus();
}
function drawDayPop(){ // returns false when the day has nothing to show
  if(tmTask){
    const t=view().find(x=>x.id===tmTask);if(!t){closeDayPop();return false}
    $("#popTitle").textContent=popEdit?"Edit task":t.cat+" task";$("#popBody").innerHTML=taskPopHTML(t);
    const f=popEdit&&$("#popBody .edit");if(f)wireEditForm(f,t,()=>{popEdit=false;closeDayPop()});
    return true;
  }
  if(!hmSel)return false;
  const now=Date.now(),t0=sod(now).getTime(),html=dayHTML(view(),now,t0);
  if(!html){closeDayPop();return false}
  $("#popTitle").textContent=new Date(hmSel.s).toLocaleDateString("en-IN",{weekday:"long",day:"numeric",month:"short"});
  $("#popBody").innerHTML=html;
  return true;
}
function moveDay(t,day){
  const now=Date.now(),next=placeOn(t,day,now);
  closeDayPop();haptic();save(next);
  toast({t:"Moved to "+fmtDue(next.due),s:t.title,ttl:2500,undo:()=>save({...t})});
}
$("#popClose").onclick=closeDayPop;
$("#pop").addEventListener("change",e=>{
  if(e.target.id!=="tpDay"||!e.target.value)return;
  const t=view().find(x=>x.id===tmTask);if(!t)return;
  const [y,m,d]=e.target.value.split("-").map(Number);moveDay(t,new Date(y,m-1,d).getTime());
});
$("#pop").addEventListener("click",e=>{
  if(e.target.id==="pop"){closeDayPop();return}
  const tp=e.target.closest("[data-tp]");
  if(tp){
    const t=view().find(x=>x.id===tmTask);if(!t)return;
    const act=tp.dataset.tp,now=Date.now();
    if(act==="edit"){popEdit=true;haptic();drawDayPop();setTimeout(()=>$("#popBody [name=title]")?.focus(),60);return}
    if(act==="undo"){save({...t,done:false,doneAt:null});haptic();return}
    if(act==="del"){closeDayPop();haptic("warn");remove(t);toast({t:"Deleted",s:t.title,ttl:4000,undo:()=>save(t)});return}
    if(act==="done"){const r=tp.getBoundingClientRect();burst(r.left+r.width/2,r.top+r.height/2,18,[tok(catVar(t.cat)),tok("--accent")],.8);dustBrand();haptic("success");
      closeDayPop();const before=dueTodayOpen();save({...t,done:true,doneAt:now});
      if(before>0&&dueTodayOpen()===0){rain();toast({t:"Today: done & dusted",s:"Everything due today is finished. Put your feet up.",ttl:4500})}
      else toast({t:"Dusted ✓",s:t.title,ttl:2500,undo:()=>save({...t})});return}
    if(act.startsWith("d:"))moveDay(t,+act.slice(2));
    return;
  }
  const tk=e.target.closest("button.tick");if(!tk)return;
  const t=view().find(x=>x.id===tk.dataset.id);if(!t)return;
  if(t.done){save({...t,done:false,doneAt:null});return}
  const r=tk.getBoundingClientRect();burst(r.left+r.width/2,r.top+r.height/2,16,[tok(catVar(t.cat)),tok("--accent")],.8);dustBrand();haptic("success");
  save({...t,done:true,doneAt:Date.now()});
});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!$("#pop").hidden)closeDayPop()});
function taskPopHTML(t){ // pop-up for one task, opened from the task map: finish it, move it, change it, delete it
  if(popEdit)return editFormHTML(t,"p",true);
  const now=Date.now(),t0=sod(now).getTime(),k=taskColours(view(),now,t0)(t),late=!t.done&&t.due&&t.due<now;
  const when=t.done?"Done":t.due?fmtDue(t.due):"No date";
  const sat=nextSat(t0),on=d=>t.due&&sod(t.due).getTime()===d?" on":"";
  const wk=new Date(t0).getDay(),wkend=wk===6?t0:wk===0?t0:sat; // on a weekend, "Weekend" means today
  return `<div class="rv"><div class="row rag-${k}${t.done?" done":""}" style="--cc:${cc(t.cat)};grid-template-columns:1fr auto"><div class="body"><div class="t">${esc(t.title)}</div><div class="meta"><span class="cat">${esc(t.cat)}</span>${t.pri?'<span class="flag">● Important</span>':""}${t.rep?`<span>↻ ${esc(repLabel(t.rep))}</span>`:""}</div></div>
      <span class="mono" style="color:${late?"var(--danger)":"var(--muted)"}">${esc(when)}</span></div>
    ${t.note?`<p class="rv-sub" style="overflow-wrap:anywhere;white-space:pre-wrap">${esc(String(t.note))}</p>`:""}
    ${t.done?`<p class="rv-sub">Dusted. Tap Not done to bring it back.</p>`:`<div class="when-row" role="group" aria-label="When"><span class="when-k">When?</span>
      <button class="chip${on(t0)}" data-tp="d:${t0}">Today</button><button class="chip${on(t0+DAY)}" data-tp="d:${t0+DAY}">Tomorrow</button><button class="chip${wkend!==t0&&on(wkend)?" on":""}" data-tp="d:${wkend}">${wkend===t0?"This weekend":"Weekend"}</button>
      <label class="chip pick">Pick a day<input type="date" id="tpDay" min="${toLocalInput(t0).slice(0,10)}" value="${t.due?toLocalInput(t.due).slice(0,10):""}"></label></div>`}
    <div class="rv-acts pop-acts">${t.done?`<button class="btn pri" data-tp="undo">Not done</button>`:`<button class="btn pri big" data-tp="done">✓ Done</button>`}
      <button class="btn" data-tp="edit">Edit</button><button class="btn warn" data-tp="del">Delete</button></div></div>`;
}
function dayHTML(list,now,t0){
  if(!hmSel)return "";
  const {s:ds}=hmSel;
  const day=list.filter(t=>t.due>=ds&&t.due<ds+DAY).sort((a,b)=>a.due-b.due);
  if(!day.length)return "";
  const st=cellStatus(day,ds,now,t0),doneN=day.filter(t=>t.done).length,colour=taskColours(list,now,t0);
  const n={r:0,a:0,g:0};day.forEach(t=>n[colour(t)]++);
  const groups={};day.forEach(t=>{(groups[t.cat]=groups[t.cat]||[]).push(t)});
  const names=Object.keys(groups).sort((x,y)=>groups[y].length-groups[x].length||x.localeCompare(y));
  const rowH=t=>{const late=!t.done&&t.due<now;const k=colour(t);return `<div class="row rag-${k}${t.done?" done":""}" style="--cc:${cc(t.cat)}"><button class="tick" data-id="${esc(t.id)}" aria-label="${t.done?"Mark not done":"Mark done"}" style="${late?"border-color:var(--danger)":""}"></button><div class="body"><div class="t">${esc(t.title)}</div><div class="meta"><span class="rag-tag ${k}">${RAGW[k]}</span>${t.pri?'<span class="flag">● Important</span>':""}</div></div><span class="mono" style="color:${late?"var(--danger)":"var(--muted)"}">${esc(t.done?"Done":fmtDue(t.due))}</span></div>`};
  return `<div class="rv"><div class="rv-head"><h5>${doneN} of ${day.length} done</h5><span class="pop-pct">${Math.round(doneN/day.length*100)}%</span></div>
   <div class="mixline"><span class="mix">${["r","a","g"].filter(k=>n[k]).map(k=>`<i class="${k}" style="flex:${n[k]}"></i>`).join("")}</span><span class="mono">${["r","a","g"].filter(k=>n[k]).map(k=>`${n[k]} ${RAGW[k].toLowerCase()}`).join(" · ")}</span></div>
   ${names.map(c=>{const g=groups[c],d=g.filter(t=>t.done).length;return `<div class="cat-grp"><div class="cat-lbl" style="--cc:${cc(c)}"><i></i>${esc(c)}<span class="mono">${d}/${g.length}</span></div><div class="list">${g.map(rowH).join("")}</div></div>`}).join("")}</div>`;
}

function chart14(days){
  const W=640,H=200,L=30,B=26,T=12,max=Math.max(4,...days.map(d=>Math.max(d.done,d.added)));
  const step=Math.ceil(max/4),top=step*4,y=v=>T+(H-T-B)*(1-v/top),bw=(W-L-8)/14;
  let g="";for(let i=0;i<=4;i++){const v=i*step;g+=`<line x1="${L}" x2="${W-4}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)" stroke-width="1"/><text x="${L-6}" y="${y(v)+4}" text-anchor="end" fill="var(--muted)" style="font:500 10px var(--f-mono)">${v}</text>`}
  const pts=days.map((d,i)=>`${L+bw*i+bw/2},${y(d.added)}`).join(" ");
  const bars=days.map((d,i)=>{const x=L+bw*i+bw*.2,hh=y(0)-y(d.done);return `<rect style="--d:${i}" x="${x}" y="${y(d.done)}" width="${bw*.6}" height="${Math.max(0,hh)}" rx="3" fill="var(--accent)"><title>${d.done} completed</title></rect>`+
   ((i%2===1||i===13)?`<text x="${L+bw*i+bw/2}" y="${H-8}" text-anchor="middle" fill="var(--muted)" style="font:500 10px var(--f-mono)">${i===13?"Today":new Date(d.s).getDate()}</text>`:"")}).join("");
  const dots=days.map((d,i)=>`<circle cx="${L+bw*i+bw/2}" cy="${y(d.added)}" r="3" fill="var(--surface)" stroke="var(--muted)" stroke-width="2"/>`).join("");
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Tasks completed and added per day, last 14 days">${g}${bars}<polyline points="${pts}" fill="none" stroke="var(--muted)" stroke-width="2" stroke-dasharray="4 3"/>${dots}</svg>`;
}

/* ---------- reminders ---------- */
const fired=new Set(lsGet("dd.fired",[]));
let audio=null;
document.addEventListener("pointerdown",()=>{if(!audio){try{audio=new (window.AudioContext||window.webkitAudioContext)()}catch(e){}}},{once:true});
function chime(){if(!audio||!pref("sound"))return;try{const n=audio.currentTime;[880,1320].forEach((f,i)=>{const o=audio.createOscillator(),g=audio.createGain();o.frequency.value=f;o.type="sine";g.gain.setValueAtTime(0,n+i*.18);g.gain.linearRampToValueAtTime(.18,n+i*.18+.02);g.gain.exponentialRampToValueAtTime(.001,n+i*.18+.5);o.connect(g).connect(audio.destination);o.start(n+i*.18);o.stop(n+i*.18+.55)})}catch(e){}}
function checkDue(){
  if(!loaded)return;const now=Date.now();
  view().filter(t=>!t.done&&t.due&&t.due<=now&&now-t.due<6*3600e3&&!fired.has(t.id+":"+t.due)).forEach(t=>{
    fired.add(t.id+":"+t.due);lsSet("dd.fired",[...fired].slice(-300));
    if(!pref("alerts"))return; // alerts are off: remember it came due, but stay quiet
    chime();webNotify(t);haptic("warn");
    alarms.set(t.id,now+6000);
    toast({t:t.title,s:`${t.cat} · due ${fmtDue(t.due)}`,sticky:true,due:true,actions:[
      ["Done",()=>save({...t,done:true,doneAt:Date.now()}),"go"],
      ["+1 hour",()=>save({...t,due:Date.now()+3600e3})],
      ["Tomorrow",()=>{const d=new Date(t.due+DAY);save({...t,due:d.getTime()})}],
    ]});
  });
  if(currentView!=="import")render();
}
setInterval(checkDue,30000);

/* welcome back: when you return to the page, replay the entrance and point at what came due */
let leftAt=null;
document.addEventListener("visibilitychange",()=>{
  if(document.hidden){leftAt=Date.now();return}
  if(!leftAt||!loaded)return;
  const away=Date.now()-leftAt,since=leftAt;leftAt=null;
  if(away<60000){checkDue();return}
  const now=Date.now();
  const came=view().filter(t=>!t.done&&t.due&&t.due>since&&t.due<=now);
  came.forEach(t=>{fired.add(t.id+":"+t.due);alarms.set(t.id,now+6000)});
  lsSet("dd.fired",[...fired].slice(-300));
  animIn=true;prevGreet={today:null,over:null};
  if(currentView==="import")setView(HOME);else render();
  const mins=Math.round(away/6e4),awayTxt=mins<60?`${mins} min`:`${Math.round(mins/60)} hr`;
  if(came.length&&pref("alerts")){chime();toast({t:`Welcome back · ${came.length} came due`,s:came.slice(0,3).map(t=>t.title).join(", ")+(came.length>3?"…":""),sticky:true,due:true,actions:[["Show me",()=>{tmCat=null;setView(HOME);$(".tm-wrap")?.scrollIntoView({behavior:REDUCED.matches?"auto":"smooth",block:"center"})},"go"]]})}
  else if(!came.length)toast({t:`${partOfDay()}, welcome back`,s:`You were away ${awayTxt}. ${dueTodayOpen()?dueTodayOpen()+" still due today.":"Nothing pressing."}`,ttl:3500});
});

/* ---------- calendar export ---------- */
const RRULE={day:"FREQ=DAILY",weekday:"FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",week:"FREQ=WEEKLY","2week":"FREQ=WEEKLY;INTERVAL=2",month:"FREQ=MONTHLY",year:"FREQ=YEARLY"};
async function exportICS(list){
  if(!list.length){toast({t:"Nothing to send",s:"Only tasks with a future due date can go to your calendar.",ttl:3500});return}
  const p=n=>String(n).padStart(2,"0");
  const f=ts=>{const d=new Date(ts);return `${d.getUTCFullYear()}${p(d.getUTCMonth()+1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}00Z`};
  const ev=list.map(t=>["BEGIN:VEVENT",`UID:${t.id}@doneanddusted`,`DTSTAMP:${f(Date.now())}`,`DTSTART:${f(t.due)}`,`DTEND:${f(t.due+15*6e4)}`,...(RRULE[t.rep]?[`RRULE:${RRULE[t.rep]}`]:[]),
   `SUMMARY:${String(t.title).replace(/[,;\\]/g,m=>"\\"+m)}`,`CATEGORIES:${t.cat}`,`DESCRIPTION:Done & Dusted · ${t.cat}`,
   "BEGIN:VALARM","ACTION:DISPLAY","DESCRIPTION:Task due","TRIGGER:-PT15M","END:VALARM","END:VEVENT"].join("\r\n"));
  const ics=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Done and Dusted//Tasks//EN",...ev,"END:VCALENDAR"].join("\r\n");
  // Android app: straight into the phone's calendar. Web, one task: Google Calendar's add-event page.
  if(isNative){
    const ids=calLinks();
    try{
      const {registerPlugin}=await import("@capacitor/core");
      const Cal=registerPlugin("DDCalendar");
      const r=await Cal.addEvents({events:list.map(t=>({title:t.title,start:t.due,minutes:15,rrule:RRULE[t.rep]||"",
        description:"Done & Dusted · "+t.cat,eventId:ids[t.id]?.e||-1}))});
      r.ids.forEach((id,i)=>{if(id>0)ids[list[i].id]={e:id,at:list[i].due}});lsSet("dd.calSync",ids);haptic("success");
      const n=list.length,what=n===1?list[0].title:n+" tasks";
      toast({t:r.added?"Added to "+r.calendar:"Updated in "+r.calendar,s:`${what}${n===1?" · "+fmtDue(list[0].due):""} · alert 15 min before`,ttl:3500});
      return;
    }catch(e){
      const m=(e&&e.message)||"";
      if(/denied/.test(m)){toast({t:"Calendar access is off",s:"Allow Calendar for Done & Dusted in your phone's app settings, then try again.",ttl:5000});return}
      if(/nocalendar/.test(m)){toast({t:"No calendar on this phone",s:"Add a Google account in your phone's settings, or save a calendar file instead.",ttl:5000,actions:[["Save file",()=>icsFile(list,ics)]]});return}
      // anything else: fall back to the calendar file below
    }
  }else if(list.length===1){
    const t=list[0],gf=f;
    const u="https://calendar.google.com/calendar/render?action=TEMPLATE&text="+encodeURIComponent(t.title)+"&dates="+gf(t.due)+"/"+gf(t.due+15*6e4)+
      "&details="+encodeURIComponent("Done & Dusted · "+t.cat)+(RRULE[t.rep]?"&recur="+encodeURIComponent("RRULE:"+RRULE[t.rep]):"");
    window.open(u,"_blank","noopener");return;
  }
  icsFile(list,ics);
}
async function icsFile(list,ics){
  try{
    const name=list.length===1?`${list[0].title.slice(0,40).replace(/[^\w ]+/g,"").trim()||"task"}.ics`:"done-and-dusted-reminders.ics";
    const r=await saveFile(name,ics,"text/calendar");
    if(r!=="cancelled")toast({t:"Calendar file ready",s:"Open it to add "+list.length+" reminder"+(list.length>1?"s":"")+" to your calendar.",ttl:4500});
  }catch(e){
    toast({t:"Couldn't create the calendar file",s:(e&&e.message)||"Try again.",ttl:5000});
  }
}

/* ---------- toasts ---------- */
function toast({t,s,ttl=0,sticky=false,undo,actions=[],due=false}){
  const el=document.createElement("div");el.className="toast"+(due?" due":"");
  el.innerHTML=`<div><div class="tt">${due?'<span class="bell">🔔</span> ':""}${esc(t)}</div>${s?`<div class="ts">${esc(s)}</div>`:""}</div>`;
  const close=()=>{if(el.classList.contains("leaving"))return;el.classList.add("leaving");setTimeout(()=>el.remove(),REDUCED.matches?0:220)};
  const acts=[...actions];if(undo)acts.push(["Undo",undo]);acts.push(["Dismiss",()=>{}]);
  if(acts.length>1||sticky){const a=document.createElement("div");a.className="ta";
    acts.forEach(([l,fn,cls])=>{const b=document.createElement("button");b.textContent=l;if(cls)b.className=cls;b.onclick=()=>{close();fn()};a.appendChild(b)});el.appendChild(a)}
  $("#toasts").appendChild(el);
  if(!sticky)setTimeout(close,ttl||3000);
  return el;
}

/* ---------- Keep import ---------- */
let pending=null;
const dropEl=$("#drop"),fileEl=$("#file");
$("#pick").onclick=()=>fileEl.click();
fileEl.onchange=()=>handleFiles([...fileEl.files]);
["dragenter","dragover"].forEach(ev=>dropEl.addEventListener(ev,e=>{e.preventDefault();dropEl.classList.add("over")}));
["dragleave","drop"].forEach(ev=>dropEl.addEventListener(ev,e=>{e.preventDefault();dropEl.classList.remove("over")}));
dropEl.addEventListener("drop",e=>handleFiles([...e.dataTransfer.files]));
$("#pasteGo").onclick=()=>{const notes=parsePasted($("#paste").value);if(!notes.length){toast({t:"Nothing to read",s:"Paste a few lines first.",ttl:3000});return}showPreview(notes)};

async function handleFiles(files){
  const notes=[];
  $("#preview").innerHTML='<div class="panel"><div class="empty">Reading your notes…</div></div>';
  for(const f of files){
    try{
      if(/\.zip$/i.test(f.name)){
        const zip=await JSZip.loadAsync(f);
        const entries=Object.values(zip.files).filter(z=>!z.dir&&/keep\//i.test(z.name)||!z.dir&&/\.json$/i.test(z.name));
        const jsons=entries.filter(z=>/\.json$/i.test(z.name));
        const use=jsons.length?jsons:entries.filter(z=>/\.html?$/i.test(z.name));
        for(const z of use){const txt=await z.async("string");const n=/\.json$/i.test(z.name)?fromJSON(txt):fromHTML(txt);if(n)notes.push(n)}
      }else if(/\.json$/i.test(f.name)){const n=fromJSON(await f.text());if(n)notes.push(n)}
      else if(/\.html?$/i.test(f.name)){const n=fromHTML(await f.text());if(n)notes.push(n)}
      else notes.push(...parsePasted(await f.text()));
    }catch(e){toast({t:"Couldn't read "+f.name,s:e.message||"Is this a Google Keep export?",ttl:5000})}
  }
  fileEl.value="";
  if(!notes.length){$("#preview").innerHTML='<div class="panel"><div class="empty">No Keep notes found in that file. Upload the Takeout .zip, or the .json files from its Keep folder.</div></div>';return}
  showPreview(notes);
}
function fromJSON(txt){
  let j;try{j=JSON.parse(txt)}catch(e){return null}
  if(!j||typeof j!=="object"||(!("textContent" in j)&&!("listContent" in j)&&!("title" in j)))return null;
  return {title:(j.title||"").trim(),text:(j.textContent||"").trim(),items:(j.listContent||[]).map(i=>({text:(i.text||"").trim(),done:!!i.isChecked})).filter(i=>i.text),
    labels:(j.labels||[]).map(l=>l.name).filter(Boolean),trashed:!!j.isTrashed,archived:!!j.isArchived,pinned:!!j.isPinned,
    created:j.createdTimestampUsec?Math.round(j.createdTimestampUsec/1000):(j.userEditedTimestampUsec?Math.round(j.userEditedTimestampUsec/1000):Date.now())};
}
function fromHTML(txt){
  const d=new DOMParser().parseFromString(txt,"text/html");
  const title=d.querySelector(".title")?.textContent.trim()||"";
  const items=[...d.querySelectorAll(".listitem, .list li")].map(li=>({text:(li.querySelector(".text")||li).textContent.trim(),done:/☑|checked/i.test(li.querySelector(".bullet")?.textContent||li.className)})).filter(i=>i.text);
  const content=d.querySelector(".content");
  const text=items.length?"":(content?content.innerText||content.textContent:"").trim();
  const labels=[...d.querySelectorAll(".label-name, .chips .label")].map(e=>e.textContent.trim()).filter(Boolean);
  if(!title&&!text&&!items.length)return null;
  return {title,text,items,labels,trashed:!!d.querySelector(".trashed"),archived:!!d.querySelector(".archived"),created:Date.now()};
}
function parsePasted(txt){
  const notes=[];let cur=null;
  txt.split(/\r?\n/).forEach(line=>{
    const l=line.trim();if(!l)return;
    const head=l.match(/^(?:#+\s*)?([^☐☑\-\*\[\]].{0,40}):$/)||l.match(/^#+\s+(.+)$/);
    if(head){cur={title:head[1].trim(),text:"",items:[],labels:[head[1].trim()],created:Date.now()};notes.push(cur);return}
    if(!cur){cur={title:"",text:"",items:[],labels:[],created:Date.now()};notes.push(cur)}
    const done=/^(☑|\[x\]|- \[x\])/i.test(l);
    cur.items.push({text:l.replace(/^(☐|☑|[-*•]\s*\[[ xX]?\]|\[[ xX]?\]|[-*•]|\d+[.)])\s*/,"").trim(),done});
  });
  return notes.filter(n=>n.items.length);
}
function buildTasks(notes,opt){
  const out=[];
  notes.forEach((n,ni)=>{
    if(n.trashed)return; if(n.archived&&opt.skipArchived)return;
    const cat=n.override||(n.labels&&n.labels[0]?titleCase(n.labels[0]):guessCat(n.title+" "+n.text+" "+n.items.map(i=>i.text).join(" ")));
    const mk=(title,note,done)=>{const w=parseWhen(title+" "+(note||""));const p=parseWhen(title);
      return {id:uid(),title:titleCase((p.rest||title).replace(/\s+(by|on|at|before)$/i,"")),cat,due:w.due,pri:n.pinned?1:0,done,doneAt:done?n.created:null,createdAt:n.created||Date.now(),src:"keep",note:note||"",_n:ni}};
    if(n.items.length&&opt.split){
      n.items.forEach(i=>{if(i.done&&!opt.keepChecked)return;out.push(mk(i.text,n.title,i.done))});
    }else{
      const firstLine=(n.text.split(/\n/)[0]||"").trim();
      const title=n.title||firstLine||(n.items[0]?.text)||"Untitled note";
      const body=n.items.length?n.items.map(i=>(i.done?"☑ ":"☐ ")+i.text).join("\n"):(n.title?n.text:n.text.split(/\n/).slice(1).join("\n")).trim();
      out.push(mk(title,body,n.items.length?n.items.every(i=>i.done):false));
    }
  });
  return out;
}
let opts={split:true,skipArchived:true,keepChecked:false};
function showPreview(notes){pending=notes;drawPreview()}
function drawPreview(){
  const notes=pending,list=buildTasks(notes,opts);
  const by={};list.forEach(t=>{(by[t.cat]=by[t.cat]||[]).push(t)});
  const skipped=notes.filter(n=>n.trashed).length+(opts.skipArchived?notes.filter(n=>n.archived&&!n.trashed).length:0);
  const allCats=[...new Set([...Object.keys(KNOWN),...Object.keys(by),...view().map(t=>t.cat)])];
  let h=`<div class="panel"><h4>Ready to import <small>${notes.length} notes → <b class="mono">${list.length}</b> tasks${skipped?` · ${skipped} trashed/archived skipped`:""}</small></h4>
   <div class="opts">
    <label><input type="checkbox" id="o-split"${opts.split?" checked":""}> Split checklists into separate tasks</label>
    <label><input type="checkbox" id="o-arch"${opts.skipArchived?" checked":""}> Skip archived notes</label>
    <label><input type="checkbox" id="o-chk"${opts.keepChecked?" checked":""}> Bring ticked items in as done</label>
   </div>`;
  for(const c of Object.keys(by).sort((a,b)=>by[b].length-by[a].length)){
    const arr=by[c];
    h+=`<div class="pv-cat"><h5><span class="dot" style="background:${cc(c)}"></span>${esc(c)} <span class="mono" style="color:var(--muted)">${arr.length}</span></h5><div class="list">`+
      arr.slice(0,6).map(t=>`<div class="pv-item"><span>${t.done?"☑":"☐"}</span><span>${esc(t.title)}${t.due?` <span class="muted mono">· ${esc(fmtDue(t.due))}</span>`:""}</span>
        <select aria-label="Move to category" id="mv-${t._n}-${esc(t.id)}" data-n="${t._n}">${allCats.map(x=>`<option${x===c?" selected":""}>${esc(x)}</option>`).join("")}</select></div>`).join("")+
      (arr.length>6?`<div class="pv-item muted">+ ${arr.length-6} more</div>`:"")+`</div></div>`;
  }
  h+=`<div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap"><button class="btn pri" id="doImport"${list.length?"":" disabled"}>Import ${list.length} tasks</button><button class="btn" id="cancelImport">Cancel</button></div>
   <p style="font-size:.78rem;color:var(--muted);margin:10px 0 0">Changing a task's category moves its whole Keep note. Notes without a label are sorted by what they mention (bills → Finance, doctor → Health, and so on).</p></div>`;
  $("#preview").innerHTML=h;
  $("#o-split").onchange=e=>{opts.split=e.target.checked;drawPreview()};
  $("#o-arch").onchange=e=>{opts.skipArchived=e.target.checked;drawPreview()};
  $("#o-chk").onchange=e=>{opts.keepChecked=e.target.checked;drawPreview()};
  document.querySelectorAll("#preview select[data-n]").forEach(s=>s.onchange=()=>{pending[+s.dataset.n].override=s.value;drawPreview()});
  $("#cancelImport").onclick=()=>{pending=null;$("#preview").innerHTML=""};
  $("#doImport").onclick=async()=>{
    const b=$("#doImport");b.disabled=true;
    const final=buildTasks(pending,opts).map(({_n,...t})=>t);
    await saveMany(final,(d,n)=>{b.textContent=`Saving ${d} of ${n}…`});
    pending=null;$("#preview").innerHTML="";
    rain();
    toast({t:`Imported ${final.length} tasks`,s:`Across ${new Set(final.map(t=>t.cat)).size} categories`,ttl:4000});
    tmCat=null;setView(HOME);
  };
}

document.addEventListener("keydown",e=>{if(e.key==="Escape"&&picked){picked=null;render()}});
/* ---------- boot ---------- */
initNotifications((action,id)=>{
  if(action==="brief"){setView(HOME);return}
  if(action==="focus"){if(focus&&ovMode==="focus")paintFocus();return}
  const t=view().find(x=>x.id===id);if(!t)return;
  if(action==="done"&&!t.done){save({...t,done:true,doneAt:Date.now()});toast({t:"Dusted ✓",s:t.title,ttl:2500,undo:()=>save({...t})})}
  else if(action==="snooze")save({...t,due:Date.now()+3600e3});
  else{alarms.set(t.id,Date.now()+6000);setView(HOME);tmTask=t.id;popEdit=false;hmSel=null;openDayPop()}
}).then(()=>syncOut());
initNativeShell({onShown:startSplash,onBack:()=>{
  if(ovMode){closeOv();return true}
  if(!$("#sheet").hidden){closeSheet();return true}
  if(!$("#pop").hidden){if(popEdit){popEdit=false;drawDayPop()}else closeDayPop();return true}
  if(!$("#addSheet").hidden){closeAdd();return true}
  if(openEdit){openEdit=null;render();return true}
  if(listOpen){closeList();return true}
  if(dict.open){closeDict();return true}
  if(picked){picked=null;render();return true}
  if(openEdit){openEdit=null;render();return true}
  if(currentView===HOME&&tmDay){tmDay=null;render();return true}
  if(currentView===HOME&&tmCat){tmCat=null;render();return true}
  if(currentView!==HOME){setView(HOME);return true}
  return false;
}});
onResume(()=>{checkDue();syncOut()});
if(!isNative&&"serviceWorker" in navigator&&import.meta.env.PROD){addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}))}
{const h=location.hash.slice(1);if(h==="import")setView(h)} // app shortcuts
document.body.dataset.view=currentView;initStore();render();
setTimeout(checkDue,1500);

/* shared with settings.js */
async function calAccess(){try{const Cal=await calPlugin();const r=await Cal.requestPermissions({permissions:["calendar"]});if(r.calendar==="granted"){calSync();return true}}catch{}return false}
function appBridge(){return {openImport:()=>setView("import"),getTasks:()=>tasks,view,toast,render,exportICS,resync:()=>syncOut(),calAccess,
  getCap:()=>cap,setCap:v=>{cap=v;lsSet("dd.cap",cap)},
  reload:async()=>{tasks=await loadAll();examples=wantExamples();animIn=true;render();syncOut()},
  isExamples:()=>examples,getPersisted:()=>persisted,
  // Settings → Delete all tasks. Returns what was removed so Undo can put it back.
  resetAll:async()=>{
    const snap={tasks:tasks.slice(),fired:[...fired]};
    await clearTasks();
    tasks=[];setPref("start",null);examples=false;exList=sampleTasks();filter="All";openEdit=null;
    fired.clear();lsSet("dd.fired",[]);alarms.clear();
    animIn=true;render();syncOut();told(); // cancels scheduled reminders and empties other open tabs
    return snap;
  },
  undoReset:async snap=>{
    await putTasks(snap.tasks);
    snap.fired.forEach(k=>fired.add(k));lsSet("dd.fired",[...fired].slice(-300));
    tasks=await loadAll();examples=wantExamples();animIn=true;render();syncOut();told();
  }}}
initSheet(appBridge);
