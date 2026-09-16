-- Administración con Supabase Auth y autorización de Gestión.
CREATE OR REPLACE FUNCTION private.participa_sesion_actual(p_token uuid)
 RETURNS TABLE(integrante_id bigint, es_admin boolean, rol text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    s.integrante_id,
    false as es_admin,
    'integrante'::text as rol
  from public.participa_sesiones s
  where s.token = p_token
    and s.revoked_at is null
    and s.expires_at > now()
  limit 1;
$function$;

CREATE OR REPLACE FUNCTION public.participa_login(p_documento text, p_codigo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_doc text := upper(regexp_replace(coalesce(p_documento,''), '[^A-Za-z0-9]', '', 'g'));
  v_codigo text := upper(btrim(coalesce(p_codigo,'')));
  v_id bigint;
  v_nombre text;
  v_foto text;
  v_pais text;
  v_token uuid;
  v_expira timestamptz;
  v_admin boolean;
  v_rol text;
begin
  if length(v_doc) < 4 or length(v_doc) > 24 or v_codigo !~ '^[A-Z0-9]{5}$' then
    return jsonb_build_object('ok',false,'message','Las credenciales no coinciden.');
  end if;

  select i.id,
         trim(concat_ws(' ', i.nombres, i.apellidos)),
         i.foto_url,
         coalesce(i.pais_nombre, i.estado)
    into v_id, v_nombre, v_foto, v_pais
  from public.integrantes i
  where (
    upper(regexp_replace(coalesce(i.documento::text,''), '[^A-Za-z0-9]', '', 'g')) = v_doc
    or upper(regexp_replace(coalesce(i.cedula::text,''), '[^A-Za-z0-9]', '', 'g')) = v_doc
  )
    and upper(btrim(coalesce(i.codigo_integrante::text,''))) = v_codigo
  order by case when upper(regexp_replace(coalesce(i.documento::text,''), '[^A-Za-z0-9]', '', 'g')) = v_doc then 0 else 1 end
  limit 1;

  if v_id is null then
    return jsonb_build_object('ok',false,'message','Las credenciales no coinciden.');
  end if;

  delete from public.participa_sesiones
  where integrante_id = v_id and (expires_at <= now() or revoked_at is not null);

  v_token := extensions.gen_random_uuid();
  v_expira := now() + interval '12 hours';
  insert into public.participa_sesiones(token, integrante_id, expires_at)
  values(v_token, v_id, v_expira);

  v_admin := false;
  v_rol := 'integrante';

  return jsonb_build_object(
    'ok',true,
    'token',v_token,
    'expires_at',v_expira,
    'admin',v_admin,
    'rol',v_rol,
    'perfil',jsonb_build_object('integrante_id',v_id,'nombre',v_nombre,'foto_url',v_foto,'pais',v_pais)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.participa_consulta_detalle(p_token uuid, p_consulta uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_s record;
  v_q record;
  v_resp uuid;
  v_preguntas jsonb;
begin
  select * into v_s from private.participa_sesion_actual(p_token);
  v_s.es_admin := coalesce(private.es_admin_gestion(),false);
  if v_s.integrante_id is null and not v_s.es_admin then return jsonb_build_object('ok',false,'message','Sesión vencida.'); end if;

  select q.*, c.titulo as campana_titulo, c.slug as campana_slug
    into v_q
  from public.participa_consultas q
  join public.participa_campanas c on c.id=q.campana_id
  where q.id=p_consulta
    and (q.estado in ('scheduled','active','closed') or v_s.es_admin);
  if v_q.id is null then return jsonb_build_object('ok',false,'message','Consulta no disponible.'); end if;

  select r.id into v_resp from public.participa_respuestas r
  where r.consulta_id=p_consulta and r.integrante_id=v_s.integrante_id;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id',p.id,'pregunta',p.pregunta,'ayuda',p.ayuda,'tipo',p.tipo,'requerida',p.requerida,
      'min_selecciones',p.min_selecciones,'max_selecciones',p.max_selecciones,
      'escala_min',p.escala_min,'escala_max',p.escala_max,'escala_min_etiqueta',p.escala_min_etiqueta,'escala_max_etiqueta',p.escala_max_etiqueta,
      'opciones',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'etiqueta',o.etiqueta,'descripcion',o.descripcion,'icono',o.icono) order by o.orden,o.created_at) from public.participa_opciones o where o.pregunta_id=p.id),'[]'::jsonb),
      'respuesta',case when v_resp is null then null else jsonb_build_object(
         'opcion_ids',coalesce((select jsonb_agg(ri.opcion_id) from public.participa_respuesta_items ri where ri.respuesta_id=v_resp and ri.pregunta_id=p.id and ri.opcion_id is not null),'[]'::jsonb),
         'texto',(select max(ri.texto) from public.participa_respuesta_items ri where ri.respuesta_id=v_resp and ri.pregunta_id=p.id),
         'numero',(select max(ri.numero) from public.participa_respuesta_items ri where ri.respuesta_id=v_resp and ri.pregunta_id=p.id)
      ) end
    ) order by p.orden,p.created_at),'[]'::jsonb)
  into v_preguntas
  from public.participa_preguntas p where p.consulta_id=p_consulta;

  return jsonb_build_object(
    'ok',true,'respondida',v_resp is not null,
    'consulta',jsonb_build_object('id',v_q.id,'titulo',v_q.titulo,'resumen',v_q.resumen,'descripcion',v_q.descripcion,'tipo',v_q.tipo,'estado',v_q.estado,'campana_titulo',v_q.campana_titulo,'campana_slug',v_q.campana_slug,'resultados_visibilidad',v_q.resultados_visibilidad,'puntos_habilitados',v_q.puntos_habilitados,'puntos_valor',v_q.puntos_valor,'permitir_editar',v_q.permitir_editar,'inicia_at',v_q.inicia_at,'cierra_at',v_q.cierra_at),
    'preguntas',v_preguntas
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.participa_admin_guardar_campana(p_token uuid, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_s record;
  v_id uuid;
  v_slug text;
  v_titulo text;
  v_estado text;
begin
  select * into v_s from private.participa_sesion_actual(p_token);
  if not coalesce(private.es_admin_gestion(),false) then return jsonb_build_object('ok',false,'message','Sin permisos.'); end if;
  begin v_id := nullif(p_payload->>'id','')::uuid; exception when others then v_id := null; end;
  v_slug := lower(btrim(coalesce(p_payload->>'slug','')));
  v_titulo := btrim(coalesce(p_payload->>'titulo',''));
  v_estado := coalesce(nullif(p_payload->>'estado',''),'draft');
  if v_titulo='' then return jsonb_build_object('ok',false,'message','El título es obligatorio.'); end if;
  if v_slug='' then v_slug := 'campana-'||substr(replace(extensions.gen_random_uuid()::text,'-',''),1,10); end if;
  if v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then return jsonb_build_object('ok',false,'message','El identificador de la campaña no es válido.'); end if;
  if v_estado not in ('draft','scheduled','active','closed','archived') then v_estado := 'draft'; end if;

  if v_id is null then
    insert into public.participa_campanas(slug,titulo,subtitulo,descripcion,estado,inicia_at,cierra_at,eyebrow,tema,created_by)
    values(v_slug,v_titulo,nullif(p_payload->>'subtitulo',''),nullif(p_payload->>'descripcion',''),v_estado,
      nullif(p_payload->>'inicia_at','')::timestamptz,nullif(p_payload->>'cierra_at','')::timestamptz,
      nullif(p_payload->>'eyebrow',''),coalesce(p_payload->'tema','{}'::jsonb),v_s.integrante_id)
    returning id into v_id;
  else
    update public.participa_campanas set
      slug=v_slug,titulo=v_titulo,subtitulo=nullif(p_payload->>'subtitulo',''),descripcion=nullif(p_payload->>'descripcion',''),estado=v_estado,
      inicia_at=nullif(p_payload->>'inicia_at','')::timestamptz,cierra_at=nullif(p_payload->>'cierra_at','')::timestamptz,
      eyebrow=nullif(p_payload->>'eyebrow',''),tema=coalesce(p_payload->'tema',tema),updated_at=now()
    where id=v_id;
    if not found then return jsonb_build_object('ok',false,'message','Campaña no encontrada.'); end if;
  end if;
  return jsonb_build_object('ok',true,'id',v_id);
end;
$function$;

CREATE OR REPLACE FUNCTION public.participa_admin_guardar_consulta(p_token uuid, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
begin
  select * into v_s from private.participa_sesion_actual(p_token);
  if not coalesce(private.es_admin_gestion(),false) then return jsonb_build_object('ok',false,'message','Sin permisos.'); end if;

  begin v_id := nullif(p_payload->>'id','')::uuid; exception when others then v_id := null; end;
  begin v_campana := nullif(p_payload->>'campana_id','')::uuid; exception when others then v_campana := null; end;
  if v_campana is null or not exists(select 1 from public.participa_campanas where id=v_campana) then return jsonb_build_object('ok',false,'message','Selecciona una campaña válida.'); end if;

  v_slug := lower(btrim(coalesce(p_payload->>'slug','')));
  v_titulo := btrim(coalesce(p_payload->>'titulo',''));
  v_tipo := coalesce(nullif(p_payload->>'tipo',''),'poll');
  v_estado := coalesce(nullif(p_payload->>'estado',''),'draft');
  v_vis := coalesce(nullif(p_payload->>'resultados_visibilidad',''),'after_vote');
  if v_titulo='' then return jsonb_build_object('ok',false,'message','El título de la consulta es obligatorio.'); end if;
  if v_slug='' then v_slug := 'consulta-'||substr(replace(extensions.gen_random_uuid()::text,'-',''),1,10); end if;
  if v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then return jsonb_build_object('ok',false,'message','El identificador de la consulta no es válido.'); end if;
  if v_tipo not in ('poll','survey','professional','proposal','decision') then v_tipo := 'poll'; end if;
  if v_estado not in ('draft','scheduled','active','closed','archived') then v_estado := 'draft'; end if;
  if v_vis not in ('always','after_vote','after_close','admin_only') then v_vis := 'after_vote'; end if;

  if v_id is null then
    insert into public.participa_consultas(campana_id,slug,titulo,resumen,descripcion,tipo,estado,resultados_visibilidad,puntos_habilitados,puntos_valor,permitir_editar,inicia_at,cierra_at,orden,created_by)
    values(v_campana,v_slug,v_titulo,nullif(p_payload->>'resumen',''),nullif(p_payload->>'descripcion',''),v_tipo,v_estado,v_vis,
      coalesce((p_payload->>'puntos_habilitados')::boolean,false),greatest(0,least(coalesce(nullif(p_payload->>'puntos_valor','')::integer,0),1000)),coalesce((p_payload->>'permitir_editar')::boolean,false),
      nullif(p_payload->>'inicia_at','')::timestamptz,nullif(p_payload->>'cierra_at','')::timestamptz,coalesce(nullif(p_payload->>'orden','')::integer,0),v_s.integrante_id)
    returning id into v_id;
    v_respuestas := 0;
  else
    select count(*) into v_respuestas from public.participa_respuestas where consulta_id=v_id;
    update public.participa_consultas set
      campana_id=v_campana,slug=v_slug,titulo=v_titulo,resumen=nullif(p_payload->>'resumen',''),descripcion=nullif(p_payload->>'descripcion',''),tipo=v_tipo,estado=v_estado,
      resultados_visibilidad=v_vis,puntos_habilitados=coalesce((p_payload->>'puntos_habilitados')::boolean,false),
      puntos_valor=greatest(0,least(coalesce(nullif(p_payload->>'puntos_valor','')::integer,0),1000)),permitir_editar=coalesce((p_payload->>'permitir_editar')::boolean,false),
      inicia_at=nullif(p_payload->>'inicia_at','')::timestamptz,cierra_at=nullif(p_payload->>'cierra_at','')::timestamptz,orden=coalesce(nullif(p_payload->>'orden','')::integer,0),updated_at=now()
    where id=v_id;
    if not found then return jsonb_build_object('ok',false,'message','Consulta no encontrada.'); end if;
  end if;

  if p_payload ? 'preguntas' then
    if v_respuestas > 0 then
      return jsonb_build_object('ok',true,'id',v_id,'warning','La consulta ya tiene respuestas. Se actualizaron sus datos, pero no la estructura de preguntas.');
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

  return jsonb_build_object('ok',true,'id',v_id);
end;
$function$;

CREATE OR REPLACE FUNCTION public.participa_admin_cambiar_estado(p_token uuid, p_consulta uuid, p_estado text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_s record; v_estado text := lower(btrim(coalesce(p_estado,'')));
begin
  select * into v_s from private.participa_sesion_actual(p_token);
  if not coalesce(private.es_admin_gestion(),false) then return jsonb_build_object('ok',false,'message','Sin permisos.'); end if;
  if v_estado not in ('draft','scheduled','active','closed','archived') then return jsonb_build_object('ok',false,'message','Estado inválido.'); end if;
  update public.participa_consultas set estado=v_estado,updated_at=now() where id=p_consulta;
  if not found then return jsonb_build_object('ok',false,'message','Consulta no encontrada.'); end if;
  return jsonb_build_object('ok',true,'estado',v_estado);
end;
$function$;

CREATE OR REPLACE FUNCTION public.participa_admin_panel(p_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_s record;
  v_campanas jsonb;
  v_consultas jsonb;
  v_aportes jsonb;
begin
  select * into v_s from private.participa_sesion_actual(p_token);
  if not coalesce(private.es_admin_gestion(),false) then
    return jsonb_build_object('ok',false,'message','No tienes permisos de administración.');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',c.id,'slug',c.slug,'titulo',c.titulo,'subtitulo',c.subtitulo,'descripcion',c.descripcion,'estado',c.estado,
    'inicia_at',c.inicia_at,'cierra_at',c.cierra_at,'eyebrow',c.eyebrow,'tema',c.tema,
    'consultas',(select count(*) from public.participa_consultas q where q.campana_id=c.id),
    'participantes',(select count(distinct r.integrante_id) from public.participa_respuestas r join public.participa_consultas q on q.id=r.consulta_id where q.campana_id=c.id)
  ) order by c.created_at desc),'[]'::jsonb) into v_campanas
  from public.participa_campanas c;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',q.id,'campana_id',q.campana_id,'campana',(select c.titulo from public.participa_campanas c where c.id=q.campana_id),
    'slug',q.slug,'titulo',q.titulo,'resumen',q.resumen,'descripcion',q.descripcion,'tipo',q.tipo,'estado',q.estado,
    'resultados_visibilidad',q.resultados_visibilidad,'puntos_habilitados',q.puntos_habilitados,'puntos_valor',q.puntos_valor,
    'permitir_editar',q.permitir_editar,'inicia_at',q.inicia_at,'cierra_at',q.cierra_at,'orden',q.orden,
    'participantes',(select count(*) from public.participa_respuestas r where r.consulta_id=q.id),
    'preguntas',(select count(*) from public.participa_preguntas p where p.consulta_id=q.id)
  ) order by q.created_at desc),'[]'::jsonb) into v_consultas
  from public.participa_consultas q;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',i.id,'consulta_id',q.id,'consulta',q.titulo,'campana',c.titulo,
    'pregunta',p.pregunta,'nombre',m.nombres,'texto',i.texto,'fecha',r.updated_at
  ) order by r.updated_at desc,i.id),'[]'::jsonb) into v_aportes
  from public.participa_respuesta_items i
  join public.participa_respuestas r on r.id=i.respuesta_id
  join public.participa_preguntas p on p.id=i.pregunta_id and p.consulta_id=r.consulta_id
  join public.participa_consultas q on q.id=r.consulta_id
  join public.participa_campanas c on c.id=q.campana_id
  join public.integrantes m on m.id=r.integrante_id
  where p.tipo='text' and nullif(btrim(i.texto),'') is not null;

  return jsonb_build_object('ok',true,'campanas',v_campanas,'consultas',v_consultas,'aportes',v_aportes);
end;
$function$;

revoke execute on function public.participa_admin_panel(uuid),public.participa_admin_guardar_consulta(uuid,jsonb),public.participa_admin_guardar_campana(uuid,jsonb),public.participa_admin_cambiar_estado(uuid,uuid,text) from public,anon;
grant execute on function public.participa_admin_panel(uuid),public.participa_admin_guardar_consulta(uuid,jsonb),public.participa_admin_guardar_campana(uuid,jsonb),public.participa_admin_cambiar_estado(uuid,uuid,text) to authenticated;