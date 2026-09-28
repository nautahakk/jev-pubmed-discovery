// The only two questions Jev is ever asked. Step 1 names Raynaud's and a measure, never a
// substance; step 2 names a substance and a measure, never Raynaud's (tests guard both).
export const MODEL = "jev-1.13.0";

export function paperState(paper) {
  return { title: paper.title, abstract: paper.abstract || "(no abstract)" };
}

function stage1Question(m) {
  return {
    type: "choice",
    instructions: `According to this paper, how is ${m} in people with Raynaud's phenomenon compared with people who don't have it?`,
    criteria: {
      higher: `The paper reports that ${m} is higher, greater, increased, stronger or exaggerated in people with Raynaud's phenomenon.`,
      lower: `The paper reports that ${m} is lower, smaller, decreased, weaker or impaired in people with Raynaud's phenomenon.`,
      abnormal_unclear: `The paper reports that ${m} is abnormal in people with Raynaud's phenomenon but doesn't say whether it is higher or lower.`,
      no_difference: `The paper reports that ${m} is normal, or no different, in people with Raynaud's phenomenon.`,
      not_reported: `The paper doesn't compare ${m} between people with and without Raynaud's phenomenon (for example, it only reports the effect of a treatment, or doesn't discuss ${m}).`,
    },
  };
}

function stage2Question(s, m) {
  return {
    type: "choice",
    instructions: `According to this paper, what does ${s} do to ${m}?`,
    criteria: {
      lowers: `The paper reports that ${s} lowers, reduces, decreases or inhibits ${m}.`,
      raises: `The paper reports that ${s} raises, increases, enhances or induces ${m}.`,
      no_effect: `The paper reports that ${s} was tested and did not clearly change ${m}.`,
      not_reported: `The paper doesn't report an effect of ${s} on ${m} (for example, ${s} is only measured, or isn't discussed in connection with ${m}).`,
    },
  };
}

export function stage1Request(paper, measures) {
  const ids = {}, questions = {};
  measures.forEach((m, i) => { ids[`m${i}`] = m; questions[`m${i}`] = stage1Question(m); });
  return { body: { model: MODEL, state: paperState(paper), questions }, ids };
}

export function stage2Request(paper, pairs) {
  const ids = {}, questions = {};
  pairs.forEach((pair, i) => { ids[`q${i}`] = pair; questions[`q${i}`] = stage2Question(pair.substance, pair.measure); });
  return { body: { model: MODEL, state: paperState(paper), questions }, ids };
}
