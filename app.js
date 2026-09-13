const STORAGE_KEY='my-schedule-pwa-v1';
const START_HOUR=6, END_HOUR=24, SLOT_MINUTES=30;
const categoryInfo={school:['학교','#4d79e8','#eaf0ff'],study:['공부','#765ce6','#efeaff'],personal:['개인','#db6290','#ffedf3'],health:['운동','#18a87a','#e6f8f1'],other:['기타','#ef9c3a','#fff2df']};
const $=s=>document.querySelector(s);
const pad=n=>String(n).padStart(2,'0');
function dateKey(d){const x=new Date(d);x.setMinutes(x.getMinutes()-x.getTimezoneOffset());return x.toISOString().slice(0,10)}
function parseDate(v){return new Date(`${v}T00:00:00`)}
function addDays(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return x}
function mondayOf(d){const x=new Date(d);const day=x.getDay()||7;x.setDate(x.getDate()-day+1);x.setHours(0,0,0,0);return x}
function minutes(value){if(!value)return 0;const [h,m]=value.split(':').map(Number);return h*60+m}
function escapeHTML(value=''){return value.replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function formatDay(d){return `${d.getMonth()+1}월 ${d.getDate()}일`}
function formatTime(t){return t||'시간 미정'}
function makeEndTime(start){const total=Math.min(minutes(start)+60,23*60+59);return `${pad(Math.floor(total/60))}:${pad(total%60)}`}

let schedules=JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]').map(x=>({...x,endTime:x.endTime||(x.time?makeEndTime(x.time):'')}));
let weekStart=mondayOf(new Date()), selectedDate=dateKey(new Date()), activeFilter='all', editId=null;
function persist(){localStorage.setItem(STORAGE_KEY,JSON.stringify(schedules))}
function sorted(items=schedules){return [...items].sort((a,b)=>`${a.date}${a.time||'99:99'}`.localeCompare(`${b.date}${b.time||'99:99'}`))}
function weekItems(){const start=dateKey(weekStart),end=dateKey(addDays(weekStart,6));return schedules.filter(x=>x.date>=start&&x.date<=end)}

function renderHeader(){
  const items=weekItems(), today=new Date(), end=addDays(weekStart,6);
  const total=items.reduce((sum,x)=>sum+Math.max(0,minutes(x.endTime)-minutes(x.time)),0)/60;
  $('#todayLabel').textContent=`${today.getMonth()+1}월 ${today.getDate()}일 · 오늘`;
  $('#summaryDate').textContent=`${formatDay(weekStart)} – ${formatDay(end)}`;
  $('#weekCount').textContent=items.length; $('#weekHours').textContent=Number.isInteger(total)?total:total.toFixed(1);
  const nowKey=dateKey(today),nowMin=today.getHours()*60+today.getMinutes();
  const next=sorted(schedules.filter(x=>x.date>nowKey||(x.date===nowKey&&minutes(x.time)>=nowMin)))[0];
  $('#nextSchedule').textContent=next?`다음 일정 · ${next.date===nowKey?'오늘':formatDay(parseDate(next.date))} ${formatTime(next.time)} ${next.title}`:'다가오는 일정이 없어요.';
}

function renderWeek(){
  const todayKey=dateKey(new Date()), end=addDays(weekStart,6);
  $('#weekTitle').textContent=`${weekStart.getFullYear()}년 ${formatDay(weekStart)} – ${formatDay(end)}`;
  let html='<div class="corner"></div>';
  const names=['월','화','수','목','금','토','일'];
  for(let d=0;d<7;d++){const day=addDays(weekStart,d),key=dateKey(day);html+=`<div class="day-head ${key===todayKey?'today':''}" style="grid-column:${d+2};grid-row:1"><strong>${names[d]}요일</strong><span>${day.getMonth()+1}/${day.getDate()}</span></div>`}
  for(let h=START_HOUR;h<END_HOUR;h++)html+=`<div class="time-label" style="grid-row:${2+(h-START_HOUR)*2}/span 2">${pad(h)}:00</div>`;
  for(let d=0;d<7;d++)html+=`<div class="day-lane" style="grid-column:${d+2}"></div>`;
  const slots=(END_HOUR-START_HOUR)*2;
  for(let d=0;d<7;d++){const date=dateKey(addDays(weekStart,d));for(let s=0;s<slots;s++){const mins=START_HOUR*60+s*SLOT_MINUTES,time=`${pad(Math.floor(mins/60))}:${pad(mins%60)}`;html+=`<button class="week-slot" type="button" data-date="${date}" data-time="${time}" aria-label="${date} ${time} 일정 추가" style="grid-column:${d+2};grid-row:${s+2}"></button>`}}
  for(const item of sorted(weekItems())){
    if(!item.time)continue;const dayIndex=Math.round((parseDate(item.date)-weekStart)/86400000);if(dayIndex<0||dayIndex>6)continue;
    const start=Math.max(minutes(item.time),START_HOUR*60),endMin=Math.min(minutes(item.endTime)||start+60,END_HOUR*60);if(endMin<=START_HOUR*60||start>=END_HOUR*60)continue;
    const row=Math.floor((start-START_HOUR*60)/SLOT_MINUTES)+2,span=Math.max(1,Math.ceil((endMin-start)/SLOT_MINUTES));const [cat,color,light]=categoryInfo[item.category]||categoryInfo.other;
    html+=`<button class="week-event" type="button" data-id="${item.id}" style="grid-column:${dayIndex+2};grid-row:${row}/span ${span};--category:${color};--category-light:${light}" aria-label="${escapeHTML(item.title)} ${item.time}부터 ${item.endTime}까지"><strong>${escapeHTML(item.title)}</strong><span>${item.time}–${item.endTime}</span></button>`;
  }
  $('#weekGrid').innerHTML=html;
}

function card(item){const [cat,color,light]=categoryInfo[item.category]||categoryInfo.other;return `<article class="schedule-card" data-id="${item.id}" style="--category:${color};--category-light:${light}" tabindex="0"><span class="category-line"></span><div class="schedule-card-body"><div class="schedule-meta"><span>${formatTime(item.time)}${item.endTime?`–${item.endTime}`:''}</span><span class="category-pill">${cat}</span></div><h3>${escapeHTML(item.title)}</h3>${item.note?`<p>${escapeHTML(item.note)}</p>`:''}</div></article>`}
function renderAgenda(){const items=sorted(weekItems().filter(x=>activeFilter==='all'||x.category===activeFilter));$('#filterButton').textContent=activeFilter==='all'?'전체 보기':`${categoryInfo[activeFilter][0]}만 보기`;if(!items.length){$('#scheduleList').innerHTML='<div class="empty"><strong>이번 주 일정이 아직 없어요.</strong>시간표의 빈 칸을 눌러 추가해 보세요.</div>';return}let html='',last='';for(const item of items){if(item.date!==last){html+=`<h3 class="date-group-title">${new Intl.DateTimeFormat('ko-KR',{month:'long',day:'numeric',weekday:'long'}).format(parseDate(item.date))}</h3>`;last=item.date}html+=card(item)}$('#scheduleList').innerHTML=html}
function render(){renderHeader();renderWeek();renderAgenda()}

function openDialog(item=null,preset={}){
  editId=item?.id||null;const start=item?.time||preset.time||'09:00';
  $('#dialogTitle').textContent=item?'일정 수정':'새 일정';$('#titleInput').value=item?.title||'';$('#dateInput').value=item?.date||preset.date||selectedDate;$('#timeInput').value=start;$('#endTimeInput').value=item?.endTime||makeEndTime(start);$('#categoryInput').value=item?.category||'school';$('#noteInput').value=item?.note||'';$('#deleteSchedule').classList.toggle('hidden',!item);$('#scheduleDialog').showModal();$('#titleInput').focus();
}
function toast(message){const t=$('#toast');t.textContent=message;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2200)}

$('#openAddModal').addEventListener('click',()=>openDialog());$('#closeDialog').addEventListener('click',()=>$('#scheduleDialog').close());
$('#timeInput').addEventListener('change',()=>{if(!editId||minutes($('#endTimeInput').value)<=minutes($('#timeInput').value))$('#endTimeInput').value=makeEndTime($('#timeInput').value)});
$('#scheduleForm').addEventListener('submit',e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.target));if(minutes(data.endTime)<=minutes(data.time)){toast('종료 시간은 시작 시간보다 늦어야 해요.');return}const item={id:editId||crypto.randomUUID(),...data};if(editId)schedules=schedules.map(x=>x.id===editId?item:x);else schedules.push(item);persist();selectedDate=item.date;weekStart=mondayOf(parseDate(item.date));$('#scheduleDialog').close();render();toast(editId?'일정을 수정했어요.':'일정을 추가했어요.')});
$('#deleteSchedule').addEventListener('click',()=>{schedules=schedules.filter(x=>x.id!==editId);persist();$('#scheduleDialog').close();render();toast('일정을 삭제했어요.')});
document.addEventListener('click',e=>{const event=e.target.closest('.week-event,.schedule-card');if(event){openDialog(schedules.find(x=>x.id===event.dataset.id));return}const slot=e.target.closest('.week-slot');if(slot){selectedDate=slot.dataset.date;openDialog(null,{date:slot.dataset.date,time:slot.dataset.time})}});
document.addEventListener('keydown',e=>{const cardEl=e.target.closest?.('.schedule-card');if(cardEl&&e.key==='Enter')openDialog(schedules.find(x=>x.id===cardEl.dataset.id))});
document.querySelectorAll('.tab').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x===b));$('#weekView').classList.toggle('hidden',b.dataset.view!=='week');$('#agendaView').classList.toggle('hidden',b.dataset.view!=='agenda')}));
$('#previousWeek').addEventListener('click',()=>{weekStart=addDays(weekStart,-7);selectedDate=dateKey(weekStart);render()});$('#nextWeek').addEventListener('click',()=>{weekStart=addDays(weekStart,7);selectedDate=dateKey(weekStart);render()});$('#jumpToday').addEventListener('click',()=>{weekStart=mondayOf(new Date());selectedDate=dateKey(new Date());render();toast('이번 주로 이동했어요.')});
$('#filterButton').addEventListener('click',()=>{const keys=['all',...Object.keys(categoryInfo)];activeFilter=keys[(keys.indexOf(activeFilter)+1)%keys.length];renderAgenda()});
if('serviceWorker'in navigator)navigator.serviceWorker.register('./service-worker.js');render();
