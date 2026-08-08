/**
 * Every business-tunable value that lives in the generic PlatformSetting
 * key/value store, listed here purely for admin discoverability - a
 * catalog entry is documentation, not a schema; `SettingsService.get`
 * doesn't consult this file at all. Add a row here whenever a new hardcoded
 * constant is converted to a settings-backed read, so `GET
 * /admin/settings/catalog` stays a complete map of what's tunable without
 * redeploying.
 */
export interface SettingsCatalogEntry {
  key: string;
  description: string;
  defaultValue: unknown;
}

export const SETTINGS_CATALOG: SettingsCatalogEntry[] = [
  {
    key: "pro_priority_window_minutes",
    description:
      "Minutes a high-value/multi-runner/boosted errand stays Pro-only before any runner can accept it.",
    defaultValue: 30,
  },
  {
    key: "ban_duration_ladder_hours",
    description:
      "Escalating ban durations (in hours) after 3 consecutive failures - runner non-completion and requester cancellations both use this ladder. One entry past the end of this list means a permanent ban.",
    defaultValue: [72, 168],
  },
  {
    key: "ban_strike_threshold",
    description:
      "Consecutive failures (errand non-completion or errand cancellation) before the next ban-ladder tier fires.",
    defaultValue: 3,
  },
  {
    key: "business_credit_packages",
    description:
      "B2B wallet-credit packages available for purchase: [{ id, label, payAmount, bonusPercent }].",
    defaultValue: [
      { id: "starter", label: "Starter", payAmount: 20000, bonusPercent: 10 },
      { id: "growth", label: "Growth", payAmount: 50000, bonusPercent: 15 },
      { id: "scale", label: "Scale", payAmount: 100000, bonusPercent: 20 },
    ],
  },
  {
    key: "subscription_plan_duration_days",
    description:
      "How many days each Pro subscription plan extends access for: { monthly, quarterly, semi_annual, annual }.",
    defaultValue: { monthly: 30, quarterly: 90, semi_annual: 180, annual: 365 },
  },
  {
    key: "concern_ack_timeout_minutes",
    description:
      "Minutes a runner has to respond to a raised concern before it's auto-reopened (if unanswered) or flagged for admin action (if acknowledged but unresolved).",
    defaultValue: 10,
  },
  {
    key: "whatsapp_link_code_ttl_seconds",
    description: "Seconds a WhatsApp account-linking code stays valid after being generated in the app.",
    defaultValue: 600,
  },
  {
    key: "whatsapp_link_max_redeem_attempts",
    description: "Max link-code redemption attempts allowed per WhatsApp phone number within the attempts window.",
    defaultValue: 5,
  },
  {
    key: "whatsapp_link_attempts_window_seconds",
    description: "Rolling window (seconds) over which whatsapp_link_max_redeem_attempts is enforced.",
    defaultValue: 900,
  },
  {
    key: "errand_accept_eta_minutes",
    description: "Default ETA (minutes) recorded when a runner accepts or is assigned an errand.",
    defaultValue: 40,
  },
  {
    key: "referral_qualifying_errand_count",
    description: "Which of the referred user's lifetime completed errands (requester or runner side) triggers the referral payout - 1 means their first.",
    defaultValue: 1,
  },
  {
    key: "notification_runner_radius_km",
    description: "Search radius (km) for fanning out a new-errand notification to nearby top-rated runners.",
    defaultValue: 10,
  },
  {
    key: "notification_runner_result_limit",
    description: "Max number of nearby top-rated runners notified per new/boosted errand.",
    defaultValue: 20,
  },
  {
    key: "notification_pro_radius_km",
    description: "Search radius (km) for fanning out a new-errand notification to nearby Pro users.",
    defaultValue: 10,
  },
  {
    key: "notification_pro_result_limit",
    description: "Max number of nearby Pro users notified per new errand.",
    defaultValue: 50,
  },
];
