(() => {
  'use strict';
  const SUPABASE_URL='https://lfdmbkzghnwvsapxypvt.supabase.co';
  const SUPABASE_KEY='sb_publishable_bRnkA6PA8-v073nrw9zxiQ_8rVGiOn1';
  const STORAGE_KEY='movidasst_participa_session';
  const $=id=>document.getElementById(id);
  const client=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  const state={token:localStorage.getItem(STORAGE_KEY),panel:null,editing:null};
  function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));}
  function toast(m){const e=$('toast');e.textContent=m;e.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>e.classList.remove('show'),2800)}
  async function rpc(name,args={}){const {data,error}=await client.rpc(name,args);if(error)throw error;return data}
  function slugify(v){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,80)}
  function iso(v){return v?new Date(v).toISOString():null}
  function localDate(v){if(!v)return'';const d=new Date(v);const pad=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`}

  async function init(){
    if(!state.token){location.href='index.html';return}
    try{
      const boot=await rpc('participa_bootstrap',{p_token:state.token});
      if(!boot?.ok||!boot.admin){location.href='index.html';return}
      $('adminName').textContent=boot.perfil?.nombre||'Administrador';
      await loadPanel(); resetForm();
    }catch(err){console.error(err);location.href='index.html'}
  }
  async function loadPanel(){
    const data=await rpc('participa_admin_panel',{p_token:state.token});if(!data?.ok)throw new Error(data?.message||'No se pudo cargar el panel.');state.panel=data;renderCampaigns();renderConsultas();renderAportesFilters();renderAportes();
    $('campanaId').innerHTML=(data.campanas||[]).map(c=>`<option value="${c.id}">${esc(c.titulo)}</option>`).join('');
  }

  function renderAportesFilters(){
    const value=$('aportesConsulta').value;
    $('aportesConsulta').innerHTML='<option value="">Todas las consultas</option>'+(state.panel.consultas||[]).map(q=>`<option value="${esc(q.id)}">${esc(q.titulo)}</option>`).join('');
    if((state.panel.consultas||[]).some(q=>q.id===value))$('aportesConsulta').value=value;
  }
  function renderAportes(){
    const normalize=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    const query=normalize($('aportesSearch').value.trim()),consulta=$('aportesConsulta').value;
    const all=state.panel.aportes||[];
    const rows=all.filter(a=>(!consulta||a.consulta_id===consulta)&&(!query||normalize([a.texto,a.nombre,a.pregunta,a.consulta,a.campana].join(' ')).includes(query)));
    $('aportesSummary').textContent=`${rows.length} aporte(s) mostrado(s) de ${all.length} en total.`;
    $('aportesList').innerHTML=rows.length?rows.map(a=>{
      const date=new Date(a.fecha);
      const fecha=Number.isNaN(date.getTime())?'':new Intl.DateTimeFormat('es-CL',{dateStyle:'medium',timeStyle:'short'}).format(date);
      return `<article class="admin-item"><div class="admin-item-head" style="flex-wrap:wrap"><div><h3>${esc(a.nombre||'Integrante')}</h3><p>${esc(a.campana)} · ${esc(a.consulta)}</p></div><time datetime="${esc(a.fecha)}" class="form-note">${esc(fecha)}</time></div><p style="font-size:.9rem;color:var(--teal);font-weight:700;margin-top:12px">${esc(a.pregunta)}</p><div style="white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.6;font-size:1rem;margin-top:8px">${esc(a.texto)}</div></article>`;
    }).join(''):`<div class="empty">${all.length?'No hay aportes que coincidan con estos filtros.':'Todavía no hay propuestas ni respuestas abiertas. Aparecerán aquí cuando los integrantes las envíen.'}</div>`;
  }
  async function refreshAportes(){
    const btn=$('refreshAportes');btn.disabled=true;
    try{await loadPanel();toast('Aportes actualizados.')}
    catch(err){console.error(err);toast('No se pudieron actualizar los aportes. Intenta nuevamente.');}
    finally{btn.disabled=false;}
  }

  function renderCampaigns(){
    $('campaignList').innerHTML=(state.panel.campanas||[]).map(c=>`<div class="admin-item"><div class="admin-item-head"><div><h3>${esc(c.titulo)}</h3><p>${esc(c.subtitulo||'')} · ${c.consultas} consultas · ${c.participantes} participantes</p></div><span class="badge ${c.estado==='active'?'active':c.estado==='closed'?'closed':'scheduled'}">${esc(c.estado)}</span></div><div class="toolbar" style="margin-top:10px"><button class="btn soft" data-edit-campaign="${c.id}"><i class="fa-solid fa-pen"></i>Editar campaña</button></div></div>`).join('')||'<div class="empty">No hay campañas.</div>';
  }
  function renderConsultas(){
    $('consultaList').innerHTML=(state.panel.consultas||[]).map(q=>`<div class="admin-item"><div class="admin-item-head"><div><h3>${esc(q.titulo)}</h3><p>${esc(q.campana)} · ${q.participantes} participantes · ${q.preguntas} preguntas</p></div><span class="badge ${q.estado==='active'?'active':q.estado==='closed'?'closed':'scheduled'}">${esc(q.estado)}</span></div><div class="chips"><span class="chip">${esc(q.tipo)}</span>${q.puntos_habilitados?`<span class="chip">${q.puntos_valor} XP</span>`:''}</div><div class="toolbar" style="margin-top:10px"><button class="btn soft" data-edit="${q.id}"><i class="fa-solid fa-pen"></i>Editar</button>${q.estado!=='active'?`<button class="btn teal" data-status="active" data-id="${q.id}">Activar</button>`:''}${q.estado!=='closed'?`<button class="btn ghost" data-status="closed" data-id="${q.id}">Cerrar</button>`:''}<button class="btn ghost" data-status="archived" data-id="${q.id}">Archivar</button></div></div>`).join('')||'<div class="empty">No hay consultas creadas.</div>';
  }

  function questionTemplate(data={}){
    const type=data.tipo||'single';const opts=(data.opciones||[]).map(o=>o.etiqueta||o).join('\n');
    const div=document.createElement('div');div.className='question-builder';div.innerHTML=`<div class="question-builder-head"><strong style="color:var(--navy)">Pregunta</strong><button type="button" class="icon-btn remove-question" title="Eliminar"><i class="fa-solid fa-trash"></i></button></div><div class="field"><label>Texto de la pregunta</label><input class="qb-title" value="${esc(data.pregunta||'')}" required></div><div class="field"><label>Ayuda / contexto</label><input class="qb-help" value="${esc(data.ayuda||'')}"></div><div class="field-row"><div class="field"><label>Tipo</label><select class="qb-type"><option value="single">Una opción</option><option value="multiple">Varias opciones</option><option value="yes_no">Sí / No</option><option value="scale">Escala</option><option value="text">Respuesta abierta</option></select></div><div class="field"><label>Obligatoria</label><select class="qb-required"><option value="true">Sí</option><option value="false">No</option></select></div></div><div class="options-editor"><div class="field"><label>Opciones · una por línea</label><textarea class="qb-options" placeholder="Opción 1\nOpción 2">${esc(opts)}</textarea></div></div><div class="multiple-editor field hidden"><label>Máximo de selecciones</label><input class="qb-max" type="number" min="1" value="${data.max_selecciones||3}"></div><div class="scale-editor field-row hidden"><div class="field"><label>Mínimo</label><input class="qb-min" type="number" value="${data.escala_min||1}"></div><div class="field"><label>Máximo</label><input class="qb-scale-max" type="number" value="${data.escala_max||5}"></div></div>`;
    div.querySelector('.qb-type').value=type;div.querySelector('.qb-required').value=String(data.requerida!==false);updateQuestionUI(div);div.querySelector('.qb-type').addEventListener('change',()=>updateQuestionUI(div));div.querySelector('.remove-question').addEventListener('click',()=>div.remove());return div;
  }
  function updateQuestionUI(div){
    const t=div.querySelector('.qb-type').value;div.querySelector('.options-editor').classList.toggle('hidden',!['single','multiple'].includes(t));div.querySelector('.multiple-editor').classList.toggle('hidden',t!=='multiple');div.querySelector('.scale-editor').classList.toggle('hidden',t!=='scale');
  }
  function addQuestion(data={}){$('questionBuilders').appendChild(questionTemplate(data))}
  function collectQuestions(){
    return [...document.querySelectorAll('.question-builder')].map(div=>{const tipo=div.querySelector('.qb-type').value;const q={pregunta:div.querySelector('.qb-title').value.trim(),ayuda:div.querySelector('.qb-help').value.trim()||null,tipo,requerida:div.querySelector('.qb-required').value==='true'};if(['single','multiple'].includes(tipo))q.opciones=div.querySelector('.qb-options').value.split('\n').map(x=>x.trim()).filter(Boolean).map(etiqueta=>({etiqueta}));if(tipo==='multiple'){q.min_selecciones=q.requerida?1:0;q.max_selecciones=Number(div.querySelector('.qb-max').value||3)}if(tipo==='scale'){q.escala_min=Number(div.querySelector('.qb-min').value||1);q.escala_max=Number(div.querySelector('.qb-scale-max').value||5)}return q;});
  }
  function resetForm(){
    state.editing=null;$('consultaForm').reset();$('consultaId').value='';$('consultaEstado').value='draft';$('consultaTipo').value='poll';$('resultVisibility').value='after_vote';$('pointsValue').value='3';$('allowEdit').checked=true;$('pointsEnabled').checked=true;$('questionBuilders').innerHTML='';addQuestion({tipo:'single',requerida:true});$('formTitle').textContent='Nueva consulta';$('saveBtn').innerHTML='<i class="fa-solid fa-floppy-disk"></i> Guardar consulta';
    if(state.panel?.campanas?.[0])$('campanaId').value=state.panel.campanas[0].id;
  }
  async function saveConsulta(ev){
    ev.preventDefault();const questions=collectQuestions();if(!questions.length){toast('Agrega al menos una pregunta.');return}if(questions.some(q=>!q.pregunta)){toast('Todas las preguntas deben tener texto.');return}
    const payload={id:$('consultaId').value||null,campana_id:$('campanaId').value,titulo:$('consultaTitulo').value.trim(),slug:$('consultaSlug').value.trim(),resumen:$('consultaResumen').value.trim(),descripcion:$('consultaDescripcion').value.trim(),tipo:$('consultaTipo').value,estado:$('consultaEstado').value,resultados_visibilidad:$('resultVisibility').value,puntos_habilitados:$('pointsEnabled').checked,puntos_valor:Number($('pointsValue').value||0),permitir_editar:$('allowEdit').checked,inicia_at:iso($('startAt').value),cierra_at:iso($('endAt').value),preguntas:questions};
    const btn=$('saveBtn');btn.disabled=true;btn.innerHTML='<i class="fa-solid fa-spinner fa-spin"></i> Guardando…';
    try{const data=await rpc('participa_admin_guardar_consulta',{p_token:state.token,p_payload:payload});if(!data?.ok)throw new Error(data?.message||'No se pudo guardar.');toast(data.warning||'Consulta guardada.');await loadPanel();resetForm();}
    catch(err){console.error(err);toast(err.message||'Error al guardar.')}finally{btn.disabled=false;btn.innerHTML='<i class="fa-solid fa-floppy-disk"></i> Guardar consulta'}
  }
  async function editConsulta(id){
    try{const base=state.panel.consultas.find(q=>q.id===id);const detail=await rpc('participa_consulta_detalle',{p_token:state.token,p_consulta:id});if(!detail?.ok)throw new Error(detail?.message||'No se pudo abrir.');state.editing=id;$('consultaId').value=id;$('campanaId').value=base.campana_id;$('consultaTitulo').value=base.titulo;$('consultaSlug').value=base.slug;$('consultaResumen').value=base.resumen||'';$('consultaDescripcion').value=base.descripcion||'';$('consultaTipo').value=base.tipo;$('consultaEstado').value=base.estado;$('resultVisibility').value=base.resultados_visibilidad;$('pointsEnabled').checked=base.puntos_habilitados;$('pointsValue').value=base.puntos_valor;$('allowEdit').checked=base.permitir_editar;$('startAt').value=localDate(base.inicia_at);$('endAt').value=localDate(base.cierra_at);$('questionBuilders').innerHTML='';detail.preguntas.forEach(addQuestion);$('formTitle').textContent='Editar consulta';$('saveBtn').innerHTML='<i class="fa-solid fa-floppy-disk"></i> Guardar cambios';window.scrollTo({top:0,behavior:'smooth'});if(base.participantes>0)toast('Ya tiene respuestas: la estructura de preguntas quedará protegida.');}
    catch(err){console.error(err);toast(err.message||'No se pudo editar.')}
  }
  async function changeStatus(id,status){try{const d=await rpc('participa_admin_cambiar_estado',{p_token:state.token,p_consulta:id,p_estado:status});if(!d?.ok)throw new Error(d?.message||'No se pudo cambiar.');toast(`Estado: ${status}`);await loadPanel()}catch(err){console.error(err);toast(err.message||'Error al cambiar estado.')}}

  function openCampaignModal(id=null){
    $('campaignModal').classList.remove('hidden');$('campaignForm').reset();$('campaignId').value='';$('campaignState').value='active';
    if(id){const c=state.panel.campanas.find(x=>x.id===id);if(c){$('campaignId').value=c.id;$('campaignTitle').value=c.titulo;$('campaignSlug').value=c.slug;$('campaignSubtitle').value=c.subtitulo||'';$('campaignDescription').value=c.descripcion||'';$('campaignState').value=c.estado;$('campaignStart').value=localDate(c.inicia_at);$('campaignEnd').value=localDate(c.cierra_at)}}
  }
  async function saveCampaign(ev){
    ev.preventDefault();const payload={id:$('campaignId').value||null,titulo:$('campaignTitle').value.trim(),slug:$('campaignSlug').value.trim(),subtitulo:$('campaignSubtitle').value.trim(),descripcion:$('campaignDescription').value.trim(),estado:$('campaignState').value,inicia_at:iso($('campaignStart').value),cierra_at:iso($('campaignEnd').value),eyebrow:'PARTICIPA · LA MOVIDA DE SST+'};
    try{const d=await rpc('participa_admin_guardar_campana',{p_token:state.token,p_payload:payload});if(!d?.ok)throw new Error(d?.message||'No se pudo guardar.');$('campaignModal').classList.add('hidden');toast('Campaña guardada.');await loadPanel();resetForm()}catch(err){console.error(err);toast(err.message||'Error al guardar campaña.')}
  }

  document.addEventListener('click',e=>{const edit=e.target.closest('[data-edit]');if(edit)editConsulta(edit.dataset.edit);const st=e.target.closest('[data-status]');if(st)changeStatus(st.dataset.id,st.dataset.status);const ec=e.target.closest('[data-edit-campaign]');if(ec)openCampaignModal(ec.dataset.editCampaign)});
  $('consultaTitulo').addEventListener('input',()=>{if(!$('consultaId').value)$('consultaSlug').value=slugify($('consultaTitulo').value)});$('campaignTitle').addEventListener('input',()=>{if(!$('campaignId').value)$('campaignSlug').value=slugify($('campaignTitle').value)});
  $('addQuestion').addEventListener('click',()=>addQuestion());$('newConsulta').addEventListener('click',resetForm);$('consultaForm').addEventListener('submit',saveConsulta);$('newCampaign').addEventListener('click',()=>openCampaignModal());$('campaignClose').addEventListener('click',()=>$('campaignModal').classList.add('hidden'));$('campaignForm').addEventListener('submit',saveCampaign);
  $('aportesConsulta').addEventListener('change',renderAportes);$('aportesSearch').addEventListener('input',renderAportes);$('refreshAportes').addEventListener('click',refreshAportes);
  init();
})();
