# 48Date Database Diagram (DBML)

This folder contains the official **DBML (Database Markup Language)** schema for the 48Date PostgreSQL database.

- **DBML Schema File:** [`schema.dbml`](./schema.dbml)

---

## Overview

The database consists of **24 tables** and **18 enums** organized into 7 logical domain groups:

| Domain Group | Tables Included | Description |
|---|---|---|
| **Auth & Profiles** | `users`, `devices`, `images`, `discovery_preferences` | User identities, auth flags, categorized profile details, push tokens, and photo metadata. |
| **Discovery & Matching** | `discovery_actions`, `matches`, `conversations`, `messages` | Swipe actions (Like/Pass/SuperLike), pair matching, real-time chat conversations, and message history. |
| **Date Planner** | `date_plans`, `date_ratings` | 48Date planning engine (venues, Mapbox coordinates, times, status), and double-blind post-date safety/behavior reviews. |
| **Trust & Safety** | `trust_scores`, `trust_score_events`, `reports`, `blocks` | Trust score (default 50), audit history events, moderation reports, and two-way blocking. |
| **Mini Games** | `games`, `game_questions`, `game_sessions`, `game_answers` | In-app icebreakers & "This or That" games between matched pairs. |
| **Social Stories** | `success_stories`, `success_story_likes`, `success_story_comments` | Couples' success stories, community moderation status, likes, and comments. |
| **Billing & Alerts** | `subscriptions`, `subscription_events`, `notifications` | In-app purchase entitlements (RevenueCat/Apple/Google), raw webhook events, and notifications. |

---

## How to Visualize

### Option 1: dbdiagram.io (Instant & Free)
1. Open [https://dbdiagram.io](https://dbdiagram.io) in your browser.
2. Copy the entire contents of [`schema.dbml`](./schema.dbml).
3. Paste into the left editor pane on dbdiagram.io.
4. The complete interactive ER diagram with relationships, foreign keys, and table groups will render immediately. You can export it as PNG, PDF, or SVG.

### Option 2: VS Code / IDE Extensions
1. Install the **vscode-dbml** or **DBML ERD Visualizer** extension in VS Code / Antigravity IDE.
2. Open [`schema.dbml`](./schema.dbml) and click the preview button in the top right.

### Option 3: dbdocs CLI
```bash
npm install -g dbdocs
dbdocs build dbml/schema.dbml --project 48date
```
