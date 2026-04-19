---
description: "Toggle the Qualflare Stop hook on or off. The Stop hook is a passive nudge that suggests /qf-cover after sessions where source files changed without test updates. Pass 'on' or 'off'."
argument-hint: "on|off"
---

Update `.qualflare/config.json` to set `stopHookEnabled` based on the argument:

- If $ARGUMENTS is "on" or "yes" (case-insensitive): set `stopHookEnabled: true`
- If $ARGUMENTS is "off" or "no" (case-insensitive): set `stopHookEnabled: false`
- If $ARGUMENTS is empty or unrecognized: tell the user the current setting (read `.qualflare/config.json`) and show usage: `/qf-hook on` or `/qf-hook off`

After updating: confirm with "Stop hook is now **on** ✅" or "Stop hook is now **off** ⏹".

If `.qualflare/config.json` does not exist, create it with `{ "version": 1, "stopHookEnabled": <value> }`.
