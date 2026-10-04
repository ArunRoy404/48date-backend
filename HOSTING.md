# 48Date — Complete Hosting & Services Guide (Hostinger Deployment)

This document is the definitive master reference for deploying the **48Date** platform using a **Hostinger VPS**. It details every required service, third-party integration, configuration, cost, and developer responsibility.

> **Note on Mapbox:** Place search and mapping are handled directly by the Flutter mobile application. Mapbox has been removed from backend requirements and external dependencies.

---

## 1. System Architecture Overview

All core backend components run on a single **Hostinger KVM VPS** using Docker and PM2. External cloud services are leveraged strictly where specialized carriers (AWS/Cloudflare for media, Twilio, Firebase) are optimal.

```
                                      ┌──────────────────────────────────────────────────────────┐
                                      │                      HOSTINGER VPS                       │
                                      │        (Ubuntu 22.04 / 24.04 LTS — KVM 2 or KVM 4)       │
                                      │                                                          │
Flutter App ─── HTTPS / WSS ─────────►│  [ Nginx Reverse Proxy + Let's Encrypt SSL ]             │
                                      │    ├── /api & REST ──────► [ NestJS API (Node 22 LTS) ]  │
React Admin ─── HTTPS ───────────────►│    ├── /socket.io ───────► [ Socket.IO Chat Gateway ]    │
                                      │    └── /admin (static) ──► [ React Admin Build ]         │
                                      │                                │          │          │   │
                                      │                 ┌──────────────┘          │          │   │
                                      │                 ▼                         ▼          │   │
                                      │       [ PostgreSQL 16 ]            [ Redis 7 ]       │   │
                                      │       (Docker: 127.0.0.1)      (Docker: 127.0.0.1)   │   │
                                      │                                                      │   │
                                      │       [ Face Recognition Microservice (FastAPI) ] ◄──┘   │
                                      │       (Docker: 127.0.0.1:5001 — InsightFace/ONNX)        │
                                      └──────────────────────────────────────────────────────────┘
                                                │                  │                   │
                                                ▼                  ▼                   ▼
                                     [ AWS S3 or Cloudflare R2 ]  [ Twilio ]    [ Firebase FCM ]
                                         (Photos / Selfies)      (Phone OTP)     (Push Alerts)
```

---

## 2. Master Services Inventory

> [!IMPORTANT]
> Services requiring a **credit card or payment method on file** (even those with a free starter allowance like AWS S3, Cloudflare R2, or RevenueCat) are listed under **PAID / BILLING REQUIRED** so the client is fully aware that billing details and usage charges apply.

### 🔴 PAID & USAGE-BASED SERVICES (Credit Card / Billing Setup Required)

| Service | Provider | Purpose | Billing Model & Pricing | Managed By |
|---|---|---|---|---|
| **Hostinger VPS** | Hostinger | Runs NestJS, Postgres, Redis, Face AI microservice, and Nginx. Recommended: **KVM 2** (8 GB RAM) or **KVM 4** (16 GB RAM). | **Fixed:** ~$7.00 – $14.00 / month | Backend Dev |
| **Domain Name** | Hostinger / Namecheap | Root domain (e.g., `48date.com`) for API (`api.`) and Admin (`admin.`). | **Fixed:** ~$10.00 – $15.00 / year | Client / Backend |
| **Business Email (SMTP)** | Hostinger | Mailbox (`noreply@48date.com`) for sending verification codes and system notices via SMTP. | **Fixed:** ~$0.00 – $2.00 / month *(often bundled free with domain)* | Backend Dev |
| **Option A: AWS S3** *(Recommended if client has AWS)* | Amazon Web Services (AWS) | Stores user profile photos, venue images, and selfies. Client already owns an AWS account. | **Usage-Based (AWS Card):** ~$0.023/GB/mo storage. First 100 GB/mo egress free (or 1 TB/mo free if paired with Amazon CloudFront CDN). | Backend Dev |
| **Option B: Cloudflare R2** *(Alternative)* | Cloudflare | S3-compatible object storage with $0 egress fees. | **Usage-Based (Card Required):** Free for first 10 GB/mo; then $0.015/GB/mo storage + $0.36/million write operations ($0 egress). | Backend Dev |
| **Phone OTP & SMS** | Twilio | Sends SMS verification codes during user login (Twilio Verify) + fallback SMS alerts. | **Pay-As-You-Go (Card Required):** $20 initial deposit. ~$1.15/mo for phone number + ~$0.05 per verification check + SMS carrier fee. | Backend Dev |
| **In-App Subscriptions** | RevenueCat | Validates App Store & Google Play receipts and syncs status via webhook. | **Usage-Based (Card Required):** Free up to $2,500/month tracked app revenue; then 1% of tracked revenue. | Shared |
| **Apple Developer Program** | Apple | Required to publish and distribute the Flutter iOS app on the App Store. | **Annual Fee:** $99.00 / year | Client / Flutter Dev |
| **Google Play Console** | Google | Required to publish and distribute the Flutter Android app on Google Play. | **One-Time Fee:** $25.00 | Client / Flutter Dev |

---

### 🟢 TRULY 100% FREE & SELF-HOSTED (Zero Billing, No Credit Card Needed)

These services are completely open-source or run locally on the VPS you already own. There are no trial periods, no cards required, and zero recurring external fees.

| Service | Provider | Purpose | License / Terms | Managed By |
|---|---|---|---|---|
| **Face Recognition Engine** | Self-Hosted (Python FastAPI + InsightFace / DeepFace) | Compares user selfie against profile photos for trust verification. Runs locally on the VPS in Docker. | **100% Free & Open Source (MIT)** — Unlimited verifications, zero API fees. | Backend Dev |
| **Database & Cache** | PostgreSQL 16 & Redis 7 | Core database and BullMQ queue/chat presence. Runs in Docker on localhost. | **100% Free & Open Source** | Backend Dev |
| **Push Notifications** | Google Firebase (FCM) | Match alerts, chat messages, and date notifications sent to mobile devices. | **100% Free** (Unlimited push notifications via Spark plan; no card required). | Shared |
| **SSL / TLS Encryption** | Let's Encrypt (Certbot) | Automatic free SSL certificate renewal for `https://` and `wss://`. Non-profit certificate authority. | **100% Free** | Backend Dev |
| **DNS Management** | Cloudflare DNS | Manages DNS records, DDOS protection, and edge SSL caching (free tier). | **100% Free** (No card required for basic DNS). | Backend Dev |
| **Google Sign-In Auth** | Google Cloud Console | OAuth 2.0 Web Client ID to verify Google ID token signatures. | **100% Free** | Shared |
| **Server Software** | Linux, Node.js 22 LTS, Nginx, PM2, Docker | Complete server operating stack. | **100% Free & Open Source** | Backend Dev |

---

## 3. Storage Bucket Comparison: AWS S3 vs. Cloudflare R2

The backend uses the official AWS S3 SDK (`@aws-sdk/client-s3`), making switching between **AWS S3** and **Cloudflare R2** a simple configuration change:

### Option A: AWS S3 (Client Already Has AWS)
* **Why Choose This:** The client already bought/owns an AWS account. You do **not** need to create another cloud account or add credit card info to Cloudflare. All cloud storage billing stays under the client's existing AWS invoice.
* **Cost:** ~$0.023 per GB / month. For 20 GB of photos, storage is only ~$0.46/month.
* **CDN Acceleration (CloudFront):** You can easily attach an AWS CloudFront distribution in front of S3 for instant image loading worldwide. CloudFront gives **1 TB (1,000 GB) per month of free data transfer**.
* **What you need from AWS:**
  1. An S3 bucket (e.g. `48date-images`) with public read permissions (or CloudFront origin access control).
  2. An IAM User with `AmazonS3FullAccess` programmatic access keys (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`).

### Option B: Cloudflare R2 (Alternative)
* **Why Choose This:** Zero egress (download) fees forever, and the first 10 GB of storage are free every month.
* **Trade-off:** The client must open a Cloudflare account and enter credit card information.

---

## 4. Face Recognition System (Self-Hosted on VPS)

Instead of paying commercial cloud APIs (like AWS Rekognition at ~$1.00/1,000 checks), 48Date uses a **100% free, self-hosted AI microservice** running on the Hostinger VPS.

### Architecture & Specs
* **Technology:** Python FastAPI microservice running **InsightFace (ArcFace) with ONNX Runtime (CPU)**.
* **Deployment:** Runs as a separate lightweight Docker container on `http://127.0.0.1:5001`.
* **Execution:** Handled asynchronously by NestJS using the existing **BullMQ worker queue** so selfie verification never blocks the Node.js event loop or user chat traffic.
* **Performance on CPU:**
  * Memory: **~300 – 400 MB RAM**
  * Speed: **~150 – 300 ms** per face comparison on a standard Hostinger KVM CPU.
  * Accuracy: **> 99.8%** benchmark accuracy (LFW).
* **Cost:** **$0.00** forever (Open-source MIT license).

---

## 5. Responsibility Separation: Backend vs. Flutter Developer

### 🖥️ Managed by BACKEND Developer
1. **Server Setup:** Launch Hostinger KVM VPS (Ubuntu 22.04/24.04 LTS), install Node.js 22 LTS, Docker, PM2, Nginx.
2. **Domain & DNS:** Point `api.yourdomain.com` (and `admin.yourdomain.com`) to the VPS IP via Cloudflare DNS.
3. **Database & Cache:** Deploy Postgres 16 and Redis 7 in Docker, execute `npx prisma migrate deploy` and `npm run db:seed`.
4. **Automated Backups:** Set up daily automated `pg_dump` backup scripts pushing encrypted archives to S3 / R2 (or Hostinger VPS Snapshot).
5. **Twilio Integration:** Configure Twilio Verify service credentials and purchased phone number in `.env`.
6. **Email SMTP:** Configure Hostinger Business Email mailbox (`noreply@`) credentials in `.env`.
7. **Storage Bucket (S3 or R2):** Create bucket (`48date-images`), set up public CDN / access domain, and add API keys in `.env`.
8. **Face Recognition Microservice:** Build and run the lightweight InsightFace Docker container on port `5001`.
9. **Admin Panel Hosting:** Build and serve the React Admin Panel static files via Nginx.
10. **Reviewer Test Account:** Maintain a seeded bypass test account for Apple & Google app reviewers.

### 📱 Managed by FLUTTER Developer
1. **Developer Accounts:** Apple Developer ($99/yr) and Google Play Console ($25 once) setup.
2. **App Store Publishing:** App screenshots, descriptions, age ratings, privacy declarations, and review submissions.
3. **App Code Signing:** Provisioning profiles, iOS distribution certificates, and Android upload keystores.
4. **Firebase Client Setup:** Integrate `google-services.json` (Android) and `GoogleService-Info.plist` (iOS).
5. **Apple Push (APNs):** Generate `.p8` auth key in Apple Developer portal and upload it to Firebase Console.
6. **Google Sign-In SDK:** Configure SHA-1 fingerprint in Google Cloud Console and generate the Web Client ID.
7. **RevenueCat Mobile SDK:** Implement in-app purchase UI / paywalls and link store product IDs.
8. **In-App Place Search & Maps:** Handle map rendering and venue search directly inside the mobile app.

### 🤝 Quick Handoff Checklist
* **Backend Dev gives Flutter Dev:** Live API URL (`https://api.yourdomain.com`) + Apple reviewer test login (`+10000000000` / OTP `123456`).
* **Flutter Dev gives Backend Dev:** Google OAuth **Web Client ID** (`GOOGLE_CLIENT_ID`) for `.env`.
* **Flutter Dev / Client gives Backend Dev:** RevenueCat **Webhook Secret** (`REVENUECAT_WEBHOOK_SECRET`) for `.env`.

---

## 6. Critical Technical & Security Rules for VPS

### 1. Lock Down Postgres and Redis Ports
* By default, Docker port mappings like `"5433:5432"` bind to `0.0.0.0`, exposing your database to the public internet and bypassing standard UFW firewalls.
* **Requirement:** In production `docker-compose.yml`, bind ports strictly to `127.0.0.1`:
  ```yaml
  ports:
    - "127.0.0.1:5433:5432"
  ```

### 2. Nginx Body Size Limit (Prevent Image Upload Failures)
* Nginx defaults to a maximum body size of **1MB**. High-resolution smartphone photos will trigger `413 Request Entity Too Large`.
* **Requirement:** Add `client_max_body_size 25M;` in the Nginx configuration.

### 3. Nginx WebSocket Proxy (Socket.IO Chat)
* Real-time chat requires explicit WebSocket upgrade headers in Nginx:
  ```nginx
  location /socket.io/ {
      proxy_pass http://127.0.0.1:3000;
      proxy_http_version 1.1;
      proxy_set_header Upgrade $http_upgrade;
      proxy_set_header Connection "upgrade";
      proxy_set_header Host $host;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }
  ```

### 4. Production Secrets Requirement
* The app refuses to boot in production (`NODE_ENV=production`) if JWT secrets are left as placeholder values (`changeme`).
* Generate unique 32-byte hex keys:
  ```bash
  openssl rand -hex 32
  ```

---

## 7. Complete Production `.env` File Template

```bash
# ==============================================================================
# 48Date Backend — Production Environment Variables
# ==============================================================================

# --- Core Settings ---
NODE_ENV=production
PORT=3000

# --- Database & Cache ---
# Postgres running via Docker on localhost:5433
DATABASE_URL=postgresql://postgres:STRONG_DB_PASSWORD@127.0.0.1:5433/date48?schema=public
REDIS_URL=redis://127.0.0.1:6379

# --- Authentication (JWT) ---
# Generate with: openssl rand -hex 32
JWT_ACCESS_SECRET=paste_generated_32_byte_access_secret_here
JWT_REFRESH_SECRET=paste_generated_32_byte_refresh_secret_here
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# --- Google Sign-In ---
# Web Client ID from Google Cloud Console
GOOGLE_CLIENT_ID=xxxxxxxxxxxx-xxxxxxxxxxxxxxxx.apps.googleusercontent.com

# --- Production Security & Validation ---
STRICT_URL_VALIDATION=true
RATE_LIMIT_ENABLED=true
RATE_LIMIT_PER_MINUTE=100
RATE_LIMIT_AUTH_PER_MINUTE=10

# ------------------------------------------------------------------------------
# --- Image Storage: CHOICE 1 — AWS S3 (Client has AWS) ---
# ------------------------------------------------------------------------------
# Set these if using AWS S3 (with or without CloudFront):
# AWS_ACCESS_KEY_ID=AKIAxxxxxxxxxxxxxxxx
# AWS_SECRET_ACCESS_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
# AWS_REGION=us-east-1
# AWS_S3_BUCKET=48date-images
# AWS_PUBLIC_URL=https://d123456abcdef.cloudfront.net

# ------------------------------------------------------------------------------
# --- Image Storage: CHOICE 2 — Cloudflare R2 (Alternative) ---
# ------------------------------------------------------------------------------
R2_ACCOUNT_ID=your_cloudflare_account_id
R2_ACCESS_KEY_ID=your_r2_access_key_id
R2_SECRET_ACCESS_KEY=your_r2_secret_access_key
R2_BUCKET=48date-images
R2_PUBLIC_URL=https://images.yourdomain.com

# --- Phone Verification (Twilio) ---
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_VERIFY_SERVICE_SID=VAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_PHONE_NUMBER=+1234567890

# --- Transactional Email (Hostinger SMTP) ---
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=587
SMTP_USER=noreply@yourdomain.com
SMTP_PASS=your_mailbox_password
SMTP_FROM="48Date <noreply@yourdomain.com>"

# --- Push Notifications (Firebase Cloud Messaging) ---
# Minified single-line JSON of your Firebase service account key
FCM_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"...","private_key":"..."}

# --- Subscriptions (RevenueCat) ---
REVENUECAT_WEBHOOK_SECRET=your_revenuecat_webhook_secret
```

---

## 8. Estimated Cost Summary

| Item | Billing Type | Pricing / Thresholds |
|---|---|---|
| **Hostinger KVM 2 VPS** | Fixed Monthly | ~$7.99 / month |
| **Domain Name (`.com`)** | Fixed Annual | ~$10.00 – $14.00 / year |
| **Hostinger Business Email** | Fixed Monthly | ~$0.00 – $1.99 / month |
| **AWS S3 Storage (Option A)** | Usage-Based (AWS Card) | ~$0.023/GB/mo (~$1–$3/mo for images; 1 TB free egress via CloudFront) |
| **Cloudflare R2 (Option B)** | Usage-Based (Card on file) | Free up to 10 GB; then $0.015/GB/mo |
| **Twilio Verify & SMS** | Pay-As-You-Go (Card on file) | ~$1.15/mo (number) + ~$0.05 per user OTP verification |
| **RevenueCat** | Usage-Based (Card on file) | Free up to $2,500/mo app revenue; then 1% |
| **Apple Developer Program** | Annual | $99.00 / year |
| **Google Play Console** | One-time | $25.00 |
| **Face Recognition Engine** | Self-Hosted | **$0.00 (100% Free & Open Source)** |
| **Firebase Cloud Messaging** | Spark Free Tier | **$0.00 (100% Free)** |
| **PostgreSQL 16 & Redis 7** | Self-Hosted | **$0.00 (100% Free)** |
| **Let's Encrypt SSL (Certbot)**| Non-Profit | **$0.00 (100% Free)** |
| **Total Base Monthly Server Cost**| — | **~$8.00 – $12.00 / month** |
| **Total Variable Cost** | — | **~$0.05 per verified user (Twilio) + small storage usage** |

---

## 9. Client Action Checklist

Share this checklist with the client to set up all necessary accounts and billing methods:

- [ ] **Hostinger Account:** Add payment method. Purchase **Hostinger KVM 2 VPS** (Ubuntu 22.04/24.04 64-bit) + Domain + Business Email.
- [ ] **Storage Bucket Choice (Choose ONE):**
  - **Option A (AWS S3):** Use existing AWS account $\rightarrow$ create S3 bucket (`48date-images`) + create IAM user credentials for backend.
  - **Option B (Cloudflare R2):** Create Cloudflare account, add card, create R2 bucket (`48date-images`) + generate R2 API token.
- [ ] **Twilio Account:** Add credit card and add $20 initial balance. Create a **Verify Service** and purchase 1 SMS phone number. *(Submit A2P 10DLC registration if sending to US numbers).*
- [ ] **RevenueCat Account:** Add payment method. Create project, link iOS and Android products, and generate a Webhook secret.
- [ ] **Apple Developer ($99/yr):** Enroll in Apple Developer Program with credit card.
- [ ] **Google Play Console ($25 once):** Create Google Play Developer account with credit card.
- [ ] **Google Firebase Console (Free):** Create project, enable Cloud Messaging, and download Service Account JSON key (no billing required for FCM).
- [ ] **Google Cloud Console (Free):** Create OAuth 2.0 Web Client ID for Google login.
