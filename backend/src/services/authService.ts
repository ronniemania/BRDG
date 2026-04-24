import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import repository from '../database/repository';
import {
  JWT_SECRET,
  JWT_REFRESH_SECRET,
  ACCESS_TOKEN_EXPIRY,
  REFRESH_TOKEN_EXPIRY,
} from '../config/constants';
import { ValidationError, AuthenticationError } from '../utils/errors';
import { ADMIN_EMAILS } from '../config/constants';

// ─── Password hashing (Node built-in crypto — no extra packages) ─────────────

const PBKDF2_ITERATIONS = 100000;
const PBKDF2_KEYLEN = 64;
const PBKDF2_DIGEST = 'sha512';

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto
    .pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, PBKDF2_DIGEST)
    .toString('hex');
  return `pbkdf2:${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  if (stored.startsWith('pbkdf2:')) {
    const [, salt, hash] = stored.split(':');
    const verify = crypto
      .pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, PBKDF2_DIGEST)
      .toString('hex');
    return verify === hash;
  }
  // Plaintext fallback for migrating existing users
  return password === stored;
}

// ─── Auth Service ─────────────────────────────────────────────────────────────

export class AuthService {
  generateAccessToken(userId: string, role: string): string {
    return jwt.sign({ userId, role }, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
  }

  generateRefreshToken(userId: string): string {
    return jwt.sign({ userId, type: 'refresh' }, JWT_REFRESH_SECRET, {
      expiresIn: REFRESH_TOKEN_EXPIRY,
    });
  }

  verifyToken(token: string): { userId: string; role: string } | null {
    try {
      return jwt.verify(token, JWT_SECRET) as { userId: string; role: string };
    } catch {
      return null;
    }
  }

  verifyRefreshToken(token: string): { userId: string } | null {
    try {
      const decoded = jwt.verify(token, JWT_REFRESH_SECRET) as {
        userId: string;
        type: string;
      };
      if (decoded.type !== 'refresh') return null;
      return { userId: decoded.userId };
    } catch {
      return null;
    }
  }

  hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  async register(email: string, password: string, firstName: string, lastName: string) {
    if (await repository.findUserByEmail(email)) {
      throw new ValidationError('Email already registered');
    }

    const user = await repository.createUser({
      id: 'user-' + Date.now(),
      email,
      password: hashPassword(password),
      firstName,
      lastName,
      role: 'member',
      status: ADMIN_EMAILS.includes(email) ? 'approved' : 'pending',
    });

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      status: user.status,
    };
  }

  async login(email: string, password: string) {
    let user = await repository.findUserByEmail(email);

    if (!user || !verifyPassword(password, user.password)) {
      throw new AuthenticationError('Invalid credentials');
    }

    if (user.status !== 'approved') {
      throw new AuthenticationError('User account not approved');
    }

    // Auto-promote admin emails to boss role
    if (ADMIN_EMAILS.includes(user.email) && user.role !== 'boss') {
      await repository.updateUser(user.id, { role: 'boss' });
      user = { ...user, role: 'boss' };
    }

    // Migrate plaintext passwords to hashed on successful login
    if (!user.password.startsWith('pbkdf2:')) {
      await repository.updateUser(user.id, { password: hashPassword(password) });
    }

    const accessToken = this.generateAccessToken(user.id, user.role);
    const refreshToken = this.generateRefreshToken(user.id);
    await repository.updateUser(user.id, {
      lastLogin: new Date(),
      refreshTokenHash: this.hashToken(refreshToken),
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
      accessToken,
      refreshToken,
    };
  }

  async refresh(refreshToken: string) {
    const decoded = this.verifyRefreshToken(refreshToken);
    if (!decoded) throw new AuthenticationError('Invalid refresh token');

    const user = await repository.findUserById(decoded.userId);
    if (!user) throw new AuthenticationError('User not found');

    // Verify token hash matches (single-device revocation)
    const hash = this.hashToken(refreshToken);
    if (user.refreshTokenHash !== hash) {
      throw new AuthenticationError('Token revoked');
    }

    // Rotate: new access + new refresh
    const newAccessToken = this.generateAccessToken(user.id, user.role);
    const newRefreshToken = this.generateRefreshToken(user.id);
    await repository.updateUser(user.id, {
      refreshTokenHash: this.hashToken(newRefreshToken),
    });

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
    };
  }

  async logout(userId: string) {
    await repository.updateUser(userId, { refreshTokenHash: null });
  }

  async getCurrentUser(userId: string) {
    const user = await repository.findUserById(userId);
    if (!user) throw new AuthenticationError('User not found');

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      status: user.status,
    };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await repository.findUserById(userId);
    if (!user) throw new AuthenticationError('User not found');

    if (!verifyPassword(currentPassword, user.password)) {
      throw new AuthenticationError('Current password is incorrect');
    }

    await repository.updateUser(userId, { password: hashPassword(newPassword) });
  }
}

export default new AuthService();
