/* MKDWander Admin — Package form v2
   Idagdag sa admin HTML bago </body>:  <script src="pkg-form-v2.js" defer></script>
   Hindi binabago ang existing fields (#pkg-inc, #pkg-exc, #pkg-itin, #pkg-route) — ini-sync lang ito,
   kaya gumagana pa rin ang lumang app.js. Bagong data: window.pkgV2.getData() / setData() / validate(). */
(()=>{
const $=id=>document.getElementById(id);
const h=(t,a={},...k)=>{const e=document.createElement(t);for(const[x,v]of Object.entries(a)){if(x==='class')e.className=v;else if(x.startsWith('on'))e.addEventListener(x.slice(2),v);else e.setAttribute(x,v)}k.flat().forEach(c=>e.append(c));return e};
const hide=el=>{el.style.display='none'};
const fire=el=>el.dispatchEvent(new Event('input',{bubbles:true}));

/* ---------- CSS ---------- */
document.head.append(h('style',{},`
.v2-row{display:grid;gap:12px;background:var(--soft);border:1px solid var(--border);border-radius:var(--r-m);padding:12px;margin-bottom:12px}
.v2-row .v2-top{display:flex;gap:8px;align-items:center}
.v2-row .v2-top b{white-space:nowrap;color:var(--head)}
.v2-row input,.v2-row textarea{width:100%;min-height:40px;padding:8px 12px;border-radius:10px;border:1px solid var(--border-s);background:var(--card)}
.v2-date{display:flex;gap:8px;align-items:center;margin-bottom:8px;flex-wrap:wrap}
.v2-date input{min-height:40px;padding:8px 12px;border-radius:10px;border:1px solid var(--border-s);background:var(--card)}
.v2-tags{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px}
.v2-tags .cp-chip button{border:none;background:none;font-size:16px;line-height:1;color:var(--muted)}
.v2-tagin{width:100%;min-height:44px;padding:10px 12px;border-radius:10px;border:1px solid var(--border-s);background:var(--card)}
.v2-sugg{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.v2-sugg button{border:1px dashed var(--border-s);background:transparent;border-radius:99px;padding:3px 10px;font-size:12px;color:var(--muted)}
.v2-sugg button:hover{border-color:var(--orange);color:var(--cta)}
.v2-flight-on{border-color:var(--sky)!important}
`));

/* ---------- Tag editor (Inclusions / Exclusions) ---------- */
function tagEditor(targetId,hint,sugg){
  const ta=$(targetId);let list=[];
  const box=h('div',{class:'v2-tags'}),sg=h('div',{class:'v2-sugg'});
  const inp=h('input',{class:'v2-tagin',placeholder:hint,'aria-label':hint});
  const root=h('div',{},box,inp,sg);
  const sync=()=>{ta.value=list.join('\n');fire(ta);draw()};
  const add=(s,front)=>{s.split(/\n+/).map(x=>x.trim()).filter(Boolean).forEach(x=>{if(!list.includes(x))front?list.unshift(x):list.push(x)});sync()};
  const del=x=>{list=list.filter(y=>y!==x);sync()};
  function draw(){
    box.replaceChildren(...list.map(x=>h('span',{class:'cp-chip'},x,h('button',{type:'button','aria-label':'Remove '+x,onclick:()=>del(x)},'×'))));
    sg.replaceChildren(...sugg.filter(s=>!list.includes(s)).map(s=>h('button',{type:'button',onclick:()=>add(s)},'+ '+s)));
  }
  inp.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();add(inp.value);inp.value=''}});
  inp.addEventListener('paste',e=>{const t=(e.clipboardData||window.clipboardData).getData('text');if(t.includes('\n')){e.preventDefault();add(t)}});
  inp.addEventListener('blur',()=>{if(inp.value.trim()){add(inp.value);inp.value=''}});
  return{root,get:()=>[...list],set:a=>{list=[...(a||[])];sync()},add,del,replaceWhere:(fn,val)=>{list=list.filter(x=>!fn(x));if(val)list.unshift(val);sync()}};
}

/* ---------- Repeater (Itinerary days / Highlights) ---------- */
function repeater(rowFn,addLabel,onChange){
  const wrap=h('div'),rows=[];
  const root=h('div',{},wrap,h('button',{type:'button',class:'btn-outline',onclick:()=>add()},'+ '+addLabel));
  function renumber(){rows.forEach((r,i)=>r.setIdx&&r.setIdx(i+1));onChange()}
  function add(d){const r=rowFn(d||{},()=>{rows.splice(rows.indexOf(r),1);r.el.remove();renumber()},onChange);rows.push(r);wrap.append(r.el);renumber();return r}
  return{root,add,get:()=>rows.map(r=>r.get()),clear:()=>{rows.splice(0).forEach(r=>r.el.remove())},set:a=>{rows.splice(0).forEach(r=>r.el.remove());(a||[]).forEach(add);if(!(a||[]).length)onChange()}};
}
const dayRow=(d,rm,chg)=>{
  const t=h('input',{placeholder:'Title, e.g. Arrival & hotel check-in',value:d.title||''});
  const a=h('textarea',{rows:'4',placeholder:'Isang activity kada linya\nArrival at Caticlan Airport\nMeet by tour coordinator'});a.value=(d.activities||[]).join('\n');
  const lab=h('b',{},'Day 1');
  const el=h('div',{class:'v2-row'},h('div',{class:'v2-top'},lab,t,h('button',{type:'button',class:'btn-danger',onclick:rm},'Remove')),a);
  [t,a].forEach(x=>x.addEventListener('input',chg));
  return{el,setIdx:i=>lab.textContent='Day '+i,get:()=>({title:t.value.trim(),activities:a.value.split('\n').map(x=>x.trim()).filter(Boolean)})};
};
const hlRow=(d,rm,chg)=>{
  const l=h('input',{placeholder:'Label, e.g. Habagat Off Season (optional)',value:d.label||''});
  const p=h('input',{placeholder:'Places, comma-separated: Puka Beach, Crocodile Island, Crystal Cove',value:(d.places||[]).join(', ')});
  const el=h('div',{class:'v2-row'},h('div',{class:'v2-top'},l,h('button',{type:'button',class:'btn-danger',onclick:rm},'Remove')),p);
  [l,p].forEach(x=>x.addEventListener('input',chg));
  return{el,get:()=>({label:l.value.trim(),places:p.value.split(',').map(x=>x.trim()).filter(Boolean)})};
};

/* ---------- Travel date row: start -> end (+ optional dagdag ₱/pax) ---------- */
const dateRow=(d={})=>{
  const r=h('div',{class:'v2-date'},
    h('input',{type:'date','aria-label':'Departure',value:d.start||''}),'→',
    h('input',{type:'date','aria-label':'Return',value:d.end||''}),
    h('input',{type:'number',min:'0',placeholder:'+₱/pax',title:'Dagdag na presyo bawat pax sa petsang ito (optional)','aria-label':'Extra per pax (optional)',style:'width:120px',value:d.extra>0?String(d.extra):''}),
    h('button',{type:'button',class:'btn-danger',onclick:()=>r.remove()},'Remove'));
  return r;
};

/* ---------- Build UI ---------- */
let inc,exc,days,hls,dates,datesBox,flightBox;
function secEl(title,sub,...body){return h('section',{class:'form-sec'},h('div',{class:'form-sec-hd'},h('span',{class:'n'},'0'),h('div',{},h('h3',{},title),h('p',{},sub))),...body)}
const field=(lab,el,cls='form-field')=>h('div',{class:cls},h('label',{},lab),el);

function init(){
  const form=$('pkg-form');if(!form||form.dataset.v2)return;form.dataset.v2='1';
  const secs=[...form.querySelectorAll('.form-sec')]; // 0 basic,1 pricing,2 featured,3 incl,4 itin,5 photos

  /* Pricing: sharing surcharges */
  const price=secs[1].querySelector('.form-grid');
  price.append(
    field('Triple sharing surcharge (+₱ per pax)',h('input',{type:'number',id:'pkg-triple',min:'0',placeholder:'2000'})),
    field('Twin sharing surcharge (+₱ per pax)',h('input',{type:'number',id:'pkg-twin',min:'0',placeholder:'3000'})),
    field('Price note',h('input',{id:'pkg-price-note',placeholder:'e.g. Based on quad sharing'})),
    field('Minimum travelers',h('input',{type:'number',id:'pkg-minpax',min:'1',placeholder:'2'})));

  /* NEW: Flight & travel dates */
  const sel=h('select',{id:'pkg-flight'},h('option',{value:'true'},'✈ May flight — included (fixed travel dates)'),h('option',{value:'false'},'🏝 Land arrangement — flight NOT included'));
  flightBox=h('div',{class:'form-grid'},
    field('Airline',h('input',{id:'pkg-airline',placeholder:'AirAsia'})),
    field('Route',h('input',{id:'pkg-flight-route',placeholder:'Manila – Caticlan – Manila'})),
    field('Baggage',h('input',{id:'pkg-baggage',placeholder:'7kg hand carry & 20kg check-in'})));
  datesBox=h('div');dates=h('div');
  const addDate=(d={})=>{dates.append(dateRow(d))};
  datesBox.append(h('label',{style:'display:block;font-size:13px;font-weight:600;margin:12px 0 6px'},'Travel dates (departure → return)'),dates,
    h('button',{type:'button',class:'btn-outline',onclick:()=>addDate()},'+ Add date'),
    h('p',{class:'feature-note'},'Isang row kada schedule (hal. Nov 6 → Nov 9). Lalabas sa app na naka-group per year. Ang “+₱/pax” ay optional: ilagay lang kung may dagdag sa presyo sa petsang iyon (hal. peak season, 1000). Idadagdag ito sa total ng traveler.'));
  const noFlight=h('p',{class:'feature-note',id:'v2-noflight'},'Hindi kasama ang flight — traveler ang magbu-book ng sariling flight. Walang fixed travel dates; idadagdag ang “Airfare Tickets” sa Exclusions.');
  const fsec=secEl('Flight & travel dates','Piliin kung kasama na ang flight sa package.',
    h('div',{class:'form-grid'},field('Flight coverage',sel,'form-field-full')),flightBox,datesBox,noFlight);
  secs[1].after(fsec);
  addDate._=addDate;

  /* Inclusions + Exclusions chips */
  inc=tagEditor('pkg-inc','Mag-type ng inclusion, Enter para idagdag (pwede ring mag-paste ng maraming linya)',
    ['4D3N Hotel Accommodation','Daily Hotel Buffet Breakfast',"Free use of the Hotel's facilities",'Hotel Taxes and Surcharges','Round Trip Land and Sea Transfers (Airport-Hotel-Airport)','Environmental Fee & Terminal Fee']);
  exc=tagEditor('pkg-exc','Mag-type ng exclusion, Enter para idagdag',['Airfare Tickets','Hotel Security Deposit','Snorkeling Gear','Travel Insurance','Fuel Surcharge: 400 per pax (subject to change)']);
  const incBox=$('pkg-inc').closest('.form-field-full'),routeBox=$('pkg-route').closest('.form-field-full');
  hide(routeBox);hide(incBox);incBox.before(h('div',{class:'form-field-full'},h('label',{},'Inclusions'),inc.root));
  const excBox=$('pkg-exc').closest('.form-field-full');hide(excBox);excBox.before(h('div',{class:'form-field-full'},h('label',{},'Exclusions'),exc.root));

  /* Highlights (own section, inserted before itinerary) */
  hls=repeater(hlRow,'Add highlight group',syncHL);
  const note=h('input',{id:'pkg-hl-note',placeholder:'e.g. Snorkeling fee ₱100/person, collected at the site (one-time)'});
  const hsec=secEl('Tour highlights','Pwedeng may label (hal. Habagat / Amihan) o diretso lang ang listahan ng places.',hls.root,field('Note / reminder (optional)',note,'form-field-full'));
  secs[3].after(hsec);

  /* Itinerary: structured days */
  days=repeater(dayRow,'Add day',syncItin);
  const itinBox=$('pkg-itin').closest('.form-field-full');hide(itinBox);itinBox.before(h('div',{class:'form-field-full'},h('label',{},'Day-by-day itinerary'),days.root));

  sel.addEventListener('change',()=>{applyFlightVis();refreshFlightLine(true)});
  ['pkg-airline','pkg-baggage'].forEach(i=>$(i).addEventListener('input',()=>refreshFlightLine(false)));

  // renumber section badges
  form.querySelectorAll('.form-sec .n').forEach((n,i)=>n.textContent=i+1);
  days.set([{}]);hls.set([{}]);addDate();applyFlightVis();
}

function syncItin(){const v=days.get();$('pkg-itin').value=v.map((d,i)=>`Day ${i+1}: ${[d.title,...d.activities].filter(Boolean).join('; ')}`).join('\n');fire($('pkg-itin'))}
function syncHL(){$('pkg-route').value=hls.get().flatMap(x=>x.places).join(', ')}

const FL='Round-Trip Airfare';
function flightOn(){return $('pkg-flight').value==='true'}
function applyFlightVis(){const on=flightOn();flightBox.style.display=on?'':'none';datesBox.style.display=on?'':'none';$('v2-noflight').style.display=on?'none':''}
function refreshFlightLine(modeChanged){
  if(!inc)return;const on=flightOn();
  if(on){
    const ap=$('pkg-airline').value.trim(),bg=$('pkg-baggage').value.trim();
    inc.replaceWhere(x=>x.startsWith(FL),FL+(bg?` with ${bg}`:'')+(ap?` via ${ap}`:''));
    if(modeChanged)exc.del('Airfare Tickets');
  }else if(modeChanged){inc.replaceWhere(x=>x.startsWith(FL),'');exc.add('Airfare Tickets')}
}

/* ---------- Public API ---------- */
const dateRows=()=>[...document.querySelectorAll('#pkg-form .v2-date')].map(r=>{const[i,o,x]=r.querySelectorAll('input');return{start:i.value,end:o.value,extra:Math.max(0,+x.value||0)}});
window.pkgV2={
  getData(){
    const on=flightOn();
    return{
      flightIncluded:on,
      airline:on?$('pkg-airline').value.trim():'',flightRoute:on?$('pkg-flight-route').value.trim():'',baggage:on?$('pkg-baggage').value.trim():'',
      travelDates:on?dateRows().filter(d=>d.start).map(d=>d.extra>0?d:{start:d.start,end:d.end}):[],
      sharing:{triple:+$('pkg-triple').value||0,twin:+$('pkg-twin').value||0},priceNote:$('pkg-price-note').value.trim(),groupMin:Math.max(1,+$('pkg-minpax').value||1),
      itineraryDays:days.get().filter(d=>d.title||d.activities.length),
      highlightGroups:hls.get().filter(x=>x.places.length),highlightNote:$('pkg-hl-note').value.trim(),
      inclusions:inc.get(),exclusions:exc.get()
    };
  },
  setData(p={}){
    init();
    $('pkg-flight').value=String(p.flightIncluded!==false&&(p.flightIncluded||(p.travelDates||[]).length>0));
    $('pkg-airline').value=p.airline||'';$('pkg-flight-route').value=p.flightRoute||'';$('pkg-baggage').value=p.baggage||'';
    $('pkg-triple').value=p.sharing?.triple||'';$('pkg-twin').value=p.sharing?.twin||'';$('pkg-price-note').value=p.priceNote||'';$('pkg-minpax').value=(p.groupMin>1?p.groupMin:'');
    $('pkg-hl-note').value=p.highlightNote||'';
    const box=document.querySelector('#pkg-form .v2-date')?.parentElement;
    if(box){box.replaceChildren();(p.travelDates?.length?p.travelDates:[{}]).forEach(d=>box.append(dateRow(d)))}
    inc.set(p.inclusions||($('pkg-inc').value?$('pkg-inc').value.split('\n'):[]));
    exc.set(p.exclusions||[]);
    let dd=p.itineraryDays;
    if(!dd?.length){const t=($('pkg-itin').value||'').split('\n').map(x=>x.trim()).filter(Boolean);dd=t.map(l=>({title:l.replace(/^day\s*\d+\s*[:\-]\s*/i,''),activities:[]}))}
    days.set(dd?.length?dd:[{}]);
    let hg=p.highlightGroups;
    if(!hg?.length){const pl=Array.isArray(p.highlights)&&p.highlights.length?p.highlights:String(p.route||'').split(',').map(x=>x.trim()).filter(Boolean);hg=pl.length?[{label:'',places:pl}]:[]}
    hls.set(hg.length?hg:[{}]);
    applyFlightVis();
  },
  validate(){
    const g=this.getData();
    if(g.flightIncluded&&!g.travelDates.length)return 'Flight included — maglagay ng kahit isang travel date.';
    if(g.travelDates.some(d=>d.end&&d.end<d.start))return 'May travel date na mas maaga ang return kaysa departure.';
    if(!g.inclusions.length)return 'Maglagay ng kahit isang inclusion.';
    return '';
  }
};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();