import { useState } from 'react';
import { MoreHorizontal, Trash2, Calendar, ChevronDown, Users } from 'lucide-react';
import { useAssessmentStore } from '@/store';
import { Button } from '@/components/ui/button';

const statusConfig = {
  draft: { label: 'Draft', color: 'bg-neutral-500', textColor: 'text-neutral-300' },
  scheduled: { label: 'Terjadwal', color: 'bg-blue-500', textColor: 'text-blue-300' },
  completed: { label: 'Selesai', color: 'bg-green-500', textColor: 'text-green-300' },
  cancelled: { label: 'Dibatalkan', color: 'bg-red-500', textColor: 'text-red-300' },
};

export function ScheduleGroupList() {
  const { scheduleGroups, deleteScheduleGroup } = useAssessmentStore();
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [menuOpen, setMenuOpen] = useState<string | null>(null);

  const toggleExpanded = (groupId: string) => {
    setExpandedGroups((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(groupId)) {
        newSet.delete(groupId);
      } else {
        newSet.add(groupId);
      }
      return newSet;
    });
  };

  const handleDelete = async (groupId: string) => {
    if (confirm('Hapus jadwal ini?')) {
      await deleteScheduleGroup(groupId);
      setMenuOpen(null);
    }
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleDateString('id-ID', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  const formatTime = (date: Date) => {
    return new Date(date).toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (scheduleGroups.length === 0) {
    return (
      <div className="flex items-center justify-center h-full border-2 border-dashed border-white/10 rounded-lg">
        <div className="text-center">
          <Users className="w-12 h-12 text-neutral-600 mb-3 mx-auto" />
          <p className="text-sm text-neutral-500 font-geist">Belum ada jadwal group</p>
          <p className="text-xs text-neutral-600 font-geist mt-1">
            Buat jadwal baru menggunakan form di samping
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white font-geist">Daftar Jadwal Group</h3>
        <span className="text-xs text-neutral-500 font-geist">
          {scheduleGroups.length} jadwal
        </span>
      </div>

      {scheduleGroups.map((group) => {
        const status = statusConfig[group.status];
        const isExpanded = expandedGroups.has(group.id);
        const isMenuOpen = menuOpen === group.id;

        return (
          <div
            key={group.id}
            className="bg-[#252526] border border-white/10 rounded-lg overflow-hidden"
          >
            {/* Header */}
            <div className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h4 className="text-sm font-semibold text-white font-geist">
                      {group.name}
                    </h4>
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-medium ${status.textColor} ${status.color}/20 font-geist`}
                    >
                      {status.label}
                    </span>
                  </div>

                  <div className="flex items-center gap-4 text-xs text-neutral-400 font-geist">
                    <div className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>{formatDate(group.scheduledDate)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Users className="w-3.5 h-3.5" />
                      <span>{group.participants.length} peserta</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  {/* Expand/Collapse */}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => toggleExpanded(group.id)}
                    className="h-8 w-8 text-neutral-400 hover:text-white"
                  >
                    <ChevronDown
                      className={`w-4 h-4 transition-transform ${
                        isExpanded ? 'rotate-180' : ''
                      }`}
                    />
                  </Button>

                  {/* Menu */}
                  <div className="relative">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setMenuOpen(isMenuOpen ? null : group.id)}
                      className="h-8 w-8 text-neutral-400 hover:text-white"
                    >
                      <MoreHorizontal className="w-4 h-4" />
                    </Button>

                    {isMenuOpen && (
                      <>
                        <div
                          className="fixed inset-0 z-10"
                          onClick={() => setMenuOpen(null)}
                        />
                        <div className="absolute right-0 mt-1 w-40 bg-[#1e1e1e] border border-white/10 rounded-lg shadow-xl py-1 z-20">
                          <Button
                            variant="ghost"
                            onClick={() => handleDelete(group.id)}
                            className="w-full justify-start text-red-400 hover:text-red-300 hover:bg-red-500/10 h-8 text-xs"
                          >
                            <Trash2 className="w-3.5 h-3.5 mr-2" />
                            Hapus
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Expanded Details */}
            {isExpanded && (
              <div className="border-t border-white/5 p-4 bg-[#1e1e1e]">
                <div className="mb-3">
                  <p className="text-xs text-neutral-500 font-geist mb-2">DAFTAR PESERTA</p>
                  <div className="space-y-1">
                    {group.participants.map((participant, index) => (
                      <div
                        key={index}
                        className="px-3 py-1.5 bg-[#252526] rounded text-xs text-neutral-300 font-geist"
                      >
                        {participant}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex items-center gap-4 text-xs text-neutral-500 font-geist">
                  <span>
                    Dibuat: {formatDate(group.createdAt)} {formatTime(group.createdAt)}
                  </span>
                  {group.updatedAt !== group.createdAt && (
                    <span>
                      Diperbarui: {formatDate(group.updatedAt)} {formatTime(group.updatedAt)}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
