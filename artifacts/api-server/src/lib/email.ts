/**
 * Email module — Supabase-only architecture.
 *
 * Resend has been completely removed. All auth emails (signup verification,
 * password reset) are handled by Supabase's built-in email system.
 *
 * Transactional notifications that previously used Resend (welcome,
 * approval, storage alert) are now delivered via:
 *   • In-app notifications  (notifications table)
 *   • Web-push              (push.ts — VAPID)
 *
 * This file is intentionally kept so that import paths remain valid if
 * any future email provider needs to be plugged in here.
 */

