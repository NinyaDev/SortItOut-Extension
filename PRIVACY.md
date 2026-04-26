---
layout: default
title: Privacy Policy
---

# Privacy Policy — SortItOut

**Last updated:** April 1, 2026

## What We Collect

SortItOut accesses the following data from your email account:

- **Email headers only:** sender name, sender address, and List-Unsubscribe header
- **Email metadata:** read/unread status and message count per sender
- **Authentication tokens:** managed by Chrome (Gmail) and stored locally (Outlook)

We **never** read your email content, attachments, or contacts.

## How We Use It

- Identify senders with unsubscribe options in your inbox
- Perform unsubscribe actions (one-click POST, open link, or provide mailto address)
- Cache scan results locally so you don't have to rescan every time
- Maintain a dismissed sender list so reviewed senders don't reappear

## Data Storage

All data is stored locally on your device using Chrome's `chrome.storage.local` API. This includes cached scan results, your dismissed sender list, cooldown preferences, and Outlook authentication tokens.

**No data is ever sent to any external server.** There is no backend, no analytics, and no tracking of any kind.

## Data Sharing

We do not sell, transfer, or share any user data with third parties. Period.

## Data Transmission

All communication with Gmail and Microsoft Outlook APIs is over HTTPS. Unsubscribe requests are sent exclusively over HTTPS.

## Limited Use Disclosure

The use of information received from Google APIs will adhere to the Chrome Web Store User Data Policy, including the Limited Use requirements.

## Your Control

- **Delete scan data:** clear your dismissed list from within the extension
- **Remove all data:** uninstalling the extension deletes all locally stored data
- **Revoke access:** remove the extension's permissions from your Google or Microsoft account settings at any time

## Contact

Questions about this policy? Open an issue at [github.com/NinyaDev/SortItOut-Extension](https://github.com/NinyaDev/SortItOut-Extension/issues).
