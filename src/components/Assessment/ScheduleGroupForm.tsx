import { useState, useEffect } from 'react';
import { X, Plus, Trash2, Calendar } from 'lucide-react';
import { useAssessmentStore } from '@/store';

export function ScheduleGroupForm() {
  const {
    isFormOpen,
    formData,
    selectedPeriodId,
    getValidDateRange,
    setIsFormOpen,
    setFormData,
    resetForm,
    addScheduleGroup,
  } = useAssessmentStore();

  const [participantInput, setParticipantInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  const validDateRange = getValidDateRange();

  // Reset participant input when form closes
  useEffect(() => {
    if (!isFormOpen) {
      setParticipantInput('');
      setError(null);
    }
  }, [isFormOpen]);

  const handleOpenForm = () => {
    setIsFormOpen(true);
    setFormData({
      assessmentPeriodId: selectedPeriodId || '',
      participants: [],
    });
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    resetForm();
  };

  const handleAddParticipant = () => {
    if (!participantInput.trim()) return;

    const currentParticipants = formData.participants || [];
    if (currentParticipants.includes(participantInput.trim())) {
      setError('Peserta sudah ada dalam daftar');
      return;
    }

    setFormData({
      participants: [...currentParticipants, participantInput.trim()],
    });
    setParticipantInput('');
    setError(null);
  };

  const handleRemoveParticipant = (participant: string) => {
    setFormData({
      participants: (formData.participants || []).filter(p => p !== participant),
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!formData.groupName?.trim()) {
      setError('Nama grup harus diisi');
      return;
    }

    if (!formData.scheduledDate) {
      setError('Tanggal jadwal harus dipilih');
      return;
    }

    if (!formData.participants || formData.participants.length === 0) {
      setError('Minimal satu peserta harus ditambahkan');
      return;
    }

    // Validate date is within valid range
    if (validDateRange) {
      const scheduledDate = new Date(formData.scheduledDate);
      const startDate = new Date(validDateRange.startDate);
      const endDate = new Date(validDateRange.endDate);

      // Reset times for comparison
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);
      scheduledDate.setHours(0, 0, 0, 0);

      if (scheduledDate < startDate || scheduledDate > endDate) {
        setError(`Tanggal harus antara ${validDateRange.startDate.toLocaleDateString('id-ID')} dan ${validDateRange.endDate.toLocaleDateString('id-ID')}`);
        return;
      }
    }

    try {
      await addScheduleGroup({
        name: formData.groupName,
        assessmentPeriodId: selectedPeriodId!,
        scheduledDate: formData.scheduledDate,
        participants: formData.participants,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal membuat jadwal');
    }
  };

  if (!isFormOpen) {
    return (
      <button
        onClick={handleOpenForm}
        className="w-full px-4 py-3 bg-[#0e639c] hover:bg-[#1177bb] text-white rounded-lg transition-colors font-geist text-sm font-medium flex items-center justify-center gap-2"
      >
        <Plus className="w-4 h-4" />
        Buat Jadwal Group
      </button>
    );
  }

  return (
    <div className="bg-[#252526] border border-white/10 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-white font-geist">Buat Jadwal Group</h3>
        <button
          onClick={handleCloseForm}
          className="p-1 rounded text-neutral-400 hover:text-white hover:bg-white/5 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Group Name */}
        <div>
          <label className="block text-xs font-medium text-neutral-300 mb-1.5 font-geist">
            Nama Group
          </label>
          <input
            type="text"
            value={formData.groupName || ''}
            onChange={(e) => setFormData({ groupName: e.target.value })}
            placeholder="Contoh: Group A - Pagi"
            className="w-full px-3 py-2 bg-[#1e1e1e] text-white border border-white/10 rounded-lg focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 font-geist text-sm"
            autoFocus
          />
        </div>

        {/* Scheduled Date */}
        <div>
          <label className="block text-xs font-medium text-neutral-300 mb-1.5 font-geist">
            Tanggal Pelaksanaan
          </label>
          <div className="relative">
            <input
              type="date"
              value={formData.scheduledDate ? new Date(formData.scheduledDate).toISOString().split('T')[0] : ''}
              onChange={(e) => setFormData({ scheduledDate: new Date(e.target.value) })}
              min={validDateRange ? new Date(validDateRange.startDate).toISOString().split('T')[0] : undefined}
              max={validDateRange ? new Date(validDateRange.endDate).toISOString().split('T')[0] : undefined}
              className="w-full px-3 py-2 pr-10 bg-[#1e1e1e] text-white border border-white/10 rounded-lg focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 font-geist text-sm"
            />
            <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500 pointer-events-none" />
          </div>
          {validDateRange && (
            <p className="text-xs text-neutral-500 font-geist mt-1">
              Periode: {new Date(validDateRange.startDate).toLocaleDateString('id-ID')} - {new Date(validDateRange.endDate).toLocaleDateString('id-ID')}
            </p>
          )}
        </div>

        {/* Participants */}
        <div>
          <label className="block text-xs font-medium text-neutral-300 mb-1.5 font-geist">
            Peserta
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={participantInput}
              onChange={(e) => setParticipantInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddParticipant();
                }
              }}
              placeholder="Nama atau NIP peserta"
              className="flex-1 px-3 py-2 bg-[#1e1e1e] text-white border border-white/10 rounded-lg focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 font-geist text-sm"
            />
            <button
              type="button"
              onClick={handleAddParticipant}
              className="px-3 py-2 bg-neutral-700 hover:bg-neutral-600 text-white rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {/* Participants List */}
          {formData.participants && formData.participants.length > 0 && (
            <div className="mt-2 space-y-1">
              {formData.participants.map((participant, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between px-3 py-1.5 bg-[#1e1e1e] rounded-lg"
                >
                  <span className="text-sm text-neutral-300 font-geist">{participant}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveParticipant(participant)}
                    className="p-1 rounded text-neutral-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="p-2 bg-red-500/10 border border-red-500/20 rounded-lg">
            <p className="text-xs text-red-400 font-geist">{error}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={handleCloseForm}
            className="flex-1 px-4 py-2 bg-neutral-700 hover:bg-neutral-600 text-white rounded-lg transition-colors font-geist text-sm"
          >
            Batal
          </button>
          <button
            type="submit"
            className="flex-1 px-4 py-2 bg-[#0e639c] hover:bg-[#1177bb] text-white rounded-lg transition-colors font-geist text-sm"
          >
            Simpan
          </button>
        </div>
      </form>
    </div>
  );
}
