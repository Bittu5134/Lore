# Lore — Architectural Memory

Lore keeps a local wiki of past decisions in `.lore/`. It exists so you understand **why** the code
is the way it is before you change it.

## Rules

1. **Read the lore first.** Before modifying code, open `.lore/wiki/index.md` and read every ADR whose
   title or tags match the files you are about to touch (`.lore/wiki/ADR-*.md`). This is not optional.
2. **Respect past decisions.** If an ADR records a decision, either follow it, or state explicitly in
   your response why it should be superseded. Never silently contradict a recorded decision.
3. **Record new decisions.** When you make a non-obvious architectural choice (a library, a pattern,
   a trade-off), record it:
   - call the `record_decision` tool if the Lore MCP server is connected, or
   - append an ADR to `.lore/drafts/` using the template in `.lore/wiki/ADR-0000-template.md`.
   Include the **context**, the **decision**, and the **alternatives you rejected and why**.
4. **Never edit `.lore/raw/`.** It is the immutable source log. Only `.lore/wiki/` ADRs are curated.
5. **Mention what you learned.** If your task reveals a constraint others should know, note it so Lore
   can compile it into the wiki.
