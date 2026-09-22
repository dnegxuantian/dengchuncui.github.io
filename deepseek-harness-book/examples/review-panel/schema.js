export const topics = ['parent_path', 'duplicate_target', 'empty_input'];
const assessment = {
  type: 'object', additionalProperties: false,
  properties: {
    behavior: {type:'string', enum:['returns_plan','throws_error','unknown']},
    file: {type:'string'}, line: {type:'integer'}, reason: {type:'string'},
  },
  required:['behavior','file','line','reason'],
};

// Copy citations from the captured files; a valid location does not prove the model's reasoning.
export function attachQuotes(review, files, selected) {
  const checks = {};
  for (const [topic, claim] of Object.entries(review.checks)) {
    const lines = selected.includes(claim.file) ? files[claim.file].split('\n') : [];
    if (!Number.isSafeInteger(claim.line) || claim.line < 1 || claim.line > lines.length
      || !lines[claim.line - 1].trim()) throw new Error('引用位置不在本次材料的非空行中');
    checks[topic] = {...claim, quote: lines[claim.line - 1]};
  }
  return {...review, checks};
}
export const reviewSchema = {
  type:'object', additionalProperties:false,
  properties:{
    verdict:{type:'string',enum:['approve','request_changes','needs_context']},
    summary:{type:'string'},
    checks:{type:'object',additionalProperties:false,
      properties:Object.fromEntries(topics.map(topic=>[topic,assessment])),required:topics},
  }, required:['verdict','summary','checks'],
};

// A disagreement is a review finding, never resolved by majority vote.
export function disagreements(reviews) {
  return topics.flatMap(topic=>{
    const claims=reviews.filter(r=>r.status==='completed')
      .map(r=>({role:r.role,...r.review.checks[topic]}))
      .filter(claim=>claim.behavior!=='unknown');
    return new Set(claims.map(claim=>claim.behavior)).size>1 ? [{topic,claims}] : [];
  });
}
