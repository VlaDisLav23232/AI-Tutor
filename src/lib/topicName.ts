/** "Орфографія: апостроф" → "Апостроф": the group/area already names the prefix. Safe on server and client. */
export function shortName(name: string): string {
  const rest = name.includes(":") ? name.slice(name.indexOf(":") + 1).trim() : name;
  return rest.charAt(0).toUpperCase() + rest.slice(1);
}
