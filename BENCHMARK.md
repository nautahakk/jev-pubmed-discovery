# Hidden-years test: protocol

Written on 2026-09-29, before any Jev call for this test. The fish-oil run ([PROTOCOL.md](PROTOCOL.md),
[RESULTS.md](RESULTS.md)) missed its bar: fish oil ranked #74 of 1,446. This test checks whether new
scoring rules do better on many cases at once, without tuning them to a known answer.

## The question

If the method only sees papers published up to 1995, how often does it put a drug that was first
tried for that disease between 1996 and 2005 near the top of its list?

## The cases (picked by code, not by hand)

Picked by `scripts/prep/pick-benchmark.mjs`; the list is in `data/benchmark.json`.

- **Pool:** every MeSH disease heading in branches C01–C20, shuffled with seed 1995.
- Taken in that order when a disease has:
  - 1,000–6,000 papers indexed with it up to 1995 (Raynaud's had 2,646 up to 1985);
  - 20+ papers in 1996–2005 tagged as drug treatment of it;
  - 5+ hidden answers.
- The first 10 that qualify are used, split by a seeded shuffle into **5 practice** and **5 exam** diseases.
- **Hidden answer:** a substance tagged "therapeutic use" in 2+ of those 1996–2005 treatment papers that
  - no paper about the disease from up to 1995 mentions (the method's own "already known" check);
  - isn't a drug-category label (MeSH branch D27, like "Vasodilator Agents");
  - already had 20+ papers of its own by 1995, so it could be found.
- **Caveat:** "tried as a treatment" isn't "it worked". Failed trials count too. This measures whether the
  method points at what researchers went on to test, which is the standard way to score this kind of search.

## The method

The same two steps as PROTOCOL.md, with the cutoff moved to 1995 (papers published 1995 or earlier).

**Reading plan** (measured on the fish-oil run by `scripts/prep/reading-plans.mjs`): Jev is only asked about a
substance on a paper when PubMed tags that substance as given (pharmacology, therapeutic use, administration &
dosage, adverse effects, toxicity, poisoning or pharmacokinetics), when the substance has no heading of its own
to judge by, or when the paper tags the measure with "drug effects". On the fish-oil run this kept 94% of the
links and 91% of the single-paper links for 69% of the cost. Random caps were rejected: 2,000 papers per link
kept only 51% of links and 38% of single-paper links. Bridges still use up to 10,000 papers (seed 1986).

Jev's answers are saved per paper, substance and measure, and reused when another disease needs the same one.
Model: `jev-1.13.0`.

## Scoring rules to compare

Code: `lib/rules.mjs`. None of them names a disease, drug or measure.

| Rule | What it does |
|---|---|
| **R0**, as run | 1 point per bridge with 1+ supporting paper and more support than against (PROTOCOL.md) |
| **R1**, sorted | R0, but enzymes, receptors (MeSH D08.811, D12.776.543.750, D12.776.826, D12.776.827) and drug-category labels (D27) move to a separate "targets and categories" list instead of the ranking |
| **R1s**, strict | R1, and the ranking only keeps substances that have a pharmacological action recorded in MeSH; the rest move to the separate list |
| **R2**, shared points | R1, plus bridges in the same MeSH branch (first two levels, like G09.330) share one point between them |
| **R3**, rare links weigh more | R1, plus each bridge weighs log10(all PubMed papers up to 1995 ÷ papers on that measure) |

**Counting baseline** (no reading by Jev): the same bridges and papers, but a paper counts as support
whenever the substance and the bridge are both on it. Scored with the same rule as the winner.

## How the rules are scored

- **Main number:** the share of diseases where at least one hidden answer is in the top 10 new candidates
  ("would checking the top 10 have found something researchers later tried?").
- **Second number:** the share of all hidden answers that land in the top 50.
- For each disease, the chance level is reported too: how likely a random ranking is to do as well.

## Practice, then exam

1. Run every rule on the 5 practice diseases. Keep the rule with the best main number (ties go to the second
   number, then to the simpler rule in the order R0, R1, R1s, R2, R3).
2. Run that rule and R0 once on the 5 exam diseases. **The exam result is the headline.** Nothing changes after it.
3. The fish-oil run is shown next to the practice results, but it doesn't count toward choosing the rule
   (we already know its answer) and it's never an exam case. Before this test, on 2026-09-29, the rules
   scored fish oil like this (best fish-oil-family rank): R0 #74, R1 #57, R1s #226, R2 #29, R3 #54.
   None reached the top 10, and R1s shows how a strict rule can bury a real find.

Exam diseases' hidden answers stay in `data/benchmark.json` and aren't printed or looked at before the exam.

## Budget

Róbert sets the budget. The run can stop after any disease and pick up again later, because answers are saved.
Costs are estimated in the prep output, and the actual cost is reported with the results.
