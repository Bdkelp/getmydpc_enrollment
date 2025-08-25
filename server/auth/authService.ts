import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as FacebookStrategy } from "passport-facebook";
import { Strategy as TwitterStrategy } from "passport-twitter";
import type { Express } from "express";
import { storage } from "../storage";
import nodemailer from "nodemailer";
import crypto from "crypto";

// Environment variables needed for OAuth providers
const OAUTH_CONFIG = {
  google: {
    clientID: process.env.GOOGLE_CLIENT_ID || "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    callbackURL: "/api/auth/google/callback"
  },
  facebook: {
    clientID: process.env.FACEBOOK_APP_ID || "",
    clientSecret: process.env.FACEBOOK_APP_SECRET || "",
    callbackURL: "/api/auth/facebook/callback"
  },
  twitter: {
    consumerKey: process.env.TWITTER_CONSUMER_KEY || "",
    consumerSecret: process.env.TWITTER_CONSUMER_SECRET || "",
    callbackURL: "/api/auth/twitter/callback"
  }
};

// Email configuration (using Gmail as example)
const emailTransporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});

// JWT configuration
const JWT_SECRET = process.env.JWT_SECRET || process.env.SESSION_SECRET || "fallback-secret";
const JWT_EXPIRY = "7d";

// Helper functions
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateToken(userId: string): string {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: JWT_EXPIRY });
}

export function verifyToken(token: string): { userId: string } | null {
  try {
    return jwt.verify(token, JWT_SECRET) as { userId: string };
  } catch {
    return null;
  }
}

export function generateVerificationToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

// Configure Passport strategies
export function configurePassportStrategies() {
  // Local Strategy (username/password)
  passport.use(new LocalStrategy({
    usernameField: "email",
    passwordField: "password"
  }, async (email, password, done) => {
    try {
      const user = await storage.getUserByEmail(email);
      if (!user) {
        return done(null, false, { message: "Invalid email or password" });
      }
      
      if (!user.passwordHash) {
        return done(null, false, { message: "Please use social login" });
      }
      
      const isValid = await verifyPassword(password, user.passwordHash);
      if (!isValid) {
        return done(null, false, { message: "Invalid email or password" });
      }
      
      if (!user.emailVerified) {
        return done(null, false, { message: "Please verify your email" });
      }
      
      return done(null, user);
    } catch (error) {
      return done(error);
    }
  }));

  // Google Strategy
  if (OAUTH_CONFIG.google.clientID) {
    passport.use(new GoogleStrategy({
      clientID: OAUTH_CONFIG.google.clientID,
      clientSecret: OAUTH_CONFIG.google.clientSecret,
      callbackURL: OAUTH_CONFIG.google.callbackURL
    }, async (accessToken, refreshToken, profile, done) => {
      try {
        let user = await storage.getUserByGoogleId(profile.id);
        
        if (!user) {
          // Check if user exists with same email
          const existingUser = await storage.getUserByEmail(profile.emails?.[0]?.value || "");
          
          if (existingUser) {
            // Link Google account to existing user
            user = await storage.updateUser(existingUser.id, {
              googleId: profile.id,
              profileImageUrl: profile.photos?.[0]?.value
            });
          } else {
            // Create new user
            user = await storage.createUser({
              id: crypto.randomUUID(),
              googleId: profile.id,
              email: profile.emails?.[0]?.value,
              firstName: profile.name?.givenName,
              lastName: profile.name?.familyName,
              profileImageUrl: profile.photos?.[0]?.value,
              emailVerified: true,
              role: "member"
            });
          }
        }
        
        return done(null, user);
      } catch (error) {
        return done(error as Error);
      }
    }));
  }

  // Facebook Strategy
  if (OAUTH_CONFIG.facebook.clientID) {
    passport.use(new FacebookStrategy({
      clientID: OAUTH_CONFIG.facebook.clientID,
      clientSecret: OAUTH_CONFIG.facebook.clientSecret,
      callbackURL: OAUTH_CONFIG.facebook.callbackURL,
      profileFields: ["id", "emails", "name", "picture"]
    }, async (accessToken, refreshToken, profile, done) => {
      try {
        let user = await storage.getUserByFacebookId(profile.id);
        
        if (!user) {
          const existingUser = await storage.getUserByEmail(profile.emails?.[0]?.value || "");
          
          if (existingUser) {
            user = await storage.updateUser(existingUser.id, {
              facebookId: profile.id,
              profileImageUrl: profile.photos?.[0]?.value
            });
          } else {
            user = await storage.createUser({
              id: crypto.randomUUID(),
              facebookId: profile.id,
              email: profile.emails?.[0]?.value,
              firstName: profile.name?.givenName,
              lastName: profile.name?.familyName,
              profileImageUrl: profile.photos?.[0]?.value,
              emailVerified: true,
              role: "member"
            });
          }
        }
        
        return done(null, user);
      } catch (error) {
        return done(error as Error);
      }
    }));
  }

  // Twitter Strategy
  if (OAUTH_CONFIG.twitter.consumerKey) {
    passport.use(new TwitterStrategy({
      consumerKey: OAUTH_CONFIG.twitter.consumerKey,
      consumerSecret: OAUTH_CONFIG.twitter.consumerSecret,
      callbackURL: OAUTH_CONFIG.twitter.callbackURL,
      includeEmail: true
    }, async (token, tokenSecret, profile, done) => {
      try {
        let user = await storage.getUserByTwitterId(profile.id);
        
        if (!user) {
          const existingUser = await storage.getUserByEmail(profile.emails?.[0]?.value || "");
          
          if (existingUser) {
            user = await storage.updateUser(existingUser.id, {
              twitterId: profile.id,
              profileImageUrl: profile.photos?.[0]?.value
            });
          } else {
            user = await storage.createUser({
              id: crypto.randomUUID(),
              twitterId: profile.id,
              email: profile.emails?.[0]?.value,
              firstName: profile.displayName,
              profileImageUrl: profile.photos?.[0]?.value,
              emailVerified: true,
              role: "member"
            });
          }
        }
        
        return done(null, user);
      } catch (error) {
        return done(error as Error);
      }
    }));
  }

  passport.serializeUser((user: any, done) => {
    done(null, user.id);
  });

  passport.deserializeUser(async (id: string, done) => {
    try {
      const user = await storage.getUser(id);
      done(null, user);
    } catch (error) {
      done(error);
    }
  });
}

// Email sending functions
export async function sendVerificationEmail(email: string, token: string) {
  const verificationUrl = `${process.env.APP_URL}/verify-email?token=${token}`;
  
  await emailTransporter.sendMail({
    from: process.env.EMAIL_USER,
    to: email,
    subject: "Verify your MyPremierPlans account",
    html: `
      <h1>Welcome to MyPremierPlans!</h1>
      <p>Please click the link below to verify your email address:</p>
      <a href="${verificationUrl}">Verify Email</a>
      <p>This link will expire in 24 hours.</p>
    `
  });
}

export async function sendPasswordResetEmail(email: string, token: string) {
  const resetUrl = `${process.env.APP_URL}/reset-password?token=${token}`;
  
  await emailTransporter.sendMail({
    from: process.env.EMAIL_USER,
    to: email,
    subject: "Reset your MyPremierPlans password",
    html: `
      <h1>Password Reset Request</h1>
      <p>Click the link below to reset your password:</p>
      <a href="${resetUrl}">Reset Password</a>
      <p>This link will expire in 1 hour. If you didn't request this, please ignore this email.</p>
    `
  });
}

// Role assignment based on email
export function determineUserRole(email: string): "admin" | "agent" | "member" {
  const adminEmails = [
    'michael@mypremierplans.com',
    'travis@mypremierplans.com', 
    'richard@mypremierplans.com',
    'joaquin@mypremierplans.com'
  ];
  
  const agentEmails = [
    'mdkeener@gmail.com',
    'tmatheny77@gmail.com',
    'svillarreal@cyariskmanagement.com'
  ];
  
  if (adminEmails.includes(email)) return "admin";
  if (agentEmails.includes(email)) return "agent";
  return "member"; // Default role for enrolled healthcare members
}