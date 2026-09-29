# Jev Discovery

Can an AI model rediscover a known medical finding using only papers published before it was made?

This repo tests that question with [Jev](https://typesafe.ai), a model by TypeSafe. The rules were written and committed before Jev read a single paper, and the result is reported as it came out, including the miss.

> This is a test of a search method. It is not medical advice, and nothing here claims that any substance treats anything.

## The question

In 1986 the information scientist Don Swanson proposed fish oil for Raynaud's syndrome, a condition where fingers and toes lose blood flow in the cold. He didn't run an experiment. He noticed that two groups of papers never cited each other: Raynaud's papers described thick blood, sticky platelets and narrowed blood vessels, while fish oil papers described fish oil reducing those same things. A clinical trial in 1989 found that fish oil helped.

The test: give an automated search only papers published up to 1985 and see whether it finds the fish oil link on its own.

## How it works

1. Jev reads each Raynaud's paper from before 1986 and says whether the body measures indexed on it (blood viscosity, platelet aggregation and so on) are higher or lower in people with Raynaud's. A measure that at least two papers agree on becomes a "bridge".
2. Jev reads papers about each bridge and says what each substance listed on the paper does to that measure.
3. Plain code, with no model involved, ranks the substances. A substance gets a point for every bridge it pushes in the helpful direction. Anything already linked to Raynaud's before 1986 is left out.

Jev was trained long after 1986, so it probably knows the answer. To keep that knowledge out, no question ever names both Raynaud's and a substance (a test checks this), and every connection between the steps is made by counting in code.

The full rules are in [PROTOCOL.md](PROTOCOL.md), committed in `3ecfd9d` before step 1 ran. A pass meant a fish oil substance in the top 10 new candidates. Top 50 counted as partial.

## Result: #74 of 1,446, short of the bar

Eicosapentaenoic acid (EPA, one of the main fatty acids in fish oil) was the best-ranked fish oil substance at #74 of 1,446 new candidates. That's about the top 5%, but short of the top-10 bar, so by the rules this run fails.

What worked:

- Step 1 found all four links Swanson used: thicker blood, stickier platelets, narrowed blood vessels and stiffer red blood cells.
- Jev read the key fish oil papers correctly. For example, it gave [Reduction in blood viscosity by eicosapentaenoic acid (1981)](https://pubmed.ncbi.nlm.nih.gov/6114257/) a 0.99 probability of lowering blood viscosity.
- The reading mattered. Ranking the same papers by simple co-occurrence, with no Jev, put EPA at #886 instead of #74.

Why it missed: most of the 13 bridges measure overlapping things, like blood flow, blood pressure, skin temperature and circulation. The rules counted each one as separate evidence, so broad circulation drugs from shock and anesthesia studies collected the most points (methylprednisolone 8, adenosine 7). The list also mixes in things that aren't treatments, like receptors and cyclic AMP.

[RESULTS.md](RESULTS.md) has the full tables and every paper behind the fish oil links, with Jev's answer for each, so anyone can check them.

| Run facts | |
|---|---|
| Model | jev-1.13.0 |
| Papers read | 828 Raynaud's papers, then 43,020 bridge papers |
| Questions in step 2 | 152,575, with 0 failed papers |
| Time | about 57 minutes |
| Cost | about $1.98 |

## Next: the hidden-years test

One case can't show whether a rule change helps, and tuning the rules until fish oil ranks higher would only teach the method this one answer. So the next test, in [BENCHMARK.md](BENCHMARK.md), uses 50 diseases picked by code. The method only sees papers up to 1995, and it's scored on whether it points at drugs that researchers first tried between 1996 and 2005. Twenty-five practice diseases choose between scoring rules, and the other 25 are the exam that gives the headline number.

It hasn't run yet. The prep prices it at about $115 in Jev credits and 50 hours of nonstop reading. Many diseases share the same body measures and answers get reused, so the real bill should land lower, possibly around $40. Either way, it's more than I can put into it right now.

## Later: all of PubMed

Each disease currently needs its own reading run. The bigger version reads all of PubMed once, about 41 million papers, and saves what every paper says about every substance and body measure. After that, any disease could be checked by counting in code, with no new Jev calls. The U.S. National Library of Medicine's SemMedDB already pulls statements out of PubMed with older text-mining tools, so it would also be a direct comparison of how well a model like Jev reads.

At today's prices one pass would cost roughly $2,000 to $6,000 in Jev credits and take more than three weeks of nonstop reading at the current rate limit. That needs compute credits or a sponsor.

## Run it yourself

You need Node.js 20 or newer, an API key from [TypeSafe](https://typesafe.ai) and an internet connection, since the papers come from PubMed. Nothing else to install.

```bash
export TYPESAFE_API_KEY=your-key
npm test
npm run fetch:raynaud
npm run stage1
npm run fetch:bridges
npm run stage2
npm run rank
```

On Windows PowerShell, set the key with `$env:TYPESAFE_API_KEY="your-key"` instead.

- Downloads and Jev's answers go in `data/`, over 100 MB for the fish oil run. Set `DATA_DIR` to keep them somewhere else.
- Each step saves as it goes, so a stopped run picks up where it left off.
- `npm run rank` rewrites RESULTS.md.
- To watch a run live, start `node scripts/dashboard.mjs` and open http://localhost:4392.
- A full run takes about an hour and costs about $2 at current Jev prices.

## Files

- `PROTOCOL.md`: the rules for the fish oil test, written before the run
- `RESULTS.md`: the full results, generated by `npm run rank`
- `BENCHMARK.md`: the rules for the hidden-years test
- `lib/`: PubMed downloads, MeSH lookups, Jev calls and scoring rules
- `scripts/`: the run steps, the hidden-years test and a live dashboard
- `test/`: the tests (`npm test`)

## Credits

- The idea comes from Don R. Swanson, "Fish oil, Raynaud's syndrome, and undiscovered public knowledge," Perspectives in Biology and Medicine, 1986.
- Paper data: PubMed and MeSH from the U.S. National Library of Medicine.
- Model: Jev by TypeSafe.
- Made by Róbert Nikulásson. The code was written with Claude Code.

Built with [Claude Code](https://claude.com/claude-code).

## License

MIT
