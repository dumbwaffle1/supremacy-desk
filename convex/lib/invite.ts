// Short, unambiguous invite code (no 0/O/1/I). Used for league join links.
export function makeInviteCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 8; i++) {
    s += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return s;
}
