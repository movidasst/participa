-- PARTICIPA · La Movida de SST Plus
-- Sincroniza automaticamente el XP de una consulta con quienes ya respondieron.
-- Si se cambia el valor (ej. 3 -> 100), actualiza los eventos existentes.
-- Si se activa XP despues de recibir respuestas, crea los eventos faltantes.
-- Si se desactiva XP, elimina solo los eventos vinculados a esa consulta.

create or replace function public.participa_admin_guardar_consulta(p_token uuid, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_s record;
  v_id uuid;
  v_campana uuid;
  v_slug text;
  v_titulo text;
  v_tipo text;
  v_estado text;
  v_vis text;
  v_respuestas bigint;
  v_preg_json jsonb;
  v_preg_id uuid;
  v_preg_tipo text;
  v_option jsonb;
  v_ord integer;
  v_op_count integer;
  v_puntos_habilitados boolean;
  v_puntos_valor integer;
  v_resp record;
  v_evento uuid;
begin
  select * into v_s from private.participa_sesion_actual(p_token);
  if not coalesce(private.es_admin_gestion(),false) then
    return jsonb_build_object('ok',false,'message','Sin permisos.');
  end if;

  begin v_id := nullif(p_payload->>'id','')::uuid; exception when others then v_id := null; end;
  begin v_campana := nullif(p_payload->>'campana_id','')::uuid; exception when others then v_campana := null; end;
  if v_campana is null or not exists(select 1 from public.participa_campanas where id=v_campana) then
    return jsonb_build_object('ok',false,'message','Selecciona una campaña válida.');
  end if;

  v_slug := lower(btrim(coalesce(p_payload->>'slug','')));
  v_titulo := btrim(coalesce(p_payload->>'titulo',''));
  v_tipo := coalesce(nullif(p_payload->>'tipo',''),'poll');
  v_estado := coalesce(nullif(p_payload->>'estado',''),'draft');
  v_vis := 'admin_only';
  v_puntos_habilitados := coalesce((p_payload->>'puntos_habilitados')::boolean,false);
  v_puntos_valor := greatest(0,least(coalesce(nullif(p_payload->>'puntos_valor','')::integer,0),1000));

  if v_titulo='' then return jsonb_build_object('ok',false,'message','El título de la consulta es obligatorio.'); end if;
  if v_slug='' then v_slug := 'consulta-'||substr(replace(extensions.gen_random_uuid()::text,'-',''),1,10); end if;
  if v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then return jsonb_build_object('ok',false,'message','El identificador de la consulta no es válido.'); end if;
  if v_tipo not in ('poll','survey','professional','proposal','decision') then v_tipo := 'poll'; end if;
  if v_estado not in ('draft','scheduled','active','closed','archived') then v_estado := 'draft'; end if;
  if v_vis not in ('always','after_vote','after_close','admin_only') then v_vis := 'after_vote'; end if;

  if v_id is null then
    insert into public.participa_consultas(campana_id,slug,titulo,resumen,descripcion,tipo,estado,resultados_visibilidad,puntos_habilitados,puntos_valor,permitir_editar,inicia_at,cierra_at,orden,created_by)
    values(v_campana,v_slug,v_titulo,nullif(p_payload->>'resumen',''),nullif(p_payload->>'descripcion',''),v_tipo,v_estado,v_vis,
      v_puntos_habilitados,v_puntos_valor,coalesce((p_payload->>'permitir_editar')::boolean,false),
      nullif(p_payload->>'inicia_at','')::timestamptz,nullif(p_payload->>'cierra_at','')::timestamptz,coalesce(nullif(p_payload->>'orden','')::integer,0),v_s.integrante_id)
    returning id into v_id;
    v_respuestas := 0;
  else
    select count(*) into v_respuestas from public.participa_respuestas where consulta_id=v_id;
    update public.participa_consultas set
      campana_id=v_campana,slug=v_slug,titulo=v_titulo,resumen=nullif(p_payload->>'resumen',''),descripcion=nullif(p_payload->>'descripcion',''),tipo=v_tipo,estado=v_estado,
      resultados_visibilidad=v_vis,puntos_habilitados=v_puntos_habilitados,
      puntos_valor=v_puntos_valor,permitir_editar=coalesce((p_payload->>'permitir_editar')::boolean,false),
      inicia_at=nullif(p_payload->>'inicia_at','')::timestamptz,cierra_at=nullif(p_payload->>'cierra_at','')::timestamptz,orden=coalesce(nullif(p_payload->>'orden','')::integer,0),updated_at=now()
    where id=v_id;
    if not found then return jsonb_build_object('ok',false,'message','Consulta no encontrada.'); end if;

    if v_puntos_habilitados and v_puntos_valor > 0 then
      update public.puntos_eventos pe
      set puntos = v_puntos_valor,
          motivo = 'Participación: '||v_titulo,
          referencia = 'participa:'||v_id::text||':'||pe.integrante_id::text,
          metadata = coalesce(pe.metadata,'{}'::jsonb) || jsonb_build_object(
            'origen','participa','subtipo','consulta','consulta_id',v_id,
            'valor_configurado',v_puntos_valor,'sincronizado_at',now()
          )
      from public.participa_puntos_otorgados po
      join public.participa_respuestas r on r.id=po.respuesta_id
      where pe.id=po.puntos_evento_id and r.consulta_id=v_id;

      for v_resp in
        select r.id as respuesta_id, r.integrante_id
        from public.participa_respuestas r
        left join public.participa_puntos_otorgados po on po.respuesta_id=r.id
        where r.consulta_id=v_id and po.respuesta_id is null
      loop
        insert into public.puntos_eventos(integrante_id,tipo,puntos,motivo,referencia,metadata)
        values(
          v_resp.integrante_id,'actividad',v_puntos_valor,
          'Participación: '||v_titulo,
          'participa:'||v_id::text||':'||v_resp.integrante_id::text,
          jsonb_build_object(
            'origen','participa','subtipo','consulta','consulta_id',v_id,
            'valor_configurado',v_puntos_valor,'sincronizado_at',now(),'retroactivo',true
          )
        ) returning id into v_evento;

        insert into public.participa_puntos_otorgados(respuesta_id,puntos_evento_id)
        values(v_resp.respuesta_id,v_evento);
      end loop;
    else
      delete from public.puntos_eventos pe
      using public.participa_puntos_otorgados po, public.participa_respuestas r
      where pe.id=po.puntos_evento_id
        and po.respuesta_id=r.id
        and r.consulta_id=v_id;
    end if;
  end if;

  if p_payload ? 'preguntas' then
    if v_respuestas > 0 then
      return jsonb_build_object(
        'ok',true,'id',v_id,'xp_sincronizados',v_respuestas,
        'puntos_valor',case when v_puntos_habilitados then v_puntos_valor else 0 end,
        'warning','La consulta ya tiene respuestas. Se actualizaron sus datos y XP, pero no la estructura de preguntas.'
      );
    end if;
    delete from public.participa_preguntas where consulta_id=v_id;
    v_ord := 0;
    for v_preg_json in select value from jsonb_array_elements(coalesce(p_payload->'preguntas','[]'::jsonb)) loop
      v_ord := v_ord + 10;
      v_preg_tipo := coalesce(nullif(v_preg_json->>'tipo',''),'single');
      if v_preg_tipo not in ('single','multiple','yes_no','scale','text') then v_preg_tipo := 'single'; end if;
      if btrim(coalesce(v_preg_json->>'pregunta',''))='' then raise exception 'Todas las preguntas deben tener texto'; end if;
      insert into public.participa_preguntas(consulta_id,pregunta,ayuda,tipo,requerida,min_selecciones,max_selecciones,escala_min,escala_max,escala_min_etiqueta,escala_max_etiqueta,orden)
      values(v_id,btrim(v_preg_json->>'pregunta'),nullif(v_preg_json->>'ayuda',''),v_preg_tipo,coalesce((v_preg_json->>'requerida')::boolean,true),
        coalesce(nullif(v_preg_json->>'min_selecciones','')::integer,0),nullif(v_preg_json->>'max_selecciones','')::integer,
        nullif(v_preg_json->>'escala_min','')::integer,nullif(v_preg_json->>'escala_max','')::integer,
        nullif(v_preg_json->>'escala_min_etiqueta',''),nullif(v_preg_json->>'escala_max_etiqueta',''),v_ord)
      returning id into v_preg_id;

      if v_preg_tipo='yes_no' and jsonb_array_length(coalesce(v_preg_json->'opciones','[]'::jsonb))=0 then
        insert into public.participa_opciones(pregunta_id,etiqueta,orden) values(v_preg_id,'Sí',10),(v_preg_id,'No',20);
      elsif v_preg_tipo in ('single','multiple','yes_no') then
        v_op_count := 0;
        for v_option in select value from jsonb_array_elements(coalesce(v_preg_json->'opciones','[]'::jsonb)) loop
          if btrim(coalesce(v_option->>'etiqueta',''))<>'' then
            v_op_count := v_op_count + 1;
            insert into public.participa_opciones(pregunta_id,etiqueta,descripcion,orden)
            values(v_preg_id,btrim(v_option->>'etiqueta'),nullif(v_option->>'descripcion',''),v_op_count*10);
          end if;
        end loop;
        if v_op_count < 2 then raise exception 'Las preguntas de opciones necesitan al menos dos alternativas'; end if;
      end if;
    end loop;
    if not exists(select 1 from public.participa_preguntas where consulta_id=v_id) then raise exception 'La consulta necesita al menos una pregunta'; end if;
  end if;

  return jsonb_build_object(
    'ok',true,'id',v_id,'xp_sincronizados',v_respuestas,
    'puntos_valor',case when v_puntos_habilitados then v_puntos_valor else 0 end
  );
end;
$function$;
