# Checkpoints and collaboration

- Commit each coherent, validated batch of work. During longer tasks, make a checkpoint when a working milestone passes its relevant checks; do not wait until the entire task is finished.
- Before committing, inspect the staged diff and include only files or hunks owned by the current task. Preserve other collaborators' changes and coordinate when a shared file is being edited.
- Use descriptive commit messages and report the commit IDs with the completed work. Keep ROMs, private test fixtures, recordings, and generated audit output out of commits.
- Run checks appropriate to the changes before each checkpoint. If a failing check prevents a checkpoint, fix or explain it rather than labeling an unverified state as validated.

# Documentation

- Keep the top-level README a spoiler-free project overview with public media and brief player instructions.
- Put change summaries, code maps, detailed gameplay and development notes in `docs/agents/`; start with `docs/agents/README.md`. The changelog is `docs/agents/CHANGELOG.md`.
- Curated promotional GIFs and title screenshots requested for the README belong in `assets/readme/`. Raw recordings, capture frames and private fixtures remain under `.local/` and out of commits.
