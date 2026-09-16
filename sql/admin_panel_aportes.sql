-- Panel de administración: respuestas abiertas protegidas por sesión y rol.
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
  if v_s.integrante_id is null or not v_s.es_admin then
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
$function$
