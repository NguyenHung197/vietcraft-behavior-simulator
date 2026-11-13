// Varies the wording of reviews, shop replies and buyer messages (phrase bank: data/text-parts.json).
const lower = (s) => s.charAt(0).toLowerCase() + s.slice(1);

// Joins two pieces: a sentence break, or a comma with the next piece in lower case.
function glue(rng, a, b) {
  if (!a) return b;
  if (!b) return a;
  if (/[.!?,;:…]$/.test(a)) return `${a} ${b}`;
  return rng.chance(0.5) ? `${a}. ${b}` : `${a}, ${lower(b)}`;
}

const joinAll = (rng, pieces) => pieces.filter(Boolean).reduce((acc, p) => glue(rng, acc, p));
const sentiment = (rating) => (rating >= 4 ? 'pos' : rating === 3 ? 'neu' : 'neg');

// Opener, the original sentence (kept), 0-2 aspects, closer; sometimes lower case and an emoji.
function reviewText(rng, texts, parts, rating) {
  const s = parts.review[sentiment(rating)];
  const aspects = rng.shuffle(s.aspect).slice(0, rng.int(0, 2));
  let text = joinAll(rng, [rng.pick(s.open), rng.pick(texts.reviews[rating]), ...aspects, rng.pick(s.close)]);
  if (rng.chance(0.1)) text = text.toLowerCase();
  if (rng.chance(0.15)) text = `${text} ${rng.pick(parts.emoji[sentiment(rating)])}`;
  return text;
}

function sellerReply(rng, texts, parts) {
  return joinAll(rng, [rng.pick(parts.seller.open), rng.pick(texts.chat.seller), rng.pick(parts.seller.close)]);
}

// kind is 'product' or 'order'. Half of the messages get a short closer such as "ạ".
function buyerMsg(rng, texts, parts, kind) {
  const base = rng.pick(texts.chat.buyer[kind]);
  const text = rng.chance(0.5) ? glue(rng, base, rng.pick(parts.buyer.close)) : base;
  return rng.chance(0.1) ? text.toLowerCase() : text;
}

module.exports = { reviewText, sellerReply, buyerMsg };
