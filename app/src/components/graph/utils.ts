export const NODE_COLORS: Record<string, string> = {
  Person: '#4fc3f7',
  Project: '#81c784',
  Technology: '#ffb74d',
  Preference: '#f06292',
  Principle: '#ba68c8',
  Infrastructure: '#90a4ae',
  Hardware: '#a1887f',
  Organization: '#4dd0e1',
  Skill: '#aed581',
  Event: '#ff8a65',
  Habit: '#ce93d8',
  Place: '#80cbc4',
  Health: '#ef5350',
  Goal: '#ffd54f',
};

export const ACTIVATED_COLOR = '#ffffff';
export const DEFAULT_COLOR = '#666666';
export const EDGE_COLOR = '#333333';
export const EDGE_ACTIVATED_COLOR = '#00e5ff';

export function getNodeColor(type: string, activated: boolean): string {
  if (activated) return ACTIVATED_COLOR;
  return NODE_COLORS[type] ?? DEFAULT_COLOR;
}
