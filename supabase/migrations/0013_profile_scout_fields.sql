-- ScoutBangers — scout identity fields on profiles
--
-- Adds the Portuguese scouting hierarchy fields so users can declare
-- which Região / Núcleo / Agrupamento they belong to. Núcleo is
-- nullable because several regiões have no núcleo subdivision.

alter table public.profiles
  add column if not exists regiao text,
  add column if not exists nucleo text,
  add column if not exists agrupamento_numero int,
  add column if not exists agrupamento_nome text;

alter table public.profiles
  add constraint profiles_agrupamento_numero_range
  check (agrupamento_numero is null or (agrupamento_numero between 1 and 9999));
