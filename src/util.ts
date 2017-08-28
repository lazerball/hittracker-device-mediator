// Intersection (a ∩ b): create a set that contains those elements of set a that are also in set b.
export const intersection = (a: any[], b: any[]): any[] => {
  const first = new Set(a);
  const second = new Set(b);
  return [...first].filter(x => second.has(x));
};

export class GameConfiguration {
  public radioIds: string[];
}
