
export type Language = 'EN' | 'VN';

export enum Tab {
  GENERAL = 'GENERAL',
  DASHBOARD = 'DASHBOARD',
  MONITORING = 'MONITORING',
  FOCUS_POINTS = 'FOCUS_POINTS',
  SCHEDULE = 'SCHEDULE',
  DAILY_REPORT = 'DAILY_REPORT',
  INSPECTION = 'INSPECTION',
  ISSUES = 'ISSUES',
  PROCUREMENT = 'PROCUREMENT',
  SUBMITTAL = 'SUBMITTAL',
  MATERIALS = 'MATERIALS',
  DEFECTS = 'DEFECTS',
  MODEL_HOUSE = 'MODEL_HOUSE',
  PAYMENT = 'PAYMENT',
  SITE_PHOTOS = 'SITE_PHOTOS',
  ADMIN = 'ADMIN',
}

export interface ProjectMilestone {
  date: string;
  description: { EN: string; VN: string };
  completed: boolean;
  isFixed?: boolean;
}

export interface WeatherData {
  date: string;
  temp: string;
  condition: string;
  icon?: string;
}

export interface Defect {
  id: string;
  description: string;
  location: string;
  severity: 'Low' | 'Medium' | 'High' | 'Critical';
  status: 'Open' | 'In Progress' | 'Resolved';
  dateReported: string;
  assignee: string;
}

export interface MaterialEntry {
  id: string;
  name: string;
  supplier: string;
  quantity: number;
  unit: string;
  date: string;
  status: 'Pending' | 'Approved' | 'Rejected';
}
