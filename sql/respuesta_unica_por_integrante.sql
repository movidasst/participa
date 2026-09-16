-- Una respuesta por encuesta e integrante; ediciones serializadas y votos sin duplicados.
CREATE OR REPLACE FUNCTION public.participa_enviar_respuesta(p_token uuid, p_consulta uuid, p_respuestas jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_s record;
  v_q record;
  v_respuesta uuid;
  v_existia boolean := false;
  a jsonb;
  v_preg uuid;
  v_tipo text;
  v_required boolean;
  v_max integer;
  v_min integer;
  v_seen uuid[] := '{}'::uuid[];
  v_scale_min integer;
  v_scale_max integer;
  v_option uuid;
  v_text text;
  v_num numeric;
  v_count integer;
  req record;
  v_evento uuid;
  v_puntos integer := 0;
begin
  select * into v_s from private.participa_sesion_actual(p_token);
  if v_s.integrante_id is null then return jsonb_build_object('ok',false,'message','Sesión vencida.'); end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_consulta::text || ':' || v_s.integrante_id::text,0));
  select * into v_q from public.participa_consultas where id=p_consulta;
  if v_q.id is null or v_q.estado <> 'active' then return jsonb_build_object('ok',false,'message','Esta consulta no está abierta.'); end if;
  if v_q.inicia_at is not null and now() < v_q.inicia_at then return jsonb_build_object('ok',false,'message','Esta consulta todavía no ha comenzado.'); end if;
  if v_q.cierra_at is not null and now() >= v_q.cierra_at then return jsonb_build_object('ok',false,'message','Esta consulta ya cerró.'); end if;
  if jsonb_typeof(p_respuestas) is distinct from 'array' then return jsonb_build_object('ok',false,'message','Formato de respuesta inválido.'); end if;

  select r.id into v_respuesta from public.participa_respuestas r where r.consulta_id=p_consulta and r.integrante_id=v_s.integrante_id;
  if v_respuesta is not null then
    v_existia := true;
    if not v_q.permitir_editar then return jsonb_build_object('ok',false,'message','Ya participaste en esta consulta.'); end if;
    delete from public.participa_respuesta_items where respuesta_id=v_respuesta;
    update public.participa_respuestas set updated_at=now() where id=v_respuesta;
  else
    insert into public.participa_respuestas(consulta_id,integrante_id) values(p_consulta,v_s.integrante_id) returning id into v_respuesta;
  end if;

  for a in select value from jsonb_array_elements(p_respuestas) loop
    begin v_preg := (a->>'pregunta_id')::uuid; exception when others then raise exception 'Pregunta inválida'; end;
    if v_preg is null or v_preg = any(v_seen) then raise exception 'Cada pregunta debe aparecer una sola vez'; end if;
    v_seen := array_append(v_seen,v_preg);
    select p.tipo,p.requerida,p.max_selecciones,p.escala_min,p.escala_max,p.min_selecciones
      into v_tipo,v_required,v_max,v_scale_min,v_scale_max,v_min
    from public.participa_preguntas p where p.id=v_preg and p.consulta_id=p_consulta;
    if v_tipo is null then raise exception 'Pregunta no pertenece a la consulta'; end if;

    if v_tipo in ('single','multiple','yes_no') then
      v_count := 0;
      if jsonb_typeof(coalesce(a->'opcion_ids','[]'::jsonb))='array' then
        for v_option in select distinct value::text::uuid from jsonb_array_elements_text(coalesce(a->'opcion_ids','[]'::jsonb)) loop
          if exists(select 1 from public.participa_opciones o where o.id=v_option and o.pregunta_id=v_preg) then
            insert into public.participa_respuesta_items(respuesta_id,pregunta_id,opcion_id) values(v_respuesta,v_preg,v_option);
            v_count := v_count + 1;
          end if;
        end loop;
      end if;
      if v_count < coalesce(v_min,0) then raise exception 'No completaste el mínimo de opciones requerido'; end if;
      if v_tipo in ('single','yes_no') and v_count>1 then raise exception 'Solo puedes seleccionar una opción'; end if;
      if v_tipo='multiple' and v_max is not null and v_count>v_max then raise exception 'Superaste el máximo de opciones permitidas'; end if;
    elsif v_tipo='text' then
      v_text := nullif(btrim(coalesce(a->>'texto','')),'');
      if v_text is not null then
        if length(v_text)>2000 then raise exception 'La respuesta abierta supera 2000 caracteres'; end if;
        insert into public.participa_respuesta_items(respuesta_id,pregunta_id,texto) values(v_respuesta,v_preg,v_text);
      end if;
    elsif v_tipo='scale' then
      begin v_num := nullif(a->>'numero','')::numeric; exception when others then v_num := null; end;
      if v_num is not null then
        if (v_scale_min is not null and v_num<v_scale_min) or (v_scale_max is not null and v_num>v_scale_max) then raise exception 'Valor fuera de la escala'; end if;
        insert into public.participa_respuesta_items(respuesta_id,pregunta_id,numero) values(v_respuesta,v_preg,v_num);
      end if;
    end if;
  end loop;

  for req in select p.id,p.pregunta from public.participa_preguntas p where p.consulta_id=p_consulta and p.requerida=true loop
    if not exists(select 1 from public.participa_respuesta_items ri where ri.respuesta_id=v_respuesta and ri.pregunta_id=req.id and (ri.opcion_id is not null or nullif(btrim(coalesce(ri.texto,'')),'') is not null or ri.numero is not null)) then
      raise exception 'Debes responder: %', req.pregunta;
    end if;
  end loop;

  if not v_existia and v_q.puntos_habilitados and v_q.puntos_valor>0 and not exists(select 1 from public.participa_puntos_otorgados po where po.respuesta_id=v_respuesta) then
    insert into public.puntos_eventos(integrante_id,tipo,puntos,motivo,referencia,metadata)
    values(v_s.integrante_id,'actividad',v_q.puntos_valor,'Participación: '||v_q.titulo,'participa:'||p_consulta::text||':'||v_s.integrante_id::text,jsonb_build_object('origen','participa','subtipo','consulta','consulta_id',p_consulta))
    returning id into v_evento;
    insert into public.participa_puntos_otorgados(respuesta_id,puntos_evento_id) values(v_respuesta,v_evento);
    v_puntos := v_q.puntos_valor;
  end if;

  insert into public.participa_resultado_eventos(consulta_id) values(p_consulta);
  return jsonb_build_object('ok',true,'respuesta_id',v_respuesta,'actualizada',v_existia,'puntos_otorgados',v_puntos);
end;
$function$
;
CREATE OR REPLACE FUNCTION public.participa_resultados(p_token uuid, p_consulta uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_s record;
  v_q record;
  v_respondio boolean;
  v_permitido boolean := false;
  v_total bigint;
  p record;
  v_opciones jsonb;
  v_pregs jsonb := '[]'::jsonb;
  v_respuestas_preg bigint;
  v_promedio numeric;
begin
  select * into v_s from private.participa_sesion_actual(p_token);
  v_s.es_admin := coalesce(private.es_admin_gestion(),false);
  if v_s.integrante_id is null and not v_s.es_admin then return jsonb_build_object('ok',false,'message','Sesión vencida.'); end if;
  select * into v_q from public.participa_consultas where id=p_consulta;
  if v_q.id is null then return jsonb_build_object('ok',false,'message','Consulta no disponible.'); end if;

  select exists(select 1 from public.participa_respuestas r where r.consulta_id=p_consulta and r.integrante_id=v_s.integrante_id) into v_respondio;
  v_permitido := v_s.es_admin
    or v_q.resultados_visibilidad='always'
    or (v_q.resultados_visibilidad='after_vote' and v_respondio)
    or (v_q.resultados_visibilidad='after_close' and (v_q.estado='closed' or (v_q.cierra_at is not null and now()>=v_q.cierra_at)));
  if not v_permitido then return jsonb_build_object('ok',false,'locked',true,'message','Los resultados todavía no están disponibles.'); end if;

  select count(*) into v_total from public.participa_respuestas r where r.consulta_id=p_consulta;

  for p in select * from public.participa_preguntas where consulta_id=p_consulta order by orden,created_at loop
    select count(distinct ri.respuesta_id) into v_respuestas_preg
    from public.participa_respuesta_items ri where ri.pregunta_id=p.id;

    if p.tipo in ('single','multiple','yes_no') then
      select coalesce(jsonb_agg(jsonb_build_object(
        'id',o.id,'etiqueta',o.etiqueta,
        'votos',(select count(distinct ri.respuesta_id) from public.participa_respuesta_items ri where ri.pregunta_id=p.id and ri.opcion_id=o.id),
        'porcentaje',case when v_respuestas_preg=0 then 0 else round(((select count(distinct ri.respuesta_id) from public.participa_respuesta_items ri where ri.pregunta_id=p.id and ri.opcion_id=o.id)::numeric*100)/v_respuestas_preg,1) end
      ) order by o.orden,o.created_at),'[]'::jsonb)
      into v_opciones from public.participa_opciones o where o.pregunta_id=p.id;
      v_pregs := v_pregs || jsonb_build_array(jsonb_build_object('id',p.id,'pregunta',p.pregunta,'tipo',p.tipo,'respuestas',v_respuestas_preg,'opciones',v_opciones));
    elsif p.tipo='scale' then
      select round(avg(ri.numero),2) into v_promedio from public.participa_respuesta_items ri where ri.pregunta_id=p.id and ri.numero is not null;
      v_pregs := v_pregs || jsonb_build_array(jsonb_build_object('id',p.id,'pregunta',p.pregunta,'tipo',p.tipo,'respuestas',v_respuestas_preg,'promedio',v_promedio,'min',p.escala_min,'max',p.escala_max));
    else
      v_pregs := v_pregs || jsonb_build_array(jsonb_build_object('id',p.id,'pregunta',p.pregunta,'tipo',p.tipo,'respuestas',v_respuestas_preg,'nota','Las respuestas abiertas se reservan para el análisis y moderación.'));
    end if;
  end loop;

  return jsonb_build_object('ok',true,'consulta_id',p_consulta,'participantes',v_total,'preguntas',v_pregs);
end;
$function$
;