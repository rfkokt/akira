import { useEffect } from 'react';
import { Calendar, AlertCircle } from 'lucide-react';
import { useAssessmentStore } from '@/store';
import { ScheduleGroupForm } from './ScheduleGroupForm';
import { ScheduleGroupList } from './ScheduleGroupList';

export function AssessmentScheduler() {
  const {
    assessmentPeriods,
    selectedPeriodId,
    getSelectedPeriod,
    getValidDateRange,
    setSelectedPeriod,
    loadAssessmentPeriods,
    loadScheduleGroups,
  } = useAssessmentStore();

  useEffect(() => {
    loadAssessmentPeriods();
    loadScheduleGroups();
  }, [loadAssessmentPeriods, loadScheduleGroups]);

  const selectedPeriod = getSelectedPeriod();
  const validDateRange = getValidDateRange();

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-white tracking-tight">
          Penjadwalan Pelaksanaan Assessment
        </h1>
        <p className="mt-1 text-xs text-neutral-500">
          Buat Jadwal Secara Group untuk pelaksanaan assessment
        </p>
      </div>

      {/* Period Selector */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-neutral-300 mb-2">
          Pilih Periode Assessment
        </label>
        <select
          value={selectedPeriodId || ''}
          onChange={(e) => setSelectedPeriod(e.target.value || null)}
          className="w-full px-4 py-2.5 bg-[#252526] text-white border border-white/10 rounded-lg focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 text-sm"
        >
          <option value="">-- Pilih Periode --</option>
          {assessmentPeriods.map((period) => (
            <option key={period.id} value={period.id}>
              {period.name} ({period.code})
            </option>
          ))}
        </select>
      </div>

      {/* Selected Period Info */}
      {selectedPeriod && validDateRange && (
        <div className="mb-6 p-4 bg-[#252526] border border-white/10 rounded-lg">
          <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-[#dcb67a]" />
            Isian Periode Assessmen Potensi
          </h3>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-neutral-500 mb-1">Start Potential Date</p>
              <p className="text-sm text-neutral-200">
                {formatDate(selectedPeriod.startPotentialDate)}
              </p>
            </div>
            <div>
              <p className="text-xs text-neutral-500 mb-1">End Potential Date</p>
              <p className="text-sm text-neutral-200">
                {formatDate(selectedPeriod.endPotentialDate)}
              </p>
            </div>
          </div>

          <div className="mt-3 pt-3 border-t border-white/5">
            <p className="text-xs text-neutral-500 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              Jadwal harus dalam periode: {formatDate(selectedPeriod.startPotentialDate)} - {formatDate(selectedPeriod.endPotentialDate)}
            </p>
          </div>
        </div>
      )}

      {/* Content */}
      {selectedPeriod ? (
        <div className="flex-1 flex gap-6">
          {/* Left: Form */}
          <div className="w-[400px] shrink-0">
            <ScheduleGroupForm />
          </div>

          {/* Right: Schedule Groups List */}
          <div className="flex-1">
            <ScheduleGroupList />
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-neutral-500">
          <div className="text-center">
            <Calendar className="w-12 h-12 text-neutral-600 mb-4 mx-auto" />
            <p className="text-sm">Silakan pilih periode assessment terlebih dahulu</p>
            <p className="text-xs text-neutral-600 mt-1">
              Pilih periode untuk membuat jadwal pelaksanaan assessment
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
