# Fish-oil rediscovery test: protocol

Written on 2026-09-28, before Jev read any paper. This file and the code are committed before step 1 runs.
After that, the rules below don't change (see "Changes after the first run").

## The question

In 1986 Don Swanson proposed fish oil for Raynaud's syndrome. He did it by connecting two groups of papers
that never mentioned each other: Raynaud's papers reported thick blood, sticky platelets and narrowed
blood vessels, and separate papers reported that fish oil reduces those same things. A clinical trial
later confirmed that fish oil helped.

Can an automatic search find the same link using only papers published before 1986, with Jev
(TypeSafe's System One model) reading one paper at a time?

## Data

- PubMed records with a publication date of 1985 or earlier (`1800:1985[dp]`).
- A paper = its title, plus its abstract when it has one (most papers from before 1975 only have a title).
- MeSH headings and the chemical list (the `RN` field) are the National Library of Medicine's own indexing.
- Before the run: PubMed has 0 papers from before 1986 that are indexed with both Raynaud Disease and
  Fish Oils or Eicosapentaenoic Acid (checked on 2026-09-28). The run repeats this check on the titles and abstracts.

Model: `jev-1.13.0` (pinned, not the moving `jev-latest` alias).

## Step 1: what is abnormal in Raynaud's

- **Raynaud papers:** MeSH `Raynaud Disease`, published 1985 or earlier.
- **Candidate measures:** every MeSH heading on those papers that sits in a body-physiology branch of the MeSH tree:
  G03 Metabolism, G04 Cell Physiological Phenomena, G07 Physiological Phenomena,
  G08 Reproductive and Urinary Physiological Phenomena, G09 Circulatory and Respiratory Physiological Phenomena,
  G10 Digestive System and Oral Physiological Phenomena, G11 Musculoskeletal and Neural Physiological Phenomena,
  G12 Immune System Phenomena, G13 Integumentary System Physiological Phenomena, G14 Ocular Physiological Phenomena.
  Left out: G01 physical, G02 chemical, G05 genetic, G06 microbiological, G15 plant, G16 general biological,
  G17 mathematical. (Tree numbers come from the current MeSH, via NLM's MeSH SPARQL service.)
- **Jev's question**, once for each paper and each candidate measure on that paper: how is the measure in
  people with Raynaud's compared with people without it? Options: higher / lower / abnormal but direction
  not stated / no difference / not reported. Exact wording: `lib/questions.mjs`.
- A paper **votes** for an option when Jev gives that option a probability of 0.5 or more.
- A measure becomes a **bridge** when at least 2 papers vote for the same direction (higher or lower), and
  that direction has more votes than the opposite direction and more votes than "no difference".
  The bridge's direction is that majority direction.

## Step 2: what changes each bridge

- **Bridge papers:** MeSH `<bridge>[mh:noexp]`, published 1985 or earlier. If a bridge has more than
  10,000 papers, a random sample of 10,000 is used (seed 1986) to keep the run time bounded.
- **Candidate substances:** the chemical list (`RN` field) of each bridge paper. Papers with no chemicals are skipped.
- **Jev's question**, once for each paper, each bridge on that paper and each substance on that paper:
  what does the substance do to the measure? Options: lowers / raises / no clear effect / not reported.
- **Helpful direction:** "lowers" when the measure is higher in Raynaud's, "raises" when it is lower.
- A paper **supports** a substance–bridge link when Jev gives the helpful option a probability of 0.5 or more,
  and counts **against** it when the opposite option gets 0.5 or more.

## Ranking (plain code, no model)

- A substance earns **1 point per bridge** where at least 1 paper supports it and supporting papers
  outnumber papers against.
- Ranked by points, then by total supporting papers, then alphabetically.
- **Already known:** a substance counts as already linked to Raynaud's when it appears in the MeSH headings
  or chemical list of any Raynaud paper from before 1986, or its name appears in their titles or abstracts
  (ignoring case). Known substances are left out of the new-candidate ranking and reported separately.
- **Secondary ranking** (reported, not the headline): the same, but a bridge needs at least 2 supporting papers.
- **Baseline without Jev** (to show what the reading adds): same bridges and papers, but a substance earns
  1 point per bridge it merely appears with, tie-broken by how many papers it appears in.

## What counts as finding fish oil

- **Fish-oil family:** substances whose name contains `fish oil`, `cod liver oil`, `eicosapentaen`,
  `icosapent`, `docosahexaen`, `omega-3`, `n-3 fatty`, `marine oil` or `menhaden` (ignoring case).
- **Headline result:** the best rank of any fish-oil-family substance among the new candidates.
  - **Pass:** top 10. **Partial:** top 50. **Fail:** below 50, or not ranked at all.
- Also reported: the ranks of `Dietary Fats, Unsaturated` and `Fatty Acids, Unsaturated`
  (broader groups that include fish oil).

## Keeping Jev's own knowledge out

Jev was trained long after 1986, so it probably knows fish oil helps Raynaud's. The design stops that
knowledge from producing the answer:

- No question ever names both Raynaud's and a substance. Step 1 questions name Raynaud's and a measure.
  Step 2 questions name a substance and a measure. A test enforces this.
- Every connection between steps is made by counting in code.
- Jev could still bring general knowledge into how it reads a single paper. The report lists every paper
  behind the fish-oil result, with Jev's answer, so anyone can check them.

## Changes after the first run

Nothing in this file changes once step 1 has started. Bug fixes are allowed (a bug = the code not doing
what this file says). Each one is listed in the results with the numbers before and after. Any other
change is reported as a separate, labelled run next to the original one, never in place of it.
