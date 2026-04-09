import { useState, useEffect } from 'react';
import { X, Plus, Trash2, Calendar } from 'lucide-react';
import { useAssessmentStore } from '@/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

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
      <Button
        onClick={handleOpenForm}
        className="w-full bg-[#0e639c] hover:bg-[#1177bb]"
      >
        <Plus className="w-4 h-4" />
        Buat Jadwal Group
      </Button>
    );
  }

  return (
    <div className="bg-[#252526] border border-white/10 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-white">Buat Jadwal Group</h3>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleCloseForm}
        >
          <X className="w-4 h-4" />
        </Button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Group Name */}
        <div>
          <label className="block text-xs font-medium text-neutral-300 mb-1.5">
            Nama Group
          </label>
          <Input
            type="text"
            value={formData.groupName || ''}
            onChange={(e) => setFormData({ groupName: e.target.value })}
            placeholder="Contoh: Group A - Pagi"
            className="bg-app-sidebar border-app-border focus-visible:ring-1 focus-visible:ring-app-accent placeholder:text-app-text-muted"
            autoFocus
          />
        </div>

        {/* Scheduled Date */}
        <div>
          <label className="block text-xs font-medium text-neutral-300 mb-1.5">
            Tanggal Pelaksanaan
          </label>
          <div className="relative">
            <Input
              type="date"
              value={formData.scheduledDate ? new Date(formData.scheduledDate).toISOString().split('T')[0] : ''}
              onChange={(e) => setFormData({ scheduledDate: new Date(e.target.value) })}
              min={validDateRange ? new Date(validDateRange.startDate).toISOString().split('T')[0] : undefined}
              max={validDateRange ? new Date(validDateRange.endDate).toISOString().split('T')[0] : undefined}
              className="pr-10 bg-app-sidebar border-app-border focus-visible:ring-1 focus-visible:ring-app-accent text-white"
            />
            <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500 pointer-events-none" />
          </div>
          {validDateRange && (
            <p className="text-xs text-neutral-500 mt-1">
              Periode: {new Date(validDateRange.startDate).toLocaleDateString('id-ID')} - {new Date(validDateRange.endDate).toLocaleDateString('id-ID')}
            </p>
          )}
        </div>

        {/* Participants */}
        <div>
          <label className="block text-xs font-medium text-neutral-300 mb-1.5">
            Peserta
          </label>
          <div className="flex gap-2">
            <Input
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
              className="flex-1 bg-app-sidebar border-app-border focus-visible:ring-1 focus-visible:ring-app-accent placeholder:text-app-text-muted"
            />
            <Button
              type="button"
              onClick={handleAddParticipant}
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>

          {/* Participants List */}
          {formData.participants && formData.participants.length > 0 && (
            <div className="mt-2 space-y-1">
              {formData.participants.map((participant, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between px-3 py-1.5 bg-[#1e1e1e] rounded-lg"
                >
                  <span className="text-sm text-neutral-300">{participant}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemoveParticipant(participant)}
                    className="text-neutral-500 hover:text-red-400 hover:bg-red-500/10"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="p-2 bg-red-500/10 border border-red-500/20 rounded-lg">
            <p className="text-xs text-red-400">{error}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <Button
            type="button"
            variant="secondary"
            onClick={handleCloseForm}
            className="flex-1"
          >
            Batal
          </Button>
          <Button
            type="submit"
            className="flex-1 bg-[#0e639c] hover:bg-[#1177bb]"
          >
            Simpan
          </Button>
        </div>
      </form>
    </div>
  );
}
