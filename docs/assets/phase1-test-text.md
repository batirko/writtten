# Phase 1 Test Text

> Paste this into the editor to verify Phase 1 sidecar behaviour. The document is a realistic PM PRD with four planted issues listed at the bottom.

---

## Fraud Alert Notifications — Product Requirements

**Stage:** Internal PRD for the payments team. Audience is engineering and design leads. Goal is to ship the first version by end of Q3.

---

### Background

Our transaction decline rate has been climbing for three consecutive quarters. The root cause, per the fraud team's analysis, is that legitimate users are being blocked by overly aggressive rules with no way to dispute in real time. This initiative gives users a path to unblock themselves without contacting support.

### Goal

Reduce false-positive friction for legitimate transactions while maintaining our fraud block rate at or above current levels.

### Success metrics

- False-positive dispute rate drops by at least 30% within 60 days of launch.
- Support ticket volume for declined transactions decreases by 20%.
- Zero increase in confirmed fraud loss rate.

### Proposed solution

When a transaction is blocked, the user receives a push notification within 10 seconds. The notification includes a one-tap challenge (biometric or PIN) that, if passed, allows the transaction to retry once.

The challenge window is 60 seconds from the time of the block. After 60 seconds, the transaction expires and the user must start over at the merchant.

### Scope — what's in

- Push notification delivery for mobile (iOS and Android).
- One-tap biometric challenge using existing auth infrastructure.
- Single retry on successful challenge.
- Logging of all challenge outcomes for the fraud model.

### Out of scope

- Web/desktop flows (browser does not support this notification pattern reliably).
- Multiple retries. Users who fail the challenge are directed to support.

### Non-goals

We are explicitly not trying to reduce the overall fraud block rate. The goal is to ensure that the 30% of blocks that are false positives reach the user in time to act.

### Technical approach

The notification must arrive within 30 seconds of the block event to be useful. Latency above this threshold correlates with transaction abandonment in our A/B data.

The retry mechanism will reuse the existing 3DS challenge infrastructure, with a new lightweight wrapper. Engineering estimates 3–4 weeks of backend work and 1–2 weeks of mobile integration.

### Risks

The main risk is notification delivery reliability. On Android, background notification delivery varies significantly across OEM battery optimization settings. We accept this as a known limitation for v1 and will monitor delivery rates post-launch.

A secondary risk is that users who dismiss or miss the notification will have a worse experience than today — they get a block with no recourse versus a block with a failed recourse. Product judgment: this is acceptable if the overall false-positive rate improves.

### Open questions

1. Should we notify on _all_ fraud blocks, or only on blocks above a certain confidence threshold? Notifying on high-confidence fraud may train users to expect a challenge for every decline.
2. Do we surface the reason for the block in the notification, or keep it generic? Legal needs to weigh in on disclosure requirements.

### Timeline

Engineering work begins in Week 1 of Q3. Given the 5–6 week estimate, we are targeting a soft launch in the final week of Q2 to a 10% rollout cohort.

---

## Expected observations

| Issue                                                                                                 | Type            | Location                                 |
| ----------------------------------------------------------------------------------------------------- | --------------- | ---------------------------------------- |
| Notification must arrive "within 10 seconds" (§Solution) vs "within 30 seconds" (§Technical approach) | `contradiction` | §Proposed solution ↔ §Technical approach |
| Launch target is "end of Q3" (stage field) but §Timeline says "final week of Q2"                      | `contradiction` | Stage definition ↔ §Timeline             |
| "30% of blocks that are false positives" stated as known fact with no cited basis                     | `clarity`       | §Non-goals                               |
| "varies significantly" — vague, unquantified claim                                                    | `clarity`       | §Risks                                   |
