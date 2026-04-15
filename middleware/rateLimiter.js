const buckets = new Map();

function createRateLimiter({ windowMs = 15 * 60 * 1000, max = 10, keyPrefix = "default" } = {}) {
  return (req, res, next) => {
    const key = `${keyPrefix}:${req.ip || "unknown"}`;
    const now = Date.now();
    const bucket = buckets.get(key) || { count: 0, resetAt: now + windowMs };

    if (now > bucket.resetAt) {
      bucket.count = 0;
      bucket.resetAt = now + windowMs;
    }

    bucket.count += 1;
    buckets.set(key, bucket);

    if (bucket.count > max) {
      return res.status(429).json({
        message: "Too many requests. Please try again in a few minutes.",
      });
    }

    return next();
  };
}

module.exports = createRateLimiter;
