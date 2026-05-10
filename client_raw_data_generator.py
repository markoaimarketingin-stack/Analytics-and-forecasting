#!/usr/bin/env python3
"""
Client-side raw data generator for agent testing.

This version is intentionally CLIENT-CENTRIC:
it creates the kinds of source data a company might already have in its own systems,
without any agent names, agent folders, or downstream processing labels.

Generated layout:

output/
  manifest.json
  clients.csv
  client_id=cli_0001/
    company_profile.json
    crm/contacts.csv
    crm/deals.csv
    website/pages.jsonl
    website/search_console.csv
    documents/briefs.jsonl
    documents/uploads.jsonl
    marketing/ad_platform_exports.csv
    marketing/email_campaigns.csv
    social/posts.jsonl
    social/comments.jsonl
    support/tickets.jsonl
    support/chat_transcripts.jsonl
    analytics/events.csv
    analytics/sessions.csv
    sales/orders.csv
    sales/refunds.csv
    finance/invoices.csv
    finance/payments.csv
    product/feedback.jsonl
    product/feature_requests.jsonl
    notes/meeting_notes.jsonl
    notes/raw_observations.jsonl

Optional S3 upload:
  aws s3 sync ./output s3://your-bucket/marko-sim/v2/

Dependencies: standard library only.
"""

from __future__ import annotations

import argparse
import csv
import gzip
import hashlib
import json
import random
import string
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Iterable, List, Dict, Tuple


INDUSTRIES = [
    "ecommerce", "saas", "d2c", "education", "fintech", "healthcare",
    "local_services", "marketplace", "hospitality", "subscription"
]

REGIONS = ["US", "UK", "EU", "IN", "UAE", "CA", "AU", "SG"]
CURRENCIES = {"US": "USD", "UK": "GBP", "EU": "EUR", "IN": "INR", "UAE": "AED", "CA": "CAD", "AU": "AUD", "SG": "SGD"}
OBJECTIVES = ["lead_gen", "purchase", "signup", "app_install", "traffic", "retention", "book_demo"]
VOICE = ["professional", "friendly", "premium", "direct", "educational", "playful"]
CHANNELS = ["google_ads", "meta_ads", "tiktok_ads", "linkedin_ads", "email", "organic", "referral", "direct"]
PRODUCTS = ["starter plan", "pro plan", "annual subscription", "audit package", "premium bundle", "service retainer", "membership"]
TOPICS = ["launch campaign", "retention push", "lead generation", "seasonal sale", "brand refresh", "geo expansion", "pricing test", "landing page fix"]
FIRST_NAMES = ["Ava", "Noah", "Mia", "Liam", "Zara", "Ishaan", "Sara", "Arjun", "Maya", "Leo", "Anika", "Kabir"]
LAST_NAMES = ["Sharma", "Patel", "Gupta", "Singh", "Khan", "Mehta", "Kapoor", "Reddy", "Joshi", "Verma", "Bhatia", "Nair"]


def mkdir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def write_json(path: Path, obj: object) -> None:
    mkdir(path.parent)
    path.write_text(json.dumps(obj, indent=2, ensure_ascii=False), encoding="utf-8")


def write_jsonl(path: Path, rows: Iterable[dict]) -> None:
    mkdir(path.parent)
    with path.open("w", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")


def write_csv(path: Path, rows: List[dict], fieldnames: List[str]) -> None:
    mkdir(path.parent)
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow(row)


def slugify(text: str) -> str:
    text = text.lower().replace("&", " and ")
    out = []
    prev_dash = False
    for ch in text:
        if ch.isalnum():
            out.append(ch)
            prev_dash = False
        elif not prev_dash:
            out.append("-")
            prev_dash = True
    return "".join(out).strip("-") or "client"


def short_hash(text: str) -> str:
    return hashlib.sha1(text.encode("utf-8")).hexdigest()[:12]


def pick(rng: random.Random, weighted_items: List[Tuple[str, float]]) -> str:
    total = sum(w for _, w in weighted_items)
    r = rng.uniform(0, total)
    c = 0.0
    for item, weight in weighted_items:
        c += weight
        if r <= c:
            return item
    return weighted_items[-1][0]


def rand_name(rng: random.Random) -> str:
    return f"{rng.choice(FIRST_NAMES)} {rng.choice(LAST_NAMES)}"


def create_client(rng: random.Random, idx: int) -> dict:
    industry = rng.choice(INDUSTRIES)
    region = rng.choice(REGIONS)
    currency = CURRENCIES[region]
    company_name = f"{rng.choice(['North', 'Blue', 'Prime', 'Pulse', 'Vertex', 'Nova', 'Summit', 'Bright', 'Urban', 'Signal'])} {rng.choice(['Labs', 'Studio', 'Health', 'Commerce', 'Finance', 'Academy', 'Market', 'Growth', 'Works', 'Collective'])}"
    company_slug = slugify(company_name)
    budget = int(rng.choice([5000, 8000, 12000, 15000, 25000, 40000, 60000, 90000]))
    return {
        "client_id": f"cli_{idx:04d}",
        "company_name": company_name,
        "company_slug": company_slug,
        "industry": industry,
        "region": region,
        "currency": currency,
        "objective": rng.choice(OBJECTIVES),
        "budget_monthly": budget,
        "voice": rng.choice(VOICE),
        "primary_channels": rng.sample(CHANNELS, k=rng.randint(3, 5)),
        "website": f"https://{company_slug}.example.com",
        "seed": rng.randint(1, 10_000_000),
    }


def generate_company_profile(rng: random.Random, client: dict) -> dict:
    return {
        "client_id": client["client_id"],
        "company_name": client["company_name"],
        "industry": client["industry"],
        "region": client["region"],
        "currency": client["currency"],
        "website": client["website"],
        "business_model": pick(rng, [("b2c", 2.0), ("b2b", 2.0), ("marketplace", 1.0), ("subscription", 1.5)]),
        "employee_band": pick(rng, [("1-10", 1.0), ("11-50", 2.0), ("51-200", 2.0), ("201-500", 1.0)]),
        "objective": client["objective"],
        "budget_monthly": client["budget_monthly"],
        "voice": client["voice"],
        "channels": client["primary_channels"],
        "created_at": datetime.utcnow().isoformat() + "Z",
    }


def generate_crm_contacts(rng: random.Random, client: dict) -> List[dict]:
    rows = []
    for i in range(rng.randint(80, 200)):
        first = rng.choice(FIRST_NAMES)
        last = rng.choice(LAST_NAMES)
        rows.append({
            "contact_id": f"{client['client_id']}_ct_{i+1:04d}",
            "full_name": f"{first} {last}",
            "email": f"{first.lower()}.{last.lower()}{i}@examplemail.com",
            "company": rng.choice([client["company_name"], f"{rng.choice(['Acme', 'Metro', 'Peak', 'Orbit', 'Zen'])} {rng.choice(['Ltd', 'Inc', 'LLC', 'Group'])}"]),
            "title": pick(rng, [("Founder", 1.0), ("Head of Growth", 1.5), ("Marketing Manager", 2.0), ("RevOps Manager", 1.0), ("Sales Lead", 1.2)]),
            "lifecycle_stage": pick(rng, [("lead", 3.0), ("mql", 2.0), ("sql", 1.5), ("customer", 1.0), ("churn_risk", 0.5)]),
            "source": pick(rng, [("website_form", 3.0), ("email_reply", 1.5), ("import", 2.0), ("event", 1.0), ("referral", 1.0)]),
            "country": rng.choice(["United States", "India", "United Kingdom", "Canada", "UAE", "Australia"]),
            "created_at": (date.today() - timedelta(days=rng.randint(0, 540))).isoformat(),
            "last_activity_at": (date.today() - timedelta(days=rng.randint(0, 120))).isoformat(),
        })
    return rows


def generate_crm_deals(rng: random.Random, client: dict, contacts: List[dict]) -> List[dict]:
    rows = []
    stages = ["new", "qualified", "proposal", "negotiation", "won", "lost"]
    for i in range(rng.randint(40, 120)):
        c = rng.choice(contacts)
        stage = pick(rng, [("qualified", 2.5), ("proposal", 2.0), ("negotiation", 1.5), ("won", 1.5), ("lost", 1.0), ("new", 1.0)])
        amount = round(rng.uniform(250, 25000), 2)
        close_date = date.today() - timedelta(days=rng.randint(0, 180))
        rows.append({
            "deal_id": f"{client['client_id']}_dl_{i+1:04d}",
            "contact_id": c["contact_id"],
            "deal_name": f"{client['company_name']} - {rng.choice(PRODUCTS)}",
            "stage": stage,
            "amount": amount,
            "currency": client["currency"],
            "probability": rng.randint(5, 95),
            "source": c["source"],
            "owner": rand_name(rng),
            "created_at": (close_date - timedelta(days=rng.randint(3, 60))).isoformat(),
            "close_date": close_date.isoformat(),
        })
    return rows


def generate_website_pages(rng: random.Random, client: dict) -> List[dict]:
    pages = [
        ("", "Home", "hero"),
        ("pricing", "Pricing", "conversion"),
        ("product", "Product", "feature"),
        ("about", "About", "trust"),
        ("blog/guide", "Guide", "seo"),
        ("case-studies", "Case Studies", "proof"),
        ("contact", "Contact", "conversion"),
    ]
    rows = []
    for slug, title, ptype in pages:
        text = f"{client['company_name']} helps customers improve {client['objective'].replace('_', ' ')} through its {client['industry']} offer."
        rows.append({
            "url": f"{client['website']}/{slug}".rstrip("/"),
            "page_type": ptype,
            "title": title,
            "h1": f"{client['company_name']} — {title}",
            "meta_description": text[:155],
            "content_text": text + " " + " ".join(rng.choice([
                "trusted by growing teams",
                "designed for measurable impact",
                "built for fast decision-making",
                "optimized for clarity and conversion",
            ]) for _ in range(4)),
            "word_count": rng.randint(250, 1600),
            "last_updated": (date.today() - timedelta(days=rng.randint(0, 300))).isoformat(),
        })
    return rows


def generate_search_console(rng: random.Random, client: dict) -> List[dict]:
    rows = []
    for i in range(40):
        rows.append({
            "query": f"{rng.choice(['best', 'top', 'how to', 'compare', 'buy'])} {client['industry']} {rng.choice(['software', 'services', 'tools', 'solution'])}",
            "page": rng.choice(["/", "/pricing", "/product", "/blog/guide", "/case-studies"]),
            "clicks": rng.randint(0, 1200),
            "impressions": rng.randint(100, 50000),
            "ctr": round(rng.uniform(0.001, 0.12), 4),
            "avg_position": round(rng.uniform(1.0, 45.0), 1),
            "country": rng.choice([client["region"], "US", "UK", "IN"]),
        })
    return rows


def generate_documents(rng: random.Random, client: dict) -> Tuple[List[dict], List[dict]]:
    briefs, uploads = [], []
    for i in range(rng.randint(3, 8)):
        briefs.append({
            "document_id": f"{client['client_id']}_brief_{i+1:03d}",
            "doc_type": "brief",
            "created_at": (datetime.utcnow() - timedelta(days=rng.randint(0, 45))).isoformat() + "Z",
            "title": rng.choice(["Q2 launch notes", "Creative review", "Budget revision", "Campaign brief", "Audience expansion memo"]),
            "raw_text": (
                f"We need a {rng.choice(TOPICS)} for {client['company_name']}. "
                f"Budget is around {client['budget_monthly']} {client['currency']} monthly. "
                f"Primary objective is {client['objective'].replace('_', ' ')}."
            ),
            "source": pick(rng, [("email", 2.0), ("notion", 1.0), ("doc", 1.5), ("slack", 1.5)]),
        })
    for i in range(rng.randint(5, 15)):
        uploads.append({
            "document_id": f"{client['client_id']}_upload_{i+1:03d}",
            "doc_type": pick(rng, [("pdf", 2.0), ("docx", 2.0), ("xlsx", 1.5), ("csv", 2.0), ("txt", 1.0), ("pptx", 1.0)]),
            "created_at": (datetime.utcnow() - timedelta(days=rng.randint(0, 90))).isoformat() + "Z",
            "filename": f"{rng.choice(['intake', 'report', 'invoice', 'audit', 'research', 'notes'])}_{i+1}.{pick(rng, [('pdf',1),('docx',1),('xlsx',1),('csv',1),('txt',1),('pptx',1)])}",
            "source": pick(rng, [("email_attachment", 2.0), ("drive", 1.5), ("upload_portal", 2.0), ("shared_link", 1.0)]),
            "text_preview": (
                f"{client['company_name']} customer data export with mixed quality fields, "
                f"some missing values, and campaign references."
            ),
        })
    return briefs, uploads


def generate_marketing_exports(rng: random.Random, client: dict) -> List[dict]:
    rows = []
    for day in range(60):
        dt = date.today() - timedelta(days=59 - day)
        for channel in client["primary_channels"]:
            spend = max(0.0, rng.gauss(client["budget_monthly"] / 30, client["budget_monthly"] / 150))
            impressions = max(0, int(spend * rng.uniform(800, 2500)))
            clicks = max(0, int(impressions * rng.uniform(0.01, 0.07)))
            conversions = max(0, int(clicks * rng.uniform(0.01, 0.12)))
            rows.append({
                "date": dt.isoformat(),
                "channel": channel,
                "campaign_name": f"{client['company_name']} {rng.choice(['Prospecting', 'Retargeting', 'Brand', 'Offer', 'Launch'])}",
                "ad_set_or_group": rng.choice(["A", "B", "C", "D"]),
                "spend": round(spend, 2),
                "impressions": impressions,
                "clicks": clicks,
                "conversions": conversions,
                "ctr": round(clicks / impressions, 4) if impressions else 0.0,
                "cpc": round(spend / clicks, 2) if clicks else 0.0,
                "cpa": round(spend / conversions, 2) if conversions else 0.0,
                "status": pick(rng, [("active", 4), ("paused", 1), ("learning", 1), ("limited", 0.5)]),
            })
    return rows


def generate_email_campaigns(rng: random.Random, client: dict) -> List[dict]:
    rows = []
    for i in range(rng.randint(20, 60)):
        sent = rng.randint(500, 50000)
        opens = int(sent * rng.uniform(0.12, 0.55))
        clicks = int(opens * rng.uniform(0.04, 0.22))
        rows.append({
            "campaign_id": f"{client['client_id']}_em_{i+1:04d}",
            "campaign_name": rng.choice(["Newsletter", "Launch", "Offer", "Education", "Re-engagement", "Winback"]),
            "subject_line": f"{rng.choice(['New', 'Last chance for', 'How to improve', 'A quick update on'])} {client['company_name']}",
            "sent": sent,
            "delivered": int(sent * rng.uniform(0.95, 0.999)),
            "opens": opens,
            "clicks": clicks,
            "unsubscribes": rng.randint(0, max(1, int(sent * 0.01))),
            "spam_complaints": rng.randint(0, 5),
            "send_date": (date.today() - timedelta(days=rng.randint(0, 180))).isoformat(),
        })
    return rows


def generate_social(rng: random.Random, client: dict) -> Tuple[List[dict], List[dict]]:
    posts, comments = [], []
    platforms = ["instagram", "linkedin", "facebook", "tiktok", "x"]
    for day in range(30):
        post_date = date.today() - timedelta(days=29 - day)
        for platform in rng.sample(platforms, k=rng.randint(1, 3)):
            post_id = f"{client['client_id']}_{platform}_{day+1:03d}"
            angle = rng.choice(["educational", "testimonial", "offer", "behind_the_scenes", "comparison"])
            posts.append({
                "post_id": post_id,
                "date": post_date.isoformat(),
                "platform": platform,
                "format": pick(rng, [("image", 2), ("carousel", 2), ("video", 1.5), ("text", 1)]),
                "caption": f"{client['company_name']} {angle} post for {client['industry']} with {client['voice']} tone.",
                "hashtags": [f"#{client['company_slug']}", f"#{angle}", f"#{client['industry']}"],
                "likes": rng.randint(5, 500),
                "shares": rng.randint(0, 80),
                "comments": rng.randint(0, 90),
                "saves": rng.randint(0, 120),
            })
            comments.extend([
                {
                    "post_id": post_id,
                    "comment_id": f"{post_id}_c1",
                    "author": rand_name(rng),
                    "sentiment": "positive",
                    "text": rng.choice(["This is useful.", "Great explanation.", "Love the clarity.", "Very helpful."]),
                    "likes": rng.randint(0, 25),
                },
                {
                    "post_id": post_id,
                    "comment_id": f"{post_id}_c2",
                    "author": rand_name(rng),
                    "sentiment": pick(rng, [("neutral", 2), ("negative", 1), ("positive", 1)]),
                    "text": rng.choice(["Can you share pricing?", "Interesting approach.", "Would like a demo.", "Not sure this applies to us."]),
                    "likes": rng.randint(0, 15),
                },
            ])
    return posts, comments


def generate_support(rng: random.Random, client: dict) -> Tuple[List[dict], List[dict]]:
    tickets, transcripts = [], []
    statuses = ["open", "pending", "resolved", "escalated"]
    channels = ["email", "chat", "phone", "web_form"]
    for i in range(rng.randint(40, 120)):
        status = pick(rng, [("resolved", 4), ("open", 2), ("pending", 2), ("escalated", 1)])
        tickets.append({
            "ticket_id": f"{client['client_id']}_tk_{i+1:04d}",
            "created_at": (date.today() - timedelta(days=rng.randint(0, 180))).isoformat(),
            "status": status,
            "priority": pick(rng, [("low", 2), ("medium", 3), ("high", 2), ("urgent", 1)]),
            "channel": rng.choice(channels),
            "category": pick(rng, [("billing", 2), ("technical", 3), ("account", 2), ("feature_request", 1.5), ("bug", 2), ("other", 1)]),
            "sentiment": pick(rng, [("positive", 1), ("neutral", 2), ("negative", 2)]),
            "csat": rng.choice([None, rng.randint(1, 5)]),
            "first_response_minutes": rng.randint(1, 2880),
            "resolution_minutes": rng.randint(10, 10080),
            "subject": rng.choice(["Login issue", "Refund request", "Feature question", "Invoice mismatch", "App error", "Upgrade help"]),
        })
    for i in range(rng.randint(30, 90)):
        transcripts.append({
            "conversation_id": f"{client['client_id']}_chat_{i+1:04d}",
            "channel": rng.choice(["live_chat", "email_thread", "support_portal"]),
            "messages": [
                {"speaker": "customer", "text": rng.choice(["I cannot access my account.", "Can you explain this invoice?", "The dashboard is slow.", "How do I upgrade?"]), "timestamp": datetime.utcnow().isoformat() + "Z"},
                {"speaker": "support", "text": rng.choice(["Thanks, I am checking this now.", "Please share a screenshot.", "We have resolved the issue.", "I can help with that."]), "timestamp": datetime.utcnow().isoformat() + "Z"},
            ],
        })
    return tickets, transcripts


def generate_analytics(rng: random.Random, client: dict) -> Tuple[List[dict], List[dict]]:
    sessions, events = [], []
    for day in range(60):
        dt = date.today() - timedelta(days=59 - day)
        for s in range(rng.randint(80, 800)):
            session_id = f"s_{client['client_id']}_{day}_{s}"
            user_id = short_hash(f"{client['client_id']}-{day}-{s}-{rng.randint(1, 10**9)}")
            source = pick(rng, [("google", 3), ("meta", 3), ("organic", 2), ("direct", 2), ("referral", 1)])
            device = pick(rng, [("mobile", 3), ("desktop", 2), ("tablet", 1)])
            country = rng.choice(["United States", "India", "United Kingdom", "Canada", "UAE", "Australia"])
            page_views = rng.randint(1, 8)
            session_events = rng.randint(2, 8)
            sessions.append({
                "session_id": session_id,
                "date": dt.isoformat(),
                "user_id": user_id,
                "source": source,
                "device": device,
                "country": country,
                "landing_page": rng.choice(["/", "/pricing", "/product", "/blog/guide", "/contact"]),
                "duration_seconds": rng.randint(12, 1800),
                "converted": rng.choice([0, 0, 0, 1]),
            })
            for ev in range(session_events):
                events.append({
                    "event_date": dt.isoformat(),
                    "timestamp": datetime.combine(dt, datetime.min.time()).replace(
                        hour=rng.randint(0, 23),
                        minute=rng.randint(0, 59),
                        second=rng.randint(0, 59)
                    ).isoformat() + "Z",
                    "session_id": session_id,
                    "user_id": user_id,
                    "event_type": pick(rng, [("page_view", 4), ("scroll", 2), ("view_item", 1.5), ("add_to_cart", 1.2), ("form_submit", 1.0), ("signup", 1.0), ("purchase", 0.8)]),
                    "page": rng.choice(["/", "/pricing", "/product", "/blog/guide", "/checkout"]),
                    "source": source,
                    "device": device,
                    "country": country,
                })
    return sessions, events


def generate_sales(rng: random.Random, client: dict) -> Tuple[List[dict], List[dict]]:
    orders, refunds = [], []
    for i in range(rng.randint(60, 240)):
        order_id = f"{client['client_id']}_ord_{i+1:05d}"
        status = pick(rng, [("paid", 9), ("pending", 1), ("refunded", 1)])
        amount = round(rng.uniform(49, 2500), 2)
        orders.append({
            "order_id": order_id,
            "created_at": (date.today() - timedelta(days=rng.randint(0, 180))).isoformat(),
            "customer_id": short_hash(f"{client['client_id']}-customer-{i}"),
            "product": rng.choice(PRODUCTS),
            "currency": client["currency"],
            "amount": amount,
            "discount_pct": rng.choice([0, 5, 10, 15, 20, 25]),
            "channel": rng.choice(client["primary_channels"]),
            "status": status,
            "payment_method": rng.choice(["card", "bank_transfer", "wallet", "upi", "paypal"]),
        })
        if status == "refunded":
            refunds.append({
                "refund_id": f"{client['client_id']}_rf_{i+1:05d}",
                "order_id": order_id,
                "refund_date": (date.today() - timedelta(days=rng.randint(0, 120))).isoformat(),
                "reason": rng.choice(["customer_request", "duplicate_charge", "product_issue", "shipping_delay", "other"]),
                "amount": round(amount * rng.uniform(0.5, 1.0), 2),
            })
    return orders, refunds


def generate_finance(rng: random.Random, client: dict) -> Tuple[List[dict], List[dict]]:
    invoices, payments = [], []
    for i in range(rng.randint(25, 80)):
        invoice_id = f"{client['client_id']}_inv_{i+1:04d}"
        amount = round(rng.uniform(150, 12000), 2)
        status = pick(rng, [("paid", 7), ("open", 2), ("overdue", 1)])
        invoices.append({
            "invoice_id": invoice_id,
            "invoice_date": (date.today() - timedelta(days=rng.randint(0, 180))).isoformat(),
            "due_date": (date.today() + timedelta(days=rng.randint(-30, 45))).isoformat(),
            "currency": client["currency"],
            "amount": amount,
            "status": status,
            "customer_name": rand_name(rng),
            "line_items": "; ".join(rng.sample(["strategy work", "creative work", "media spend", "consulting", "support", "setup fee"], k=rng.randint(1, 3))),
        })
        if status == "paid":
            payments.append({
                "payment_id": f"{client['client_id']}_pay_{i+1:04d}",
                "invoice_id": invoice_id,
                "payment_date": (date.today() - timedelta(days=rng.randint(0, 150))).isoformat(),
                "currency": client["currency"],
                "amount": amount,
                "method": rng.choice(["card", "bank_transfer", "upi", "paypal"]),
                "status": "settled",
            })
    return invoices, payments


def generate_product_feedback(rng: random.Random, client: dict) -> Tuple[List[dict], List[dict]]:
    feedback, requests = [], []
    for i in range(rng.randint(50, 180)):
        feedback.append({
            "feedback_id": f"{client['client_id']}_fb_{i+1:04d}",
            "created_at": (date.today() - timedelta(days=rng.randint(0, 180))).isoformat(),
            "source": rng.choice(["in_app", "email", "review_site", "support", "survey"]),
            "sentiment": pick(rng, [("positive", 3), ("neutral", 2), ("negative", 2)]),
            "rating": rng.randint(1, 5),
            "text": rng.choice([
                "The product is useful but onboarding is confusing.",
                "Great value, but I need better reporting.",
                "Love the service quality.",
                "The page is slow on mobile.",
                "Pricing is not clear enough.",
                "Support responded quickly.",
            ]),
        })
    for i in range(rng.randint(20, 80)):
        requests.append({
            "request_id": f"{client['client_id']}_fr_{i+1:04d}",
            "created_at": (date.today() - timedelta(days=rng.randint(0, 180))).isoformat(),
            "category": rng.choice(["feature", "bug", "ux", "integration", "reporting", "pricing"]),
            "priority": pick(rng, [("low", 2), ("medium", 3), ("high", 2), ("urgent", 1)]),
            "text": rng.choice([
                "Need CSV export for reports.",
                "Want clearer attribution.",
                "Need better mobile performance.",
                "Please add team permissions.",
                "Need webhook integration.",
                "Would like cheaper entry pricing.",
            ]),
        })
    return feedback, requests


def generate_notes(rng: random.Random, client: dict) -> Tuple[List[dict], List[dict]]:
    meeting_notes, raw_obs = [], []
    for i in range(rng.randint(10, 25)):
        meeting_notes.append({
            "note_id": f"{client['client_id']}_mn_{i+1:03d}",
            "created_at": (datetime.utcnow() - timedelta(days=rng.randint(0, 120))).isoformat() + "Z",
            "attendees": [rand_name(rng) for _ in range(rng.randint(2, 6))],
            "title": rng.choice(["Weekly review", "Client check-in", "Launch planning", "Budget discussion", "Performance review"]),
            "notes": [
                "Need cleaner reporting.",
                "CAC is volatile across channels.",
                "Creative fatigue showing up in paid social.",
                "Organic traffic is improving slowly.",
                "Support tickets increase after launches.",
            ],
        })
    for i in range(rng.randint(20, 50)):
        raw_obs.append({
            "observation_id": f"{client['client_id']}_obs_{i+1:03d}",
            "source": rng.choice(["call", "slack", "email", "doc", "whatsapp"]),
            "created_at": (datetime.utcnow() - timedelta(days=rng.randint(0, 180))).isoformat() + "Z",
            "text": rng.choice([
                "Attribution seems noisy.",
                "Reporting is delayed.",
                "Budget may need to shift next month.",
                "Geo performance differs a lot.",
                "Audience overlaps are likely causing waste.",
                "Copy is too aggressive for policy.",
            ]),
            "confidence": round(rng.uniform(0.4, 0.98), 2),
        })
    return meeting_notes, raw_obs


def write_client_package(base: Path, client: dict, rng: random.Random, manifest_rows: List[dict]) -> None:
    client_dir = base / f"client_id={client['client_id']}"
    mkdir(client_dir)

    profile = generate_company_profile(rng, client)
    contacts = generate_crm_contacts(rng, client)
    deals = generate_crm_deals(rng, client, contacts)
    website_pages = generate_website_pages(rng, client)
    search_console = generate_search_console(rng, client)
    briefs, uploads = generate_documents(rng, client)
    marketing_exports = generate_marketing_exports(rng, client)
    email_campaigns = generate_email_campaigns(rng, client)
    posts, comments = generate_social(rng, client)
    tickets, transcripts = generate_support(rng, client)
    sessions, events = generate_analytics(rng, client)
    orders, refunds = generate_sales(rng, client)
    invoices, payments = generate_finance(rng, client)
    feedback, feature_requests = generate_product_feedback(rng, client)
    meeting_notes, raw_obs = generate_notes(rng, client)

    write_json(client_dir / "company_profile.json", profile)
    write_csv(client_dir / "crm" / "contacts.csv", contacts, list(contacts[0].keys()))
    write_csv(client_dir / "crm" / "deals.csv", deals, list(deals[0].keys()))
    write_jsonl(client_dir / "website" / "pages.jsonl", website_pages)
    write_csv(client_dir / "website" / "search_console.csv", search_console, list(search_console[0].keys()))
    write_jsonl(client_dir / "documents" / "briefs.jsonl", briefs)
    write_jsonl(client_dir / "documents" / "uploads.jsonl", uploads)
    write_csv(client_dir / "marketing" / "ad_platform_exports.csv", marketing_exports, list(marketing_exports[0].keys()))
    write_csv(client_dir / "marketing" / "email_campaigns.csv", email_campaigns, list(email_campaigns[0].keys()))
    write_jsonl(client_dir / "social" / "posts.jsonl", posts)
    write_jsonl(client_dir / "social" / "comments.jsonl", comments)
    write_jsonl(client_dir / "support" / "tickets.jsonl", tickets)
    write_jsonl(client_dir / "support" / "chat_transcripts.jsonl", transcripts)
    write_csv(client_dir / "analytics" / "sessions.csv", sessions, list(sessions[0].keys()))
    write_csv(client_dir / "analytics" / "events.csv", events, list(events[0].keys()))
    write_csv(client_dir / "sales" / "orders.csv", orders, list(orders[0].keys()))
    write_csv(client_dir / "sales" / "refunds.csv", refunds if refunds else [{"refund_id": "", "order_id": "", "refund_date": "", "reason": "", "amount": ""}], list((refunds[0] if refunds else {"refund_id": "", "order_id": "", "refund_date": "", "reason": "", "amount": ""}).keys()))
    write_csv(client_dir / "finance" / "invoices.csv", invoices, list(invoices[0].keys()))
    write_csv(client_dir / "finance" / "payments.csv", payments if payments else [{"payment_id": "", "invoice_id": "", "payment_date": "", "currency": "", "amount": "", "method": "", "status": ""}], list((payments[0] if payments else {"payment_id": "", "invoice_id": "", "payment_date": "", "currency": "", "amount": "", "method": "", "status": ""}).keys()))
    write_jsonl(client_dir / "product" / "feedback.jsonl", feedback)
    write_jsonl(client_dir / "product" / "feature_requests.jsonl", feature_requests)
    write_jsonl(client_dir / "notes" / "meeting_notes.jsonl", meeting_notes)
    write_jsonl(client_dir / "notes" / "raw_observations.jsonl", raw_obs)

    counts = {
        "contacts": len(contacts),
        "deals": len(deals),
        "website_pages": len(website_pages),
        "search_console_rows": len(search_console),
        "briefs": len(briefs),
        "uploads": len(uploads),
        "marketing_rows": len(marketing_exports),
        "email_campaigns": len(email_campaigns),
        "posts": len(posts),
        "comments": len(comments),
        "tickets": len(tickets),
        "transcripts": len(transcripts),
        "sessions": len(sessions),
        "events": len(events),
        "orders": len(orders),
        "refunds": len(refunds),
        "invoices": len(invoices),
        "payments": len(payments),
        "feedback": len(feedback),
        "feature_requests": len(feature_requests),
        "meeting_notes": len(meeting_notes),
        "raw_observations": len(raw_obs),
    }

    write_json(client_dir / "manifest.json", {
        "client_id": client["client_id"],
        "company_name": client["company_name"],
        "industry": client["industry"],
        "region": client["region"],
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "counts": counts,
    })

    manifest_rows.append({
        "client_id": client["client_id"],
        "company_name": client["company_name"],
        "industry": client["industry"],
        "region": client["region"],
        "currency": client["currency"],
        "objective": client["objective"],
        "budget_monthly": client["budget_monthly"],
        "voice": client["voice"],
        "channels": "|".join(client["primary_channels"]),
        "website": client["website"],
    })


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate raw client-side data for testing downstream processing.")
    parser.add_argument("--output", type=str, default="./client_raw_data", help="Output directory")
    parser.add_argument("--clients", type=int, default=25, help="Number of clients")
    parser.add_argument("--seed", type=int, default=42, help="Random seed")
    parser.add_argument("--gzip-jsonl", action="store_true", help="Also create gzip copies for JSONL files")
    args = parser.parse_args()

    rng = random.Random(args.seed)
    base = Path(args.output).resolve()
    mkdir(base)

    clients = [create_client(rng, i + 1) for i in range(args.clients)]
    write_csv(base / "clients.csv", clients, ["client_id", "company_name", "company_slug", "industry", "region", "currency", "objective", "budget_monthly", "voice", "primary_channels", "website", "seed"])

    manifest_rows: List[dict] = []
    for client in clients:
        client_rng = random.Random(client["seed"])
        write_client_package(base, client, client_rng, manifest_rows)

    write_json(base / "manifest.json", {
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "seed": args.seed,
        "client_count": len(clients),
        "clients": manifest_rows,
    })

    if args.gzip_jsonl:
        # Optional companion gzip copies for JSONL files.
        for path in base.rglob("*.jsonl"):
            gz = path.with_suffix(path.suffix + ".gz")
            with path.open("rb") as src, gzip.open(gz, "wb") as dst:
                dst.write(src.read())

    print(f"Generated raw client data at: {base}")
    print("Recommended S3 sync command:")
    print(f"aws s3 sync {base} s3://your-bucket/marko-sim/v2/")

if __name__ == "__main__":
    main()
