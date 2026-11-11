// Pure helpers: categories, natural-language dates, formatting, example data.
// No DOM access, so these run (and are tested) in Node too.

const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,8);
const DAY=864e5;
const sod=d=>{const x=new Date(d);x.setHours(0,0,0,0);return x};

/* ---------- categories ---------- */
const PALETTE=["--c1","--c2","--c3","--c4","--c5","--c6","--c7"];
const KNOWN={Work:"--c1",Home:"--c2",Finance:"--c7",Health:"--c3",Shopping:"--c4",Learning:"--c5",Personal:"--c6",Inbox:"--c8"};
const GUESS=[
 ["Finance",/\b(pay|bill|emi|loan|tax|itr|gst|invoice|bank|sip|insurance|premium|rent|salary|upi|refund|credit card|fd|mutual fund|stock|trade|crypto)\b/i],
 ["Health",/\b(doctor|dentist|medicine|tablet|gym|walk|yoga|blood test|checkup|check-up|hospital|clinic|vaccine|workout|diet|run)\b/i],
 ["Shopping",/\b(buy|order|amazon|flipkart|groceries|grocery|milk|vegetables|bigbasket|zepto|blinkit|shop)\b/i],
 ["Work",/\b(client|meeting|sow|proposal|deck|deploy|pipeline|review|jira|sprint|deadline|email|call with|report|standup|informatica|etl|design doc)\b/i],
 ["Learning",/\b(learn|course|read|book|certif|study|tutorial|practice|exam|udemy|coursera|leetcode)\b/i],
 ["Home",/\b(clean|fix|repair|plumber|electrician|gas|cylinder|laundry|maid|cook|kitchen|house|garden|water|maintenance|society)\b/i],
];
function guessCat(text){for(const [c,re] of GUESS) if(re.test(text)) return c; return "Inbox"}
function titleCase(s){s=String(s).trim();return s.charAt(0).toUpperCase()+s.slice(1)}
function catVar(c){
  if(KNOWN[c]) return KNOWN[c];
  let h=0;for(const ch of c) h=(h*31+ch.charCodeAt(0))>>>0;
  return PALETTE[h%PALETTE.length];
}
const cc=c=>`var(${catVar(c)})`;

/* ---------- natural-language date parsing ---------- */
const MON=["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
const WD=["sun","mon","tue","wed","thu","fri","sat"];
function parseWhen(text,now=new Date()){
  let s=" "+text+" ",date=null,time=null,hit=[];
  const take=(re,fn)=>{const m=s.match(re);if(m){const r=fn(m);if(r!==false){hit.push(m[0].trim());s=s.replace(m[0]," ");}}};
  // time
  take(/\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i,m=>{let h=+m[1]%12;if(m[3].toLowerCase()==="pm")h+=12;time=[h,+(m[2]||0)]});
  if(!time) take(/\b(?:at\s+)?([01]?\d|2[0-3]):([0-5]\d)\b/,m=>{time=[+m[1],+m[2]]});
  if(!time) take(/\bat\s+(\d{1,2})\b/i,m=>{let h=+m[1];if(h<8)h+=12;time=[h,0]});
  if(!time) take(/\b(morning)\b/i,()=>{time=[9,0]});
  if(!time) take(/\b(evening)\b/i,()=>{time=[18,0]});
  // date
  take(/\b(today)\b/i,()=>{date=sod(now)});
  if(!date) take(/\b(tonight)\b/i,()=>{date=sod(now);if(!time)time=[20,0]});
  if(!date) take(/\b(tomorrow|tmrw|tmr)\b/i,()=>{date=new Date(sod(now).getTime()+DAY)});
  if(!date) take(/\bin\s+(\d+)\s+(day|days|week|weeks)\b/i,m=>{date=new Date(sod(now).getTime()+ +m[1]*(m[2][0].toLowerCase()==="w"?7:1)*DAY)});
  if(!date) take(/\b(next week)\b/i,()=>{const d=sod(now);d.setDate(d.getDate()+((8-d.getDay())%7||7));date=d});
  if(!date) take(/\b(?:by|on|before)?\s*(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?(?:\s+(\d{4}))?\b/i,m=>{date=mkDate(+m[1],MON.indexOf(m[2].toLowerCase().slice(0,3)),m[3],now)});
  if(!date) take(/\b(?:by|on|before)?\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\b/i,m=>{date=mkDate(+m[2],MON.indexOf(m[1].toLowerCase().slice(0,3)),m[3],now)});
  if(!date) take(/\b(?:by|on|before)?\s*(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?\b/,m=>{const mo=+m[2]-1;if(mo<0||mo>11||+m[1]>31)return false;date=mkDate(+m[1],mo,m[3],now)});
  if(!date) take(/\b(?:by|on|this|next)?\s*(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)(?:day|nesday|sday|urday)?\b/i,m=>{
    const w=WD.indexOf(m[1].toLowerCase().slice(0,3));const d=sod(now);let add=(w-d.getDay()+7)%7;
    if(add===0)add=7; d.setDate(d.getDate()+add);date=d});
  if(!date&&time){date=sod(now);if(time[0]*60+time[1]<=now.getHours()*60+now.getMinutes())date=new Date(date.getTime()+DAY)}
  if(date){date=new Date(date);const t=time||[9,0];date.setHours(t[0],t[1],0,0)}
  return {due:date?date.getTime():null,rest:s.replace(/\s+/g," ").trim(),hit};
}
function mkDate(d,m,y,now){
  let yr=y?(+y<100?2000+ +y:+y):now.getFullYear();
  let dt=new Date(yr,m,d);
  if(!y&&dt<sod(now)-30*DAY) dt=new Date(yr+1,m,d);
  return dt;
}
function parseQuick(text){
  let pri=0,cat=null;
  let t=text.replace(/(^|\s)#([\p{L}\p{N}_-]+)/u,(_,a,c)=>{cat=titleCase(c);return " "});
  t=t.replace(/(^|\s)!{1,3}(?=\s|$)/,()=>{pri=1;return " "});
  t=t.replace(/\b(urgent|important|asap)\b/i,m=>{pri=1;return m});
  const w=parseWhen(t);
  const title=w.rest.replace(/\s+(by|on|at|before)$/i,"").trim();
  return {title,due:w.due,cat:cat||guessCat(title),catGuessed:!cat,pri,hit:w.hit};
}

/* ---------- formatting ---------- */
function fmtDue(ts,now=Date.now()){
  if(!ts) return "";
  const d=new Date(ts),t0=sod(now).getTime(),dd=sod(d).getTime(),diff=Math.round((dd-t0)/DAY);
  const tm=d.toLocaleTimeString("en-IN",{hour:"numeric",minute:"2-digit"}).replace(" ","").toLowerCase();
  const tpart=(d.getHours()===9&&d.getMinutes()===0)?"":" "+tm;
  if(diff===0) return "Today"+tpart;
  if(diff===1) return "Tomorrow"+tpart;
  if(diff===-1) return "Yesterday"+tpart;
  if(diff>1&&diff<7) return d.toLocaleDateString("en-IN",{weekday:"short"})+tpart;
  return d.toLocaleDateString("en-IN",{day:"numeric",month:"short"})+tpart;
}
const toLocalInput=ts=>{if(!ts)return"";const d=new Date(ts);const p=n=>String(n).padStart(2,"0");return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`};


function sampleTasks(){
  const n=Date.now(),t0=sod(n).getTime(),at=(d,h,m=0)=>t0+d*DAY+(h*60+m)*6e4;
  return [
   // [title, category, due, important, done]
   ["Pay electricity bill","Finance",at(0,18),1,0],["Send SOW draft to client","Work",at(0,11),1,0],
   ["Book gas cylinder","Home",at(-1,10),0,0],["Blood test — fasting","Health",at(1,7,30),0,0],
   ["Order groceries for the week","Shopping",at(2,9),0,0],["Finish Snowflake certification module 3","Learning",at(4,21),0,0],
   ["Call Amma","Personal",at(0,20),0,0],["Renew car insurance","Finance",at(6,9),1,0],
   ["Review pipeline design doc","Work",at(-2,15),0,0],["Plan weekend trip","Personal",null,0,0],
   ["Submit weekly timesheet","Work",at(-3,17),0,1],["Client status call","Work",at(-5,16),0,1],["Load-plan data model review","Work",at(-6,11),0,1],
   ["Pay credit card bill","Finance",at(-4,10),1,1],["File GST return","Finance",at(-6,12),0,1],
   ["Fix kitchen tap","Home",at(-5,9),0,1],["Water purifier service","Home",at(-3,11),0,0],
   ["Morning walk 5 km","Health",at(-1,6,30),0,1],["Dentist appointment","Health",at(-4,18),0,1],
   ["Buy diyas and sweets","Shopping",at(-2,19),0,1],["Watch Airflow DAG tutorial","Learning",at(-1,21),0,1],
   ["Sprint planning","Work",at(1,10),0,0],["Prepare demo deck","Work",at(1,15),1,0],["Data mapping workshop","Work",at(1,17),0,0],
   ["Haircut","Personal",at(3,11),0,0],["Mutual fund SIP check","Finance",at(5,10),0,0],
  ].map(([title,cat,due,pri,done],i)=>({id:"ex"+i,title,cat,due,pri,done:!!done,doneAt:done?Math.min(n,due+3600e3):null,createdAt:n-(12-i%12)*DAY,src:"example"}));
}


export { esc, uid, DAY, sod, PALETTE, KNOWN, GUESS, guessCat, titleCase, catVar, cc, MON, WD, parseWhen, mkDate, parseQuick, fmtDue, toLocalInput, sampleTasks };
