#!/usr/bin/env node
// sync-agents.mjs — Syncs all OpenClaw agents into Supabase agent_status
// Usage: node ~/.openclaw/workspace/mission-control/scripts/sync-agents.mjs

import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

// ── Config ────────────────────────────────────────────────────────────────────

const SUPABASE_URL  = 'https://evfgrjslfrjwyopyzqzx.supabase.co';
const KEY_PATH      = join(homedir(), '.openclaw/workspace/secrets/supabase-service-key.txt');
const CONFIG_PATH   = join(homedir(), '.openclaw/openclaw.json');

const SUPABASE_KEY  = readFileSync(KEY_PATH, 'utf8').trim();

// ── Agent metadata (canonical defaults) ──────────────────────────────────────

const AGENT_META = {
  main: {
    name: 'Jerry',
    emoji: '🤙',
    role: "Orchestrator — David's main assistant",
    channel: 'telegram',
    capabilities: ['orchestration', 'config', 'skills', 'memory'],
  },
  phil: {
    name: 'Phil',
    emoji: '📊',
    role: 'CFO/Ops — JobTread, Airtable, job costing, contacts',
    channel: 'telegram',
    capabilities: ['jobtread', 'airtable', 'job-costing', 'supabase'],
  },
  bobby: {
    name: 'Bobby',
    emoji: '📣',
    role: 'Marketing & Comms — SMS, email campaigns, brand',
    channel: 'telegram',
    capabilities: ['sms', 'email', 'marketing', 'brand'],
  },
  mickey: {
    name: 'Mickey',
    emoji: '🛠',
    role: 'Lead Engineer — all code, web dev, GitHub, Vercel, DNS',
    channel: 'telegram',
    capabilities: ['coding', 'web-dev', 'github', 'vercel', 'supabase'],
  },
  daisy: {
    name: 'Daisy',
    emoji: '🌼',
    role: "Operations Manager — Valerie's assistant",
    channel: 'telegram',
    capabilities: ['job-ops', 'scheduling', 'client-comms', 'buildbase', 'airtable'],
  },
};

// ── Supabase helper ───────────────────────────────────────────────────────────

async function upsert(rows) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/agent_status`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify(rows),
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, body: text || null };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('📖 Reading openclaw.json…');
  const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));

  const agentList = config?.agents?.list ?? [];
  if (!agentList.length) {
    console.warn('⚠️  No agents found in openclaw.json → agents.list');
  }

  // Build rows: start from AGENT_META defaults, then overlay model from config
  const rows = [];

  // Collect agent ids from both sources (union)
  const allIds = new Set([...Object.keys(AGENT_META), ...agentList.map(a => a.id ?? a)]);

  for (const id of allIds) {
    const meta = AGENT_META[id] ?? {};

    // Find config entry — list items may be strings or objects
    const configEntry = agentList.find(a => (a.id ?? a) === id);
    const model =
      (typeof configEntry === 'object' && configEntry?.model?.primary) ||
      'anthropic/claude-sonnet-4-6';

    const row = {
      id,
      name:         meta.name ?? id,
      emoji:        meta.emoji ?? '🤖',
      role:         meta.role ?? '',
      channel:      meta.channel ?? 'telegram',
      capabilities: meta.capabilities ?? [],
      model,
      status:       'active',
      updated_at:   new Date().toISOString(),
    };

    rows.push(row);
    console.log(`  → ${row.emoji} ${row.name} (${id}) | model: ${model}`);
  }

  console.log(`\n⬆️  Upserting ${rows.length} agent(s) to Supabase…`);
  const result = await upsert(rows);

  if (result.ok) {
    console.log(`✅ Sync complete — ${rows.length} agent(s) upserted.`);
  } else {
    console.error('❌ Supabase upsert failed:', result.status, result.body);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
