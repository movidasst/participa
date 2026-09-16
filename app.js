(() => {
  'use strict';
  const SUPABASE_URL = 'https://lfdmbkzghnwvsapxypvt.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_bRnkA6PA8-v073nrw9zxiQ_8rVGiOn1';
  const STORAGE_KEY = 'movidasst_participa_session';
  const DEFAULT_AVATAR = 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><rect width="160" height="160" rx="80" fill="#edf3f7"/><circle cx="80" cy="62" r="28" fill="#9db0bf"/><path d="M31 142c5-30 23-45 49-45s44 15 49 45" fill="#9db0bf"/></svg>`);
  const $ = id => document.getElementById(id);
  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false} });
  const state = { token:null, data:null, current:null, channel:null };

  function esc(v){ return String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c])); }
  function fmtDate(v){ if(!v) return 'Sin fecha'; const d=new Date(v); if(Number.isNaN(d.getTime())) return ''; return new Intl.DateTimeFormat('es-CL',{day:'2-digit',month:'short',year:'numeric'}).format(d); }
  function toast(msg){ const el=$('toast'); el.textContent=msg; el.classList.add('show'); clearTimeout(toast.t); toast.t=setTimeout(()=>el.classList.remove('show'),2800); }
  async function rpc(name,args={}){ const {data,error}=await client.rpc(name,args); if(error) throw error; return data; }
  function saveToken(token){ state.token=token; localStorage.setItem(STORAGE_KEY,token); }
  function clearToken(){ state.token=null; state.data=null; localStorage.removeItem(STORAGE_KEY); }
  function statusBadge(status){ const cls=status==='active'?'active':status==='closed'?'closed':'scheduled'; const label=status==='active'?'Activa':status==='closed'?'Cerrada':'Programada'; return `<span class="badge ${cls}">${label}</span>`; }

  function showLogin(message=''){
    $('appView').classList.add('hidden'); $('loginView').classList.remove('hidden');
    if(message){ $('loginError').textContent=message; $('loginError').classList.remove('hidden'); } else $('loginError').classList.add('hidden');
  }
  function showApp(){ $('loginView').classList.add('hidden'); $('appView').classList.remove('hidden'); }

  async function login(ev){
    ev.preventDefault();
    const btn=$('loginBtn'); const documento=$('documento').value.trim(); const codigo=$('codigo').value.trim().toUpperCase();
    $('loginError').classList.add('hidden'); btn.disabled=true; btn.innerHTML='<i class="fa-solid fa-spinner fa-spin"></i> Validando…';
    try{
      const data=await rpc('participa_login',{p_documento:documento,p_codigo:codigo});
      if(!data?.ok) throw new Error(data?.message||'No fue posible ingresar.');
      saveToken(data.token); await bootstrap(); toast(`Bienvenido/a, ${data.perfil?.nombre?.split(' ')[0]||'integrante'}`);
      $('codigo').value='';
    }catch(err){ console.error(err); $('loginError').textContent=err.message||'No fue posible ingresar.'; $('loginError').classList.remove('hidden'); }
    finally{ btn.disabled=false; btn.innerHTML='<i class="fa-solid fa-right-to-bracket"></i> Ingresar'; }
  }

  async function bootstrap(){
    if(!state.token){ showLogin(); return; }
    try{
      const data=await rpc('participa_bootstrap',{p_token:state.token});
      if(!data?.ok){ clearToken(); showLogin(data?.message||'Tu sesión venció.'); return; }
      state.data=data; showApp(); renderHeader(); renderHero(); renderConsultas(); renderResultadosIndex(); renderMiPerfil();
    }catch(err){ console.error(err); showLogin('No pudimos cargar PARTICIPA. Intenta nuevamente.'); }
  }

  function renderHeader(){
    const p=state.data.perfil||{}; $('userAvatar').src=p.foto_url||DEFAULT_AVATAR; $('userAvatar').onerror=()=>{$('userAvatar').src=DEFAULT_AVATAR};
    $('adminLink').classList.remove('hidden');
  }
  function campaign(){ return (state.data.campanas||[]).find(c=>c.estado==='active') || (state.data.campanas||[])[0] || {}; }
  function renderHero(){
    const c=campaign(); $('heroEyebrow').innerHTML=`<i class="fa-solid fa-people-group"></i> ${esc(c.eyebrow||'PARTICIPA · LA MOVIDA')}`;
    $('heroTitle').textContent=c.titulo||'PARTICIPA'; $('heroSubtitle').textContent=c.subtitulo||'Tu voz también construye la comunidad'; $('heroDescription').textContent=c.descripcion||'Consulta, vota y participa.';
    const qs=state.data.consultas||[]; $('kpiActive').textContent=qs.filter(q=>q.estado==='active').length; $('kpiAnswered').textContent=qs.filter(q=>q.respondida).length; $('kpiPeople').textContent=qs.reduce((a,q)=>a+Number(q.participantes||0),0);
  }

  function octoberCard(q){
    return `<article class="festival-card"><div class="festival-main"><div class="festival-kicker">${statusBadge(q.estado)}<span>OCTUBRE FEST 2026</span></div><h3>Construyamos juntos<br>el Octubre Fest</h3><p>Cuéntanos qué te gustaría hacer y ayúdanos a preparar las actividades de la comunidad.</p><div class="festival-meta"><span><i class="fa-solid fa-users"></i> ${Number(q.participantes||0)} participantes</span>${q.puntos_habilitados?`<span><i class="fa-solid fa-star"></i> ${q.puntos_valor} XP por participar</span>`:''}${q.cierra_at?`<span><i class="fa-regular fa-calendar"></i> Hasta ${esc(fmtDate(q.cierra_at))}</span>`:''}</div><div class="festival-actions">${q.estado==='active'?`<button class="btn teal" data-open="${q.id}">${q.respondida?'Revisar mi participación':'Quiero participar'} <i class="fa-solid fa-arrow-right"></i></button>`:''}<button class="btn ghost" data-result="${q.id}">Ver resultados</button></div>${q.respondida?'<p class="festival-saved"><i class="fa-solid fa-circle-check"></i> Tu participación está registrada.</p>':''}</div><div class="festival-route"><p class="route-caption">Una consulta · Tres pasos</p><div class="route-item"><span>01</span><div><strong>Las actividades</strong><p>Elige hasta tres dinámicas y propón tu propia idea.</p></div></div><div class="route-item"><span>02</span><div><strong>Los temas</strong><p>Cuéntanos sobre qué quieres aprender y debatir.</p></div></div><div class="route-item"><span>03</span><div><strong>Tu disponibilidad</strong><p>Define el tiempo y la modalidad que te acomodan.</p></div></div></div></article>`;
  }
  function card(q){
    if(q.slug==='actividades-octubre-fest')return octoberCard(q);
    const action=q.estado==='active'?`<button class="btn teal" data-open="${q.id}"><i class="fa-solid fa-check-to-slot"></i>${q.respondida?'Ver / cambiar':'Participar'}</button>`:`<button class="btn ghost" data-result="${q.id}"><i class="fa-solid fa-chart-column"></i>Resultados</button>`;
    return `<article class="card"><div class="card-accent"></div><div class="card-body"><div class="card-top"><div><span class="chip"><i class="fa-solid fa-users"></i>${Number(q.participantes||0)} participantes</span><h3>${esc(q.titulo)}</h3></div>${statusBadge(q.estado)}</div><p>${esc(q.resumen||'Consulta de la comunidad.')}</p><div class="chips">${q.puntos_habilitados?`<span class="chip"><i class="fa-solid fa-star"></i>${q.puntos_valor} XP</span>`:''}${q.respondida?'<span class="chip"><i class="fa-solid fa-circle-check"></i>Ya participaste</span>':''}${q.cierra_at?`<span class="chip"><i class="fa-regular fa-calendar"></i>Hasta ${esc(fmtDate(q.cierra_at))}</span>`:''}</div><div class="card-actions">${action}<button class="btn soft" data-result="${q.id}"><i class="fa-solid fa-chart-simple"></i>Ver resultados</button></div></div></article>`;
  }
  function renderConsultas(){
    const list=(state.data.consultas||[]).filter(q=>q.estado!=='draft'&&q.estado!=='archived'); $('consultasGrid').innerHTML=list.length?list.map(card).join(''):`<div class="empty" style="grid-column:1/-1"><i class="fa-regular fa-comments"></i><div><strong>No hay consultas disponibles.</strong><br>Vuelve pronto.</div></div>`;
  }
  function renderResultadosIndex(){
    const list=(state.data.consultas||[]).filter(q=>q.estado!=='draft'&&q.estado!=='archived'); $('resultadosGrid').innerHTML=list.length?list.map(q=>`<article class="card"><div class="card-body"><div class="card-top"><div><span class="chip">${esc(q.tipo)}</span><h3>${esc(q.titulo)}</h3></div>${statusBadge(q.estado)}</div><p>${q.respondida?'Puedes consultar los resultados disponibles.':'Algunas consultas muestran resultados después de votar o al cerrar.'}</p><div class="card-actions"><button class="btn soft" data-result="${q.id}"><i class="fa-solid fa-chart-column"></i>Abrir resultados</button></div></div></article>`).join(''):'<div class="empty">Sin resultados todavía.</div>';
  }
  function renderMiPerfil(){
    const p=state.data.perfil||{}; const qs=state.data.consultas||[]; const done=qs.filter(q=>q.respondida); const xp=done.reduce((a,q)=>a+(q.puntos_habilitados?Number(q.puntos_valor||0):0),0);
    $('miPanel').innerHTML=`<div style="display:flex;gap:14px;align-items:center"><img class="avatar" style="width:64px;height:64px" src="${esc(p.foto_url||DEFAULT_AVATAR)}" onerror="this.src='${esc(DEFAULT_AVATAR)}'" alt=""><div><h3 style="margin:0;color:var(--navy)">${esc(p.nombre||'Integrante')}</h3><p style="margin:4px 0 0;color:var(--muted)">${esc(p.pais||'La Movida de SST Plus')}</p></div></div><div class="chips" style="margin-top:18px"><span class="chip"><i class="fa-solid fa-check"></i>${done.length} consultas respondidas</span><span class="chip"><i class="fa-solid fa-star"></i>${xp} XP potenciales en PARTICIPA</span></div><p class="form-note" style="margin-top:14px">Los XP otorgados por PARTICIPA se integran al mismo sistema de puntos de Estudia y del ranking de La Movida.</p>`;
  }

  function setView(view){
    ['consultas','resultados','miperfil'].forEach(v=>$(`view-${v}`).classList.toggle('active',v===view)); document.querySelectorAll('[data-nav]').forEach(b=>b.classList.toggle('active',b.dataset.nav===view)); window.scrollTo({top:0,behavior:'smooth'});
  }

  async function openConsulta(id){
    try{
      const data=await rpc('participa_consulta_detalle',{p_token:state.token,p_consulta:id}); if(!data?.ok) throw new Error(data?.message||'Consulta no disponible.');
      state.current=data; $('modalTitle').textContent=data.consulta.titulo; $('modalSubtitle').textContent=data.consulta.resumen||data.consulta.campana_titulo||'';
      const editable=data.consulta.estado==='active' && (!data.respondida || data.consulta.permitir_editar);
      $('modalBody').innerHTML=`${data.consulta.descripcion?`<p style="color:var(--muted);line-height:1.55;margin-top:0">${esc(data.consulta.descripcion)}</p>`:''}<form id="voteForm">${data.consulta.id==='c89f12cd-b0f3-4f89-a51b-f6368383d640' && editable ? renderWizard(data.preguntas) : data.preguntas.map(renderQuestion).join('')}${editable?`<button class="btn primary" type="submit" style="width:100%"><i class="fa-solid fa-paper-plane"></i>${data.respondida?'Actualizar mi respuesta':'Enviar mi participación'}</button>`:`<div class="panel"><strong>Tu respuesta ya fue registrada.</strong></div>`}</form><div id="inlineResults" style="margin-top:18px"></div>`;
      $('consultaModal').classList.remove('hidden'); $('consultaModal').setAttribute('aria-hidden','false');
      if(editable){ $('voteForm').addEventListener('submit',submitVote);if(data.consulta.id==='c89f12cd-b0f3-4f89-a51b-f6368383d640')showWizardStep(0); } if(data.respondida){ await loadResults(id,'inlineResults',false); subscribeResults(id); }
    }catch(err){ console.error(err); toast(err.message||'No fue posible abrir la consulta.'); }
  }

  function renderWizard(questions){
    const groups=[questions.slice(0,2),questions.slice(2,3),questions.slice(3)];
    state.wizardStep=0;
    return `<div class="wizard-progress" aria-label="Avance de la consulta"><span data-wizard-indicator="0">1. Actividades</span><span data-wizard-indicator="1">2. Temas</span><span data-wizard-indicator="2">3. Disponibilidad</span></div><p id="wizardStatus" class="wizard-status" role="status"></p>${groups.map((qs,i)=>`<div data-wizard-step="${i}" class="${i?'hidden':''}">${qs.map(renderQuestion).join('')}</div>`).join('')}<div class="wizard-actions"><button id="wizardBack" class="btn ghost" type="button" data-wizard-back>Anterior</button><button id="wizardNext" class="btn teal" type="button" data-wizard-next>Siguiente paso <i class="fa-solid fa-arrow-right"></i></button></div>`;
  }
  function showWizardStep(step){
    state.wizardStep=step;
    $('consultaModal').querySelector('.modal-card').scrollTop=0;
    document.querySelectorAll('[data-wizard-step]').forEach(el=>el.classList.toggle('hidden',Number(el.dataset.wizardStep)!==step));
    document.querySelectorAll('[data-wizard-indicator]').forEach(el=>{el.classList.toggle('current',Number(el.dataset.wizardIndicator)===step);el.classList.toggle('complete',Number(el.dataset.wizardIndicator)<step);});
    $('wizardBack').disabled=step===0;$('wizardNext').classList.toggle('hidden',step===2);
    $('voteForm').querySelector('button[type="submit"]').classList.toggle('hidden',step!==2);
    $('wizardStatus').textContent=`Paso ${step+1} de 3 · ${['Tus actividades favoritas','Los temas que te interesan','Cómo prefieres participar'][step]}`;
  }
  function validateWizardStep(step){
    const groups=[state.current.preguntas.slice(0,2),state.current.preguntas.slice(2,3),state.current.preguntas.slice(3)];
    for(const q of groups[step]){
      if(['single','multiple','yes_no'].includes(q.tipo)){
        const inputs=[...$('voteForm').querySelectorAll(`[name="q_${q.id}"]:checked`)];
        if(q.requerida&&inputs.length<Math.max(1,Number(q.min_selecciones||0))){toast('Selecciona una opción para continuar.');return false;}
        if(q.max_selecciones&&inputs.length>Number(q.max_selecciones)){toast(`Puedes elegir hasta ${q.max_selecciones} opciones.`);return false;}
      }
    }
    return true;
  }
  function renderQuestion(q){
    const r=q.respuesta||{}; const selected=new Set((r.opcion_ids||[]).map(String)); let body='';
    if(['single','multiple','yes_no'].includes(q.tipo)){
      const inputType=q.tipo==='multiple'?'checkbox':'radio'; body=`<div class="options">${q.opciones.map(o=>`<label class="option"><input type="${inputType}" name="q_${q.id}" value="${o.id}" ${selected.has(String(o.id))?'checked':''}><span><strong>${esc(o.etiqueta)}</strong>${o.descripcion?`<span>${esc(o.descripcion)}</span>`:''}</span></label>`).join('')}</div>`;
    }else if(q.tipo==='text') body=`<div class="field"><textarea name="q_${q.id}" maxlength="2000" placeholder="Escribe tu aporte…">${esc(r.texto||'')}</textarea></div>`;
    else if(q.tipo==='scale'){ const min=Number(q.escala_min||1),max=Number(q.escala_max||5); body=`<div class="field"><input type="range" name="q_${q.id}" min="${min}" max="${max}" value="${Number(r.numero||min)}" oninput="this.nextElementSibling.textContent=this.value"><strong style="text-align:center">${Number(r.numero||min)}</strong></div>`; }
    return `<section class="question" data-question="${q.id}" data-type="${q.tipo}" data-max="${q.max_selecciones||''}"><h4>${esc(q.pregunta)}${q.requerida?' *':''}</h4>${q.ayuda?`<small>${esc(q.ayuda)}</small>`:''}${body}</section>`;
  }

  async function submitVote(ev){
    ev.preventDefault();
    if($('wizardStatus')&&state.wizardStep<2){if(validateWizardStep(state.wizardStep))showWizardStep(state.wizardStep+1);return;}
    if($('wizardStatus')){for(let i=0;i<3;i++){if(!validateWizardStep(i)){showWizardStep(i);return;}}}
    const data=state.current; const form=ev.currentTarget; const answers=[];
    for(const q of data.preguntas){
      if(['single','multiple','yes_no'].includes(q.tipo)){
        const values=[...form.querySelectorAll(`[name="q_${q.id}"]:checked`)].map(i=>i.value); if(q.tipo==='multiple'&&q.max_selecciones&&values.length>Number(q.max_selecciones)){ toast(`Máximo ${q.max_selecciones} opciones en: ${q.pregunta}`); return; } answers.push({pregunta_id:q.id,opcion_ids:values});
      }else if(q.tipo==='text') answers.push({pregunta_id:q.id,texto:form.querySelector(`[name="q_${q.id}"]`)?.value||''});
      else if(q.tipo==='scale') answers.push({pregunta_id:q.id,numero:Number(form.querySelector(`[name="q_${q.id}"]`)?.value)});
    }
    const btn=form.querySelector('button[type="submit"]'); btn.disabled=true; btn.innerHTML='<i class="fa-solid fa-spinner fa-spin"></i> Guardando…';
    try{
      const res=await rpc('participa_enviar_respuesta',{p_token:state.token,p_consulta:data.consulta.id,p_respuestas:answers}); if(!res?.ok) throw new Error(res?.message||'No se pudo guardar.');
      toast(res.puntos_otorgados>0?`Participación guardada · +${res.puntos_otorgados} XP`:'Participación actualizada'); await bootstrap();
      if(state.channel){client.removeChannel(state.channel);state.channel=null;}
      $('modalTitle').textContent='¡Gracias por participar!';$('modalSubtitle').textContent='Tu voz ayuda a construir el Octubre Fest.';
      $('modalBody').innerHTML=`<div class="participation-done"><i class="fa-solid fa-circle-check"></i><h3>Tu participación quedó registrada</h3><p>Ya puedes conocer las preferencias de la comunidad. Puedes volver y editar tu respuesta mientras la consulta esté abierta.</p>${res.puntos_otorgados>0?`<span class="chip">+${res.puntos_otorgados} XP</span>`:''}<div class="festival-actions"><button class="btn teal" data-result="${data.consulta.id}">Ver resultados</button><button class="btn ghost" type="button" data-close-modal>Listo</button></div></div>`;
    }catch(err){ console.error(err); toast(err.message||'No se pudo guardar la respuesta.'); }
    finally{ if(btn){btn.disabled=false;btn.innerHTML='<i class="fa-solid fa-paper-plane"></i> Enviar mi participación';} }
  }

  async function loadResults(id,target='modalBody',wrap=true){
    try{
      const data=await rpc('participa_resultados',{p_token:state.token,p_consulta:id});
      if(!data?.ok){ const html=`<div class="panel"><strong><i class="fa-solid fa-lock"></i> ${esc(data?.message||'Resultados no disponibles todavía.')}</strong></div>`; if(wrap){ $('modalTitle').textContent='Resultados'; $('modalSubtitle').textContent=''; $(target).innerHTML=html; $('consultaModal').classList.remove('hidden'); } else $(target).innerHTML=html; return; }
      const html=`<div class="panel" style="margin-bottom:14px"><span class="live-dot">En vivo</span><h3 style="margin:8px 0 0;color:var(--navy)">${data.participantes} participantes</h3></div>${data.preguntas.map(resultQuestion).join('')}`;
      if(wrap){ $('modalTitle').textContent='Resultados de la comunidad'; $('modalSubtitle').textContent='Se actualizan cuando se registra una nueva participación.'; $(target).innerHTML=`<div class="results">${html}</div>`; $('consultaModal').classList.remove('hidden'); subscribeResults(id,()=>loadResults(id,target,wrap)); }
      else $(target).innerHTML=`<div class="results"><h3 style="color:var(--navy)">Resultados</h3>${html}</div>`;
    }catch(err){ console.error(err); toast('No fue posible cargar los resultados.'); }
  }
  function resultQuestion(q){
    if(['single','multiple','yes_no'].includes(q.tipo)) return `<div class="question"><h4>${esc(q.pregunta)}</h4>${q.opciones.map(o=>`<div class="result-row"><div class="result-head"><span>${esc(o.etiqueta)}</span><span>${o.porcentaje}% · ${o.votos}</span></div><div class="bar"><span style="width:${Math.max(0,Math.min(100,Number(o.porcentaje||0)))}%"></span></div></div>`).join('')}</div>`;
    if(q.tipo==='scale') return `<div class="question"><h4>${esc(q.pregunta)}</h4><div class="panel" style="box-shadow:none"><strong style="font-size:1.5rem;color:var(--teal)">${q.promedio??'—'}</strong> / ${q.max}</div></div>`;
    return `<div class="question"><h4>${esc(q.pregunta)}</h4><p class="form-note">${q.respuestas} respuestas abiertas. Se reservan para análisis y moderación.</p></div>`;
  }

  function subscribeResults(id,callback){
    if(state.channel){ client.removeChannel(state.channel); state.channel=null; }
    state.channel=client.channel(`participa-${id}-${Date.now()}`).on('postgres_changes',{event:'INSERT',schema:'public',table:'participa_resultado_eventos',filter:`consulta_id=eq.${id}`},()=>{ callback?callback():loadResults(id,'inlineResults',false); bootstrap(); }).subscribe();
  }
  function closeModal(){ $('consultaModal').classList.add('hidden'); $('consultaModal').setAttribute('aria-hidden','true'); if(state.channel){client.removeChannel(state.channel);state.channel=null;} state.current=null; }
  async function logout(){ try{ if(state.token) await rpc('participa_logout',{p_token:state.token}); }catch(_){} clearToken(); closeModal(); showLogin(); }

  document.addEventListener('click',e=>{
    if(e.target.closest('[data-wizard-next]')&&validateWizardStep(state.wizardStep))showWizardStep(state.wizardStep+1);
    if(e.target.closest('[data-wizard-back]'))showWizardStep(Math.max(0,state.wizardStep-1));
    if(e.target.closest('[data-close-modal]'))closeModal();
    const nav=e.target.closest('[data-nav]'); if(nav){ e.preventDefault(); setView(nav.dataset.nav); }
    const open=e.target.closest('[data-open]'); if(open) openConsulta(open.dataset.open);
    const result=e.target.closest('[data-result]'); if(result) loadResults(result.dataset.result);
  });
  $('loginForm').addEventListener('submit',login); $('logoutBtn').addEventListener('click',logout); $('modalClose').addEventListener('click',closeModal); $('consultaModal').addEventListener('click',e=>{if(e.target===$('consultaModal'))closeModal();});
  window.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal();});
  state.token=localStorage.getItem(STORAGE_KEY); bootstrap();
})();
