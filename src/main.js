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
import { esc, uid, DAY, sod, KNOWN, guessCat, titleCase, catVar, cc, parseWhen, parseQuick, fmtDue, toLocalInput, sampleTasks, parseDictation, collapseRepeats, REPEATS, repLabel, nextDue } from "./core.js";
import { dictationSupported, startDictation } from "./speech.js";
import { doBackup } from "./settings.js";
import { infoBtn, infoText, wireInfo } from "./info.js";
import { playSplashSound } from "./splash-sound.js";
import { pref, setPref } from "./prefs.js";
import { loadAll, putTask, putTasks, deleteTask, clearTasks, migrateFromLocalStorage, requestPersist } from "./store.js";
import { isNative, saveFile, haptic, initNativeShell, onResume } from "./platform.js";
import { initNotifications, scheduleSync, webNotify } from "./notify.js";
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
if(bc)bc.onmessage=async()=>{tasks=await loadAll();examples=examples&&tasks.length===0;render();scheduleSync(view)};

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
function afterLoad(){if(!q.value)$("#parse").innerHTML=parseHint();if(tasks.length&&!pref("start"))setPref("start","had");examples=wantExamples();render();scheduleSync(view)}
function view(){return examples?exList:tasks}
let exList=sampleTasks();
function failed(e){toast({t:"Couldn't save that change",s:(e&&e.message)||"Your device storage may be full.",ttl:5000})}

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
  if(i>=0)tasks[i]=t; else tasks.push(t);
  if(extra)tasks.push(extra);
  if(gone)tasks=tasks.filter(x=>x.id!==gone.id);
  render();
  try{await putTask(t);if(extra)await putTask(extra);if(gone)await deleteTask(gone.id);told()}catch(e){failed(e)}
  scheduleSync(view);
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
  scheduleSync(view);
}
async function updateMany(list){
  if(!list.length)return;
  const byId=new Map(list.map(t=>[t.id,t]));
  if(list[0].src==="example"){exList=exList.map(t=>byId.get(t.id)||t);render();return}
  tasks=tasks.map(t=>byId.get(t.id)||t);render();
  try{await putTasks(list);told()}catch(e){failed(e)}
  scheduleSync(view);
}
async function saveMany(list,progress){
  examples=false;tasks.push(...list);render();
  try{await putTasks(list);told()}catch(e){failed(e)}
  progress&&progress(list.length,list.length);
  scheduleSync(view);
}

/* ---------- state ---------- */
let filter="All",openEdit=null,currentView="tasks";
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
function parseHint(){return tasks.length<5?'<span>Try <b>#Home</b>, <b>fri 5pm</b>, <b>!</b> for important, <b>every monday</b>.</span>':""}
const q=$("#quick");
q.addEventListener("input",()=>{
  const v=q.value.trim();
  if(!v){$("#parse").innerHTML=parseHint();return}
  const p=parseQuick(v);
  $("#parse").innerHTML=`<span class="pchip" style="color:${cc(p.cat)}">● ${esc(p.cat)}${p.catGuessed?" (guessed)":""}</span>`+
   (p.due?`<span class="pchip">⏰ ${esc(fmtDue(p.due))}</span>`:`<span class="pchip">No date</span>`)+(p.rep?`<span class="pchip">↻ ${esc(repLabel(p.rep))}</span>`:"")+(p.pri?`<span class="pchip" style="color:var(--danger)">Important</span>`:"");
});
$("#addForm").addEventListener("submit",e=>{
  e.preventDefault();const v=q.value.trim();
  const p=v?parseQuick(v):null;
  if(!p||!p.title){const f=$("#addForm");f.classList.remove("shake");void f.offsetWidth;f.classList.add("shake");q.focus();return}
  if(examples){examples=false;animIn=true}
  const nid=uid();lastAdded=nid;haptic();
  const br=$("#addForm button").getBoundingClientRect();burst(br.left+br.width/2,br.top+br.height/2,14,[tok(catVar(p.cat)),tok("--accent")],.7);
  save({id:nid,title:titleCase(p.title),cat:p.cat,due:p.due,pri:p.pri,rep:p.rep||null,done:false,doneAt:null,createdAt:Date.now(),src:"manual"});
  q.value="";q.dispatchEvent(new Event("input"));
  toast({t:"Added",s:`${titleCase(p.title)}${p.due?" · "+fmtDue(p.due):""}${p.rep?" · repeats "+repLabel(p.rep).toLowerCase():""}`,ttl:2500});
  setView("tasks");
});

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
  el.querySelector("#stFresh").onclick=go("fresh",()=>{examples=false;render();q.focus()});
  el.querySelector("#stEx").onclick=go("examples",()=>{examples=true;render()});
}
function steps(){
  const real=tasks;
  return [
    ["add","Add your first task",real.length>0,"Type it in the box above, or import from Keep."],
    ["time","Give a task a time",real.some(t=>t.due),"Add “tomorrow 6pm” to a task. You'll get a reminder."],
    ...(canDictate?[["voice","Say a task out loud",real.some(t=>t.src==="voice"),"Tap the mic and speak. Say several at once."]]:[]),
    ["done","Finish one",real.some(t=>t.done),isNative||matchMedia("(pointer:coarse)").matches?"Tap the circle, or swipe the task right.":"Tap the circle next to it."],
    ["dash","Peek at the Dashboard",!!pref("sawDash"),"See what's overdue, your streak and the task map."],
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
  if(b("goFresh"))b("goFresh").onclick=()=>{setPref("start","fresh");examples=false;animIn=true;render();q.focus()};
  if(b("gdHide"))b("gdHide").onclick=()=>{setPref("gdHidden",true);render()};
  if(b("dnOk"))b("dnOk").onclick=()=>{setPref("dataNoteOk",true);render()};
  if(b("dnBackup"))b("dnBackup").onclick=()=>doBackup();
  el.querySelectorAll("[data-gd]").forEach(x=>x.onclick=()=>{
    const k=x.dataset.gd;haptic();
    if(k==="add"||k==="time"){q.focus();if(k==="time"&&!q.value){q.value="Call the plumber tomorrow 6pm";q.dispatchEvent(new Event("input"));q.select()}}
    else if(k==="voice")micBtn.click();
    else if(k==="dash")setView("dash");
    else if(k==="backup")doBackup();
    else if(k==="done")el.querySelector(".row:not(.done) .tick")?.focus();
  });
}

/* ---------- dictation: speak several tasks, review, add ---------- */
const dict={open:false,listening:false,text:"",items:[],session:null,note:""};
const micBtn=$("#mic"),dictEl=$("#dict");
$("#hdrAdd").onclick=()=>{haptic();setView("tasks");q.focus()};
wireInfo($("#v-dash"),()=>render());
let canDictate=false;
dictationSupported().then(ok=>{micBtn.hidden=!ok;canDictate=ok;if(currentView==="tasks")render()});
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
    const now=Date.now(),list=dict.items.map((x,i)=>({id:uid()+i,title:x.title,cat:x.cat,due:x.due,pri:x.pri,rep:x.rep||null,done:false,doneAt:null,createdAt:now+i,src:"voice"}));
    if(!list.length)return;
    if(examples)animIn=true;
    burstAt("#dictAdd",20);haptic("success");
    lastAdded=list[list.length-1].id;
    closeDict();saveMany(list);
    toast({t:`Added ${list.length} task${list.length>1?"s":""}`,s:list.slice(0,3).map(t=>t.title).join(", ")+(list.length>3?"…":""),ttl:3500});
    setView("tasks");
  };
}
function drawDictAfterDrop(){ // a card was removed by hand: keep the remaining cards as they are
  const keep=dict.items.slice();drawDict();dict.items=keep;
  const n=keep.length,b=$("#dictAdd");if(b){b.disabled=!n;b.textContent=`Add ${n||""} task${n===1?"":"s"}`}
  $("#dictCards").innerHTML=keep.map((x,i)=>`<div class="dcard" style="--cc:${cc(x.cat)}"><span class="cdot"></span><div class="body"><div class="t">${x.pri?'<span class="cflag">! </span>':""}${esc(x.title)}</div><div class="meta"><span class="cat">${esc(x.cat)}</span><span>${x.due?"⏰ "+esc(fmtDue(x.due)):"No date"}</span>${x.pri?'<span class="flag">● Important</span>':""}</div></div><button class="more" data-drop="${i}" aria-label="Remove this task">✕</button></div>`).join("");
}

/* ---------- views ---------- */
document.querySelectorAll(".seg button").forEach(b=>b.addEventListener("click",()=>setView(b.dataset.view)));
function setView(v){
  const changed=currentView!==v;currentView=v;
  const views=["tasks","plan","dash","import"];
  $(".seg").style.setProperty("--i",views.indexOf(v));
  document.querySelectorAll(".seg button").forEach(b=>b.setAttribute("aria-selected",b.dataset.view===v));
  $("#v-tasks").hidden=v!=="tasks";$("#v-plan").hidden=v!=="plan";$("#v-dash").hidden=v!=="dash";$("#v-import").hidden=v!=="import";
  if(v==="dash"&&!pref("sawDash"))setPref("sawDash",true);
  if(v==="plan"&&changed)setPref("planSeen",(pref("planSeen")||0)+1);
  document.body.dataset.view=v;
  if(changed){animIn=true;if(v==="import"){const s=$("#v-import");s.classList.remove("view-in");void s.offsetWidth;s.classList.add("view-in")}}
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
  if(currentView==="tasks") renderTasks(list,now,t0);
  if(currentView==="dash") renderDash(list,now,t0);
  if(currentView==="plan") renderPlan(list,now,t0);
  if(!$("#pop").hidden)drawDayPop(); // keep an open day pop-up in step with changes
  if(loaded)animIn=false;
}

function cats(list){const m={};list.forEach(t=>{m[t.cat]=m[t.cat]||{open:0,done:0};t.done?m[t.cat].done++:m[t.cat].open++});return m}

function renderTasks(list,now,t0){
  const el=$("#v-tasks");
  if(!loaded){el.innerHTML='<div class="empty">Loading your tasks…</div>';return}
  const m=cats(list),names=Object.keys(m).sort((a,b)=>(m[b].open-m[a].open)||a.localeCompare(b));
  if(filter!=="All"&&!m[filter])filter="All";
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
  if(!tasks.length&&!pref("start")){ // first run: ask how they want to start
    el.classList.toggle("enter",animIn);el.innerHTML=startHTML();wireStart(el);return;
  }
  if(!examples){const g=getDustedHTML();if(g)h+=g;else if(dataNoteDue())h+=dataNoteHTML()}
  if(examples) h+=`<div class="note" style="--d:0"><span>These are example tasks so you can see how Done &amp; Dusted works. They vanish when you add a task or import from Keep.</span><span class="note-acts"><button id="goFresh">Start fresh</button><button id="goImp">Import from Keep</button></span></div>`;
  h+=`<div class="chips" role="group" aria-label="Filter by category"><button class="chip" aria-pressed="${filter==="All"}" data-f="All">All <span class="n">${list.filter(t=>!t.done).length}</span></button>`+
     names.map((c,i)=>`<button class="chip" style="--d:${Math.min(i+1,10)}" aria-pressed="${filter===c}" data-f="${esc(c)}"><span class="dot" style="background:${cc(c)}"></span>${esc(c)} <span class="n">${m[c].open}</span></button>`).join("")+`</div>`;
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
  const gi=el.querySelector("#goImp");if(gi)gi.onclick=()=>setView("import");
  wireOnboard(el);
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
    const f=r.querySelector(".edit");if(!f)return;
    f.querySelector("[data-a=save]").onclick=()=>{
      const v=n=>f.querySelector(`[name=${n}]`).value;
      let cat=v("cat")==="__new"?titleCase(v("newcat")||"Inbox"):v("cat");
      let due=v("due")?new Date(v("due")).getTime():null;const rp=v("rep")||null;
      if(rp&&!due){const n=new Date(),d=sod(n);d.setHours(9,0,0,0);if(d<=n)d.setDate(d.getDate()+1);due=d.getTime(); // a repeat needs a first date
        toast({t:"Starts "+fmtDue(due),s:"A repeating task needs a date, so it starts at the next 9am.",ttl:4000})}
      openEdit=null;save({...t,title:v("title").trim()||t.title,cat,due,pri:+v("pri"),rep:rp,note:v("note"),reminded:due!==t.due?false:t.reminded});
    };
    const tm=f.querySelector("[data-a=tmr]");if(tm)tm.onclick=()=>{openEdit=null;snooze(t)};
    f.querySelector("[data-a=del]").onclick=()=>{openEdit=null;remove(t);toast({t:"Deleted",s:t.title,ttl:4000,undo:()=>save(t)})};
    f.querySelector("[data-a=cal]").onclick=()=>exportICS([t]);
    const sel=f.querySelector("[name=cat]");sel.onchange=()=>{f.querySelector(".newcat").hidden=sel.value!=="__new"};
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
     ${t.rep?`<span class="rep">↻ ${esc(repLabel(t.rep))}</span>`:""}
     ${t.src==="keep"?`<span class="src">Keep</span>`:""}
     ${t.note?`<span style="overflow-wrap:anywhere">${esc(String(t.note).slice(0,80))}</span>`:""}
   </div></div>
   <button class="more" aria-label="Edit task" aria-expanded="${openEdit===t.id}">⋯</button>${today?'<span class="fuse" aria-hidden="true"></span>':""}`;
  if(openEdit===t.id){
    const all=[...new Set([...Object.keys(KNOWN),...view().map(x=>x.cat)])];
    h+=`<div class="edit">
      <label class="full">Task<input name="title" id="e-title-${esc(t.id)}" value="${esc(t.title)}"></label>
      <label>Category<select name="cat" id="e-cat-${esc(t.id)}">${all.map(c=>`<option${c===t.cat?" selected":""}>${esc(c)}</option>`).join("")}<option value="__new">New category…</option></select>
        <input class="newcat" name="newcat" id="e-new-${esc(t.id)}" placeholder="Category name" hidden></label>
      <label>Due<input type="datetime-local" name="due" id="e-due-${esc(t.id)}" value="${toLocalInput(t.due)}"></label>
      <label>Priority<select name="pri" id="e-pri-${esc(t.id)}"><option value="0"${!t.pri?" selected":""}>Normal</option><option value="1"${t.pri?" selected":""}>Important</option></select></label>
      <label>Repeat<select name="rep" id="e-rep-${esc(t.id)}"><option value="">Doesn't repeat</option>${Object.entries(REPEATS).map(([k,n])=>`<option value="${k}"${t.rep===k?" selected":""}>${n}</option>`).join("")}</select></label>
      <label class="full">Note<textarea name="note" id="e-note-${esc(t.id)}">${esc(t.note||"")}</textarea></label>
      <div class="acts"><button class="btn pri" data-a="save">Save</button>${t.due?`<button class="btn" data-a="cal">Add to calendar</button>`:`<button class="btn" data-a="cal" hidden></button>`}${t.done?"":`<button class="btn" data-a="tmr">Move to tomorrow</button>`}<button class="btn warn" data-a="del">Delete</button></div>
    </div>`;
  }
  return h+`</div>`;
}

/* ---------- dashboard ---------- */
/* The Dashboard's parts, in the order they show. All are on until the person hides them. */
const DASH=[["tiles","Summary numbers"],["map","Task map"],["heat","Status heatmap"],["ring","Today's progress"],["cats","By category"],["week","Coming up"],["chart","Last 14 days"],["rem","Reminders"]];
let dashEdit=false,dashOpening=false; // dashOpening: animate the chips panel only as it opens
function dashBarHTML(hide){
  return `<div class="dash-bar"><button class="btn sm" id="dashEdit" aria-expanded="${dashEdit}" aria-controls="dashPick">${dashEdit?"Done":"Customise"}</button></div>`+
  (dashEdit?`<div class="dash-pick${dashOpening?" in":""}" id="dashPick"><p>Tap a part to show or hide it on the Dashboard.</p>
    <div class="dash-chips" role="group" aria-label="Show on the Dashboard">${DASH.map(([k,n])=>`<button class="chip" data-dash="${k}" aria-pressed="${!hide.has(k)}">${n}</button>`).join("")}</div>
    ${hide.size?`<button class="btn sm" id="dashReset">Show all</button>`:""}</div>`:"");
}
function renderDash(list,now,t0){
  const el=$("#v-dash");
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

  let h=examples?`<div class="note"><span>Dashboard is showing the example tasks.</span></div>`:"";
  // each part is built on its own; the person picks which ones show (Customise)
  const P={};
  P.tiles=`<div class="tiles">
    <div class="tile" style="--d:0"><div class="k">Open</div><div class="v" data-n="${open.length}">${open.length}</div><div class="s">${open.filter(t=>!t.due).length} without a date</div></div>
    <div class="tile ${todayAll.some(t=>!t.done)?"warm":""}" style="--d:1"><div class="k">Due today</div><div class="v" data-n="${todayAll.filter(t=>!t.done).length}">${todayAll.filter(t=>!t.done).length}</div><div class="s">${todayDone} done today</div></div>
    <div class="tile ${overdue.length?"bad":""}" style="--d:2"><div class="k">Overdue</div><div class="v" data-n="${overdue.length}">${overdue.length}</div><div class="s">${overdue.length?"oldest "+fmtDue(Math.min(...overdue.map(t=>t.due))):"all clear"}</div></div>
    <div class="tile" style="--d:3"><div class="k">Done · 7 days</div><div class="v" data-n="${weekDone}">${weekDone}</div><div class="s">${streak} day streak${streak>=3?" 🔥":""}</div></div>
  </div>`;
  if(tmCat&&!list.some(t=>t.cat===tmCat))tmCat=null;
  P.map=`<div class="panel" style="--d:4"><h4>Task map <small>${tmCat?"tap a task":"tap a category"} ${infoBtn("map")}</small></h4>${tmCat?taskTreemapHTML(list,now,t0,tmCat):treemapHTML(list,now,t0)}</div>`;
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
  h=dashBarHTML(hide)+h+(parts.join("")||`<div class="empty dash-empty">Every part of the Dashboard is hidden. Tap Customise to bring some back.</div>`);
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
    const up=e.target.closest("[data-tmup]"),go=e.target.closest("[data-tmgo]"),tk=e.target.closest("[data-tid]"),b=e.target.closest("[data-tcat]");
    if(up){tmCat=null;animIn=true;haptic();render();return}
    if(go){filter=go.dataset.tmgo;haptic();setView("tasks");return}
    if(tk){tmTask=tk.dataset.tid;hmSel=null;haptic();openDayPop();return} // same pop-up as a heatmap day
    if(b){tmCat=b.dataset.tcat;animIn=true;haptic();render()}
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
function placeOn(t,dayStart,now,slot=0){ // keep the task's time of day; if that's already past today, use the next free hour
  if(dayStart===null)return {...t,due:null,reminded:false};
  const d=new Date(dayStart),src=t.due?new Date(t.due):null;
  if(src)d.setHours(src.getHours(),src.getMinutes(),0,0);else d.setHours(9+slot,0,0,0);
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
  const load=[...Array(7)].map((_,i)=>open.filter(t=>t.due>=now&&t.due>=t0+i*DAY&&t.due<t0+(i+1)*DAY).length);
  const before=snapRects(),prev=[],next=[];let spill=0;
  for(const t of pool){
    let i=load.findIndex(n=>n<cap);
    if(i<0){i=load.indexOf(Math.min(...load));spill++}
    const placed=placeOn({...t,due:null},t0+i*DAY,now,load[i]);
    load[i]++;prev.push(t);next.push(placed);
  }
  updateMany(next);
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
    <button class="btn auto" id="autoBtn"><span class="spark">✦</span> Auto-plan</button></div></div>
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
      <h4><span class="dname">${i===0?'Today <span class="tag">'+d.toLocaleDateString("en-IN",{day:"numeric",month:"short"})+'</span>':i===1?"Tomorrow":d.toLocaleDateString("en-IN",{weekday:"long"})}${i>1?` <small>${d.toLocaleDateString("en-IN",{day:"numeric",month:"short"})}</small>`:""}</span>
        <small class="mono">${n}/${cap}${doneN?` · ${doneN} done`:""}</small></h4>
      <div class="meter ${st}" style="--m:${Math.min(100,n/cap*100)}%"><span></span></div>
      <div class="cards">${day.map((t,j)=>cardHTML(t,now,j+i)).join("")||'<span class="free">Free</span>'}</div>
      <button class="dropbtn" data-to="${s}">Move here</button></div>`;
  }
  h+=`</div>${later?`<p class="plan-hint" style="margin-top:12px">${later} more planned beyond this week.</p>`:""}`;
  el.classList.toggle("enter",animIn);el.classList.toggle("picking",!!picked);
  el.innerHTML=h;

  $("#capDown").onclick=()=>{cap=Math.max(1,cap-1);lsSet("dd.cap",cap);render()};
  $("#capUp").onclick=()=>{cap=Math.min(12,cap+1);lsSet("dd.cap",cap);render()};
  $("#autoBtn").onclick=autoPlan;
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
/* Task map, one category: one tile per task. Colour = the task's RAG (done tasks green and struck through).
   Size = how much it needs you: overdue 3, due today or at risk 2, on track 1.5, done 1; Important adds 1. */
function taskTreemapHTML(list,now,t0,cat){
  const arr=list.filter(t=>t.cat===cat),colour=taskColours(list,now,t0),RANK={r:0,a:1,g:2};
  const n={r:0,a:0,g:0};
  let items=arr.map(t=>{
    const k=colour(t);n[k]++;
    const sub=t.done?"Done":t.due?fmtDue(t.due):"No date";
    return {v:(t.done?1:k==="r"?3:k==="a"?2:1.5)+(t.pri&&!t.done?1:0),id:t.id,k,name:t.title,sub,done:t.done,pri:t.pri,
      ord:t.done?3:RANK[k],due:t.due||Infinity};
  }).sort((a,b)=>a.ord-b.ord||a.due-b.due||a.name.localeCompare(b.name));
  // same proportions as the category map; more tasks get a taller map so tiles stay tappable
  const px=arr.length<=3?170:arr.length<=8?230:arr.length<=16?300:Math.min(520,300+(arr.length-16)*10),W=1000,H=Math.round(W*px/340);
  const floor=Math.min(.12,.5/items.length),tot=items.reduce((s,it)=>s+it.v,0);
  items.forEach(it=>{it.v=Math.max(it.v,floor*tot)});
  const tiles=squarify(items,W,H).map((b,i)=>{
    const wpx=b.w/W*340,hpx=b.h/H*px,tiny=wpx<48||hpx<30,small=wpx<100||hpx<64;
    const label=`${b.name}: ${b.done?"done":RAGW[b.k].toLowerCase()}, ${b.sub}${b.pri&&!b.done?", Important":""}`;
    const style=`left:${(b.x/W*100).toFixed(2)}%;top:${(b.y/H*100).toFixed(2)}%;width:${(b.w/W*100).toFixed(2)}%;height:${(b.h/H*100).toFixed(2)}%;--i:${Math.min(i,20)}`;
    const inner=tiny?"":`<span class="nm">${b.pri&&!b.done?"● ":""}${esc(b.name)}</span>${small?"":`<span class="sb">${esc(b.sub)}</span>`}`;
    return `<button class="tmap-tile task-tile ${b.k}${b.done?" done":""}${small?" small":""}" style="${style}" data-tid="${esc(b.id)}" aria-label="${esc(label)}" title="${esc(label)}">${inner}</button>`;
  }).join("");
  const open=arr.filter(t=>!t.done).length,pct=Math.round((arr.length-open)/arr.length*100);
  return `<div class="tm-wrap"><div class="tm-head">
      <button class="btn tm-up" data-tmup aria-label="Back to all categories">‹ All categories</button>
      <span class="tm-crumb"><b style="color:${cc(cat)}">${esc(cat)}</b> · ${arr.length} task${arr.length>1?"s":""} · ${pct}% done</span>
      <button class="btn" data-tmgo="${esc(cat)}">Open list</button></div>
    <div class="tmap" role="group" aria-label="${esc(cat)} tasks" style="height:${px}px">${tiles}</div>
    <div class="hm-legend"><span><i style="background:var(--danger)"></i>Overdue ${n.r}</span><span><i style="background:var(--amber)"></i>Due today or at risk ${n.a}</span><span><i style="background:var(--ok)"></i>On track or done ${n.g}</span></div>
    ${infoText("map","Bigger tiles need you sooner: overdue, then due today, then Important. Tap a task to see it and act on it.")}</div>`;
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
  hmSel=null;tmTask=null;document.querySelectorAll(".hm-cell.sel").forEach(x=>x.classList.remove("sel"));
  pop.classList.remove("open");setTimeout(()=>{pop.hidden=true},250);
  back&&back.focus();
}
function drawDayPop(){ // returns false when the day has nothing to show
  if(tmTask){
    const t=view().find(x=>x.id===tmTask);if(!t){closeDayPop();return false}
    $("#popTitle").textContent=t.cat+" task";$("#popBody").innerHTML=taskPopHTML(t);return true;
  }
  if(!hmSel)return false;
  const now=Date.now(),t0=sod(now).getTime(),html=dayHTML(view(),now,t0);
  if(!html){closeDayPop();return false}
  $("#popTitle").textContent=new Date(hmSel.s).toLocaleDateString("en-IN",{weekday:"long",day:"numeric",month:"short"});
  $("#popBody").innerHTML=html;
  return true;
}
$("#popClose").onclick=closeDayPop;
$("#pop").addEventListener("click",e=>{
  if(e.target.id==="pop"){closeDayPop();return}
  const tp=e.target.closest("[data-tp]");
  if(tp){
    const t=view().find(x=>x.id===tmTask);if(!t)return;
    const act=tp.dataset.tp,now=Date.now(),t0=sod(now).getTime();
    if(act==="edit"){const id=t.id;closeDayPop();filter=t.cat;openEdit=id;haptic();setView("tasks");
      setTimeout(()=>document.querySelector(`.row[data-id="${CSS.escape(id)}"]`)?.scrollIntoView({block:"center",behavior:"smooth"}),300);return}
    if(act==="undo"){save({...t,done:false,doneAt:null});haptic();return}
    if(act==="done"){const r=tp.getBoundingClientRect();burst(r.left+r.width/2,r.top+r.height/2,18,[tok(catVar(t.cat)),tok("--accent")],.8);dustBrand();haptic("success");
      save({...t,done:true,doneAt:now});toast({t:"Dusted ✓",s:t.title,ttl:2500,undo:()=>save({...t})});return}
    const next=act==="hour"?{...t,due:now+3600e3,reminded:false}:placeOn(t,t0+(act==="week"?7:1)*DAY,now);
    haptic();save(next);toast({t:"Moved to "+fmtDue(next.due),s:t.title,ttl:2500,undo:()=>save({...t})});return;
  }
  const tk=e.target.closest("button.tick");if(!tk)return;
  const t=view().find(x=>x.id===tk.dataset.id);if(!t)return;
  if(t.done){save({...t,done:false,doneAt:null});return}
  const r=tk.getBoundingClientRect();burst(r.left+r.width/2,r.top+r.height/2,16,[tok(catVar(t.cat)),tok("--accent")],.8);dustBrand();haptic("success");
  save({...t,done:true,doneAt:Date.now()});
});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!$("#pop").hidden)closeDayPop()});
function taskPopHTML(t){ // pop-up for one task, opened from the task map
  const now=Date.now(),t0=sod(now).getTime(),k=taskColours(view(),now,t0)(t),late=!t.done&&t.due&&t.due<now;
  const when=t.done?"Done":t.due?fmtDue(t.due):"No date";
  return `<div class="rv"><div class="row rag-${k}${t.done?" done":""}" style="--cc:${cc(t.cat)};grid-template-columns:1fr auto"><div class="body"><div class="t">${esc(t.title)}</div><div class="meta"><span class="cat">${esc(t.cat)}</span><span class="rag-tag ${k}">${RAGW[k]}</span>${t.pri?'<span class="flag">● Important</span>':""}${t.rep?'<span>↻ Repeats</span>':""}</div></div>
      <span class="mono" style="color:${late?"var(--danger)":"var(--muted)"}">${esc(when)}</span></div>
    ${t.note?`<p class="rv-sub" style="overflow-wrap:anywhere;white-space:pre-wrap">${esc(String(t.note))}</p>`:""}
    <p class="rv-sub">${t.done?"Dusted. Tap Not done to bring it back.":t.due?RAGSUB[k]:"No date yet. Give it a day, or edit it."}</p>
    <div class="rv-acts">${t.done?`<button class="btn" data-tp="undo">Not done</button>`
      :`<button class="btn pri" data-tp="done">Done ✓</button>${late||(t.due&&t.due<t0+DAY)?`<button class="btn" data-tp="hour">+1 hour</button>`:""}<button class="btn" data-tp="tomorrow">Tomorrow</button><button class="btn" data-tp="week">Next week</button>`}
      <button class="btn" data-tp="edit">Edit</button></div></div>`;
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
  if(currentView==="import")setView("tasks");else render();
  const mins=Math.round(away/6e4),awayTxt=mins<60?`${mins} min`:`${Math.round(mins/60)} hr`;
  if(came.length&&pref("alerts")){chime();toast({t:`Welcome back · ${came.length} came due`,s:came.slice(0,3).map(t=>t.title).join(", ")+(came.length>3?"…":""),sticky:true,due:true,actions:[["Show me",()=>{filter="All";setView("tasks");document.querySelector(".row.alarm")?.scrollIntoView({behavior:REDUCED.matches?"auto":"smooth",block:"center"})},"go"]]})}
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
    const ids=lsGet("dd.calIds",{});
    try{
      const {registerPlugin}=await import("@capacitor/core");
      const Cal=registerPlugin("DDCalendar");
      const r=await Cal.addEvents({events:list.map(t=>({title:t.title,start:t.due,minutes:15,rrule:RRULE[t.rep]||"",
        description:"Done & Dusted · "+t.cat,eventId:ids[t.id]||-1}))});
      r.ids.forEach((id,i)=>{if(id>0)ids[list[i].id]=id});lsSet("dd.calIds",ids);haptic("success");
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
    filter="All";setView("tasks");
  };
}

document.addEventListener("keydown",e=>{if(e.key==="Escape"&&picked){picked=null;render()}});
/* ---------- boot ---------- */
initNotifications((action,id)=>{
  const t=view().find(x=>x.id===id);if(!t)return;
  if(action==="done"&&!t.done){save({...t,done:true,doneAt:Date.now()});toast({t:"Dusted ✓",s:t.title,ttl:2500,undo:()=>save({...t})})}
  else if(action==="snooze")save({...t,due:Date.now()+3600e3});
  else{filter="All";alarms.set(t.id,Date.now()+6000);setView("tasks");setTimeout(()=>document.querySelector(`.row[data-id="${CSS.escape(t.id)}"]`)?.scrollIntoView({block:"center",behavior:"smooth"}),300)}
}).then(()=>scheduleSync(view));
initNativeShell({onShown:startSplash,onBack:()=>{
  if(!$("#sheet").hidden){closeSheet();return true}
  if(!$("#pop").hidden){closeDayPop();return true}
  if(dict.open){closeDict();return true}
  if(picked){picked=null;render();return true}
  if(openEdit){openEdit=null;render();return true}
  if(currentView==="dash"&&tmCat){tmCat=null;render();return true}
  if(currentView!=="tasks"){setView("tasks");return true}
  return false;
}});
onResume(()=>{checkDue();scheduleSync(view)});
if(!isNative&&"serviceWorker" in navigator&&import.meta.env.PROD){addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}))}
{const h=location.hash.slice(1);if(["plan","dash","import"].includes(h))setView(h)} // app shortcuts
initStore();render();
setTimeout(checkDue,1500);

/* shared with settings.js */
function appBridge(){return {getTasks:()=>tasks,view,toast,render,exportICS,resync:()=>scheduleSync(view),
  getCap:()=>cap,setCap:v=>{cap=v;lsSet("dd.cap",cap)},
  reload:async()=>{tasks=await loadAll();examples=wantExamples();animIn=true;render();scheduleSync(view)},
  isExamples:()=>examples,getPersisted:()=>persisted,
  // Settings → Delete all tasks. Returns what was removed so Undo can put it back.
  resetAll:async()=>{
    const snap={tasks:tasks.slice(),fired:[...fired]};
    await clearTasks();
    tasks=[];setPref("start",null);examples=false;exList=sampleTasks();filter="All";openEdit=null;
    fired.clear();lsSet("dd.fired",[]);alarms.clear();
    animIn=true;render();scheduleSync(view);told(); // cancels scheduled reminders and empties other open tabs
    return snap;
  },
  undoReset:async snap=>{
    await putTasks(snap.tasks);
    snap.fired.forEach(k=>fired.add(k));lsSet("dd.fired",[...fired].slice(-300));
    tasks=await loadAll();examples=wantExamples();animIn=true;render();scheduleSync(view);told();
  }}}
initSheet(appBridge);
