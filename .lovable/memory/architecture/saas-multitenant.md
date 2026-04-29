---
name: SaaS Multi-Tenant Architecture
description: Three-tier roles (super_admin, admin, user/member) with company_id scoping
type: feature
---
- `app_role` enum: super_admin (SaaS owner), admin (company owner), user (member/agent).
- `companies` = tenants; `instances` = WhatsApp connections per company.
- Major tables have `company_id` FK to companies (contacts, conversations, deals, nina_settings, teams, team_members, appointments, whatsapp_templates, user_roles).
- DB functions: `is_super_admin()`, `my_company_id()` (SECURITY DEFINER) used by RLS.
- BEFORE INSERT triggers auto-set company_id from creator's user_roles. Conversations also inherit from contact.
- RLS: super_admin sees all; admin sees own company; member sees only assigned conversations within own company.
- Super admin: comercial@inda-ia.tech (user_id 060a1c7c-ffe3-4ddf-aead-e435aeb61596). Default company: Gesso Gilmar (aaaaaaaa-0000-0000-0000-000000000001).
- Frontend: `useCompanyContext` hook, `SuperAdminRoute`, pages `/companies` and `/instances`.
- `useCompanySettings.isAdmin` returns true for both 'admin' and 'super_admin'.
