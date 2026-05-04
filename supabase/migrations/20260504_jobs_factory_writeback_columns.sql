-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: jobs.factory_material_delivery_date + jobs.factory_dispatch_ready_date
-- Date:      2026-05-04
-- Purpose:   FACTORY-CRM-CONTRACT.md §6.1 — Factory CRM writes these dates
--            onto the linked job whenever the factory order's
--            materialDeliveryDate (Aluplast-confirmed, §4.2) or
--            dispatchReadyDate (capacity planner output, §5.2) changes.
--
-- Job CRM uses factory_dispatch_ready_date as the EARLIEST date on which
-- the job can be installed (§6.2). The CRM-side mirroring helper is
-- _mirrorFactoryOrderToJob in modules/16-factory-crm.js; round-tripping
-- runs through dbUpdate which converts the camelCase JS field to the
-- snake_case column below.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.jobs
  add column if not exists factory_material_delivery_date date,
  add column if not exists factory_dispatch_ready_date    date;

comment on column public.jobs.factory_material_delivery_date is
  'Aluplast-confirmed material delivery date, mirrored from factory_orders.material_delivery_date. See FACTORY-CRM-CONTRACT.md §4.2 + §6.1.';

comment on column public.jobs.factory_dispatch_ready_date is
  'Capacity-planner dispatch-ready date, mirrored from factory_orders.dispatch_ready_date. The earliest date Job CRM may offer for install (§6.2).';
