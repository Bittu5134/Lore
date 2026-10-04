Lore is a local architectural knowledge engine designed to preserve the “why” behind software decisions rather than just storing the final code.   
PNG
Core Concept & Problem Solved

    The "Black Box" Problem: Modern autonomous AI coding agents like Cline generate code at rapid speed, but their intermediate reasoning and architectural trade-offs are lost once the task finishes.   
    PNG+ 1

    The Solution: Lore maintains a living, local wiki of project decisions directly inside the repository. It captures the rationale, discarded approaches, and trade-offs that standard Git commits and diffs fail to communicate.   
    PNG+ 3

Key Capabilities

    Native Cline Thought Capture: Hooks into Cline's reasoning loop to intercept inner monologues, tool usage, and problem-solving steps in real time.   
    PNG

    Automated ADR Generation: Automatically structures and indexes Architectural Decision Records (ADRs) as markdown files alongside the codebase.   
    PNG+ 1

    Preserving Project Continuity: Prevents unmaintainable legacy code by ensuring future developers and subsequent AI agent prompts understand past constraints before making modifications.   
    PNG+ 1