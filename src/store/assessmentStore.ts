import { create } from 'zustand';
import type {
  AssessmentPeriod,
  AssessmentScheduleGroup,
  CreateScheduleGroupInput,
  ScheduleFormData
} from '@/types/assessment';

interface AssessmentState {
  // Assessment Periods
  assessmentPeriods: AssessmentPeriod[];
  selectedPeriodId: string | null;

  // Schedule Groups
  scheduleGroups: AssessmentScheduleGroup[];

  // UI State
  isFormOpen: boolean;
  formData: Partial<ScheduleFormData>;

  // Actions
  setSelectedPeriod: (periodId: string | null) => void;
  getSelectedPeriod: () => AssessmentPeriod | null;
  getValidDateRange: () => { startDate: Date; endDate: Date } | null;
  setIsFormOpen: (isOpen: boolean) => void;
  setFormData: (data: Partial<ScheduleFormData>) => void;
  resetForm: () => void;
  addScheduleGroup: (group: CreateScheduleGroupInput) => Promise<void>;
  updateScheduleGroup: (id: string, updates: Partial<AssessmentScheduleGroup>) => Promise<void>;
  deleteScheduleGroup: (id: string) => Promise<void>;
  loadAssessmentPeriods: () => Promise<void>;
  loadScheduleGroups: () => Promise<void>;
}

// Mock data for demonstration
const mockAssessmentPeriods: AssessmentPeriod[] = [
  {
    id: '1',
    name: 'Periode Assessmen Potensi Q1 2026',
    code: 'PAP-Q1-2026',
    startPotentialDate: new Date('2026-01-15'),
    endPotentialDate: new Date('2026-03-31'),
    isActive: true,
  },
  {
    id: '2',
    name: 'Periode Assessmen Potensi Q2 2026',
    code: 'PAP-Q2-2026',
    startPotentialDate: new Date('2026-04-01'),
    endPotentialDate: new Date('2026-06-30'),
    isActive: false,
  },
];

export const useAssessmentStore = create<AssessmentState>((set, get) => ({
  assessmentPeriods: mockAssessmentPeriods,
  selectedPeriodId: null,
  scheduleGroups: [],
  isFormOpen: false,
  formData: {},

  setSelectedPeriod: (periodId: string | null) => {
    set({ selectedPeriodId: periodId });
    // Reset form when period changes
    get().resetForm();
  },

  getSelectedPeriod: () => {
    const { assessmentPeriods, selectedPeriodId } = get();
    return assessmentPeriods.find(p => p.id === selectedPeriodId) || null;
  },

  /**
   * Get the valid date range for the selected assessment period.
   * This fixes the bug where the end date was incorrectly calculated.
   * Now correctly returns startPotentialDate - endPotentialDate range.
   */
  getValidDateRange: () => {
    const period = get().getSelectedPeriod();
    if (!period) return null;

    // FIX: Return the correct date range from startPotentialDate to endPotentialDate
    return {
      startDate: period.startPotentialDate,
      endDate: period.endPotentialDate,
    };
  },

  setIsFormOpen: (isOpen: boolean) => {
    set({ isFormOpen: isOpen });
  },

  setFormData: (data: Partial<ScheduleFormData>) => {
    set(state => ({
      formData: { ...state.formData, ...data },
    }));
  },

  resetForm: () => {
    set({
      formData: {},
    });
  },

  addScheduleGroup: async (input: CreateScheduleGroupInput) => {
    const period = get().assessmentPeriods.find(p => p.id === input.assessmentPeriodId);

    const newGroup: AssessmentScheduleGroup = {
      id: `group-${Date.now()}`,
      name: input.name,
      assessmentPeriodId: input.assessmentPeriodId,
      assessmentPeriod: period,
      scheduledDate: input.scheduledDate,
      participants: input.participants,
      status: 'draft',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    set(state => ({
      scheduleGroups: [...state.scheduleGroups, newGroup],
      isFormOpen: false,
      formData: {},
    }));
  },

  updateScheduleGroup: async (id: string, updates: Partial<AssessmentScheduleGroup>) => {
    set(state => ({
      scheduleGroups: state.scheduleGroups.map(group =>
        group.id === id
          ? { ...group, ...updates, updatedAt: new Date() }
          : group
      ),
    }));
  },

  deleteScheduleGroup: async (id: string) => {
    set(state => ({
      scheduleGroups: state.scheduleGroups.filter(group => group.id !== id),
    }));
  },

  loadAssessmentPeriods: async () => {
    // In a real app, this would fetch from an API
    set({ assessmentPeriods: mockAssessmentPeriods });
  },

  loadScheduleGroups: async () => {
    // In a real app, this would fetch from an API
    set({ scheduleGroups: [] });
  },
}));
