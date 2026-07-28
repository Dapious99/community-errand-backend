import { User } from "../entities/user.entity";

/** The single place "is this user currently Pro" is decided - every perk gates on this. */
export function isProUser(user: Pick<User, "proExpiresAt">): boolean {
  return !!user.proExpiresAt && user.proExpiresAt.getTime() > Date.now();
}
