const jwt = require("jsonwebtoken");


const authMiddleware = (req, res, next) => {
  console.log("HEADERS:", req.headers.cookie);
  console.log("REQ.COOKIES:", req.cookies);
  const token = req.cookies?.token;

  console.log("TOKEN IN MIDDLEWARE:", token);

  if (!token) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    console.log("Decoded",decoded)
    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid token" });
  }
};

module.exports = authMiddleware;
