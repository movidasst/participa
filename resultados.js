/* PARTICIPA: resultados estadísticos para integrantes autenticados.
   No expone nombres, cédulas ni respuestas escritas. Actualización cada 15 segundos. */
(() => {
  'use strict';
  const SERVER='https://lfdmbkzghnwvsapxypvt.supabase.co';
  const PUBLIC_KEY='sb_publishable_bRnkA6PA8-v073nrw9zxiQ_8rVGiOn1';
  const TOKEN_KEY='movidasst_participa_session';
  const client=window.supabase.createClient(SERVER,PUBLIC_KEY,
    {auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  const find=id=>document.getElementById(id);
  const view=find('view-resultados'),select=find('resultsConsulta'),
    summary=find('resultsSummary'),grid=find('resultsGrid'),refresh=find('resultsRefresh');
  if(!view||!select||!summary||!grid||!refresh)return;
  let timer=null,busy=false,sequence=0,active=false,requestedId=null;
  function element(tag,cls,text){
    const el=document.createElement(tag);
    if(cls)el.className=cls;
    if(text!==undefined)el.textContent=String(text);
    return el;
  }
  async function rpc(name,args){
    const response=await client.rpc(name,args);
    if(response.error)throw response.error;
    return response.data;
  }
  function message(msg){
    grid.replaceChildren(element('div','empty',msg));
  }
  function endPolling(){if(timer!==null)clearInterval(timer);timer=null;}
  function setActive(on){
    active=on;
    view.classList.toggle('active',on);
    endPolling();
    if(on)timer=setInterval(()=>{if(!document.hidden)loadResults()},15000);
  }
  async function populateOptions(targetId){
    const token=localStorage.getItem(TOKEN_KEY);
    if(!token){message('Inicia sesión para consultar los resultados.');return;}
    const old=targetId||select.value;
    select.replaceChildren();
    try{
      const data=await rpc('participa_bootstrap',{p_token:token});
      if(!data?.ok)throw Error(data?.message||'Sesión vencida.');
      const qs=(data.consultas||[]).filter(q=>['active','closed','scheduled'].includes(q.estado)&&
        ['always','after_vote','after_close'].includes(q.resultados_visibilidad));
      for(const q of qs)select.appendChild(new Option(q.titulo,q.id));
      if(qs.some(q=>q.id===old))select.value=old;
      if(!qs.length){message('Todavía no hay consultas con resultados para mostrar.');summary.replaceChildren();return;}
      await loadResults();
    }catch(err){message('No fue posible cargar las consultas. Intenta nuevamente.');}
  }
  function bar(name,ratio,votes){
    const p=Math.max(0,Math.min(100,Number(ratio)||0));
    const row=element('div','participa-result-option');
    const top=element('div','participa-result-label');
    top.append(element('strong','',name),
      element('span','',p.toLocaleString('es-CL',{maximumFractionDigits:1})+' % · '+Number(votes||0)+' votos'));
    const track=element('div','participa-result-track');
    track.setAttribute('role','img');
    track.setAttribute('aria-label',name+': '+p+' por ciento');
    const fill=element('span','');fill.style.width=p+'%';
    track.appendChild(fill);
    row.append(top,track);
    return row;
  }
  function chart(question){
    const art=element('article','participa-result-panel');
    art.appendChild(element('h3','',question.pregunta||'Resultados'));
    const n=Number(question.respuestas||0);
    if(question.tipo==='protected'){
      art.appendChild(element('p','participa-results-note',
        'Tendencias disponibles cuando al menos 3 personas respondan esta pregunta. Respuestas actuales: '+n+'.'));
      return art;
    }
    if(question.tipo==='text'){
      art.appendChild(element('p','participa-results-note',
        n+' aporte(s) escritos recibidos. El contenido se revisa solo en administración.'));
      return art;
    }
    if(question.tipo==='scale'){
      art.appendChild(element('div','participa-result-score',
        (question.promedio==null?'—':Number(question.promedio).toLocaleString('es-CL'))+' promedio'));
      art.appendChild(element('p','participa-results-note',n+' respuesta(s)'));
      return art;
    }
    art.appendChild(element('p','participa-results-note',
      n+' respuesta(s).'+(question.tipo==='multiple'?' Cada participante podía marcar varias opciones.':'')));
    const bars=element('div','participa-result-bars');
    const opts=[...(question.opciones||[])].sort((a,b)=>Number(b.votos||0)-Number(a.votos||0));
    for(const o of opts)bars.appendChild(bar(o.etiqueta||'Opción',o.porcentaje,o.votos));
    art.appendChild(bars);
    return art;
  }
  async function loadResults(){
    const token=localStorage.getItem(TOKEN_KEY);
    if(!active||busy||document.hidden||!token||!select.value||find('appView').classList.contains('hidden'))return;
    busy=true;refresh.disabled=true;
    const id=select.value,myRequest=++sequence;
    try{
      const data=await rpc('participa_resultados_publicos',{p_token:token,p_consulta:id});
      if(!active||select.value!==id||myRequest!==sequence)return;
      if(!data?.ok){summary.replaceChildren();message(data?.message||'Los resultados todavía no están disponibles.');return;}
      const n=Number(data.participantes||0);
      const participants=element('div','participa-stat-pill');
      participants.append(element('i','fa-solid fa-users'),element('strong','',n),document.createTextNode(' participantes'));
      const updated=element('div','participa-stat-pill');
      updated.append(element('i','fa-regular fa-clock'),document.createTextNode(' Actualizado '+new Intl.DateTimeFormat('es-CL',{hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(new Date())));
      summary.replaceChildren(participants,updated);
      if(n<Number(data.minimo_para_detalle||3)){
        message('Se han registrado '+n+' participación(es). Las tendencias se muestran a partir de 3 participantes para proteger la privacidad.');
      }else{
        const nodes=(data.preguntas||[]).map(chart);
        grid.replaceChildren(...nodes);
      }
    }catch(err){
      if(active&&select.value===id)message('No se pudieron actualizar las estadísticas. Pulsa «Actualizar» para reintentar.');
    }finally{busy=false;refresh.disabled=false;}
  }
  function openResults(id){
    setActive(true);
    populateOptions(id||'');
    const close=find('consultaModal');
    if(close&&!close.classList.contains('hidden'))find('modalClose')?.click();
  }
  document.addEventListener('click',ev=>{
    const nav=ev.target.closest('[data-nav]');
    if(nav){
      if(nav.dataset.nav==='resultados') {const id=requestedId;requestedId=null;openResults(id); }
      else setActive(false);
    }
    const see=ev.target.closest('[data-result-open]');
    if(see){
      ev.preventDefault();
      find('consultaModal')?.classList.contains('hidden')||find('modalClose')?.click();
      requestedId=see.dataset.resultOpen;
      const tab=document.querySelector('[data-nav="resultados"]');
      if(tab)tab.click();
    }
  });
  select.addEventListener('change',loadResults);
  refresh.addEventListener('click',loadResults);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&active)loadResults()});
  new MutationObserver(()=>{if(find('appView').classList.contains('hidden'))setActive(false)})
    .observe(find('appView'),{attributes:true,attributeFilter:['class']});
})();
