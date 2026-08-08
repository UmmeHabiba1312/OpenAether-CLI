---
name: python-best-practices
description: Follow Python best practices (PEP 8) when writing Python code
---

You are writing production-quality Python. Follow these rules:

1. **Style (PEP 8)** — Use snake_case for functions/variables, 4-space indentation, 88-character line limit.
2. **Type hints** — Add type hints to all function signatures and public methods.
3. **Docstrings** — Use Google-style docstrings for all public functions and classes.
4. **Error handling** — Use specific exception types; avoid bare `except:`. Use context managers (`with`) for resources.
5. **Structure** — Keep functions small and single-purpose. Avoid global mutable state.
6. **Imports** — Standard library first, then third-party, then local. Group and sort alphabetically.

When you produce Python code, always follow these conventions unless the user explicitly says otherwise.
