(() => {
'use strict';

const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const te = new TextEncoder();
const td = new TextDecoder();
const CONFIG_KEY = 'trackr-github-config';
const COLORS = ['#7c5ce5','#2eb67d','#1264a3','#e01e5a','#d98920','#4a154b'];
const MAX_JSON_BYTES = 20 * 1024 * 1024;
const MAX_VOICE_BYTES = 4 * 1024 * 1024;
let githubToken = null;
let githubConfig = null;
let remoteSha = null;
let state = null;
let saveChain = Promise.resolve();
let recording = null;
let toastTimer = null;
let menuActions = [];
let hiddenAt = 0;
let showArchived = false;
let searchText = '';
let messageSearch = '';
let currentMode = 'chats';

const uid = prefix => `${prefix}_${crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36)+Math.random().toString(36).slice(2)}`;
const now = () => new Date().toISOString();
const esc = value => String(value ?? '').replace(/[&<>'\"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
const nl = value => esc(value).replace(/\n/g,'<br>');
const normalizePath = value => String(value||'trackr.json').trim().replace(/^\/+|\/+$/g,'');
const encodePath = value => normalizePath(value).split('/').map(encodeURIComponent).join('/');
const formatDuration = sec => `${Math.floor(sec/60)}:${String(Math.floor(sec%60)).padStart(2,'0')}`;
const localeTime = iso => new Date(iso).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'});
const localeDate = iso => new Date(iso).toLocaleDateString([], {weekday:'short',day:'numeric',month:'short',year:new Date(iso).getFullYear()!==new Date().getFullYear()?'numeric':undefined});
const dayKey = iso => { const d=new Date(iso); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
const preview = text => String(text || '').replace(/\s+/g,' ').trim().slice(0,60) || 'No entries yet';

const ICONS = {
  github:'<path d="M12 2.7a9.3 9.3 0 0 0-2.94 18.12c.47.09.64-.2.64-.45v-1.79c-2.62.57-3.17-1.11-3.17-1.11-.43-1.09-1.05-1.38-1.05-1.38-.86-.59.07-.58.07-.58.95.07 1.45.98 1.45.98.85 1.45 2.22 1.03 2.76.79.09-.61.33-1.03.6-1.27-2.09-.24-4.29-1.05-4.29-4.66 0-1.03.37-1.87.98-2.53-.1-.24-.42-1.2.09-2.5 0 0 .8-.26 2.56.97A8.9 8.9 0 0 1 12 6.96a8.9 8.9 0 0 1 2.33.31c1.77-1.23 2.56-.97 2.56-.97.51 1.3.19 2.26.09 2.5.61.66.98 1.5.98 2.53 0 3.62-2.21 4.41-4.31 4.65.34.29.64.87.64 1.76v2.63c0 .25.17.54.65.45A9.3 9.3 0 0 0 12 2.7Z" fill="currentColor" stroke="none"/>',
  search:'<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.2v.1"/>',
  user:'<circle cx="12" cy="8" r="3.2"/><path d="M5.5 20c.7-4 3-6 6.5-6s5.8 2 6.5 6"/>',
  chat:'<path d="M5 18.2 3.5 21l4.1-1.2c1.3.7 2.8 1 4.4 1 5 0 9-3.7 9-8.4S17 4 12 4s-9 3.7-9 8.4c0 2.2.8 4.2 2 5.8Z"/><path d="M8 10h8M8 14h5"/>',
  tracker:'<rect x="4" y="3" width="16" height="18" rx="3"/><path d="m8 9 1.5 1.5L12 8M14 9h3m-9 6 1.5 1.5L12 14m2 1h3"/>',
  settings:'<path d="M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M6 14v6"/>',
  lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>',
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon:'<path d="M20.5 15.5A8.5 8.5 0 0 1 8.5 3.5 8.7 8.7 0 1 0 20.5 15.5Z"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  pin:'<path d="m15 3 6 6-3 1-4 4v3l-2 2-7-7 2-2h3l4-4 1-3Z"/><path d="m9 16-5 5"/>',
  archive:'<path d="M4 7h16v13H4zM3 3h18v4H3zM9 11h6"/>',
  more:'<circle cx="5" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none"/>',
  back:'<path d="m15 18-6-6 6-6"/>',
  edit:'<path d="m14 5 5 5L8 21H3v-5Z"/><path d="m12 7 5 5"/>',
  copy:'<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
  star:'<path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6-5.4-2.9-5.4 2.9 1-6-4.4-4.3 6.1-.9Z"/>',
  trash:'<path d="M4 7h16M9 3h6l1 4H8l1-4ZM6 7l1 14h10l1-14M10 11v6M14 11v6"/>',
  mic:'<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3M9 21h6"/>',
  send:'<path d="m21 3-7.5 18-3.2-7.3L3 10.5 21 3Z"/><path d="m21 3-10.7 10.7"/>',
  text:'<path d="M5 6V4h14v2M12 4v16M8 20h8"/>',
  download:'<path d="M12 3v12m-5-5 5 5 5-5M4 20h16"/>',
  upload:'<path d="M12 16V4m-5 5 5-5 5 5M4 20h16"/>',
  refresh:'<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6.1 8a7 7 0 0 1 11.7-1L20 12M4 12l2.2 5a7 7 0 0 0 11.7-1"/>',
  move:'<path d="M12 3v18M3 12h18m-6-6-3-3-3 3m6 12-3 3-3-3m9-9 3 3-3 3M6 9l-3 3 3 3"/>',
  arrowUp:'<path d="m6 15 6-6 6 6"/>',arrowDown:'<path d="m6 9 6 6 6-6"/>',arrowLeft:'<path d="m15 6-6 6 6 6"/>',arrowRight:'<path d="m9 6 6 6-6 6"/>',
  close:'<path d="m6 6 12 12M18 6 6 18"/>'
};
function icon(name,className=''){return `<svg class="ui-icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]||ICONS.info}</svg>`;}
function hydrateStaticIcons(){ $$('[data-icon]').forEach(el=>{el.innerHTML=icon(el.dataset.icon)}); }
function applyTheme(theme,save=true){
  const value=theme==='dark'?'dark':'light';document.documentElement.dataset.theme=value;
  if(save)localStorage.setItem('trackr-theme',value);
  const meta=$('meta[name="theme-color"]');if(meta)meta.content=value==='dark'?'#171218':'#3f0e40';
  $$('[data-theme-icon]').forEach(el=>{el.innerHTML=icon(value==='dark'?'sun':'moon');});
}
function toggleTheme(){applyTheme(document.documentElement.dataset.theme==='dark'?'light':'dark');}
function initializeTheme(){const saved=localStorage.getItem('trackr-theme');applyTheme(saved||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'),false);}

function toast(message, ms=2300){ const el=$('#toast');if(!el)return;el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),ms); }
function setSyncStatus(kind,label){ const el=$('#syncIndicator');if(!el)return;el.className=`sync-indicator ${kind||''}`;const text=$('span',el);if(text)text.textContent=label; }
function utf8ToB64(value){ const bytes=te.encode(value);let binary='';const chunk=0x8000;for(let i=0;i<bytes.length;i+=chunk)binary+=String.fromCharCode(...bytes.subarray(i,i+chunk));return btoa(binary); }
function b64ToUtf8(value){ const clean=String(value||'').replace(/\s/g,'');const binary=atob(clean);const bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);return td.decode(bytes); }

class GitHubError extends Error{ constructor(message,status,details=''){super(message);this.status=status;this.details=details;} }
function apiBase(){ return `https://api.github.com/repos/${encodeURIComponent(githubConfig.owner)}/${encodeURIComponent(githubConfig.repo)}`; }
async function githubRequest(url,options={}){
  if(!githubToken)throw new GitHubError('GitHub token is not available. Reconnect first.',401);
  const response=await fetch(url,{...options,cache:'no-store',headers:{Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',Authorization:`Bearer ${githubToken}`,'Content-Type':'application/json',...(options.headers||{})}});
  let data=null;try{data=await response.json()}catch{}
  if(!response.ok)throw new GitHubError(data?.message||`GitHub request failed (${response.status})`,response.status,data?.documentation_url||'');
  return data;
}
function handleGitHubError(err,prefix='GitHub sync failed'){
  console.error(err);setSyncStatus('error','Sync failed');let message=err?.message||'Unknown error';
  if(err?.status===401)message='Token rejected. Confirm it is valid and not expired.';
  else if(err?.status===403)message='GitHub denied access. Check fine-grained repository permissions and rate limits.';
  else if(err?.status===404)message='Repository, branch, or JSON path was not found for this token.';
  else if(err?.status===409)message='Another device updated the file. Refresh from GitHub before trying again.';
  toast(`${prefix}: ${message}`,5200);
}

function initialState(){
  const chatId=uid('chat'),trackerId=uid('tracker');
  const python={id:uid('cat'),name:'Python',notes:'Focus on data analysis and visualisation.',color:'#7c5ce5',topics:[{id:uid('topic'),name:'Learn Pandas',notes:'Complete data-cleaning exercises',complete:false},{id:uid('topic'),name:'Learn Matplotlib',notes:'Practise chart styling',complete:false},{id:uid('topic'),name:'Learn Seaborn',notes:'Start relational and distribution plots',complete:false}]};
  const sql={id:uid('cat'),name:'SQL',notes:'Build strong querying fundamentals.',color:'#ecb22e',topics:[]};
  const tableau={id:uid('cat'),name:'Tableau',notes:'Create one dashboard using a real-world dataset.',color:'#e01e5a',topics:[]};
  return {version:2,storage:'github-json',createdAt:now(),chats:[{id:chatId,name:'General',avatar:null,color:'#2eb67d',pinned:true,archived:false,createdAt:now(),updatedAt:now()}],messages:[],activeChatId:chatId,trackers:[{id:trackerId,name:'Learning Tracker',description:'Skills and topics I am actively learning',color:'#7c5ce5',createdAt:now(),updatedAt:now(),categories:[python,sql,tableau]}],activeTrackerId:trackerId};
}
function migrateState(data){
  if(!data||typeof data!=='object'||Array.isArray(data))throw new Error('The GitHub JSON is not a valid trackr. workspace.');
  data.version=2;data.storage='github-json';data.chats||=[];data.messages||=[];data.trackers||=[];
  for(const c of data.chats){c.pinned=!!c.pinned;c.archived=!!c.archived;c.color||=COLORS[0];}
  for(const t of data.trackers){t.categories||=[];t.color||=COLORS[0];for(const c of t.categories){c.topics||=[];c.color||=COLORS[0];}}
  return data;
}

async function loadRemoteState(createWhenMissing=true){
  const url=`${apiBase()}/contents/${encodePath(githubConfig.path)}?ref=${encodeURIComponent(githubConfig.branch)}`;
  try{
    const file=await githubRequest(url);remoteSha=file.sha;let encoded=file.content;
    if(!encoded&&file.git_url){const blob=await githubRequest(file.git_url);encoded=blob.content;}
    if(!encoded)throw new Error('GitHub did not return JSON file content.');
    state=migrateState(JSON.parse(b64ToUtf8(encoded)));
  }catch(err){
    if(err.status===404&&createWhenMissing){state=initialState();remoteSha=null;await writeRemoteState(JSON.stringify(state),'Initialize trackr. data');return;}
    throw err;
  }
}
async function writeRemoteState(snapshot,message='Update trackr. data'){
  const bytes=te.encode(snapshot).length;if(bytes>MAX_JSON_BYTES)throw new Error('The JSON file is above the 20 MB safety limit. Remove media or split storage before syncing.');
  setSyncStatus('saving','Saving…');
  const url=`${apiBase()}/contents/${encodePath(githubConfig.path)}`;
  const body={message,content:utf8ToB64(snapshot),branch:githubConfig.branch};if(remoteSha)body.sha=remoteSha;
  const result=await githubRequest(url,{method:'PUT',body:JSON.stringify(body)});remoteSha=result.content?.sha||result.commit?.sha||remoteSha;setSyncStatus('saved','Saved to GitHub');
}
async function persistState(message='Update trackr. data'){
  if(!state||!githubToken)return false;const snapshot=JSON.stringify(state);
  saveChain=saveChain.catch(()=>{}).then(()=>writeRemoteState(snapshot,message)).catch(err=>{handleGitHubError(err);return false;});
  return saveChain;
}

function openModal({title,subtitle='',body='',footer='',wide=false,locked=false,onOpen}={}){
  const root=$('#modalRoot');root.innerHTML=`<div class="modal-overlay" data-modal-overlay><section class="modal-card ${wide?'wide':''}" role="dialog" aria-modal="true" aria-label="${esc(title)}"><header class="modal-head"><div class="modal-head-copy"><h2>${esc(title)}</h2>${subtitle?`<p>${esc(subtitle)}</p>`:''}</div>${locked?'':`<button class="modal-close" data-close-modal aria-label="Close">${icon('close')}</button>`}</header><div class="modal-body">${body}</div>${footer?`<footer class="modal-footer">${footer}</footer>`:''}</section></div>`;
  const overlay=$('[data-modal-overlay]',root);if(!locked)overlay.addEventListener('click',e=>{if(e.target===overlay)closeModal();});requestAnimationFrame(()=>{const focus=$('[autofocus]',root)||$('input,textarea,button',root);focus?.focus();onOpen?.(root);});
}
function closeModal(){ $('#modalRoot').innerHTML='';menuActions=[]; }
function confirmModal(title,message,confirmText='Delete',danger=true){return new Promise(resolve=>{openModal({title,body:`<div class="danger-copy">${esc(message)}</div>`,footer:`<button class="btn secondary" data-confirm-no>Cancel</button><button class="btn ${danger?'danger':'primary'}" data-confirm-yes>${esc(confirmText)}</button>`});$('[data-confirm-no]').onclick=()=>{closeModal();resolve(false)};$('[data-confirm-yes]').onclick=()=>{closeModal();resolve(true)};});}
function actionMenu(title,items){menuActions=items;openModal({title,body:`<div class="menu-list">${items.map((it,i)=>`<button class="menu-item ${it.danger?'danger':''}" data-menu-action="${i}"><span class="menu-icon">${icon(it.icon||'info')}</span><span>${esc(it.label)}</span></button>`).join('')}</div>`});}
function setBusy(form,busy,label){const btn=$('button[type="submit"]',form);if(!btn)return;if(busy){btn.dataset.old=btn.textContent;btn.textContent=label||'Connecting…';btn.disabled=true}else{btn.textContent=btn.dataset.old||btn.textContent;btn.disabled=false}}

async function connectGitHub(form){
  const error=$('#githubAuthError');error.textContent='';const config={owner:$('#githubOwner').value.trim(),repo:$('#githubRepo').value.trim(),branch:'main',path:'trackr.json'};const token=$('#githubToken').value.trim();
  if(!config.owner||!config.repo||!config.path||!token){error.textContent='Complete all GitHub connection fields.';return;}
  githubConfig=config;githubToken=token;setBusy(form,true,'Checking private repository…');
  try{
    const repo=await githubRequest(`${apiBase()}`);if(!repo.private)throw new Error('The selected data repository is public. Use a private repository.');
    localStorage.setItem(CONFIG_KEY,JSON.stringify({owner:config.owner,repo:config.repo}));
    $('#githubToken').value='';setBusy(form,true,'Loading shared JSON…');await loadRemoteState(true);enterApp();
  }catch(err){githubToken=null;remoteSha=null;handleGitHubError(err,'Connection failed');error.textContent=err.message||'Could not connect to GitHub.';}
  finally{setBusy(form,false);}
}
function enterApp(){
  $('#auth').classList.add('hidden');$('#app').classList.remove('hidden');currentMode='chats';if(!state.activeChatId&&state.chats[0])state.activeChatId=state.chats[0].id;if(!state.activeTrackerId&&state.trackers[0])state.activeTrackerId=state.trackers[0].id;setSyncStatus('saved','Connected');render();
}
function lockApp(){
  if(recording)stopRecording(false);githubToken=null;remoteSha=null;state=null;saveChain=Promise.resolve();$('#modalRoot').innerHTML='';$('#app').classList.add('hidden');$('#app').classList.remove('mobile-detail');$('#auth').classList.remove('hidden');$('#githubToken').value='';$('#githubAuthError').textContent='';setTimeout(()=>$('#githubToken').focus(),100);
}
function boot(){
  initializeTheme();hydrateStaticIcons();applyTheme(document.documentElement.dataset.theme,false);
  try{const saved=JSON.parse(localStorage.getItem(CONFIG_KEY)||'null');if(saved){$('#githubOwner').value=saved.owner||'';$('#githubRepo').value=saved.repo||'';}}catch{localStorage.removeItem(CONFIG_KEY)}
}

function chatMessages(chatId){ return state.messages.filter(m=>m.chatId===chatId).sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt)); }
function lastMessage(chatId){ const ms=chatMessages(chatId); return ms[ms.length-1]; }
function activeChat(){ return state.chats.find(c=>c.id===state.activeChatId); }
function activeTracker(){ return state.trackers.find(t=>t.id===state.activeTrackerId); }
function avatarInner(item){ return item.avatar?`<img src="${esc(item.avatar)}" alt="">`:`${esc((item.name||'?').trim().charAt(0).toUpperCase()||'?')}`; }
function avatarStyle(item){ return item.avatar?'background:#fff;color:var(--slack)':'background:var(--conversation-icon-bg);color:var(--conversation-icon-ink)'; }
function getTrackerProgress(tracker){ const topics=tracker.categories.flatMap(c=>c.topics||[]); if(!topics.length)return 0; return Math.round(topics.filter(t=>t.complete).length/topics.length*100); }
function lastUpdatedLabel(iso){
  const d=new Date(iso), today=new Date(); if(dayKey(iso)===dayKey(today.toISOString())) return localeTime(iso);
  const diff=(today-d)/86400000; if(diff<7)return d.toLocaleDateString([],{weekday:'short'}); return d.toLocaleDateString([],{day:'numeric',month:'short'});
}

function setMode(mode,detail=false){
  if(recording && mode!=='chats'){ stopRecording(false); toast('Voice recording cancelled'); }
  currentMode=mode; const app=$('#app'); app.dataset.mode=mode; app.classList.toggle('mobile-detail',detail || mode==='settings');
  $$('[data-nav]').forEach(b=>b.classList.toggle('active',b.dataset.nav===mode));
  render();
}
function render(){
  if(!state)return;
  renderSidebar(); renderContent();
}
function renderSidebar(){
  if(currentMode==='chats') renderChatSidebar();
  else if(currentMode==='trackers') renderTrackerSidebar();
  else renderSettingsSidebar();
}
function sidebarHeader(title,subtitle,action,label,placeholder){
  return `<div class="sidebar-head"><div class="sidebar-title-line"><div><h1>${esc(title)}</h1><div class="sidebar-sub">${esc(subtitle)}</div></div>${action?`<button class="sidebar-create" data-action="${action}" aria-label="${esc(label)}">${icon('plus')}</button>`:''}</div>${placeholder?`<div class="side-search"><span>${icon('search')}</span><input id="sideSearch" value="${esc(searchText)}" placeholder="${esc(placeholder)}"></div>`:''}</div>`;
}
function renderChatSidebar(){
  $('#sidebarHeader').innerHTML=sidebarHeader('Chats','Your private conversations','new-chat','New conversation','Search conversations');
  const visible=state.chats.filter(c=>showArchived?c.archived:!c.archived).filter(c=>c.name.toLowerCase().includes(searchText.toLowerCase())).sort((a,b)=>(Number(b.pinned)-Number(a.pinned))||(new Date(b.updatedAt)-new Date(a.updatedAt)));
  const pinned=visible.filter(c=>c.pinned), recent=visible.filter(c=>!c.pinned);
  const row=c=>{const last=lastMessage(c.id);const pv=last?(last.kind==='voice'?'Voice note':preview(last.text)):'No entries yet';return `<button class="side-row ${c.id===state.activeChatId?'active':''}" data-action="select-chat" data-id="${c.id}"><span class="side-avatar" style="${avatarStyle(c)}">${avatarInner(c)}</span><span class="side-copy"><span class="side-name">${esc(c.name)} ${c.pinned?`<span class="side-pin" title="Pinned">${icon('pin')}</span>`:''}</span><span class="side-preview">${esc(pv)}</span></span><span class="side-time">${last?esc(lastUpdatedLabel(last.createdAt)):''}</span></button>`};
  let html=''; if(pinned.length) html+=`<div class="side-section-title">Pinned</div>${pinned.map(row).join('')}`; if(recent.length) html+=`<div class="side-section-title">${showArchived?'Archived':'Recent'}</div>${recent.map(row).join('')}`;
  if(!visible.length) html=`<div class="empty-side">${searchText?'No conversations match your search.':showArchived?'No archived conversations.':'Create a conversation for groceries, daily tasks, work notes, or anything else.'}</div>`;
  $('#sidebarContent').innerHTML=html;
  const archivedCount=state.chats.filter(c=>c.archived).length;
  $('#sidebarFooter').innerHTML=`<div class="sidebar-footer"><button class="sidebar-footer-btn" data-action="toggle-archived">${showArchived?`${icon('back')}<span>Back to conversations</span>`:`${icon('archive')}<span>Archived${archivedCount?` · ${archivedCount}`:''}</span>`}</button></div>`;
  bindSideSearch();
}
function renderTrackerSidebar(){
  $('#sidebarHeader').innerHTML=sidebarHeader('Trackers','Systems built your way','new-tracker','New tracker','Search trackers');
  const trackers=state.trackers.filter(t=>t.name.toLowerCase().includes(searchText.toLowerCase()));
  $('#sidebarContent').innerHTML=trackers.length?`<div class="side-section-title">My trackers</div>${trackers.map(t=>{const topics=t.categories.flatMap(c=>c.topics).length;return `<button class="side-row ${t.id===state.activeTrackerId?'active':''}" data-action="select-tracker" data-id="${t.id}"><span class="side-avatar" style="background:${esc(t.color)};color:#fff">${esc(t.name.charAt(0).toUpperCase())}</span><span class="side-copy"><span class="side-name">${esc(t.name)}</span><span class="side-preview">${t.categories.length} categories · ${topics} topics</span></span><span class="side-time">${getTrackerProgress(t)}%</span></button>`}).join('')}`:`<div class="empty-side">${searchText?'No trackers match your search.':'Create a tracker, then add your own categories and topics.'}</div>`;
  $('#sidebarFooter').innerHTML=`<div class="sidebar-footer"><button class="sidebar-footer-btn" data-action="new-tracker">${icon('plus')}<span>Create another tracker</span></button></div>`;
  bindSideSearch();
}
function renderSettingsSidebar(){
  $('#sidebarHeader').innerHTML=sidebarHeader('Settings','GitHub connection and shared JSON',null,null,null);
  $('#sidebarContent').innerHTML=`<div class="side-section-title">Workspace</div><button class="side-row active"><span class="side-avatar settings-avatar">${icon('settings')}</span><span class="side-copy"><span class="side-name">Settings</span><span class="side-preview">Connection, data and appearance</span></span></button>`;
  $('#sidebarFooter').innerHTML=`<div class="sidebar-footer"><button class="sidebar-footer-btn" data-action="lock">${icon('lock')}<span>Disconnect workspace</span></button></div>`;
}
function bindSideSearch(){
  const input=$('#sideSearch'); if(!input)return;
  input.addEventListener('input',e=>{searchText=e.target.value; const pos=e.target.selectionStart; renderSidebar(); const next=$('#sideSearch'); next?.focus(); next?.setSelectionRange(pos,pos);});
}

function renderContent(){
  if(currentMode==='chats')renderChatContent(); else if(currentMode==='trackers')renderTrackerContent(); else renderSettings();
}
function headerAvatar(item){ return `<span class="content-title-avatar" style="${avatarStyle(item)}">${avatarInner(item)}</span>`; }
function renderChatContent(){
  const chat=activeChat(); const content=$('#content');
  if(!chat){ content.innerHTML=`<div class="empty-main"><div class="empty-card"><div class="empty-illustration">${icon('chat')}</div><h2>No conversation selected</h2><p>Create a conversation for groceries, daily tasks, work, general notes, or anything else.</p><button class="btn primary" data-action="new-chat">Create conversation</button></div></div>`;return; }
  const all=chatMessages(chat.id); const messages=messageSearch?all.filter(m=>(m.text||'Voice note').toLowerCase().includes(messageSearch.toLowerCase())):all;
  let lastDay='',html='';
  for(const m of messages){const dk=dayKey(m.createdAt);if(dk!==lastDay){html+=`<div class="date-divider"><span>${esc(localeDate(m.createdAt))}</span></div>`;lastDay=dk;}html+=messageHTML(m);}
  if(!messages.length) html=`<div class="empty-main"><div class="empty-card"><div class="empty-illustration">${icon(messageSearch?'search':'edit')}</div><h2>${messageSearch?'No matching entries':'Start writing'}</h2><p>${messageSearch?'Try a different search.':'This conversation is yours. Add a thought, list, task, or voice note.'}</p></div></div>`;
  content.innerHTML=`<header class="content-header"><button class="icon-btn mobile-back" data-action="mobile-back" aria-label="Back">${icon('back')}</button>${headerAvatar(chat)}<div class="content-heading"><h2>${esc(chat.name)} ${chat.pinned?`<span class="header-pin" title="Pinned">${icon('pin')}</span>`:''}</h2><p>${chat.archived?'Archived conversation':'Personal conversation'}${messageSearch?` · Searching “${esc(messageSearch)}”`:''}</p></div><div class="content-actions"><button class="icon-btn optional-mobile" data-action="search-messages" title="Search conversation" aria-label="Search conversation">${icon('search')}</button><button class="icon-btn hide-narrow ${chat.pinned?'active-pin':''}" data-action="pin-chat" data-id="${chat.id}" title="${chat.pinned?'Unpin':'Pin'}" aria-label="${chat.pinned?'Unpin':'Pin'} conversation">${icon('pin')}</button><button class="icon-btn" data-action="chat-menu" data-id="${chat.id}" title="Conversation options" aria-label="Conversation options">${icon('more')}</button></div></header><div class="content-scroll" id="messageScroll"><div class="message-list">${html}</div></div>${recording?recordingHTML():composerHTML()}`;
  bindComposer();
  if(!messageSearch) requestAnimationFrame(()=>{const scroller=$('#messageScroll');if(scroller)scroller.scrollTop=scroller.scrollHeight;});
}
function messageHTML(m){
  const body=m.kind==='voice'?`<div class="voice-note"><span class="voice-note-icon">${icon('mic')}</span><div class="voice-note-copy"><div class="voice-note-title">Voice note</div><audio controls playsinline preload="metadata" src="${esc(m.audio)}"></audio></div><span class="voice-duration">${formatDuration(m.duration||0)}</span></div>`:`<div class="message-text">${nl(m.text)}</div>`;
  return `<article class="message-row"><button class="message-menu" data-action="message-menu" data-id="${m.id}" aria-label="Entry options">${icon('more')}</button><div class="message-body"><div class="message-meta"><span class="message-author">You</span><span class="message-time">${esc(localeTime(m.createdAt))}</span>${m.editedAt?'<span class="edited">edited</span>':''}${m.starred?`<span class="star-mark" title="Starred">${icon('star')}</span>`:''}</div>${body}</div><span class="message-user">${icon('user')}</span></article>`;
}
function composerHTML(){ return `<footer class="message-composer"><div class="composer-box"><textarea id="composerInput" class="composer-input" rows="1" placeholder="Write in ${esc(activeChat()?.name||'conversation')}…"></textarea><div class="composer-tools"><button class="composer-tool" data-action="voice-record" title="Record voice note" aria-label="Record voice note">${icon('mic')}</button><button class="composer-tool" data-action="composer-tip" title="Writing tips" aria-label="Writing tips">${icon('text')}</button><span class="composer-spacer"></span><button id="sendText" class="composer-send" title="Send" aria-label="Send" disabled>${icon('send')}</button></div></div></footer>`; }
function recordingHTML(){ return `<footer class="message-composer"><div class="recording-panel"><span class="recording-pulse"></span><div class="recording-copy"><b>Recording voice note</b><span>Microphone audio stays on this device</span></div><strong class="record-time" id="recordTimer">${formatDuration((Date.now()-recording.startedAt)/1000)}</strong><button class="record-action cancel" data-action="voice-cancel">Cancel</button><button class="record-action send" data-action="voice-send">Send</button></div></footer>`; }
function bindComposer(){
  const input=$('#composerInput'),send=$('#sendText'); if(!input||!send)return;
  const update=()=>{send.disabled=!input.value.trim();input.style.height='auto';input.style.height=Math.min(input.scrollHeight,130)+'px'};
  input.addEventListener('input',update); input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendTextMessage();}}); send.onclick=sendTextMessage;
}
async function sendTextMessage(){
  const input=$('#composerInput'),text=input?.value.trim(); const chat=activeChat(); if(!text||!chat)return;
  state.messages.push({id:uid('msg'),chatId:chat.id,kind:'text',text,starred:false,createdAt:now(),editedAt:null}); chat.updatedAt=now();
  await persistState(); render();
}

function renderTrackerContent(){
  const tracker=activeTracker(),content=$('#content');
  if(!tracker){content.innerHTML=`<div class="empty-main"><div class="empty-card"><div class="empty-illustration">${icon('tracker')}</div><h2>Create your first tracker</h2><p>Add categories and topics for learning, health, projects, or any system you want to build.</p><button class="btn primary icon-text-btn" data-action="new-tracker">${icon('plus')}<span>Create tracker</span></button></div></div>`;return;}
  const progress=getTrackerProgress(tracker); const topicCount=tracker.categories.flatMap(c=>c.topics).length;
  const categories=tracker.categories.length?tracker.categories.map((c,i)=>categoryHTML(tracker,c,i)).join(''):`<div class="no-categories"><b>No categories yet</b>Add your first category, then place topics and notes inside it.</div>`;
  content.innerHTML=`<header class="content-header tracker-header"><button class="icon-btn mobile-back" data-action="mobile-back" aria-label="Back">${icon('back')}</button><span class="content-title-avatar tracker-title-avatar" style="background:${esc(tracker.color)};color:#fff">${esc(tracker.name.charAt(0).toUpperCase())}</span><div class="content-heading"><h2>${esc(tracker.name)}</h2><p>${esc(tracker.description||`${tracker.categories.length} categories · ${topicCount} topics`)}</p></div><div class="tracker-progress"><div class="progress-label"><span>Overall progress</span><b>${progress}%</b></div><div class="progress-bar"><div class="progress-fill" style="width:${progress}%"></div></div></div><div class="content-actions"><button class="icon-btn" data-action="tracker-menu" data-id="${tracker.id}" aria-label="Tracker options">${icon('more')}</button></div></header><div class="tracker-board-wrap"><div class="tracker-toolbar"><p>Use category and topic menus to edit, move, reorder, or delete.</p><button class="btn primary icon-text-btn" data-action="new-category">${icon('plus')}<span>Add category</span></button></div><div class="category-board">${categories}</div></div>`;
}
function categoryHTML(tracker,c,index){
  const done=c.topics.filter(t=>t.complete).length;
  return `<section class="category-card"><div class="category-head"><span class="category-dot" style="background:${esc(c.color)}"></span><div><div class="category-title">${esc(c.name)}</div><div class="category-count">${c.topics.length} topics · ${done} completed</div></div><button class="mini-menu" data-action="category-menu" data-id="${c.id}" aria-label="Category options">${icon('more')}</button></div>${c.notes?`<div class="category-note">${nl(c.notes)}</div>`:''}<div class="topic-list">${c.topics.map((t,i)=>topicHTML(c,t,i)).join('')}</div><button class="add-topic-btn" data-action="new-topic" data-id="${c.id}">${icon('plus')}<span>Add topic</span></button></section>`;
}
function topicHTML(c,t,index){ return `<article class="topic-card"><div class="topic-top"><input class="topic-check" type="checkbox" data-action="toggle-topic" data-category="${c.id}" data-id="${t.id}" ${t.complete?'checked':''} aria-label="Mark ${esc(t.name)} complete"><span class="topic-name ${t.complete?'topic-complete':''}">${esc(t.name)}</span><button class="mini-menu" data-action="topic-menu" data-category="${c.id}" data-id="${t.id}" aria-label="Topic options">${icon('more')}</button></div>${t.notes?`<div class="topic-note">${nl(t.notes)}</div>`:''}</article>`; }

function renderSettings(){
  const content=$('#content');
  const bytes=te.encode(JSON.stringify(state)).length;
  content.innerHTML=`<div class="settings-page"><div class="settings-inner"><div class="settings-title"><h1>Settings</h1><p>GitHub synchronization, JSON data and app installation.</p></div><section class="settings-card"><div class="settings-card-head"><h3>Private GitHub repository</h3><p>This repository is the shared source of truth on every browser.</p></div><div class="setting-row"><div class="setting-copy"><b>${esc(githubConfig.owner)}/${esc(githubConfig.repo)}</b><span>Branch: ${esc(githubConfig.branch)} · File: ${esc(githubConfig.path)}</span></div><span class="security-badge"><i></i>Connected</span></div><div class="setting-row"><div class="setting-copy"><b>Synchronize now</b><span>Wait for pending uploads, then download the latest committed JSON.</span></div><button class="btn blue icon-text-btn" data-action="refresh-cloud">${icon('refresh')}<span>Refresh from GitHub</span></button></div><div class="setting-row"><div class="setting-copy"><b>Disconnect</b><span>Clears the PAT from application memory. You will enter it again to reconnect.</span></div><button class="btn secondary icon-text-btn" data-action="lock">${icon('lock')}<span>Disconnect</span></button></div></section><section class="settings-card"><div class="settings-card-head"><h3>Token handling</h3><p>The fine-grained PAT is used directly by this browser for GitHub API requests.</p></div><div class="setting-row"><div class="setting-copy"><b>Memory only</b><span>The PAT is never written to localStorage, IndexedDB, cookies, the JSON file, or either repository. Repository details are the only remembered values.</span></div><span class="security-badge"><i></i>Not persisted</span></div><div class="setting-row"><div class="setting-copy"><b>Current limitation</b><span>While connected, advanced DevTools, extensions, or malware on this device could inspect the Authorization request. Use a fine-grained, expiring PAT limited to this one repository.</span></div></div></section><section class="settings-card"><div class="settings-card-head"><h3>Shared JSON</h3><p>Chats, trackers, avatar images and voice-note data are currently stored in the configured JSON file.</p></div><div class="setting-row"><div class="setting-copy"><b>Workspace size</b><span>${(bytes/1024).toFixed(1)} KB before GitHub base64 transfer encoding</span></div></div><div class="setting-row"><div class="setting-copy"><b>Download JSON copy</b><span>Downloads the current readable workspace JSON to this device.</span></div><button class="btn secondary icon-text-btn" data-action="download-json">${icon('download')}<span>Download</span></button></div><div class="setting-row"><div class="setting-copy"><b>Replace from JSON</b><span>Validates and uploads a JSON file to the private repository.</span></div><button class="btn secondary icon-text-btn" data-action="import-json">${icon('upload')}<span>Choose file</span></button></div><div class="storage-note" style="margin:12px 18px 17px">Images and voice notes use base64 inside JSON. This is suitable for light personal usage, but the file and Git history will grow as media is added.</div></section><section class="settings-card"><div class="settings-card-head"><h3>Install on iPhone</h3><p>trackr. supports iPhone safe areas and laptop/monitor layouts.</p></div><div class="setting-row"><div class="setting-copy"><b>Add to Home Screen</b><ol class="install-steps"><li>Open the GitHub Pages URL in Safari.</li><li>Tap Share.</li><li>Choose <strong>Add to Home Screen</strong>.</li></ol><div class="storage-note">Voice notes require HTTPS microphone permission. The PAT will be requested whenever the page reloads or the app reconnects.</div></div></div></section><section class="settings-card"><div class="settings-card-head"><h3>Danger zone</h3><p>This replaces the shared repository JSON for every device.</p></div><div class="setting-row"><div class="setting-copy"><b>Reset shared workspace</b><span>Replaces all conversations and trackers with the starter workspace.</span></div><button class="btn danger icon-text-btn" data-action="reset-cloud">${icon('trash')}<span>Reset</span></button></div></section></div></div>`;
}
async function updateStorageEstimate(){
  const el=$('#storageEstimate'); if(!el)return;
  try{const x=await navigator.storage?.estimate(); if(!x||!x.usage){el.textContent='Stored privately in this browser';return;} el.textContent=`${(x.usage/1048576).toFixed(1)} MB used on this origin`; }catch{el.textContent='Stored privately in this browser';}
}

async function compressImage(file){
  if(!file?.type.startsWith('image/')) throw new Error('Choose an image file.');
  const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.readAsDataURL(file)});
  const img=await new Promise((resolve,reject)=>{const x=new Image();x.onload=()=>resolve(x);x.onerror=()=>reject(new Error('Could not read image'));x.src=data});
  const size=256,canvas=document.createElement('canvas');canvas.width=size;canvas.height=size;const ctx=canvas.getContext('2d');const scale=Math.max(size/img.width,size/img.height);const w=img.width*scale,h=img.height*scale;ctx.drawImage(img,(size-w)/2,(size-h)/2,w,h);return canvas.toDataURL('image/jpeg',.82);
}
function chatDialog(chat=null){
  let avatar=chat?.avatar||null; const color=chat?.color||COLORS[Math.floor(Math.random()*COLORS.length)]; const edit=!!chat;
  openModal({title:edit?'Edit conversation':'New conversation',subtitle:'A private place for anything you want to remember.',body:`<form id="chatForm"><div class="avatar-editor"><div class="avatar-preview" id="chatAvatarPreview" style="background:var(--conversation-icon-bg);color:var(--conversation-icon-ink)">${avatar?`<img src="${esc(avatar)}" alt="">`:esc((chat?.name||'N').charAt(0).toUpperCase())}</div><div class="avatar-buttons"><label class="btn secondary" for="chatAvatarFile">Upload picture</label><input id="chatAvatarFile" type="file" accept="image/*" hidden><button type="button" class="text-btn" id="removeChatAvatar" style="margin:0">Use generated avatar</button></div></div><div class="form-field"><label for="chatNameField">Conversation name</label><input id="chatNameField" maxlength="50" value="${esc(chat?.name||'')}" placeholder="e.g. Grocery List" required autofocus></div><label class="check-row"><span><b>Pin conversation</b><br><small>Keep it at the top of your list</small></span><input id="chatPinnedField" type="checkbox" ${chat?.pinned?'checked':''}></label></form>`,footer:`<button class="btn secondary" data-close-modal>Cancel</button><button class="btn primary" id="saveChat">${edit?'Save changes':'Create conversation'}</button>`});
  const name=$('#chatNameField'),previewEl=$('#chatAvatarPreview');
  name.oninput=()=>{if(!avatar)previewEl.textContent=(name.value.trim().charAt(0)||'N').toUpperCase()};
  $('#chatAvatarFile').onchange=async e=>{try{avatar=await compressImage(e.target.files[0]);previewEl.innerHTML=`<img src="${avatar}" alt="">`}catch(err){toast(err.message)}};
  $('#removeChatAvatar').onclick=()=>{avatar=null;previewEl.textContent=(name.value.trim().charAt(0)||'N').toUpperCase()};
  $('#saveChat').onclick=async()=>{if(!name.reportValidity())return;const value=name.value.trim();if(edit){chat.name=value;chat.avatar=avatar;chat.pinned=$('#chatPinnedField').checked;chat.updatedAt=now()}else{const c={id:uid('chat'),name:value,avatar,color,pinned:$('#chatPinnedField').checked,archived:false,createdAt:now(),updatedAt:now()};state.chats.push(c);state.activeChatId=c.id;}await persistState();closeModal();showArchived=false;searchText='';setMode('chats',true);toast(edit?'Conversation updated':'Conversation created')};
}
function chatMenu(chat){
  actionMenu(chat.name,[
    {icon:'edit',label:'Rename or change picture',fn:()=>chatDialog(chat)},
    {icon:'pin',label:chat.pinned?'Unpin conversation':'Pin conversation',fn:async()=>{chat.pinned=!chat.pinned;chat.updatedAt=now();await persistState();render();toast(chat.pinned?'Conversation pinned':'Conversation unpinned')}},
    {icon:'archive',label:chat.archived?'Unarchive conversation':'Archive conversation',fn:async()=>{chat.archived=!chat.archived;chat.updatedAt=now();if(chat.archived&&!showArchived)state.activeChatId=state.chats.find(c=>!c.archived)?.id||null;await persistState();render();toast(chat.archived?'Conversation archived':'Conversation restored')}},
    {icon:'search',label:'Search this conversation',fn:()=>searchMessagesDialog()},
    {icon:'trash',label:'Delete conversation',danger:true,fn:async()=>{if(await confirmModal('Delete conversation?',`“${chat.name}” and all of its entries and voice notes will be permanently deleted.`)){state.chats=state.chats.filter(c=>c.id!==chat.id);state.messages=state.messages.filter(m=>m.chatId!==chat.id);state.activeChatId=state.chats.find(c=>!c.archived)?.id||state.chats[0]?.id||null;await persistState();render();toast('Conversation deleted')}}}
  ]);
}
function searchMessagesDialog(){
  openModal({title:'Search conversation',body:`<div class="form-field"><label for="messageSearchField">Words to find</label><input id="messageSearchField" value="${esc(messageSearch)}" placeholder="Search entries" autofocus></div>`,footer:`${messageSearch?'<button class="btn secondary" id="clearMessageSearch">Clear</button>':''}<button class="btn primary" id="applyMessageSearch">Search</button>`});
  $('#applyMessageSearch').onclick=()=>{messageSearch=$('#messageSearchField').value.trim();closeModal();renderContent()}; if($('#clearMessageSearch'))$('#clearMessageSearch').onclick=()=>{messageSearch='';closeModal();renderContent()};
}
function messageMenu(message){
  actionMenu(message.kind==='voice'?'Voice note':'Entry',[
    ...(message.kind==='text'?[{icon:'edit',label:'Edit entry',fn:()=>editMessage(message)},{icon:'copy',label:'Copy text',fn:async()=>{try{await navigator.clipboard.writeText(message.text);toast('Copied')}catch{toast('Copy is not available in this browser')}}}]:[]),
    {icon:'star',label:message.starred?'Remove star':'Star entry',fn:async()=>{message.starred=!message.starred;await persistState();renderContent();toast(message.starred?'Entry starred':'Star removed')}},
    {icon:'trash',label:'Delete entry',danger:true,fn:async()=>{if(await confirmModal('Delete entry?','This entry will be permanently removed.')){state.messages=state.messages.filter(m=>m.id!==message.id);const c=activeChat();if(c)c.updatedAt=now();await persistState();render();toast('Entry deleted')}}}
  ]);
}
function editMessage(message){
  openModal({title:'Edit entry',body:`<div class="form-field"><label for="editMessageText">Text</label><textarea id="editMessageText" rows="6" autofocus>${esc(message.text)}</textarea></div>`,footer:`<button class="btn secondary" data-close-modal>Cancel</button><button class="btn primary" id="saveMessageEdit">Save</button>`});
  $('#saveMessageEdit').onclick=async()=>{const value=$('#editMessageText').value.trim();if(!value)return;message.text=value;message.editedAt=now();await persistState();closeModal();renderContent();toast('Entry updated')};
}

function trackerDialog(tracker=null){
  const edit=!!tracker;
  openModal({title:edit?'Edit tracker':'New tracker',subtitle:'Create a system with your own categories and topics.',body:`<form><div class="form-field"><label for="trackerNameField">Tracker name</label><input id="trackerNameField" maxlength="60" value="${esc(tracker?.name||'')}" placeholder="e.g. Learning Tracker" required autofocus></div><div class="form-field"><label for="trackerDescField">Description</label><textarea id="trackerDescField" rows="3" placeholder="What is this tracker for?">${esc(tracker?.description||'')}</textarea></div><div class="form-field"><label for="trackerColorField">Colour</label><input id="trackerColorField" type="color" value="${esc(tracker?.color||'#7c5ce5')}"></div></form>`,footer:`<button class="btn secondary" data-close-modal>Cancel</button><button class="btn primary" id="saveTracker">${edit?'Save changes':'Create tracker'}</button>`});
  $('#saveTracker').onclick=async()=>{const input=$('#trackerNameField');if(!input.reportValidity())return; if(edit){tracker.name=input.value.trim();tracker.description=$('#trackerDescField').value.trim();tracker.color=$('#trackerColorField').value;tracker.updatedAt=now()}else{const t={id:uid('tracker'),name:input.value.trim(),description:$('#trackerDescField').value.trim(),color:$('#trackerColorField').value,createdAt:now(),updatedAt:now(),categories:[]};state.trackers.push(t);state.activeTrackerId=t.id;}await persistState();closeModal();searchText='';setMode('trackers',true);toast(edit?'Tracker updated':'Tracker created')};
}
function trackerMenu(tracker){
  actionMenu(tracker.name,[
    {icon:'edit',label:'Edit tracker',fn:()=>trackerDialog(tracker)},
    {icon:'copy',label:'Duplicate tracker',fn:async()=>{const copy=structuredClone(tracker);copy.id=uid('tracker');copy.name=`${tracker.name} copy`;copy.createdAt=copy.updatedAt=now();copy.categories.forEach(c=>{c.id=uid('cat');c.topics.forEach(t=>t.id=uid('topic'))});state.trackers.push(copy);state.activeTrackerId=copy.id;await persistState();render();toast('Tracker duplicated')}},
    {icon:'trash',label:'Delete tracker',danger:true,fn:async()=>{if(await confirmModal('Delete tracker?',`“${tracker.name}” and all of its categories, topics and notes will be permanently deleted.`)){state.trackers=state.trackers.filter(t=>t.id!==tracker.id);state.activeTrackerId=state.trackers[0]?.id||null;await persistState();render();toast('Tracker deleted')}}}
  ]);
}
function categoryDialog(category=null){
  const tracker=activeTracker(),edit=!!category;
  openModal({title:edit?'Edit category':'New category',body:`<div class="form-field"><label for="categoryNameField">Category name</label><input id="categoryNameField" maxlength="60" value="${esc(category?.name||'')}" placeholder="e.g. Python" required autofocus></div><div class="form-field"><label for="categoryNotesField">Notes</label><textarea id="categoryNotesField" rows="5" placeholder="Write notes or pointers. Use new lines for bullets.">${esc(category?.notes||'')}</textarea></div><div class="form-field"><label for="categoryColorField">Colour</label><input id="categoryColorField" type="color" value="${esc(category?.color||COLORS[tracker.categories.length%COLORS.length])}"></div>`,footer:`<button class="btn secondary" data-close-modal>Cancel</button><button class="btn primary" id="saveCategory">${edit?'Save changes':'Add category'}</button>`});
  $('#saveCategory').onclick=async()=>{const input=$('#categoryNameField');if(!input.reportValidity())return;if(edit){category.name=input.value.trim();category.notes=$('#categoryNotesField').value.trim();category.color=$('#categoryColorField').value}else tracker.categories.push({id:uid('cat'),name:input.value.trim(),notes:$('#categoryNotesField').value.trim(),color:$('#categoryColorField').value,topics:[]});tracker.updatedAt=now();await persistState();closeModal();render();toast(edit?'Category updated':'Category added')};
}
function categoryMenu(tracker,category){
  const i=tracker.categories.findIndex(c=>c.id===category.id);
  actionMenu(category.name,[
    {icon:'edit',label:'Edit category and notes',fn:()=>categoryDialog(category)},
    ...(i>0?[{icon:'arrowLeft',label:'Move category left',fn:async()=>{[tracker.categories[i-1],tracker.categories[i]]=[tracker.categories[i],tracker.categories[i-1]];await persistState();renderContent()}}]:[]),
    ...(i<tracker.categories.length-1?[{icon:'arrowRight',label:'Move category right',fn:async()=>{[tracker.categories[i+1],tracker.categories[i]]=[tracker.categories[i],tracker.categories[i+1]];await persistState();renderContent()}}]:[]),
    {icon:'trash',label:'Delete category',danger:true,fn:async()=>{const detail=category.topics.length?` It contains ${category.topics.length} topic${category.topics.length===1?'':'s'}.`:'';if(await confirmModal('Delete category?',`“${category.name}” will be permanently deleted.${detail}`)){tracker.categories=tracker.categories.filter(c=>c.id!==category.id);tracker.updatedAt=now();await persistState();render();toast('Category deleted')}}}
  ]);
}
function topicDialog(category,topic=null){
  const edit=!!topic;
  openModal({title:edit?'Edit topic':'New topic',subtitle:`Inside ${category.name}`,body:`<div class="form-field"><label for="topicNameField">Topic name</label><input id="topicNameField" maxlength="80" value="${esc(topic?.name||'')}" placeholder="e.g. Learn Pandas" required autofocus></div><div class="form-field"><label for="topicNotesField">Notes</label><textarea id="topicNotesField" rows="5" placeholder="Add notes, pointers, or next steps.">${esc(topic?.notes||'')}</textarea></div><label class="check-row"><span><b>Completed</b><br><small>Include this topic in progress</small></span><input id="topicCompleteField" type="checkbox" ${topic?.complete?'checked':''}></label>`,footer:`<button class="btn secondary" data-close-modal>Cancel</button><button class="btn primary" id="saveTopic">${edit?'Save changes':'Add topic'}</button>`});
  $('#saveTopic').onclick=async()=>{const input=$('#topicNameField');if(!input.reportValidity())return;if(edit){topic.name=input.value.trim();topic.notes=$('#topicNotesField').value.trim();topic.complete=$('#topicCompleteField').checked}else category.topics.push({id:uid('topic'),name:input.value.trim(),notes:$('#topicNotesField').value.trim(),complete:$('#topicCompleteField').checked});activeTracker().updatedAt=now();await persistState();closeModal();render();toast(edit?'Topic updated':'Topic added')};
}
function topicMenu(tracker,category,topic){
  const i=category.topics.findIndex(t=>t.id===topic.id);
  actionMenu(topic.name,[
    {icon:'edit',label:'Edit topic and notes',fn:()=>topicDialog(category,topic)},
    ...(tracker.categories.length>1?[{icon:'move',label:'Move to another category',fn:()=>moveTopicDialog(tracker,category,topic)}]:[]),
    ...(i>0?[{icon:'arrowUp',label:'Move topic up',fn:async()=>{[category.topics[i-1],category.topics[i]]=[category.topics[i],category.topics[i-1]];await persistState();renderContent()}}]:[]),
    ...(i<category.topics.length-1?[{icon:'arrowDown',label:'Move topic down',fn:async()=>{[category.topics[i+1],category.topics[i]]=[category.topics[i],category.topics[i+1]];await persistState();renderContent()}}]:[]),
    {icon:'trash',label:'Delete topic',danger:true,fn:async()=>{if(await confirmModal('Delete topic?',`“${topic.name}” and its notes will be permanently deleted.`)){category.topics=category.topics.filter(t=>t.id!==topic.id);tracker.updatedAt=now();await persistState();render();toast('Topic deleted')}}}
  ]);
}
function moveTopicDialog(tracker,source,topic){
  const targets=tracker.categories.filter(c=>c.id!==source.id);
  openModal({title:'Move topic',subtitle:`Move “${topic.name}” to another category.`,body:`<div class="form-field"><label for="moveTopicTarget">Destination category</label><select id="moveTopicTarget">${targets.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></div>`,footer:`<button class="btn secondary" data-close-modal>Cancel</button><button class="btn primary" id="moveTopicSave">Move topic</button>`});
  $('#moveTopicSave').onclick=async()=>{const dest=tracker.categories.find(c=>c.id===$('#moveTopicTarget').value);if(!dest)return;source.topics=source.topics.filter(t=>t.id!==topic.id);dest.topics.push(topic);tracker.updatedAt=now();await persistState();closeModal();render();toast(`Moved to ${dest.name}`)};
}

async function startRecording(){
  if(recording)return;
  if(!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder){toast('Voice notes are not supported in this browser. Try Safari over HTTPS.',4000);return;}
  try{
    const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}});
    const choices=['audio/mp4','audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus']; const mime=choices.find(x=>MediaRecorder.isTypeSupported?.(x));
    const recorder=mime?new MediaRecorder(stream,{mimeType:mime}):new MediaRecorder(stream); const session={recorder,stream,chunks:[],startedAt:Date.now(),timer:null,wantSave:false,mime:recorder.mimeType||mime||'audio/webm',chatId:activeChat()?.id};
    recording=session;
    recorder.ondataavailable=e=>{if(e.data?.size)session.chunks.push(e.data)};
    recorder.onerror=e=>{console.error(e);toast('Recording failed');stopRecording(false)};
    recorder.onstop=async()=>{
      clearInterval(session.timer);session.stream.getTracks().forEach(t=>t.stop());const shouldSave=session.wantSave;const duration=(Date.now()-session.startedAt)/1000;recording=null;if(state)renderContent();
      if(!shouldSave||!state)return;
      const blob=new Blob(session.chunks,{type:session.mime});if(!blob.size){toast('No audio was captured');return;}if(blob.size>MAX_VOICE_BYTES){toast('That voice note is too large. Keep recordings under about 5 minutes.',4500);return;}
      const audio=await blobToDataURL(blob);const chat=state.chats.find(c=>c.id===session.chatId);if(!chat)return;state.messages.push({id:uid('msg'),chatId:chat.id,kind:'voice',audio,duration:Math.round(duration),starred:false,createdAt:now()});chat.updatedAt=now();await persistState();render();toast('Voice note saved');
    };
    recorder.start(300);renderContent();session.timer=setInterval(()=>{const el=$('#recordTimer');if(el)el.textContent=formatDuration((Date.now()-session.startedAt)/1000);if(Date.now()-session.startedAt>=300000){session.wantSave=true;recorder.stop();toast('Five-minute limit reached — saving voice note')}} ,250);
  }catch(err){console.error(err);toast(err.name==='NotAllowedError'?'Microphone permission was not granted. Enable it in Safari settings.':'Could not start the microphone.',4200);}
}
function stopRecording(save){ if(!recording)return; recording.wantSave=save; if(recording.recorder.state!=='inactive')recording.recorder.stop(); }
function blobToDataURL(blob){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.readAsDataURL(blob)});}

function downloadBlob(content,filename,type='application/octet-stream'){
  const blob=content instanceof Blob?content:new Blob([content],{type}); const url=URL.createObjectURL(blob); const a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1200);
}
function downloadWorkspaceJSON(){ downloadBlob(JSON.stringify(state,null,2),`trackr-${new Date().toISOString().slice(0,10)}.json`,'application/json'); toast('JSON copy downloaded'); }
function chooseWorkspaceJSON(){
  const input=document.createElement('input');input.type='file';input.accept='application/json,.json';input.onchange=async()=>{if(!input.files[0])return;try{const parsed=migrateState(JSON.parse(await input.files[0].text()));if(!await confirmModal('Replace shared JSON?','This uploads the selected file and replaces the current workspace for every device.','Replace workspace'))return;state=parsed;await persistState('Replace trackr. data from JSON');render();toast('Shared JSON replaced')}catch(err){toast(err.message||'Invalid JSON file',4200)}};input.click();
}
async function refreshFromGitHub(){
  try{await saveChain;setSyncStatus('saving','Refreshing…');await loadRemoteState(false);render();setSyncStatus('saved','Up to date');toast('Latest GitHub data loaded')}catch(err){handleGitHubError(err,'Could not refresh from GitHub')}
}
async function resetRemoteWorkspace(){
  if(!await confirmModal('Reset shared workspace?','This replaces the GitHub JSON for every browser. Download a copy first if needed.','Reset everything'))return;
  state=initialState();await persistState('Reset trackr. workspace');render();toast('Shared workspace reset');
}
function installHelpDialog(){openModal({title:'Install trackr. on iPhone',subtitle:'The interface accounts for iPhone 15 and 16 screen sizes and safe areas.',body:`<ol class="install-steps" style="font-size:13px"><li>Open the deployed trackr. site in <strong>Safari</strong>.</li><li>Tap the <strong>Share</strong> button in Safari.</li><li>Scroll and choose <strong>Add to Home Screen</strong>.</li><li>Confirm the name, then tap <strong>Add</strong>.</li></ol><div class="storage-note">Voice notes require microphone permission. Safari asks only when you tap the record button, and the site must use HTTPS.</div>`,footer:`<button class="btn primary" data-close-modal>Got it</button>`});}
function globalSearchDialog(){
  openModal({title:'Search workspace',subtitle:'Find conversations, entries, trackers, categories and topics.',wide:true,body:`<div class="form-field"><input id="globalSearchInput" placeholder="Type to search everything" autofocus></div><div id="globalSearchResults"></div>`});
  const input=$('#globalSearchInput'),results=$('#globalSearchResults');
  const update=()=>{const q=input.value.trim().toLowerCase();if(!q){results.innerHTML='<div class="empty-side" style="color:#777">Start typing to search your private workspace.</div>';return;}let items=[];state.chats.filter(c=>c.name.toLowerCase().includes(q)).forEach(c=>items.push({type:'Conversation',name:c.name,fn:()=>{state.activeChatId=c.id;messageSearch='';closeModal();setMode('chats',true)}}));state.messages.filter(m=>(m.text||'voice note').toLowerCase().includes(q)).slice(0,20).forEach(m=>{const c=state.chats.find(x=>x.id===m.chatId);items.push({type:c?.name||'Conversation',name:m.kind==='voice'?'Voice note':preview(m.text),fn:()=>{state.activeChatId=m.chatId;messageSearch=q;closeModal();setMode('chats',true)}})});state.trackers.forEach(t=>{if(t.name.toLowerCase().includes(q))items.push({type:'Tracker',name:t.name,fn:()=>{state.activeTrackerId=t.id;closeModal();setMode('trackers',true)}});t.categories.forEach(c=>{if(c.name.toLowerCase().includes(q)||(c.notes||'').toLowerCase().includes(q))items.push({type:`${t.name} · Category`,name:c.name,fn:()=>{state.activeTrackerId=t.id;closeModal();setMode('trackers',true)}});c.topics.forEach(x=>{if(x.name.toLowerCase().includes(q)||(x.notes||'').toLowerCase().includes(q))items.push({type:`${t.name} · ${c.name}`,name:x.name,fn:()=>{state.activeTrackerId=t.id;closeModal();setMode('trackers',true)}})})})});window.__searchActions=items.map(x=>x.fn);results.innerHTML=items.length?`<div class="menu-list">${items.slice(0,30).map((x,i)=>`<button class="menu-item" data-search-result="${i}"><span class="menu-icon">${icon('search')}</span><span><b>${esc(x.name)}</b><br><small>${esc(x.type)}</small></span></button>`).join('')}</div>`:'<div class="empty-side" style="color:#777">No results found.</div>';};input.oninput=update;update();
}

function handleAction(action,target){
  const id=target.dataset.id;
  if(action==='new-chat')chatDialog();
  else if(action==='select-chat'){if(recording){stopRecording(false);toast('Voice recording cancelled')}state.activeChatId=id;messageSearch='';setMode('chats',true);}
  else if(action==='toggle-archived'){showArchived=!showArchived;searchText='';renderSidebar();}
  else if(action==='pin-chat'){const c=state.chats.find(x=>x.id===id);if(c){c.pinned=!c.pinned;c.updatedAt=now();persistState();render();}}
  else if(action==='chat-menu'){const c=state.chats.find(x=>x.id===id);if(c)chatMenu(c);}
  else if(action==='search-messages')searchMessagesDialog();
  else if(action==='message-menu'){const m=state.messages.find(x=>x.id===id);if(m)messageMenu(m);}
  else if(action==='voice-record')startRecording();
  else if(action==='voice-cancel')stopRecording(false);
  else if(action==='voice-send')stopRecording(true);
  else if(action==='composer-tip')toast('Press Enter to save. Use Shift + Enter for a new line.');
  else if(action==='new-tracker')trackerDialog();
  else if(action==='select-tracker'){state.activeTrackerId=id;setMode('trackers',true);}
  else if(action==='tracker-menu'){const t=state.trackers.find(x=>x.id===id);if(t)trackerMenu(t);}
  else if(action==='new-category')categoryDialog();
  else if(action==='category-menu'){const t=activeTracker(),c=t?.categories.find(x=>x.id===id);if(c)categoryMenu(t,c);}
  else if(action==='new-topic'){const c=activeTracker()?.categories.find(x=>x.id===id);if(c)topicDialog(c);}
  else if(action==='topic-menu'){const t=activeTracker(),c=t?.categories.find(x=>x.id===target.dataset.category),topic=c?.topics.find(x=>x.id===id);if(topic)topicMenu(t,c,topic);}
  else if(action==='mobile-back')$('#app').classList.remove('mobile-detail');
  else if(action==='lock')lockApp();
  else if(action==='download-json')downloadWorkspaceJSON();
  else if(action==='import-json')chooseWorkspaceJSON();
  else if(action==='refresh-cloud')refreshFromGitHub();
  else if(action==='reset-cloud')resetRemoteWorkspace();
}

document.addEventListener('visibilitychange',()=>{
  if(document.hidden){ hiddenAt=Date.now(); if(recording)stopRecording(false); }
  else if(state && hiddenAt && Date.now()-hiddenAt>60000){ lockApp(); toast('Reconnect to GitHub after leaving trackr. in the background'); }
});
window.addEventListener('pagehide',()=>{ githubToken=null; });
window.addEventListener('pageshow',e=>{ if(e.persisted && state && !githubToken)lockApp(); });

// Static UI events
$$('[data-reveal]').forEach(btn=>btn.onclick=()=>{const input=$('#'+btn.dataset.reveal);const show=input.type==='password';input.type=show?'text':'password';btn.textContent=show?'Hide':'Show'});
$('#githubAuthForm').addEventListener('submit',async e=>{e.preventDefault();await connectGitHub(e.currentTarget)});
$('#lockButton').onclick=lockApp;$('#openSettings').onclick=()=>setMode('settings',true);$('#installHelp').onclick=installHelpDialog;$('#globalSearchButton').onclick=globalSearchDialog;$('#themeToggleDesktop').onclick=toggleTheme;$('#themeToggleMobile').onclick=toggleTheme;

document.addEventListener('click',e=>{
  const close=e.target.closest('[data-close-modal]');if(close){closeModal();return;}
  const nav=e.target.closest('[data-nav]');if(nav){searchText='';setMode(nav.dataset.nav,false);return;}
  const action=e.target.closest('[data-action]');if(action){handleAction(action.dataset.action,action);return;}
  const menu=e.target.closest('[data-menu-action]');if(menu){const fn=menuActions[Number(menu.dataset.menuAction)]?.fn;closeModal();fn?.();return;}
  const search=e.target.closest('[data-search-result]');if(search){window.__searchActions?.[Number(search.dataset.searchResult)]?.();return;}
});
document.addEventListener('change',e=>{const el=e.target;if(el.matches('[data-action="toggle-topic"]')){const c=activeTracker()?.categories.find(x=>x.id===el.dataset.category),t=c?.topics.find(x=>x.id===el.dataset.id);if(t){t.complete=el.checked;activeTracker().updatedAt=now();persistState('Update topic completion');renderContent();}}});
document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'&&state){e.preventDefault();globalSearchDialog()}if(e.key==='Escape'&&$('#modalRoot').children.length)closeModal();});

boot();
})();
