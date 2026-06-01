// const buckets = new Map();

// function createRateLimiter({ windowMs = 15 * 60 * 1000, max = 10, keyPrefix = "default" } = {}) {
//   return (req, res, next) => {
//     const key = `${keyPrefix}:${req.ip || "unknown"}`;
//     const now = Date.now();
//     const bucket = buckets.get(key) || { count: 0, resetAt: now + windowMs };

//     if (now > bucket.resetAt) {
//       bucket.count = 0;
//       bucket.resetAt = now + windowMs;
//     }

//     bucket.count += 1;
//     buckets.set(key, bucket);

//     if (bucket.count > max) {
//       return res.status(429).json({
//         message: "Too many requests. Please try again in a few minutes.",
//       });
//     }

//     return next();
//   };
// }

// module.exports = createRateLimiter;

const buckets = new Map();

function createRateLimiter({
  windowMs = 15 * 60 * 1000,
  max = 10,
  keyPrefix = "default",
} = {}) {
  return (req, res, next) => {
    const ip =
      req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
      req.ip ||
      req.connection?.remoteAddress ||
      "unknown";

    const key = `${keyPrefix}:${ip}`;
    const now = Date.now();

    const bucket = buckets.get(key) || {
      count: 0,
      resetAt: now + windowMs,
    };

    if (now >= bucket.resetAt) {
      bucket.count = 0;
      bucket.resetAt = now + windowMs;
    }

    bucket.count += 1;
    buckets.set(key, bucket);

    res.setHeader("X-RateLimit-Limit", String(max));
    res.setHeader(
      "X-RateLimit-Remaining",
      String(Math.max(max - bucket.count, 0)),
    );
    res.setHeader(
      "X-RateLimit-Reset",
      String(Math.ceil(bucket.resetAt / 1000)),
    );

    if (bucket.count > max) {
      res.setHeader(
        "Retry-After",
        String(Math.ceil((bucket.resetAt - now) / 1000)),
      );
      return res.status(429).json({
        message: "Too many requests. Please try again later.",
      });
    }

    return next();
  };
}

module.exports = createRateLimiter;
