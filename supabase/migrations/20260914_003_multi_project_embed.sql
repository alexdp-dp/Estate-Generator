alter table public.projects add column if not exists is_published boolean not null default false;
alter table public.projects add column if not exists embed_height integer not null default 760;
alter table public.projects add column if not exists source_mode text not null default 'glb';
alter table public.projects add column if not exists model_generation_status text not null default 'not_requested';
alter table public.projects add column if not exists settings jsonb not null default '{}'::jsonb;
alter table public.buildings add column if not exists model_path text;
alter table public.buildings add column if not exists real_height_m numeric;
alter table public.buildings add column if not exists display_height_units numeric not null default 2.7;
alter table public.buildings add column if not exists model_up_axis text not null default 'Y';
alter table public.buildings add column if not exists auto_ground boolean not null default true;
alter table public.buildings add column if not exists position_x numeric not null default 0;
alter table public.buildings add column if not exists position_y numeric not null default 0;
alter table public.buildings add column if not exists position_z numeric not null default 0;
alter table public.buildings add column if not exists rotation_y_deg numeric not null default 0;
alter table public.buildings add column if not exists settings jsonb not null default '{}'::jsonb;
alter table public.floors add column if not exists plan_width integer;
alter table public.floors add column if not exists plan_height integer;
alter table public.floors add column if not exists settings jsonb not null default '{}'::jsonb;
alter table public.apartments add column if not exists image_path text;
alter table public.apartments add column if not exists external_url text;
alter table public.apartments add column if not exists settings jsonb not null default '{}'::jsonb;
alter table public.project_assets add column if not exists file_name text;
alter table public.project_assets add column if not exists mime_type text;
alter table public.project_assets add column if not exists file_size bigint;
insert into storage.buckets(id,name,public,file_size_limit) values('project-documents','project-documents',false,52428800) on conflict(id) do nothing;

-- Existing Build 02 projects: move project-level model settings to the first building.
with first_building as (select distinct on (project_id) id, project_id from public.buildings order by project_id, sort_order, created_at) update public.buildings b set model_path=coalesce(b.model_path,p.model_path), real_height_m=coalesce(b.real_height_m,p.real_height_m), display_height_units=coalesce(b.display_height_units,p.display_height_units,2.7), model_up_axis=coalesce(b.model_up_axis,p.model_up_axis,'Y') from first_building fb join public.projects p on p.id=fb.project_id where b.id=fb.id and (b.model_path is null or b.real_height_m is null);
