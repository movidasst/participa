-- Detalle privado de participantes y votos para la administración de PARTICIPA.
-- Requiere sesión Supabase Auth de un administrador activo de Gestión.

create or replace function public.participa_admin_participantes(p_consulta uuid)
returns jsonb
language plpgsql
stable security definer
set search_path to ''
as $function$
declare
  v_participantes jsonb;
begin
  if not coalesce(private.es_admin_gestion(), false) then
    return jsonb_build_object('ok', false, 'message', 'No tienes permisos de administración.');
  end if;

  if not exists (select 1 from public.participa_consultas q where q.id = p_consulta) then
    return jsonb_build_object('ok', false, 'message', 'Consulta no encontrada.');
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'integrante_id', m.id,
        'nombre', coalesce(nullif(btrim(concat_ws(' ', m.nombres, m.apellidos)), ''), 'Integrante'),
        'pais', coalesce(m.pais_nombre, m.estado),
        'foto_url', m.foto_url,
        'submitted_at', r.submitted_at,
        'updated_at', r.updated_at,
        'respuestas', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'pregunta_id', p.id,
              'pregunta', p.pregunta,
              'tipo', p.tipo,
              'opciones', coalesce((
                select jsonb_agg(
                  jsonb_build_object('id', o.id, 'etiqueta', o.etiqueta)
                  order by o.orden, o.created_at
                )
                from public.participa_respuesta_items ri
                join public.participa_opciones o on o.id = ri.opcion_id
                where ri.respuesta_id = r.id
                  and ri.pregunta_id = p.id
                  and ri.opcion_id is not null
              ), '[]'::jsonb),
              'texto', (
                select max(ri.texto)
                from public.participa_respuesta_items ri
                where ri.respuesta_id = r.id
                  and ri.pregunta_id = p.id
              ),
              'numero', (
                select max(ri.numero)
                from public.participa_respuesta_items ri
                where ri.respuesta_id = r.id
                  and ri.pregunta_id = p.id
              )
            )
            order by p.orden, p.created_at
          )
          from public.participa_preguntas p
          where p.consulta_id = p_consulta
        ), '[]'::jsonb)
      )
      order by r.updated_at desc, m.nombres, m.apellidos
    ),
    '[]'::jsonb
  )
  into v_participantes
  from public.participa_respuestas r
  join public.integrantes m on m.id = r.integrante_id
  where r.consulta_id = p_consulta;

  return jsonb_build_object(
    'ok', true,
    'consulta_id', p_consulta,
    'participantes', v_participantes,
    'total', jsonb_array_length(v_participantes)
  );
end;
$function$;

revoke execute on function public.participa_admin_participantes(uuid) from public, anon;
grant execute on function public.participa_admin_participantes(uuid) to authenticated;
