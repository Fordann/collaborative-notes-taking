"use client";

interface Member {
  id: string;
  name: string;
  hasContributed: boolean;
  isLeader: boolean;
  joinedAt: string;
}

interface MemberListProps {
  members: Member[];
  sessionId?: string;
}

export default function MemberList({ members }: MemberListProps) {
  const contributed = members.filter((m) => m.hasContributed).length;

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-slate-800">Membres du groupe</h3>
        <span className="text-xs bg-indigo-50 text-indigo-600 px-2.5 py-1 rounded-full font-medium">
          {contributed}/{members.length} ont contribué
        </span>
      </div>

      <div className="space-y-2.5">
        {members.map((member) => (
          <div
            key={member.id}
            className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-slate-50 transition"
          >
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                member.hasContributed
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-slate-100 text-slate-500"
              }`}
            >
              {member.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 flex items-center gap-1.5">
              <p className="text-sm font-medium text-slate-700">
                {member.name}
              </p>
              {member.isLeader && (
                <span title="Chef de groupe">⭐</span>
              )}
            </div>
            {member.hasContributed ? (
              <span className="text-xs text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                Notes uploadées
              </span>
            ) : (
              <span className="text-xs text-slate-400 bg-slate-50 px-2 py-0.5 rounded-full">
                En attente
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
