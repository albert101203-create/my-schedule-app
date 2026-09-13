const STORAGE_KEY='my-schedule-pwa-v1';
const ORDER_KEY='my-schedule-sun-thu-v1';
const START_HOUR=6,END_HOUR=24,SLOT_MINUTES=30;
const DAY_NAMES=['일','월','화','수','목'];
const DAY_FULL=DAY_NAMES.map(x=>`${x}요일`);
const categoryInfo={school:['학교','#4d79e8','#eaf0ff'],study:['공부','#765ce6','#efeaff'],personal:['개인','#db6290','#ffedf3'],health:['운동','#18a87a','#e6f8f1'],other:['기타','#ef9c3a','#fff2df']};
const $=s=>document.querySelector(s);
const pad=n=>String(n).padStart(2,'0');
function parseDate(v){return new Date(`${v}T00:00:00`)}
function todayIndex(){return new Date().getDay()}
function defaultDay(){return todayIndex()<=4?todayIndex():0}
function minutes(value){if(!value)return 0;const[h,m]=value.split(':').map(Number);return h*60+m}
function escapeHTML(value=''){return value.replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function formatTime(t){return t||'시간 미정'}
function makeEndTime(start){const total=Math.min(minutes(start)+60,23*60+59);return`${pad(Math.floor(total/60))}:${pad(total%60)}`}
function slotTime(slot){const total=START_HOUR*60+slot*SLOT_MINUTES;if(total>=24*60)return'23:59';return`${pad(Math.floor(total/60))}:${pad(total%60)}`}

let schedules=JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]').map(x=>({...x,endTime:x.endTime||(x.time?makeEndTime(x.time):'')}));
if(!localStorage.getItem(ORDER_KEY)){
  schedules=schedules.map(x=>({...x,day:x.date?parseDate(x.date).getDay():(Number(x.day)+1)%7}));
  localStorage.setItem(ORDER_KEY,'1');localStorage.setItem(STORAGE_KEY,JSON.stringify(schedules));
}else schedules=schedules.map(x=>({...x,day:Number(x.day)}));

let selectedDay=defaultDay(),activeFilter='all',editId=null;
function visibleSchedules(){return schedules.filter(x=>Number(x.day)>=0&&Number(x.day)<DAY_NAMES.length)}
function persist(){localStorage.setItem(STORAGE_KEY,JSON.stringify(schedules))}
function sorted(items=visibleSchedules()){return[...items].sort((a,b)=>Number(a.day)-Number(b.day)||String(a.time||'99:99').localeCompare(String(b.time||'99:99')))}

function renderWeek(){
  let html='<div class="corner"></div>';
  for(let d=0;d<DAY_NAMES.length;d++)html+=`<div class="day-head" style="grid-column:${d+2};grid-row:1"><strong>${DAY_NAMES[d]}</strong></div>`;
  for(let h=START_HOUR;h<END_HOUR;h++)html+=`<div class="time-label" style="grid-row:${2+(h-START_HOUR)*2}/span 2">${pad(h)}:00</div>`;
  for(let d=0;d<DAY_NAMES.length;d++)html+=`<div class="day-lane" style="grid-column:${d+2}"></div>`;
  const slots=(END_HOUR-START_HOUR)*2;
  for(let d=0;d<DAY_NAMES.length;d++)for(let s=0;s<slots;s++){const time=slotTime(s);html+=`<button class="week-slot" type="button" data-day="${d}" data-time="${time}" data-slot="${s}" aria-label="${DAY_FULL[d]} ${time} 일정 추가" style="grid-column:${d+2};grid-row:${s+2}"></button>`}
  for(const item of sorted()){
    if(!item.time)continue;const dayIndex=Number(item.day),start=Math.max(minutes(item.time),START_HOUR*60),endMin=Math.min(minutes(item.endTime)||start+60,END_HOUR*60);if(endMin<=START_HOUR*60||start>=END_HOUR*60)continue;
    const row=Math.floor((start-START_HOUR*60)/SLOT_MINUTES)+2,span=Math.max(1,Math.ceil((endMin-start)/SLOT_MINUTES));const[cat,color,light]=categoryInfo[item.category]||categoryInfo.other;
    html+=`<button class="week-event" type="button" data-id="${item.id}" style="grid-column:${dayIndex+2};grid-row:${row}/span ${span};--category:${color};--category-light:${light}" aria-label="${escapeHTML(item.title)} ${item.time}부터 ${item.endTime}까지"><strong>${escapeHTML(item.title)}</strong><span>${item.time}–${item.endTime}</span></button>`;
  }
  $('#weekGrid').innerHTML=html;
}

function card(item){const[cat,color,light]=categoryInfo[item.category]||categoryInfo.other;return`<article class="schedule-card" data-id="${item.id}" style="--category:${color};--category-light:${light}" tabindex="0"><span class="category-line"></span><div class="schedule-card-body"><div class="schedule-meta"><span>${formatTime(item.time)}${item.endTime?`–${item.endTime}`:''}</span><span class="category-pill">${cat}</span></div><h3>${escapeHTML(item.title)}</h3>${item.note?`<p>${escapeHTML(item.note)}</p>`:''}</div></article>`}
function renderAgenda(){const items=sorted(visibleSchedules().filter(x=>activeFilter==='all'||x.category===activeFilter));$('#filterButton').textContent=activeFilter==='all'?'전체 보기':`${categoryInfo[activeFilter][0]}만 보기`;if(!items.length){$('#scheduleList').innerHTML='<div class="empty"><strong>등록된 일정이 없어요.</strong>시간표의 빈 칸을 위아래로 드래그해 추가하세요.</div>';return}let html='',last=-1;for(const item of items){if(Number(item.day)!==last){last=Number(item.day);html+=`<h3 class="date-group-title">${DAY_FULL[last]}</h3>`}html+=card(item)}$('#scheduleList').innerHTML=html}
function render(){renderWeek();renderAgenda()}

function openDialog(item=null,preset={}){
  editId=item?.id||null;const start=item?.time||preset.time||'09:00';
  $('#dialogTitle').textContent=item?'일정 수정':'새 일정';$('#titleInput').value=item?.title||'';$('#dayInput').value=String(item?.day??preset.day??selectedDay);$('#timeInput').value=start;$('#endTimeInput').value=item?.endTime||preset.endTime||makeEndTime(start);$('#categoryInput').value=item?.category||'school';$('#noteInput').value=item?.note||'';$('#deleteSchedule').classList.toggle('hidden',!item);$('#scheduleDialog').showModal();$('#titleInput').focus();
}
function toast(message){const t=$('#toast');t.textContent=message;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2200)}

let dragState=null,suppressSlotClick=false;
function clearDragPreview(){$('.drag-preview')?.remove();$('#weekGrid').classList.remove('dragging')}
function updateDragPreview(){clearDragPreview();if(!dragState)return;const low=Math.min(dragState.start,dragState.current),high=Math.max(dragState.start,dragState.current);const preview=document.createElement('div');preview.className='drag-preview';preview.style.gridColumn=String(Number(dragState.day)+2);preview.style.gridRow=`${low+2}/span ${high-low+1}`;preview.textContent=`${slotTime(low)}–${slotTime(high+1)}`;$('#weekGrid').appendChild(preview);$('#weekGrid').classList.add('dragging')}
function cancelDrag(blockClick=false){dragState=null;clearDragPreview();if(blockClick){suppressSlotClick=true;setTimeout(()=>suppressSlotClick=false,350)}}
function finishDrag(e){if(!dragState||e.pointerId!==dragState.pointerId)return;const state=dragState,low=Math.min(state.start,state.current),high=Math.max(state.start,state.current);cancelDrag(true);selectedDay=Number(state.day);openDialog(null,{day:state.day,time:slotTime(low),endTime:state.moved?slotTime(high+1):makeEndTime(slotTime(low))})}
$('#weekGrid').addEventListener('pointerdown',e=>{const slot=e.target.closest('.week-slot');if(!slot||(e.pointerType==='mouse'&&e.button!==0))return;dragState={pointerId:e.pointerId,day:slot.dataset.day,start:Number(slot.dataset.slot),current:Number(slot.dataset.slot),x:e.clientX,y:e.clientY,moved:false};updateDragPreview();if(e.pointerType==='mouse')e.preventDefault()});
document.addEventListener('pointermove',e=>{if(!dragState||e.pointerId!==dragState.pointerId)return;const dx=e.clientX-dragState.x,dy=e.clientY-dragState.y;if(e.pointerType==='touch'&&!dragState.moved&&Math.abs(dx)>10&&Math.abs(dx)>Math.abs(dy)){cancelDrag(true);return}if(Math.abs(dy)>5||Math.abs(dx)>5)dragState.moved=true;const slot=document.elementFromPoint(e.clientX,e.clientY)?.closest?.('.week-slot');if(slot&&slot.dataset.day===dragState.day){dragState.current=Number(slot.dataset.slot);updateDragPreview()}if(dragState.moved){e.preventDefault();const scroller=$('#weekScroll'),rect=scroller.getBoundingClientRect();if(e.clientY<rect.top+72)scroller.scrollTop-=12;else if(e.clientY>rect.bottom-40)scroller.scrollTop+=12}},{passive:false});
document.addEventListener('pointerup',finishDrag);document.addEventListener('pointercancel',()=>cancelDrag(true));

$('#openAddModal').addEventListener('click',()=>openDialog());$('#closeDialog').addEventListener('click',()=>$('#scheduleDialog').close());
$('#timeInput').addEventListener('change',()=>{if(!editId||minutes($('#endTimeInput').value)<=minutes($('#timeInput').value))$('#endTimeInput').value=makeEndTime($('#timeInput').value)});
$('#scheduleForm').addEventListener('submit',e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.target));if(minutes(data.endTime)<=minutes(data.time)){toast('종료 시간은 시작 시간보다 늦어야 해요.');return}const item={id:editId||crypto.randomUUID(),...data,day:Number(data.day)};if(editId)schedules=schedules.map(x=>x.id===editId?item:x);else schedules.push(item);persist();selectedDay=item.day;$('#scheduleDialog').close();render();toast(editId?'일정을 수정했어요.':'일정을 추가했어요.')});
$('#deleteSchedule').addEventListener('click',()=>{schedules=schedules.filter(x=>x.id!==editId);persist();$('#scheduleDialog').close();render();toast('일정을 삭제했어요.')});
document.addEventListener('click',e=>{const event=e.target.closest('.week-event,.schedule-card');if(event){openDialog(schedules.find(x=>x.id===event.dataset.id));return}const slot=e.target.closest('.week-slot');if(slot&&!suppressSlotClick){selectedDay=Number(slot.dataset.day);openDialog(null,{day:slot.dataset.day,time:slot.dataset.time})}});
document.addEventListener('keydown',e=>{const cardEl=e.target.closest?.('.schedule-card');if(cardEl&&e.key==='Enter')openDialog(schedules.find(x=>x.id===cardEl.dataset.id))});
document.querySelectorAll('.tab').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('.tab').forEach(x=>x.classList.toggle('active',x===b));$('#weekView').classList.toggle('hidden',b.dataset.view!=='week');$('#agendaView').classList.toggle('hidden',b.dataset.view!=='agenda')}));
$('#filterButton').addEventListener('click',()=>{const keys=['all',...Object.keys(categoryInfo)];activeFilter=keys[(keys.indexOf(activeFilter)+1)%keys.length];renderAgenda()});
if('serviceWorker'in navigator)navigator.serviceWorker.register('./service-worker.js');render();
