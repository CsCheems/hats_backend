-- 04 · Semilla de catálogos: México y sus 32 entidades.
--
-- Clave INEGI y nombre de uso común («Coahuila», no «Coahuila de Zaragoza»): es
-- lo que la gente escribe y lo que la maqueta ya traía. Se puede correr más de
-- una vez sin duplicar nada.

begin;

insert into public.paises (codigo_iso, nombre)
values ('MX', 'México')
on conflict do nothing;

insert into public.estados (pais_id, clave, nombre)
select p.id, e.clave, e.nombre
from public.paises p
cross join (values
  ('01', 'Aguascalientes'),
  ('02', 'Baja California'),
  ('03', 'Baja California Sur'),
  ('04', 'Campeche'),
  ('05', 'Coahuila'),
  ('06', 'Colima'),
  ('07', 'Chiapas'),
  ('08', 'Chihuahua'),
  ('09', 'Ciudad de México'),
  ('10', 'Durango'),
  ('11', 'Guanajuato'),
  ('12', 'Guerrero'),
  ('13', 'Hidalgo'),
  ('14', 'Jalisco'),
  ('15', 'Estado de México'),
  ('16', 'Michoacán'),
  ('17', 'Morelos'),
  ('18', 'Nayarit'),
  ('19', 'Nuevo León'),
  ('20', 'Oaxaca'),
  ('21', 'Puebla'),
  ('22', 'Querétaro'),
  ('23', 'Quintana Roo'),
  ('24', 'San Luis Potosí'),
  ('25', 'Sinaloa'),
  ('26', 'Sonora'),
  ('27', 'Tabasco'),
  ('28', 'Tamaulipas'),
  ('29', 'Tlaxcala'),
  ('30', 'Veracruz'),
  ('31', 'Yucatán'),
  ('32', 'Zacatecas')
) as e (clave, nombre)
where p.codigo_iso = 'MX'
on conflict do nothing;

commit;
