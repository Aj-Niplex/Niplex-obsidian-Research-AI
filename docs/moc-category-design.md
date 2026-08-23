# AI-discovered MOC category design

## Target hierarchy

The generated structure is intentionally small and navigational rather than a bulk vault dump:

```text
MOCs/
├── Love.md
├── Goals.md
├── Meeting.md
└── MOCs super.md
```

The names above are examples only. The model chooses the actual category names from the note properties and bounded note excerpts. `MOCs super.md` is the entry point. It links to each category MOC, explains what belongs inside that category, and recommends useful combinations of category MOCs for a research question.

## Category note contract

Every category note contains a short model-written description, a statement of the signals used to assign notes, and a list of wiki-links. A note can appear in multiple category notes when its properties and content support multiple categories. The plugin never forces a note into exactly one category.

```markdown
# <Model-selected category>

## What belongs here
<short description>

## Why notes are assigned here
<property and bounded-content signals>

## Notes
- [[Some note]]
```

## Super-MOC contract

```markdown
# MOCs super

## Start here
- [[<Category A>]] — <description>
- [[<Category B>]] — <description>

## Recommended combinations
- [[<Category A>]] + [[<Category C>]] — <when this combination is useful>
```

The super-MOC is a recommendation layer, not another copy of note content. It contains category descriptions and links only.

## Sequential processing and research navigation

The create flow processes every eligible Markdown note sequentially by default. It reads one note at a time and sends only frontmatter, file metadata, and a bounded opening excerpt for that note. There is no arbitrary 20-note batch ceiling, and the plugin never sends all note bodies in one request. The operation remains user-visible through progress updates and can be limited by an explicit positive count when a user wants a smaller maintenance run.

The adjust flow selects one recently edited eligible note and sends only that note’s bounded context to the provider. It then updates only the affected category MOCs and the super-MOC. Existing category links are preserved, and duplicate links are not added.

For ordinary research, the runtime injects a bounded snapshot of `MOCs super.md` at the beginning of every run when that file exists. The model uses it as a navigation index, chooses relevant category MOCs, and then follows only relevant note links with one bounded `read_file_chunk` call at a time. If the index does not answer the question, the model may use focused search. The step budget remains the runaway-loop guard; it is not a hidden note-count target.

When a provider returns a rate-limit or quota response, the runtime checks that provider’s live model catalogue and tries the next available model. It never switches providers silently. A user-ordered fallback list is treated as a preference and is filtered against the live catalogue when the catalogue is available.

## Model output contract

The category call requests JSON with this shape:

```json
{
  "categories": [
    {
      "name": "Short category name",
      "description": "What this category contains",
      "reason": "Signals that make this note belong here"
    }
  ]
}
```

The plugin validates and normalizes the response, limits category count and name length, rejects unsafe path characters, and falls back to a readable `Uncategorized` category only when the provider returns no usable category.

## Privacy boundary

Only the selected note’s metadata and bounded excerpt are sent for categorization. Category notes and the super-MOC contain links and model-generated descriptions, not copied note bodies. API keys remain in Obsidian SecretStorage and are never included in MOC files.
