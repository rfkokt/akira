/**
 * Assessment Period Types
 * Used for scheduling assessment implementation
 */

export interface AssessmentPeriod {
  id: string;
  name: string;
  code: string;
  startPotentialDate: Date;
  endPotentialDate: Date;
  isActive: boolean;
}

export interface AssessmentScheduleGroup {
  id: string;
  name: string;
  assessmentPeriodId: string;
  assessmentPeriod?: AssessmentPeriod;
  scheduledDate: Date;
  participants: string[];
  status: 'draft' | 'scheduled' | 'completed' | 'cancelled';
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateScheduleGroupInput {
  name: string;
  assessmentPeriodId: string;
  scheduledDate: Date;
  participants: string[];
}

export interface ScheduleFormData {
  assessmentPeriodId: string;
  groupName: string;
  scheduledDate: Date;
  participants: string[];
}
