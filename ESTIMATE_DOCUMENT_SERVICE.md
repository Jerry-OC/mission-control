# Estimate Document Service — Integration Spec

**Status:** Research / Design — Not Built Yet  
**Decision needed by:** When we're ready to send proposals to clients  
**Author:** Mickey

---

## The Job

Generate a clean, professional PDF from an Order + its Line Items,  
and optionally get it signed by the client.

---

## Options Evaluated

### Option A — DocuSeal (self-hosted or SaaS)
- **What it is:** Open-source e-signature platform; can self-host on Fly/Railway/Render or use their hosted SaaS
- **How it works:** You define a template (PDF or HTML), send a "submission" request with data,  
  DocuSeal merges the data, generates a signable PDF, emails a signing link to the client
- **API:** REST; simple `POST /submissions` with `{ template_id, submitters: [{ email, role }], values: {...} }`
- **Pricing:** Free self-hosted; SaaS starts ~$25/month for up to 100 docs/month
- **Pros:**  
  - Open source, no lock-in  
  - We control the template and branding  
  - Webhook on `submission.completed` → update order status to Signed in Supabase  
  - Clean API, low latency  
- **Cons:**  
  - Template setup is manual (build once in DocuSeal UI)  
  - Self-hosting requires infra work (~1-2 hours on Fly.io)

---

### Option B — PandaDoc
- **What it is:** Full-featured SaaS proposal + e-signature tool
- **How it works:** Create document via API with content blocks, send for signature
- **API:** REST; POST `/documents` with structured JSON body including tables
- **Pricing:** ~$49/month/user (Essentials); no free self-hosted tier
- **Pros:**  
  - Very polished output; built for exactly this use case (proposals)  
  - Built-in document tracking (viewed, opened, signed)  
  - Good webhook support  
- **Cons:**  
  - Expensive for low volume  
  - Monthly subscription even if you only send 5 proposals  
  - Harder to customize branding at lower tiers  

---

### Option C — Server-side PDF Generation (pdf-lib + Nodemailer + DocuSign-free signing)
- **What it is:** Generate PDFs in a Vercel serverless function using `pdf-lib` or `puppeteer`  
  and use a lightweight signing service just for e-signature
- **How it works:**  
  1. `/api/estimate-pdf?order_id=xxx` renders HTML → PDF via Puppeteer  
  2. Upload to Supabase Storage  
  3. Send client a pre-signed URL via email (Bobby)  
  4. For signing: use Docusign free tier or SignWell free tier  
- **Pros:**  
  - Zero cost at low volume  
  - Full control over PDF layout  
- **Cons:**  
  - Puppeteer is heavyweight for Vercel serverless (bundle size, cold starts)  
  - Signing is a separate step with a separate tool — fragmented UX  
  - More glue code = more maintenance  

---

## Recommendation: DocuSeal (SaaS to start, self-host if volume grows)

**Why:**
1. **Cost:** ~$25/month covers all of Cody Design Build's proposal volume
2. **E-signature included:** One tool does PDF + signing + tracking — no glue
3. **Webhook → Supabase:** When a client signs, DocuSeal POSTs a webhook → our Vercel function  
   updates `orders.status = 'Signed'` and `orders.date_signed = today` automatically
4. **Open source option:** If we outgrow the SaaS pricing, self-host on Fly.io for $5/month
5. **Template control:** We build the Cody Design Build template once in DocuSeal UI  
   (logo, section headers, line item table, signature block) — then API calls just fill in the data

---

## Integration Plan (when we're ready to build)

### 1. Template Setup (DocuSeal UI, ~2 hours)
Create a template that maps to our data model:
- Header: Job Name, Client Name, Date
- Section: Order Name, Type (Proposal / Change Order)
- Table: Line Items (Name, Description, Labor, Materials, Other, Margin%, Price)
- Footer: Order Total (Cost, Price)
- Signature block: Client signature + date

### 2. New API Route: `POST /api/estimate-send`
```
{
  order_id: "uuid"
}
→ fetches order + line items from Supabase
→ POST to DocuSeal /api/submissions with template_id + values
→ returns { submission_id, signing_url }
→ updates order: status = "Sent", date_sent = today
→ Bobby agent emails the client with the signing link
```

### 3. Webhook Handler: `POST /api/estimate-webhook`
```
Receives DocuSeal webhook on submission.completed:
→ validates webhook secret
→ looks up order by submission_id (store mapping when we send)
→ updates order: status = "Signed", date_signed = date from webhook
```

### 4. Order ID mapping
Add column to `orders`: `docuseal_submission_id text` — store when we send,  
use to match the webhook back to the right order.

### 5. Mission Control UI additions (small)
- "Send to Client" button on order card (Draft → Sent flow)
- Status auto-updates via polling or page refresh after signing

---

## Env Vars Needed (add to Vercel)
```
DOCUSEAL_API_KEY=...
DOCUSEAL_TEMPLATE_ID=...
DOCUSEAL_WEBHOOK_SECRET=...
```

---

## What to Build NOW (already done)
- [x] Supabase schema (orders + line_items + views)
- [x] API routes (orders.js, estimate-line-items.js, estimate-jobs.js)
- [x] Estimating tab in Mission Control (data entry, inline editing)

## What to Build WHEN READY
- [ ] DocuSeal account setup + template design
- [ ] `/api/estimate-send` route
- [ ] `/api/estimate-webhook` route
- [ ] `docuseal_submission_id` column on orders
- [ ] "Send to Client" button in UI

---

## Notes on Selections/Allowances
Per spec: "Selections/allowances can be a future enhancement."

**Future implementation:**  
- Add `is_allowance boolean default false` column to `line_items`  
- Add `allowance_amount numeric` for the budgeted allowance  
- In the PDF template: show allowances as a separate section with "TBD / Owner Selection"  
- In Mission Control: toggle line item as an allowance; show visually distinct  
- Change Orders generated from actual selection costs become a CO against the allowance

---

## Notes on Missing Features Worth Discussing

### Line Item Categories
Organizing line items into sections (e.g., "Demo", "Framing", "Plumbing", "Finishes")  
would make proposals easier to read and manage.  
**Suggest:** Add `category text` field to `line_items` and group rows in the UI + PDF.  
Small schema change, big UX win.

### Markup vs. Margin Toggle
- Current schema: `margin_pct` — formula is `price = cost * (1 + margin/100)` (this is actually **markup** math)
- True margin formula: `price = cost / (1 - margin/100)`  
- A toggle in the UI and/or per-order setting would be useful if David sometimes talks in  
  margin % and sometimes in markup %.  
**Suggest:** Add `markup_mode boolean default true` to `orders`; the generated `price` column  
would need to be on the app layer instead (since SQL generated columns can't reference other tables).  
Doable but slightly more complex — revisit when David confirms which convention he uses.

### Client-Facing View
A read-only public URL (`/estimate/:token`) that shows just the order total and line items  
(without cost details) — good for clients to review before signing.  
**Suggest:** Implement alongside the DocuSeal integration.
