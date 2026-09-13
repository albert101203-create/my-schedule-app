(()=>{
  const app=window.scheduleApp,config=window.APP_CONFIG||{},configured=Boolean(config.supabaseUrl&&config.supabasePublishableKey&&window.supabase);
  const accountButton=document.querySelector('#accountButton'),shareButton=document.querySelector('#shareButton');
  const authDialog=document.querySelector('#authDialog'),shareDialog=document.querySelector('#shareDialog');
  let client=null,user=null,timetables=[],activeTimetable=null,syncTimer=null,syncing=false,preparing=null;
  const activeKey='my-schedule-active-timetable-v1';
  const message=(selector,text,error=false)=>{const el=document.querySelector(selector);el.textContent=text||'';el.classList.toggle('error',error)};
  const dbRow=(item,timetableId)=>({id:item.id,timetable_id:timetableId,day:Number(item.day),start_time:item.time,end_time:item.endTime,title:item.title,color:item.color||'#4d79e8',note:item.note||'',periods:Array.isArray(item.periods)?item.periods:[]});
  const appItem=row=>({id:row.id,day:Number(row.day),time:row.start_time,endTime:row.end_time,title:row.title,color:row.color,note:row.note||'',periods:Array.isArray(row.periods)?row.periods:[]});

  function setSignedOut(){user=null;timetables=[];activeTimetable=null;accountButton.textContent='로그인';shareButton.classList.add('hidden');app.setReadOnly(false)}
  function renderTimetableChoices(){
    const select=document.querySelector('#timetableSelect');select.innerHTML=timetables.map(table=>`<option value="${table.id}">${table.owner_id===user.id?'내 시간표':'공유받음'} · ${escapeText(table.name)}</option>`).join('');if(activeTimetable)select.value=activeTimetable.id;
  }
  function escapeText(value=''){return String(value).replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]))}
  function applyTimetable(table){
    activeTimetable=table;localStorage.setItem(activeKey,table.id);const owner=table.owner_id===user.id;app.setReadOnly(!owner);document.querySelector('#ownerShareArea').classList.toggle('hidden',!owner);document.querySelector('#shareLinkInput').value=owner?`${location.origin}${location.pathname}?join=${table.share_code}`:'';renderTimetableChoices();
  }
  async function fetchTimetables(){const{data,error}=await client.from('timetables').select('id,owner_id,name,share_code,sharing_enabled,created_at').order('created_at');if(error)throw error;return data||[]}
  async function loadSchedules(table){
    applyTimetable(table);const{data,error}=await client.from('schedules').select('*').eq('timetable_id',table.id).order('day').order('start_time');if(error)throw error;app.replaceSchedules((data||[]).map(appItem));
  }
  async function uploadItems(items,tableId){if(!items.length)return;const{error}=await client.from('schedules').upsert(items.map(item=>dbRow(item,tableId)));if(error)throw error}
  async function syncNow(){
    if(!user||!activeTimetable||activeTimetable.owner_id!==user.id||syncing)return;syncing=true;
    try{const local=app.getSchedules(),{data,error}=await client.from('schedules').select('id').eq('timetable_id',activeTimetable.id);if(error)throw error;const ids=new Set(local.map(item=>item.id)),stale=(data||[]).map(row=>row.id).filter(id=>!ids.has(id));if(stale.length){const result=await client.from('schedules').delete().in('id',stale);if(result.error)throw result.error}await uploadItems(local,activeTimetable.id)}catch(error){app.notify(`동기화 실패: ${error.message}`)}finally{syncing=false}
  }
  function scheduleSync(){clearTimeout(syncTimer);syncTimer=setTimeout(syncNow,650)}
  async function joinByCode(raw){
    const input=String(raw||'').trim();let code=input;try{code=new URL(input).searchParams.get('join')||input}catch{}
    if(!code)throw new Error('공유 코드나 링크를 입력하세요.');const{data,error}=await client.rpc('join_timetable_by_code',{input_code:code});if(error)throw error;return data;
  }
  async function prepareAccount(){
    const localBefore=app.getSchedules();let created=false;timetables=await fetchTimetables();let mine=timetables.find(table=>table.owner_id===user.id);
    if(!mine){const{data,error}=await client.from('timetables').insert({owner_id:user.id,name:'나의 시간표'}).select().single();if(error)throw error;mine=data;created=true;timetables=await fetchTimetables()}
    const queryCode=new URLSearchParams(location.search).get('join');let preferredId=localStorage.getItem(activeKey);
    if(queryCode){preferredId=await joinByCode(queryCode);history.replaceState({},'',location.pathname);timetables=await fetchTimetables();app.notify('공유 시간표를 추가했어요.')}
    const table=timetables.find(item=>item.id===preferredId)||mine||timetables[0];
    if(created&&localBefore.length){await uploadItems(localBefore,mine.id);app.notify('기존 시간표를 계정에 저장했어요.')}
    await loadSchedules(table);
  }
  async function setSession(session){
    if(!session){setSignedOut();return}user=session.user;accountButton.textContent='로그아웃';shareButton.classList.remove('hidden');
    if(preparing)return preparing;preparing=prepareAccount();try{await preparing}catch(error){app.notify(`계정 연결 실패: ${error.message}`)}finally{preparing=null}
  }

  accountButton.addEventListener('click',async()=>{
    if(user){await client.auth.signOut();return}
    authDialog.showModal();message('#authMessage',configured?'':'Supabase 연결값을 먼저 설정해야 해요.',!configured);
  });
  document.querySelector('#closeAuthDialog').addEventListener('click',()=>authDialog.close());
  document.querySelector('#authForm').addEventListener('submit',async event=>{event.preventDefault();if(!configured)return;message('#authMessage','로그인 중…');const email=document.querySelector('#authEmail').value.trim(),password=document.querySelector('#authPassword').value;const{error}=await client.auth.signInWithPassword({email,password});if(error)message('#authMessage',error.message,true);else authDialog.close()});
  document.querySelector('#signupButton').addEventListener('click',async()=>{if(!configured)return;message('#authMessage','가입 처리 중…');const email=document.querySelector('#authEmail').value.trim(),password=document.querySelector('#authPassword').value;if(!email||password.length<6){message('#authMessage','이메일과 6자 이상의 비밀번호를 입력하세요.',true);return}const{data,error}=await client.auth.signUp({email,password});if(error)message('#authMessage',error.message,true);else if(data.session){authDialog.close();app.notify('회원가입이 완료됐어요.')}else message('#authMessage','확인 메일을 보냈어요. 메일의 링크를 눌러 가입을 완료하세요.')});
  shareButton.addEventListener('click',()=>{renderTimetableChoices();message('#shareMessage','');shareDialog.showModal()});
  document.querySelector('#closeShareDialog').addEventListener('click',()=>shareDialog.close());
  document.querySelector('#timetableSelect').addEventListener('change',async event=>{const table=timetables.find(item=>item.id===event.target.value);if(!table)return;try{await loadSchedules(table);shareDialog.close()}catch(error){message('#shareMessage',error.message,true)}});
  document.querySelector('#copyShareLink').addEventListener('click',async()=>{const link=document.querySelector('#shareLinkInput').value;if(!link)return;await navigator.clipboard.writeText(link);app.notify('공유 링크를 복사했어요.')});
  document.querySelector('#joinTimetable').addEventListener('click',async()=>{try{message('#shareMessage','추가하는 중…');const id=await joinByCode(document.querySelector('#joinCodeInput').value);timetables=await fetchTimetables();const table=timetables.find(item=>item.id===id);await loadSchedules(table);message('#shareMessage','공유 시간표를 추가했어요.');setTimeout(()=>shareDialog.close(),500)}catch(error){message('#shareMessage',error.message,true)}});
  window.addEventListener('schedule-data-changed',scheduleSync);

  if(!configured){setSignedOut();return}
  client=window.supabase.createClient(config.supabaseUrl,config.supabasePublishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  client.auth.getSession().then(({data})=>setSession(data.session));
  client.auth.onAuthStateChange((event,session)=>{if(event==='TOKEN_REFRESHED')return;setTimeout(()=>setSession(session),0)});
})();
