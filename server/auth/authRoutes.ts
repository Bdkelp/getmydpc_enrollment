import { Router } from "express";
import passport from "passport";
import { 
  hashPassword, 
  generateToken, 
  generateVerificationToken, 
  sendVerificationEmail,
  sendPasswordResetEmail,
  determineUserRole,
  verifyToken
} from "./authService";
import { storage } from "../storage";
import crypto from "crypto";

const router = Router();

// Registration endpoint
router.post("/api/auth/register", async (req, res) => {
  try {
    const { email, password, firstName, lastName, username } = req.body;

    // Validate input
    if (!email || !password || !firstName || !lastName) {
      return res.status(400).json({ 
        message: "Email, password, first name, and last name are required" 
      });
    }

    // Check if user exists
    const existingUser = await storage.getUserByEmail(email);
    if (existingUser) {
      return res.status(400).json({ message: "Email already registered" });
    }

    // Check username if provided
    if (username) {
      const existingUsername = await storage.getUserByUsername(username);
      if (existingUsername) {
        return res.status(400).json({ message: "Username already taken" });
      }
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Generate verification token
    const verificationToken = generateVerificationToken();

    // Determine role based on email
    const role = determineUserRole(email);

    // Create user
    const user = await storage.createUser({
      id: crypto.randomUUID(),
      email,
      username,
      passwordHash,
      firstName,
      lastName,
      emailVerificationToken: verificationToken,
      emailVerified: false,
      role
    });

    // Send verification email
    await sendVerificationEmail(email, verificationToken);

    res.json({ 
      message: "Registration successful. Please check your email to verify your account.",
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role
      }
    });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ message: "Registration failed" });
  }
});

// Login endpoint
router.post("/api/auth/login", passport.authenticate("local"), (req, res) => {
  const user = req.user as any;
  const token = generateToken(user.id);

  // Update last login
  storage.updateUser(user.id, { lastLoginAt: new Date() });

  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      profileImageUrl: user.profileImageUrl
    }
  });
});

// Email verification
router.get("/api/auth/verify-email", async (req, res) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({ message: "Token required" });
    }

    const user = await storage.getUserByVerificationToken(token as string);
    if (!user) {
      return res.status(400).json({ message: "Invalid token" });
    }

    await storage.updateUser(user.id, {
      emailVerified: true,
      emailVerificationToken: null
    });

    res.json({ message: "Email verified successfully" });
  } catch (error) {
    console.error("Email verification error:", error);
    res.status(500).json({ message: "Verification failed" });
  }
});

// Password reset request
router.post("/api/auth/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;

    const user = await storage.getUserByEmail(email);
    if (!user) {
      // Don't reveal if email exists
      return res.json({ message: "If the email exists, a reset link will be sent" });
    }

    const resetToken = generateVerificationToken();
    const resetExpiry = new Date();
    resetExpiry.setHours(resetExpiry.getHours() + 1); // 1 hour expiry

    await storage.updateUser(user.id, {
      resetPasswordToken: resetToken,
      resetPasswordExpiry: resetExpiry
    });

    await sendPasswordResetEmail(email, resetToken);

    res.json({ message: "If the email exists, a reset link will be sent" });
  } catch (error) {
    console.error("Password reset request error:", error);
    res.status(500).json({ message: "Failed to process request" });
  }
});

// Password reset
router.post("/api/auth/reset-password", async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({ message: "Token and password required" });
    }

    const user = await storage.getUserByResetToken(token);
    if (!user || !user.resetPasswordExpiry || user.resetPasswordExpiry < new Date()) {
      return res.status(400).json({ message: "Invalid or expired token" });
    }

    const passwordHash = await hashPassword(password);

    await storage.updateUser(user.id, {
      passwordHash,
      resetPasswordToken: null,
      resetPasswordExpiry: null
    });

    res.json({ message: "Password reset successful" });
  } catch (error) {
    console.error("Password reset error:", error);
    res.status(500).json({ message: "Failed to reset password" });
  }
});

// OAuth routes
router.get("/api/auth/google", passport.authenticate("google", { scope: ["profile", "email"] }));
router.get("/api/auth/google/callback", 
  passport.authenticate("google", { failureRedirect: "/login?error=auth_failed" }), 
  (req, res) => {
    try {
      const user = req.user as any;
      if (!user) {
        return res.redirect("/login?error=no_user");
      }
      const token = generateToken(user.id);

      // Check if this is a mobile request
      const userAgent = req.headers['user-agent'] || '';
      const isMobile = /Mobile|Android|iPhone|iPad/i.test(userAgent);

      if (isMobile) {
        // For mobile, redirect to a success page that can handle the token
        res.redirect(`/auth-callback?token=${token}&provider=google`);
      } else {
        res.redirect(`/?token=${token}`);
      }
    } catch (error) {
      console.error("Google auth callback error:", error);
      res.redirect("/login?error=callback_failed");
    }
  }
);

router.get("/api/auth/facebook", passport.authenticate("facebook", { scope: ["email"] }));
router.get("/api/auth/facebook/callback",
  passport.authenticate("facebook", { failureRedirect: "/login?error=auth_failed" }),
  (req, res) => {
    try {
      const user = req.user as any;
      if (!user) {
        return res.redirect("/login?error=no_user");
      }
      const token = generateToken(user.id);

      const userAgent = req.headers['user-agent'] || '';
      const isMobile = /Mobile|Android|iPhone|iPad/i.test(userAgent);

      if (isMobile) {
        res.redirect(`/auth-callback?token=${token}&provider=facebook`);
      } else {
        res.redirect(`/?token=${token}`);
      }
    } catch (error) {
      console.error("Facebook auth callback error:", error);
      res.redirect("/login?error=callback_failed");
    }
  }
);

router.get("/api/auth/twitter", passport.authenticate("twitter"));
router.get("/api/auth/twitter/callback",
  passport.authenticate("twitter", { failureRedirect: "/login?error=auth_failed" }),
  (req, res) => {
    try {
      const user = req.user as any;
      if (!user) {
        return res.redirect("/login?error=no_user");
      }
      const token = generateToken(user.id);

      const userAgent = req.headers['user-agent'] || '';
      const isMobile = /Mobile|Android|iPhone|iPad/i.test(userAgent);

      if (isMobile) {
        res.redirect(`/auth-callback?token=${token}&provider=twitter`);
      } else {
        res.redirect(`/?token=${token}`);
      }
    } catch (error) {
      console.error("Twitter auth callback error:", error);
      res.redirect("/login?error=callback_failed");
    }
  }
);

// Logout
router.post("/api/auth/logout", (req, res) => {
  req.logout(() => {
    res.json({ message: "Logged out successfully" });
  });
});

// Get current user (for JWT authentication)
router.get("/api/auth/me", async (req, res) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "No token provided" });
  }

  const token = authHeader.substring(7);
  const payload = verifyToken(token);

  if (!payload) {
    return res.status(401).json({ message: "Invalid token" });
  }

  const user = await storage.getUser(payload.userId);
  if (!user) {
    return res.status(404).json({ message: "User not found" });
  }

  res.json({
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    profileImageUrl: user.profileImageUrl
  });
});

export default router;