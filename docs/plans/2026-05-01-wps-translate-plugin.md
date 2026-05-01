# WPS AI Smart Translation Plugin Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a WPS Web Add-in that translates Chinese documents to English with rich-text format preservation using LLM.

**Architecture:** Three-layer: WPS client (HTML/CSS/JS) ↔ Node.js middleware ↔ LLM API. Client serializes paragraph formatting into XML tags, backend translates via LLM with tag-preservation prompts, client deserializes and re-applies formatting.

**Tech Stack:** Node.js/Express (backend), Vanilla HTML/CSS/JS (frontend), OpenAI-compatible API (LLM)

---

## Task 1: Backend — Project Scaffold
**Files:**
- Create: `server/package.json`
- Create: `server/.env.example`
- Create: `server/server.js`

## Task 2: Backend — LLM Service
**Files:**
- Create: `server/services/llm.js`

## Task 3: Backend — Chunker Utility
**Files:**
- Create: `server/utils/chunker.js`

## Task 4: Backend — Translation Route
**Files:**
- Create: `server/routes/translate.js`

## Task 5: Frontend — Utilities
**Files:**
- Create: `client/util.js`

## Task 6: Frontend — Ribbon & Main
**Files:**
- Create: `client/ribbon.xml`
- Create: `client/main.js`
- Create: `client/index.html`
- Create: `client/package.json`

## Task 7: Frontend — Task Pane UI
**Files:**
- Create: `client/taskpane.html`
- Create: `client/taskpane.css`

## Task 8: Frontend — Core Translation Engine
**Files:**
- Create: `client/taskpane.js`
