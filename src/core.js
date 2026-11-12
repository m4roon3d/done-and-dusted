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
GUESS.push(["Personal",/\b(mom|mum|mother|amma|appa|dad|father|wife|husband|son|daughter|friend|birthday|anniversary|family|temple|pooja|puja)\b/i]);
GUESS.find(g=>g[0]==="Work")[1]=new RegExp(GUESS.find(g=>g[0]==="Work")[1].source.replace("client|","client|timesheet|interview|presentation|"),"i");
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
  const r=parseRepeat(t);
  const w=parseWhen(r.rest);
  let due=w.due;
  if(r.rep&&!due){const n=new Date(),d=sod(n);d.setHours(9,0,0,0);if(d<=n)d.setDate(d.getDate()+1);due=d.getTime()} // a repeat needs a first date: the next 9am
  if(r.rep==="weekday"&&due){const d=new Date(due);while(d.getDay()===0||d.getDay()===6)d.setDate(d.getDate()+1);due=d.getTime()}
  const title=w.rest.replace(/\s+(by|on|at|before)$/i,"").trim();
  return {title,due,cat:cat||guessCat(title),catGuessed:!cat,pri,rep:r.rep,hit:w.hit};
}

/* ---------- repeating tasks ---------- */
const REPEATS={day:"Daily",weekday:"Weekdays",week:"Weekly","2week":"Every 2 weeks",month:"Monthly",year:"Yearly"};
const repLabel=r=>REPEATS[r]||"";
/* Pull a repeat phrase out of typed or spoken text.
   "every monday" keeps "monday" so the date parser sets the first day.
   A bare "daily / weekly / monthly / yearly" only counts at the end or before a date word, so "Weekly report fri" keeps its title. */
function parseRepeat(text){
  let rep=null,s=" "+text+" ";
  const take=(re,r,keep)=>{if(rep)return;const m=s.match(re);if(m){rep=typeof r==="function"?r(m):r;s=s.replace(m[0]," "+(keep?keep(m):"")+" ")}};
  take(/\b(?:every\s+(?:other|second|2nd)\s+week|every\s+(?:2|two)\s+weeks)\b/i,"2week");
  take(/\b(?:every\s+weekday|on\s+weekdays)\b/i,"weekday");
  take(/\b(?:every\s*day|each\s+day)\b/i,"day");
  take(/\b(?:every|each)\s+week\b/i,"week");
  take(/\b(?:every|each)\s+month\b/i,"month");
  take(/\b(?:every|each)\s+year\b/i,"year");
  take(/\bevery\s+((?:sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)(?:day|nesday|sday|urday)?)\b/i,"week",m=>m[1]);
  take(/\b(daily|weekdays|weekly|fortnightly|monthly|yearly|annually)\b(?=\s*(?:$|(?:at|on|by|from|starting|today|tonight|tomorrow|morning|evening)\b|\d))/i,
    m=>({daily:"day",weekdays:"weekday",weekly:"week",fortnightly:"2week",monthly:"month",yearly:"year",annually:"year"})[m[1].toLowerCase()]);
  return {rep,rest:s.replace(/\s+/g," ").trim()};
}
/* The next due time after `due` that is still in the future, so finishing a long-overdue daily task
   doesn't hand back another overdue one. Monthly and yearly keep the day of the month (31st -> 28 Feb -> 31 Mar). */
function nextDue(due,rep,now=Date.now()){
  if(!due||!REPEATS[rep])return null;
  const d=new Date(due),dom=d.getDate();
  const step=()=>{
    if(rep==="day")d.setDate(d.getDate()+1);
    else if(rep==="weekday"){do{d.setDate(d.getDate()+1)}while(d.getDay()===0||d.getDay()===6)}
    else if(rep==="week")d.setDate(d.getDate()+7);
    else if(rep==="2week")d.setDate(d.getDate()+14);
    else{
      let y=d.getFullYear(),m=d.getMonth();if(rep==="month")m++;else y++;
      const last=new Date(y,m+1,0).getDate();
      d.setTime(new Date(y,m,Math.min(dom,last),d.getHours(),d.getMinutes()).getTime());
    }
  };
  step();
  for(let i=0;d.getTime()<=now&&i<5000;i++)step();
  return d.getTime();
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


/* ---------- dictation: one spoken paragraph → several tasks ---------- */
const VERBS="pay|call|buy|send|book|email|mail|remind|schedule|renew|pick|get|finish|submit|review|clean|fix|order|check|prepare|meet|go|take|write|read|file|update|complete|plan|visit|drop|collect|message|text|ask|cancel|return|print|sign|transfer|recharge|refill|wash|cook|make|bring|share|upload|download|install|register|apply|confirm|follow|ring|reply|respond|draft|deploy|test|study|practice|practise|exercise|walk|water|feed|arrange|organise|organize|set|start|do";
const LEADIN=/^(?:(?:and|also|then|next|plus|ok|okay|so|um|uh)\s+)*(?:please\s+)?(?:(?:can you\s+)?remind me (?:to|about)|i (?:need|have|want|would like|ought|got)(?: got)? to|i (?:should|must|gotta)|i'?ve got to|don'?t (?:let me )?forget to|do not forget to|make sure (?:i|to)|remember to|(?:add|create|make|new|another)(?: a| an| one)?(?: new)? (?:task|reminder|to-?do)(?: (?:to|for|called|saying|that says))?|we (?:need|have) to|need to|have to|to)\s+/i;
/* Hindi, Kannada and Tamil words for days and hours, turned into the English the date parser reads.
   Whole words only (no \b for these scripts). Hindi "कल" is read as tomorrow, as it almost always is for a task. */
const IW=w=>new RegExp("(?<=^|[\\s,.।])(?:"+w.join("|")+")(?=$|[\\s,.।])","g");
const IN_DAY2=IW(["परसों","ನಾಡಿದ್ದು","நாளை மறுநாள்","நாளன்னைக்கு"]);
const IN_TODAY=IW(["आज","ಇಂದು","ಇವತ್ತು","இன்று","இன்னைக்கு"]);
const IN_TMRW=IW(["कल","ನಾಳೆ","நாளை","நாளைக்கு"]);
const IN_HOUR=/(\d{1,2})(?:[:.](\d{2}))?\s*(?:बजे|ಗಂಟೆಗೆ|ಗಂಟೆ|மணிக்கு|மணி)/g;
/* Speech engines on Android (the phone's recogniser and Chrome) sometimes hand back words they already sent,
   so "buy milk tomorrow" arrives as "buy milk buy milk tomorrow". Drop any run of words that immediately
   repeats itself. Single-word repeats people really say ("bye bye", "very very") are kept. */
const KEEP_DOUBLE=new Set(["bye","very","no","so","really","ha","haha","knock","tut","chop","blah","bla","well","yes","now","go","come","many","more"]);
function collapseRepeats(text){
  let w=String(text||"").trim().split(/\s+/).filter(Boolean);
  const k=x=>x.toLowerCase().replace(/[^\p{L}\p{N}]/gu,"");
  let changed=true;
  while(changed){
    changed=false;
    for(let n=Math.floor(w.length/2);n>=1&&!changed;n--){
      for(let i=0;i+2*n<=w.length;i++){
        let same=true;
        for(let j=0;j<n;j++)if(k(w[i+j])!==k(w[i+n+j])||!k(w[i+j])){same=false;break}
        if(!same)continue;
        if(n===1&&KEEP_DOUBLE.has(k(w[i])))continue;
        w.splice(i+n,n);changed=true;break;
      }
    }
  }
  return w.join(" ");
}
function normaliseSpeech(text){
  return String(text||"")
    .replace(IN_DAY2," in 2 days ").replace(IN_TODAY," today ").replace(IN_TMRW," tomorrow ")
    .replace(IN_HOUR,(m,h,mm)=>" at "+h+(mm?":"+mm:"")+" ")
    .replace(/\b([ap])\.\s?m\.?/gi,"$1m")                 // 5 p.m. → 5 pm
    .replace(/\b(\d{1,2})\s*o'?\s?clock\b/gi,"at $1")      // 6 o'clock → at 6
    .replace(/\bday after tomorrow\b/gi,"in 2 days")
    .replace(/\b(?:at )?noon\b/gi,"12pm").replace(/\b(?:at )?midnight\b/gi,"11:59pm")
    .replace(/\bthis (morning|evening)\b/gi,"today $1")
    .replace(/\bhalf past (\d{1,2})\b/gi,"$1:30").replace(/\bquarter past (\d{1,2})\b/gi,"$1:15")
    .replace(/\b(\d{1,2})(?:st|nd|rd|th)?\s+of\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/gi,"$1 $2")   // 20th of November
    .replace(/\b(?:on\s+)?the\s+(\d{1,2})(?:st|nd|rd|th)\b(?!\s+(?:of\s+)?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec))/gi,(m,d)=>{ // "on the 1st" → next such date
      const n=new Date(),x=new Date(n.getFullYear(),n.getMonth(),+d);if(+d<1||+d>31)return m;
      if(x<sod(n))x.setMonth(x.getMonth()+1);return x.getDate()+" "+MON[x.getMonth()]+" "+x.getFullYear()})
    .replace(/\s+/g," ").trim();
}
/* Splits on sentence ends, on cue words ("then", "also", "next", "new task"), and on "and" or a comma
   only when an action follows ("…tomorrow and call the plumber"), so "buy bread and milk" stays one task. */
function splitDictation(text){
  const t=normaliseSpeech(text);
  if(!t)return [];
  const mark=t
    .replace(/[.;!?\n।]+\s*/g," ¦ ")
    .replace(/\s*,?\s*\b(?:and then|after that|and also|then|also|next task|new task|another task|next|plus)\b,?\s+/gi," ¦ ")
    .replace(new RegExp("\\s*(?:,\\s*and|,|\\band)\\s+(?=(?:(?:i|we)\\s+(?:need|have|want|should|must)\\b|remind me\\b|don'?t forget\\b|remember to\\b|(?:"+VERBS+")\\b))","gi")," ¦ ");
  return mark.split("¦").map(x=>x.trim()).filter(x=>x.replace(/[^\p{L}\p{N}]/gu,"").length>1);
}
/* cats: category names the person already uses, so "under work" / "category home" can be heard. */
function parseDictation(text,cats=[]){
  const known=[...new Set([...Object.keys(KNOWN),...cats])].filter(c=>c!=="Inbox");
  const catRe=known.length?new RegExp("\\b(?:(?:under|category|tag|hashtag|hash tag|label|in)\\s+(?:the\\s+)?("+known.map(c=>c.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join("|")+")(?:\\s+(?:category|list|tag))?|("+known.map(c=>c.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")).join("|")+")\\s+category)\\b","i"):null;
  return splitDictation(text).map(piece=>{
    let p=piece,cat=null,pri=0,prev;
    do{prev=p;p=p.replace(LEADIN,"")}while(p!==prev);
    if(catRe)p=p.replace(catRe,(m,a,b)=>{const hit=(a||b).toLowerCase();cat=known.find(c=>c.toLowerCase()===hit);return " "});
    p=p.replace(/\b(?:(?:and\s+)?(?:it'?s|it is|that'?s|this is|mark (?:it|this)(?: as)?|make (?:it|this))\s+)?(?:very |really |super )?(?:important|urgent|high priority|top priority)\b/gi,()=>{pri=1;return " "});
    const q=parseQuick(p.replace(/\s+/g," ").trim()+(cat?" #"+cat.replace(/\s+/g,"-"):""));
    let ttl=q.title.replace(/^(?:and|to)\s+/i,""),was;
    do{was=ttl;ttl=ttl.replace(/[\s,]+$/,"").replace(/\s+(?:for|on|at|by|every|this|the|before|until|till|in|of|and|to)$/i,"")}while(ttl!==was); // words left dangling once the date is taken out
    const title=titleCase(ttl);
    return {title,due:q.due,cat:cat||q.cat,catGuessed:!cat&&q.catGuessed,pri:pri||q.pri,rep:q.rep};
  }).filter(x=>x.title.length>1&&!/^(?:um+|uh+|er+|hmm+|ok|okay|so|and|then|yeah|yes|right|that'?s (?:it|all))$/i.test(x.title));
}

export { esc, uid, DAY, sod, PALETTE, KNOWN, GUESS, guessCat, titleCase, catVar, cc, MON, WD, parseWhen, mkDate, parseQuick, REPEATS, repLabel, parseRepeat, nextDue, fmtDue, toLocalInput, sampleTasks, normaliseSpeech, collapseRepeats, splitDictation, parseDictation };
