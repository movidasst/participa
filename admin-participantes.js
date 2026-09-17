(() => {
  'use strict';

  const SUPABASE_URL='https://lfdmbkzghnwvsapxypvt.supabase.co';
  const SUPABASE_KEY='sb_publishable_bRnkA6PA8-v073nrw9zxiQ_8rVGiOn1';
  const client=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{storageKey:'movidasst_participa_admin_auth',persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
  const $=id=>document.getElementById(id);
  let currentId=null;

  function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));}
  function normalize(v){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();}
  function fmtDate(v){if(!v)return'';const d=new Date(v);return Number.isNaN(d.getTime())?'':new Intl.DateTimeFormat('es-CL',{dateStyle:'medium',timeStyle:'short'}).format(d);}
  async function rpc(name,args={}){const {data,error}=await client.rpc(name,args);if(error)throw error;return data;}

  function answerLabel(a){
    if(!a)return 'Sin respuesta';
    const opts=(a.opciones||[]).map(o=>o.etiqueta).filter(Boolean);
    if(opts.length)return opts.join(', ');
    if(a.numero!==null&&a.numero!==undefined&&a.numero!=='')return String(a.numero);
    if(a.texto)return a.texto;
    return 'Sin respuesta';
  }

  function optionVoters(participants,questionId,optionId){
    return participants.filter(p=>(p.respuestas||[]).some(a=>a.pregunta_id===questionId&&(a.opciones||[]).some(o=>o.id===optionId)));
  }

  function renderQuestion(q,participants){
    const number=v=>Number.isFinite(Number(v))?Number(v):0;
    if(['single','multiple','yes_no'].includes(q.tipo)){
      return `<section class="question"><h4>${esc(q.pregunta)}</h4><p class="form-note">${number(q.respuestas)} integrante(s) respondieron esta pregunta.${q.tipo==='multiple'?' Se podían elegir varias opciones; los porcentajes pueden sumar más de 100 %.':''}</p>${(q.opciones||[]).map(o=>{
        const voters=optionVoters(participants,q.id,o.id);
        return `<div class="result-row"><div class="result-head" style="flex-wrap:wrap"><span style="overflow-wrap:anywhere">${esc(o.etiqueta)}</span><span>${number(o.votos)} voto(s) · ${number(o.porcentaje)} %</span></div><div class="bar"><span style="width:${Math.max(0,Math.min(100,number(o.porcentaje)))}%"></span></div>${voters.length?`<details style="margin-top:10px"><summary style="cursor:pointer;color:var(--teal);font-weight:800;font-size:.8rem">Ver quién votó (${voters.length})</summary><div class="chips" style="margin-top:8px">${voters.map(v=>`<span class="chip"><i class="fa-solid fa-user"></i>${esc(v.nombre||'Integrante')}</span>`).join('')}</div></details>`:`<p class="form-note" style="margin:8px 0 0">Sin votos en esta opción.</p>`}</div>`;
      }).join('')}</section>`;
    }
    if(q.tipo==='scale')return `<section class="question"><h4>${esc(q.pregunta)}</h4><p style="font-size:1.5rem;color:var(--teal);font-weight:800">Promedio: ${q.promedio==null?'Sin respuestas':esc(q.promedio)}</p><p class="form-note">Escala de ${esc(q.min)} a ${esc(q.max)} · ${number(q.respuestas)} respuestas.</p></section>`;
    return `<section class="question"><h4>${esc(q.pregunta)}</h4><p>${number(q.respuestas)} respuesta(s) abierta(s).</p><p class="form-note">El detalle por integrante aparece más abajo y también puedes usar «Leer respuestas abiertas».</p></section>`;
  }

  function participantCard(p){
    const answers=(p.respuestas||[]).map(a=>`<div style="padding:10px 0;border-top:1px solid var(--line)"><strong style="display:block;color:var(--navy);font-size:.82rem">${esc(a.pregunta)}</strong><span style="display:block;margin-top:4px;white-space:pre-wrap;overflow-wrap:anywhere;color:var(--ink);font-size:.86rem">${esc(answerLabel(a))}</span></div>`).join('');
    const avatar=p.foto_url?`<img src="${esc(p.foto_url)}" alt="" style="width:44px;height:44px;border-radius:50%;object-fit:cover;background:#eef2f6;flex:0 0 auto">`:`<div style="width:44px;height:44px;border-radius:50%;display:grid;place-items:center;background:#eef7f8;color:var(--teal);flex:0 0 auto"><i class="fa-solid fa-user"></i></div>`;
    return `<article class="admin-item admin-participant-card" data-participant-search="${esc(normalize([p.nombre,p.pais].join(' ')))}"><div class="admin-item-head" style="flex-wrap:wrap;align-items:center"><div style="display:flex;gap:10px;align-items:center;min-width:0">${avatar}<div style="min-width:0"><h3 style="overflow-wrap:anywhere">${esc(p.nombre||'Integrante')}</h3><p>${esc(p.pais||'País no indicado')}</p></div></div><time class="form-note" datetime="${esc(p.updated_at||p.submitted_at||'')}">${esc(fmtDate(p.updated_at||p.submitted_at))}</time></div><details style="margin-top:12px"><summary style="cursor:pointer;color:var(--teal);font-weight:900">Ver sus respuestas</summary><div style="margin-top:8px">${answers||'<p class="form-note">No hay respuestas registradas.</p>'}</div></details></article>`;
  }

  function renderParticipants(participants){
    if(!participants.length)return '<section class="question"><h4>Quiénes participaron</h4><div class="empty" style="margin-top:10px">Todavía no hay participantes registrados.</div></section>';
    return `<section class="question" style="background:#fff"><div class="section-head" style="align-items:center;flex-wrap:wrap;margin-bottom:10px"><div><h4 style="font-size:1.1rem;margin:0">Quiénes participaron</h4><p class="form-note" style="margin:5px 0 0">Solo administración puede ver esta identificación y el detalle individual de los votos.</p></div><span class="chip">${participants.length} integrante(s)</span></div><div class="field" style="margin-top:10px"><label for="adminParticipantSearch">Buscar participante</label><input id="adminParticipantSearch" type="search" placeholder="Nombre o país"></div><p id="adminParticipantSummary" class="form-note" style="margin:10px 0">${participants.length} participante(s).</p><div id="adminParticipantList" class="admin-list">${participants.map(participantCard).join('')}</div></section>`;
  }

  function bindParticipantSearch(){
    const input=$('adminParticipantSearch');if(!input)return;
    input.addEventListener('input',()=>{
      const q=normalize(input.value.trim());let visible=0;
      document.querySelectorAll('.admin-participant-card').forEach(card=>{const show=!q||card.dataset.participantSearch.includes(q);card.classList.toggle('hidden',!show);if(show)visible++;});
      const s=$('adminParticipantSummary');if(s)s.textContent=`${visible} participante(s) mostrado(s).`;
    });
  }

  async function openDetailedResults(id){
    currentId=id;
    const modal=$('adminResultsModal'),body=$('adminResultsBody'),refresh=$('adminResultsRefresh');
    if(!modal||!body)return;
    const card=modal.querySelector('.modal-card');if(card)card.style.width='min(980px,100%)';
    const consultation=document.querySelector(`[data-admin-results="${CSS.escape(id)}"]`)?.closest('.admin-item')?.querySelector('h3')?.textContent;
    $('adminResultsTitle').textContent=consultation||'Resultados de la encuesta';
    $('adminResultsSubtitle').textContent='Resultados y detalle de participación · visible solo para administración.';
    modal.classList.remove('hidden');modal.setAttribute('aria-hidden','false');
    body.innerHTML='<div class="empty">Cargando resultados y participantes…</div>';
    if(refresh)refresh.disabled=true;
    try{
      const [results,detail]=await Promise.all([
        rpc('participa_resultados',{p_token:null,p_consulta:id}),
        rpc('participa_admin_participantes',{p_consulta:id})
      ]);
      if(currentId!==id)return;
      if(!results?.ok)throw new Error(results?.message||'No se pudieron cargar los resultados.');
      if(!detail?.ok)throw new Error(detail?.message||'No se pudo cargar el detalle de participantes.');
      const participants=detail.participantes||[];
      $('adminResultsSubtitle').textContent='Actualizado: '+new Intl.DateTimeFormat('es-CL',{dateStyle:'short',timeStyle:'medium'}).format(new Date())+' · detalle privado de administración';
      body.innerHTML=`<div class="panel" style="box-shadow:none;background:#eff8f9"><strong style="font-size:1.5rem;color:var(--navy)">${Number(results.participantes)||0} participante(s)</strong><p class="form-note">Una respuesta por integrante. Si alguien edita su respuesta, el voto anterior se reemplaza y aquí verás la selección vigente.</p></div>${(results.preguntas||[]).map(q=>renderQuestion(q,participants)).join('')}${renderParticipants(participants)}`;
      bindParticipantSearch();
    }catch(err){console.error(err);if(currentId===id)body.innerHTML=`<div class="error">${esc(err.message||'No se pudieron cargar los resultados y participantes.')} Puedes reintentar con «Actualizar resultados».</div>`;}
    finally{if(currentId===id&&refresh)refresh.disabled=false;}
  }

  function relabelButtons(){
    document.querySelectorAll('[data-admin-results]').forEach(btn=>{btn.innerHTML='<i class="fa-solid fa-chart-column"></i> Resultados y participantes';btn.title='Ver resultados, quién participó y quién votó por cada opción';});
  }

  document.addEventListener('click',e=>{
    const btn=e.target.closest('[data-admin-results]');
    if(!btn)return;
    e.preventDefault();e.stopImmediatePropagation();
    openDetailedResults(btn.dataset.adminResults);
  },true);

  $('adminResultsRefresh')?.addEventListener('click',e=>{
    if(!currentId)return;
    e.preventDefault();e.stopImmediatePropagation();
    openDetailedResults(currentId);
  },true);

  $('adminResultsAportes')?.addEventListener('click',e=>{
    if(!currentId)return;
    e.preventDefault();e.stopImmediatePropagation();
    const id=currentId;currentId=null;
    const modal=$('adminResultsModal');if(modal){modal.classList.add('hidden');modal.setAttribute('aria-hidden','true');}
    const filter=$('aportesConsulta');if(filter){filter.value=id;filter.dispatchEvent(new Event('change',{bubbles:true}));}
    $('aportes')?.scrollIntoView({behavior:'smooth'});
  },true);

  $('adminResultsClose')?.addEventListener('click',()=>{currentId=null;});
  document.addEventListener('keydown',e=>{if(e.key==='Escape')currentId=null;});
  $('adminResultsModal')?.addEventListener('click',e=>{if(e.target===$('adminResultsModal'))currentId=null;});

  const list=$('consultaList');
  if(list){new MutationObserver(relabelButtons).observe(list,{childList:true,subtree:true});relabelButtons();}
})();
