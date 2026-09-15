(()=>{
  const app=window.scheduleApp,config=window.APP_CONFIG||{},configured=Boolean(config.supabaseUrl&&config.supabasePublishableKey&&window.supabase);
  const accountButton=document.querySelector('#accountButton'),shareButton=document.querySelector('#shareButton'),friendsButton=document.querySelector('#friendsButton');
  const authDialog=document.querySelector('#authDialog'),shareDialog=document.querySelector('#shareDialog'),friendsDialog=document.querySelector('#friendsDialog');
  let client=null,user=null,timetables=[],activeTimetable=null,syncTimer=null,syncing=false,preparing=null;
  const activeKey='my-schedule-active-timetable-v1';
  const message=(selector,text,error=false)=>{const el=document.querySelector(selector);el.textContent=text||'';el.classList.toggle('error',error)};
  const dbRow=(item,timetableId)=>({id:item.id,timetable_id:timetableId,day:Number(item.day),start_time:item.time,end_time:item.endTime,title:item.title,color:item.color||'#4d79e8',note:item.note||'',periods:Array.isArray(item.periods)?item.periods:[]});
  const appItem=row=>({id:row.id,day:Number(row.day),time:row.start_time,endTime:row.end_time,title:row.title,color:row.color,note:row.note||'',periods:Array.isArray(row.periods)?row.periods:[]});

  function setSignedOut(){user=null;timetables=[];activeTimetable=null;accountButton.textContent='로그인';shareButton.classList.add('hidden');friendsButton.classList.add('hidden');app.setReadOnly(false)}
  function renderTimetableChoices(){
    const select=document.querySelector('#timetableSelect');select.innerHTML=timetables.map(table=>`<option value="${table.id}">${table.owner_id===user.id?'내 시간표':table.access_role==='editor'?'공유받음(수정 가능)':'공유받음(보기 전용)'} · ${escapeText(table.name)}</option>`).join('');if(activeTimetable)select.value=activeTimetable.id;
  }
  function escapeText(value=''){return String(value).replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]))}
  function applyTimetable(table){
    activeTimetable=table;localStorage.setItem(activeKey,table.id);const owner=table.owner_id===user.id,canEdit=owner||table.access_role==='editor';app.setReadOnly(!canEdit);document.querySelector('#ownerShareArea').classList.toggle('hidden',!owner);document.querySelector('#shareLinkInput').value=owner?`${location.origin}${location.pathname}?join=${table.share_code}`:'';renderTimetableChoices();
  }
  async function fetchTimetables(){const tablesResult=await client.from('timetables').select('id,owner_id,name,share_code,sharing_enabled,created_at').order('created_at'),membersResult=await client.from('timetable_members').select('timetable_id,role').eq('user_id',user.id);if(tablesResult.error)throw tablesResult.error;if(membersResult.error)throw membersResult.error;const roles=new Map((membersResult.data||[]).map(row=>[row.timetable_id,row.role]));return(tablesResult.data||[]).map(table=>({...table,access_role:roles.get(table.id)||null}))}
  async function loadSchedules(table){
    applyTimetable(table);const{data,error}=await client.from('schedules').select('*').eq('timetable_id',table.id).order('day').order('start_time');if(error)throw error;app.replaceSchedules((data||[]).map(appItem));
  }
  async function uploadItems(items,tableId){if(!items.length)return;const{error}=await client.from('schedules').upsert(items.map(item=>dbRow(item,tableId)));if(error)throw error}
  async function syncNow(){
    if(!user||!activeTimetable||(activeTimetable.owner_id!==user.id&&activeTimetable.access_role!=='editor')||syncing)return;syncing=true;
    try{const local=app.getSchedules(),{data,error}=await client.from('schedules').select('id').eq('timetable_id',activeTimetable.id);if(error)throw error;const ids=new Set(local.map(item=>item.id)),stale=(data||[]).map(row=>row.id).filter(id=>!ids.has(id));if(stale.length){const result=await client.from('schedules').delete().in('id',stale);if(result.error)throw result.error}await uploadItems(local,activeTimetable.id)}catch(error){app.notify(`동기화 실패: ${error.message}`)}finally{syncing=false}
  }
  function scheduleSync(){clearTimeout(syncTimer);syncTimer=setTimeout(syncNow,650)}
  async function joinByCode(raw){
    const input=String(raw||'').trim();let code=input;try{code=new URL(input).searchParams.get('join')||input}catch{}
    if(!code)throw new Error('공유 코드나 링크를 입력하세요.');const{data,error}=await client.rpc('join_timetable_by_code',{input_code:code});if(error)throw error;return data;
  }
  async function prepareAccount(){
    const localBefore=app.getSchedules(),previousActive=localStorage.getItem(activeKey);timetables=await fetchTimetables();let mine=timetables.find(table=>table.owner_id===user.id);
    if(!mine){const{error}=await client.from('timetables').insert({name:'나의 시간표'});if(error)throw error;timetables=await fetchTimetables();mine=timetables.find(table=>table.owner_id===user.id);if(!mine)throw new Error('내 시간표를 불러오지 못했어요.')}
    const migrationKey=`my-schedule-cloud-migrated-${user.id}`;
    if(!localStorage.getItem(migrationKey)&&localBefore.length&&(!previousActive||previousActive===mine.id)){const{count,error}=await client.from('schedules').select('id',{count:'exact',head:true}).eq('timetable_id',mine.id);if(error)throw error;if(!count){await uploadItems(localBefore,mine.id);app.notify('기존 시간표를 내 계정으로 옮겼어요.')}localStorage.setItem(migrationKey,'1')}
    const queryCode=new URLSearchParams(location.search).get('join');let preferredId=previousActive;
    if(queryCode){preferredId=await joinByCode(queryCode);history.replaceState({},'',location.pathname);timetables=await fetchTimetables();app.notify('공유 시간표를 추가했어요.')}
    const table=timetables.find(item=>item.id===preferredId)||mine||timetables[0];
    await loadSchedules(table);
  }
  async function setSession(session){
    if(!session){setSignedOut();return}user=session.user;accountButton.textContent='로그아웃';shareButton.classList.remove('hidden');friendsButton.classList.remove('hidden');
    if(preparing)return preparing;preparing=prepareAccount();try{await preparing}catch(error){app.notify(`계정 연결 실패: ${error.message}`)}finally{preparing=null}
  }

  function renderFriendRequests(rows){
    const target=document.querySelector('#friendRequestList');target.innerHTML=rows.length?rows.map(row=>`<article class="friend-card"><div><strong>${escapeText(row.display_name)}</strong><span>${escapeText(row.friend_code)}</span></div><div class="friend-card-actions"><button data-friend-action="accept" data-request-id="${row.request_id}">수락</button><button class="muted" data-friend-action="reject" data-request-id="${row.request_id}">거절</button></div></article>`).join(''):'<p class="friend-empty">받은 요청이 없어요.</p>';
  }
  function renderFriends(rows){
    const target=document.querySelector('#friendList'),canShare=activeTimetable?.owner_id===user.id;target.innerHTML=rows.length?rows.map(row=>`<article class="friend-card"><div><strong>${escapeText(row.display_name)}</strong><span>${escapeText(row.friend_code)}</span></div><div class="friend-card-actions">${canShare?`<button data-friend-action="share-viewer" data-friend-id="${row.friend_id}">보기 공유</button><button data-friend-action="share-editor" data-friend-id="${row.friend_id}">수정 공유</button>`:''}<button class="danger" data-friend-action="remove" data-friend-id="${row.friend_id}" aria-label="친구 삭제">×</button></div></article>`).join(''):'<p class="friend-empty">아직 친구가 없어요.</p>';
  }
  async function loadFriends(){
    const[profileResult,requestsResult,friendsResult]=await Promise.all([client.rpc('get_my_profile'),client.rpc('get_pending_friend_requests'),client.rpc('get_friends')]);if(profileResult.error)throw profileResult.error;if(requestsResult.error)throw requestsResult.error;if(friendsResult.error)throw friendsResult.error;const profile=profileResult.data?.[0]||{};document.querySelector('#friendDisplayName').value=profile.display_name||'';document.querySelector('#myFriendCode').value=profile.friend_code||'';renderFriendRequests(requestsResult.data||[]);renderFriends(friendsResult.data||[]);
  }

  accountButton.addEventListener('click',async()=>{
    if(user){await client.auth.signOut();return}
    authDialog.showModal();message('#authMessage',configured?'':'Supabase 연결값을 먼저 설정해야 해요.',!configured);
  });
  document.querySelector('#closeAuthDialog').addEventListener('click',()=>authDialog.close());
  document.querySelector('#authForm').addEventListener('submit',async event=>{event.preventDefault();if(!configured)return;message('#authMessage','로그인 중…');const email=document.querySelector('#authEmail').value.trim(),password=document.querySelector('#authPassword').value;const{error}=await client.auth.signInWithPassword({email,password});if(error)message('#authMessage',error.message,true);else authDialog.close()});
  document.querySelector('#signupButton').addEventListener('click',async()=>{if(!configured)return;message('#authMessage','가입 처리 중…');const email=document.querySelector('#authEmail').value.trim(),password=document.querySelector('#authPassword').value;if(!email||password.length<6){message('#authMessage','이메일과 6자 이상의 비밀번호를 입력하세요.',true);return}const{data,error}=await client.auth.signUp({email,password,options:{emailRedirectTo:`${location.origin}${location.pathname}`}});if(error)message('#authMessage',error.message,true);else if(data.session){authDialog.close();app.notify('회원가입이 완료됐어요.')}else message('#authMessage','확인 메일을 보냈어요. 메일의 링크를 눌러 가입을 완료하세요.')});
  shareButton.addEventListener('click',()=>{renderTimetableChoices();message('#shareMessage','');shareDialog.showModal()});
  document.querySelector('#closeShareDialog').addEventListener('click',()=>shareDialog.close());
  document.querySelector('#timetableSelect').addEventListener('change',async event=>{const table=timetables.find(item=>item.id===event.target.value);if(!table)return;try{await loadSchedules(table);shareDialog.close()}catch(error){message('#shareMessage',error.message,true)}});
  document.querySelector('#copyShareLink').addEventListener('click',async()=>{const link=document.querySelector('#shareLinkInput').value;if(!link)return;await navigator.clipboard.writeText(link);app.notify('공유 링크를 복사했어요.')});
  document.querySelector('#joinTimetable').addEventListener('click',async()=>{try{message('#shareMessage','추가하는 중…');const id=await joinByCode(document.querySelector('#joinCodeInput').value);timetables=await fetchTimetables();const table=timetables.find(item=>item.id===id);await loadSchedules(table);message('#shareMessage','공유 시간표를 추가했어요.');setTimeout(()=>shareDialog.close(),500)}catch(error){message('#shareMessage',error.message,true)}});
  friendsButton.addEventListener('click',async()=>{friendsDialog.showModal();message('#friendsMessage','불러오는 중…');try{await loadFriends();message('#friendsMessage','')}catch(error){message('#friendsMessage',error.message,true)}});
  document.querySelector('#closeFriendsDialog').addEventListener('click',()=>friendsDialog.close());
  document.querySelector('#copyFriendCode').addEventListener('click',async()=>{const code=document.querySelector('#myFriendCode').value;if(!code)return;await navigator.clipboard.writeText(code);app.notify('친구 코드를 복사했어요.')});
  document.querySelector('#saveDisplayName').addEventListener('click',async()=>{const inputName=document.querySelector('#friendDisplayName').value.trim();message('#friendsMessage','저장하는 중…');const{error}=await client.rpc('update_my_display_name',{input_name:inputName});if(error)message('#friendsMessage',error.message,true);else{message('#friendsMessage','이름을 저장했어요.');await loadFriends()}});
  document.querySelector('#sendFriendRequest').addEventListener('click',async()=>{const code=document.querySelector('#friendCodeInput').value.trim();message('#friendsMessage','요청하는 중…');const{data,error}=await client.rpc('send_friend_request',{input_code:code});if(error)message('#friendsMessage',error.message,true);else{document.querySelector('#friendCodeInput').value='';message('#friendsMessage',data==='accepted'?'서로 친구가 됐어요.':'친구 요청을 보냈어요.');await loadFriends()}});
  document.querySelector('#friendRequestList').addEventListener('click',async event=>{const button=event.target.closest('[data-friend-action]');if(!button)return;const accept=button.dataset.friendAction==='accept';message('#friendsMessage','처리하는 중…');const{error}=await client.rpc('respond_friend_request',{request_id:button.dataset.requestId,accept_request:accept});if(error)message('#friendsMessage',error.message,true);else{message('#friendsMessage',accept?'친구가 됐어요.':'요청을 거절했어요.');await loadFriends()}});
  document.querySelector('#friendList').addEventListener('click',async event=>{const button=event.target.closest('[data-friend-action]');if(!button)return;const action=button.dataset.friendAction,friendId=button.dataset.friendId;if(action==='remove'){if(!confirm('이 친구를 삭제할까요?'))return;const{error}=await client.rpc('remove_friend',{target_friend:friendId});if(error)message('#friendsMessage',error.message,true);else{message('#friendsMessage','친구를 삭제했어요.');await loadFriends()}return}if(!activeTimetable||activeTimetable.owner_id!==user.id){message('#friendsMessage','내 시간표를 선택한 뒤 공유하세요.',true);return}const role=action==='share-editor'?'editor':'viewer';const{error}=await client.rpc('share_timetable_with_friend',{target_timetable:activeTimetable.id,target_friend:friendId,access_role:role});if(error)message('#friendsMessage',error.message,true);else message('#friendsMessage',role==='editor'?'친구가 함께 수정할 수 있게 공유했어요.':'친구에게 보기 전용으로 공유했어요.')});
  window.addEventListener('schedule-data-changed',scheduleSync);

  if(!configured){setSignedOut();return}
  client=window.supabase.createClient(config.supabaseUrl,config.supabasePublishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  client.auth.getSession().then(({data})=>setSession(data.session));
  client.auth.onAuthStateChange((event,session)=>{if(event==='TOKEN_REFRESHED')return;setTimeout(()=>setSession(session),0)});
})();
