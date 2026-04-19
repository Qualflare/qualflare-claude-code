---
description: "Toggle the Qualflare Stop hook on or off. The Stop hook is a passive nudge that suggests /qf-cover after sessions where source files changed without test updates. Pass 'on' or 'off'."
argument-hint: "on|off"
---

Update `.qualflare/config.json` to set `stopHookEnabled` based on the argument:

- If $ARGUMENTS is "on" or "yes" (case-insensitive): set `stopHookEnabled: true`. Confirm: "Stop hook is now **on** ✅ — you'll get a nudge after sessions where source files change without test updates."
- If $ARGUMENTS is "off" or "no" (case-insensitive): set `stopHookEnabled: false`. Confirm: "Stop hook is now **off** ⏹ — run `/qf-hook on` to re-enable."
- If $ARGUMENTS is empty or unrecognized: print current status in this format:

```
Stop hook: ✅ enabled  (or ❌ disabled)

Usage:
  /qf-hook on    — enable the post-session nudge
  /qf-hook off   — disable the post-session nudge
```

If `.qualflare/config.json` does not exist:
- When toggling (on/off): create it with `{ "version": 1, "stopHookEnabled": <value> }` and confirm normally.
- When showing status (no args): print "Stop hook: ❌ not configured — run `/qf-init` to set up, or `/qf-hook on` to enable directly."
