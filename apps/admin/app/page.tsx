import type { GroupSummary, Role, StudentSummary } from "@erp/contracts";
import { Suspense } from "react";
import { apiGet, getCurrentUser } from "@/lib/api";
import { LogoutButton } from "./logout-button";

const ROLE_LABEL: Record<Role, string> = {
  ADMINISTRATOR: "Administrator",
  ACADEMIC_MANAGER: "Academic manager",
  TEACHER: "Teacher",
  STUDENT: "Student",
};

export default function HomePage() {
  return (
    <div className="flex-1 bg-zinc-50">
      {/* Everything below reads the session, so it streams in behind this boundary. */}
      <Suspense fallback={<p className="p-8 text-sm text-zinc-500">Loading…</p>}>
        <Console />
      </Suspense>
    </div>
  );
}

async function Console() {
  const user = await getCurrentUser();
  const isStaff = user.roles.length > 0;

  return (
    <>
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-3">
        <span className="text-sm font-semibold text-zinc-900">Staff Console</span>
        <div className="flex items-center gap-4">
          <span className="text-sm text-zinc-600">
            {user.fullName}
            {isStaff && (
              <span className="text-zinc-400">
                {" · "}
                {[...new Set(user.roles.map((r) => ROLE_LABEL[r.role]))].join(", ")}
              </span>
            )}
          </span>
          <LogoutButton />
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-8 p-6">
        {isStaff ? (
          <Roster />
        ) : (
          <p className="rounded-lg border border-zinc-200 bg-white p-6 text-sm text-zinc-600">
            This account has no staff role. Students sign in to the student app instead.
          </p>
        )}
      </main>
    </>
  );
}

async function Roster() {
  const [groups, students] = await Promise.all([
    apiGet<GroupSummary[]>("/groups"),
    apiGet<StudentSummary[]>("/students"),
  ]);

  return (
    <>
      <Section title="Groups" count={groups.length} empty="No groups are assigned to you yet.">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-zinc-500">
            <tr>
              <Th>Group</Th>
              <Th>Branch</Th>
              <Th>Level</Th>
              <Th className="text-right">Students</Th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <tr key={g.id} className="border-t border-zinc-100">
                <Td className="font-medium text-zinc-900">{g.name}</Td>
                <Td>{g.branchName}</Td>
                <Td>{g.levelName ?? "—"}</Td>
                <Td className="text-right tabular-nums">{g.studentCount}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Students" count={students.length} empty="No students are enrolled in your groups yet.">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-zinc-500">
            <tr>
              <Th>Student</Th>
              <Th>Group</Th>
              <Th className="text-right">Target band</Th>
            </tr>
          </thead>
          <tbody>
            {students.map((s) => (
              <tr key={s.id} className="border-t border-zinc-100">
                <Td className="font-medium text-zinc-900">{s.fullName}</Td>
                <Td>{s.groups.map((g) => g.name).join(", ")}</Td>
                <Td className="text-right tabular-nums">{s.targetBand?.toFixed(1) ?? "—"}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </>
  );
}

function Section(props: { title: string; count: number; empty: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold text-zinc-900">
        {props.title} <span className="font-normal text-zinc-400">{props.count}</span>
      </h2>
      <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
        {props.count === 0 ? <p className="p-6 text-sm text-zinc-500">{props.empty}</p> : props.children}
      </div>
    </section>
  );
}

function Th({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <th className={`px-4 py-2.5 font-medium ${className}`}>{children}</th>;
}

function Td({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <td className={`px-4 py-2.5 text-zinc-600 ${className}`}>{children}</td>;
}
