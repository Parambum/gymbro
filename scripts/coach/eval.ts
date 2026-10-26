/**
 * How well does the research library answer, and where should it say "I don't
 * know"?
 *
 *   npm run coach:eval            summary table
 *   npm run coach:eval -- --show  also print every composed answer
 *
 * Two sets of questions:
 *
 *   IN_SCOPE   things a lifter asks that the library covers, each with the
 *              paper (PMCID) that should come back in the top results;
 *   OUT_SCOPE  things it does not cover, which must fall below the confidence
 *              floor rather than be answered with something nearby.
 *
 * The table shows the best passage cosine for each, which is how
 * MIN_PASSAGE_COSINE in src/lib/coach/rag/compose.ts was chosen: between the
 * weakest in-scope score and the strongest out-of-scope one.
 */
import { MIN_PASSAGE_COSINE, composeAnswer, sourceLines } from "../../src/lib/coach/rag/compose";
import { retrieve } from "../../src/lib/coach/rag/retrieve";
import { loadKnowledgeBase } from "../../src/lib/coach/rag/store";

const IN_SCOPE: Array<[string, string[]]> = [
  ["how much protein should I eat per day to build muscle?", ["PMC5477153", "PMC9441410", "PMC6090881"]],
  ["is there an anabolic window after training?", ["PMC5596471", "PMC5477153"]],
  ["should I take protein before bed?", ["PMC5477153", "PMC5596471"]],
  ["how much creatine should I take and do I need to load it?", ["PMC5469049", "PMC7871530", "PMC11703406"]],
  ["does creatine cause hair loss?", ["PMC7871530", "PMC11703406"]],
  ["is creatine bad for your kidneys?", ["PMC7871530", "PMC5469049", "PMC11703406"]],
  ["how much caffeine before a workout?", ["PMC7777221", "PMC10375938", "PMC9987737"]],
  ["do I need to train to failure to grow?", ["PMC9935748"]],
  ["how long should I rest between sets for hypertrophy?", ["PMC11349676"]],
  ["heavy weights or light weights for muscle growth?", ["PMC7927075"]],
  ["how many times a week should I train each muscle?", ["PMC6081873", "PMC8363540", "PMC11239729"]],
  ["when should I take a deload week?", ["PMC10511399", "PMC10948666"]],
  ["will cardio kill my gains?", ["PMC8891239"]],
  ["is HIIT better than steady cardio for fat loss?", ["PMC10048683"]],
  ["does intermittent fasting work with lifting?", ["PMC10770891", "PMC13665703", "PMC5470183"]],
  ["does stretching build muscle?", ["PMC11026323"]],
  ["does stretching after a workout help recovery?", ["PMC8133317"]],
  ["does lack of sleep make me weaker?", ["PMC12263768"]],
  ["can I build muscle on a vegan diet?", ["PMC5598028"]],
  ["what does beta-alanine do?", ["PMC4501114"]],
  ["is fish oil worth taking for lifters?", ["PMC11737053"]],
  ["are energy drinks safe before the gym?", ["PMC9987737"]],
  ["best diet to lose fat while keeping muscle", ["PMC13665703", "PMC5470183", "PMC4033492"]],
  ["how fast can I expect to get stronger?", ["PMC10101404", "PMC11239729"]],
  ["does HMB work?", ["PMC11740297", "PMC6090881"]],
];

const OUT_SCOPE = [
  "what is the capital of France?",
  "how do I change the oil in my car?",
  "recommend a good pizza place in Mumbai",
  "write me a poem about the ocean",
  "what's the best programming language to learn?",
  "who won the cricket world cup?",
  "how do I fix a leaking tap?",
  "what is the weather tomorrow?",
];

async function main() {
  const show = process.argv.includes("--show");
  const kb = loadKnowledgeBase();
  console.log(`library: ${kb.sources.length} sources, ${kb.passages.length} passages · floor ${MIN_PASSAGE_COSINE}\n`);

  let hits = 0;
  let answered = 0;
  const inScores: number[] = [];
  for (const [q, expected] of IN_SCOPE) {
    const r = await retrieve(q);
    const ids = r.hits.map((h) => kb.sources[kb.passages[h.passage].source].id);
    const found = expected.some((e) => ids.slice(0, 3).includes(e));
    const answer = composeAnswer(q, kb, r);
    if (found) hits++;
    if (answer.confident) answered++;
    inScores.push(r.hits[0]?.dense ?? 0);
    console.log(`${found ? "hit " : "MISS"} ${answer.confident ? "ans" : "---"} ${(r.hits[0]?.dense ?? 0).toFixed(3)}  ${q}  → ${[...new Set(ids.slice(0, 3))].join(", ")}`);
    if (show && answer.confident) {
      for (const b of answer.bullets) console.log(`        - ${b}`);
      for (const s of sourceLines(answer.citations)) console.log(`          ${s}`);
    }
  }

  console.log("");
  let refused = 0;
  const outScores: number[] = [];
  for (const q of OUT_SCOPE) {
    const r = await retrieve(q);
    const answer = composeAnswer(q, kb, r);
    if (!answer.confident) refused++;
    outScores.push(r.hits[0]?.dense ?? 0);
    console.log(`${answer.confident ? "ANSWERED" : "refused "} ${(r.hits[0]?.dense ?? 0).toFixed(3)}  ${q}`);
  }

  console.log(
    `\nin scope:  right paper in top 3 for ${hits}/${IN_SCOPE.length}, answered ${answered}/${IN_SCOPE.length}, weakest top score ${Math.min(...inScores).toFixed(3)}`,
  );
  console.log(`out scope: refused ${refused}/${OUT_SCOPE.length}, strongest top score ${Math.max(...outScores).toFixed(3)}`);
  if (hits < IN_SCOPE.length || refused < OUT_SCOPE.length || answered < IN_SCOPE.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
