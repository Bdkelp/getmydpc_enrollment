import crypto from "crypto";
import { supabase } from "../lib/supabaseClient";

const DEFAULT_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

interface BaseIdOptions {
  prefix?: string;
  includeDateSegment?: boolean;
  randomLength?: number;
  separator?: string;
}

export interface UniqueIdOptions extends BaseIdOptions {
  table?: string;
  column?: string;
  maxAttempts?: number;
}

export function generateHumanReadableId(options: BaseIdOptions = {}): string {
  const {
    prefix = "MEMB",
    includeDateSegment = true,
    randomLength,
    separator = "-",
  } = options;

  const now = new Date();
  const dateSegment = includeDateSegment
    ? `${String(now.getFullYear()).slice(-2)}${String(now.getMonth() + 1).padStart(2, "0")}`
    : "";

  const effectiveRandomLength = Math.max(
    4,
    randomLength ?? (includeDateSegment ? 4 : 6),
  );

  const randomSegment = generateRandomSegment(effectiveRandomLength);
  const suffix = `${dateSegment}${randomSegment}`.toUpperCase();
  const cleanPrefix = prefix.trim().toUpperCase();

  return `${cleanPrefix}${separator}${suffix}`;
}

export async function generateUniqueMemberIdentifier(
  options: UniqueIdOptions = {},
): Promise<string> {
  const {
    prefix = "MEMB",
    includeDateSegment = true,
    randomLength,
    separator = "-",
    table = "members",
    column = "member_public_id",
    maxAttempts = 25,
  } = options;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const candidate = generateHumanReadableId({
      prefix,
      includeDateSegment,
      randomLength,
      separator,
    });

    const { count, error } = await supabase
      .from(table)
      .select(column, { head: true, count: "exact" })
      .eq(column, candidate);

    if (error) {
      console.error(
        `[MemberIdGenerator] Failed to verify uniqueness for ${candidate}:`,
        error.message,
      );
      throw error;
    }

    if (!count || count === 0) {
      return candidate;
    }
  }

  throw new Error(
    `Unable to generate unique identifier for ${prefix} after ${maxAttempts} attempts`,
  );
}

function generateRandomSegment(length: number): string {
  const bytes = crypto.randomBytes(length);
  let result = "";

  for (let i = 0; i < length; i++) {
    const index = bytes[i] % DEFAULT_ALPHABET.length;
    result += DEFAULT_ALPHABET[index];
  }

  return result;
}
