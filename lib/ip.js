// Private-range client IP, so the BE per-IP view limit applies per simulated person.
const fakeIp = (rng) => `10.${rng.int(0, 255)}.${rng.int(0, 255)}.${rng.int(1, 254)}`;

module.exports = { fakeIp };
