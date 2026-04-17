export function ObscuredUsername({
  username,
  reveal = false,
}: {
  username: string;
  reveal?: boolean;
}) {
  if (reveal) {
    return <span className="font-mono text-sm">{username}</span>;
  }
  const masked = username.replace(/[a-zA-Z0-9]/g, "•");
  return (
    <span
      aria-label={`obscured username: ${username.length} characters`}
      className="inline-block select-none font-mono text-sm blur-sm"
    >
      {masked}
    </span>
  );
}
