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